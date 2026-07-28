"""
Master scoring orchestrator — aggregates all component scores into
a single composite risk score for each asset.
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import desc, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset
from app.models.blockchain_metric import BlockchainMetric
from app.models.liquidity_metric import LiquidityMetric
from app.models.market_data import MarketData
from app.models.reserve_attestation import ReserveAttestation
from app.models.risk_score import RiskBand, RiskScore
from app.models.wallet_concentration import WalletConcentration
from app.scoring.components import (
    compute_network_velocity_score,
    compute_peg_liquidity_score,
    compute_reserve_transparency_score,
    compute_security_compliance_score,
)
from app.scoring.weights import (
    DEFAULT_WEIGHTS,
    RISK_BAND_THRESHOLDS,
    get_weights_for_asset_type,
)

logger = structlog.get_logger(__name__)


@dataclass
class ComponentScores:
    reserve_transparency: float = 0.0
    peg_liquidity: float = 0.0
    network_velocity: float = 0.0
    security_compliance: float = 0.0
    reserve_breakdown: dict[str, Any] = field(default_factory=dict)
    peg_breakdown: dict[str, Any] = field(default_factory=dict)
    network_breakdown: dict[str, Any] = field(default_factory=dict)
    security_breakdown: dict[str, Any] = field(default_factory=dict)


@dataclass
class RiskScoreResult:
    asset_id: uuid.UUID
    overall_score: float
    risk_band: RiskBand
    components: ComponentScores
    confidence: float
    percentile_rank: float | None
    score_breakdown: dict[str, Any]
    model_version: str = "1.0.0"
    scored_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class ScoringEngine:
    """
    Orchestrates data retrieval and scoring for a given asset.
    Reads recent data from PostgreSQL, computes all components,
    applies weights, and persists the result.
    """

    MODEL_VERSION = "1.0.0"
    # Number of price history points to load (hours)
    PRICE_HISTORY_POINTS = 168  # 7 days of hourly data

    def __init__(self, weights=DEFAULT_WEIGHTS) -> None:
        self.weights = weights

    async def score_asset(
        self,
        asset_id: uuid.UUID,
        db: AsyncSession,
        persist: bool = True,
    ) -> RiskScoreResult:
        """
        Compute and optionally persist the full risk score for an asset.

        Args:
            asset_id: UUID of the asset to score.
            db: Async SQLAlchemy session.
            persist: Whether to write the score to the database.

        Returns:
            RiskScoreResult with full breakdown.
        """
        logger.info("scoring_asset", asset_id=str(asset_id))

        asset_data = await self._gather_asset_data(asset_id, db)

        # Select weights calibrated for this asset type
        asset_type = asset_data.get("asset_type", "stablecoin")
        effective_weights = get_weights_for_asset_type(asset_type)
        if self.weights is not DEFAULT_WEIGHTS:
            effective_weights = self.weights  # caller-supplied override takes precedence

        components = self.compute_component_scores(asset_data)
        original_weights = self.weights
        self.weights = effective_weights
        overall = self.apply_weights(components)
        self.weights = original_weights
        confidence = self.calculate_confidence(asset_data)
        band = self.assign_risk_band(overall)

        # Calculate percentile rank across all assets with today's scores
        percentile = await self._calculate_percentile(overall, db)

        breakdown = {
            "components": {
                "reserve_transparency": components.reserve_breakdown,
                "peg_liquidity": components.peg_breakdown,
                "network_velocity": components.network_breakdown,
                "security_compliance": components.security_breakdown,
            },
            "weights": {
                "reserve_transparency": effective_weights.reserve_transparency,
                "peg_liquidity": effective_weights.peg_liquidity,
                "network_velocity": effective_weights.network_velocity,
                "security_compliance": effective_weights.security_compliance,
            },
            "asset_type": asset_type,
            "data_completeness": asset_data.get("completeness", {}),
        }

        result = RiskScoreResult(
            asset_id=asset_id,
            overall_score=round(overall, 2),
            risk_band=band,
            components=components,
            confidence=round(confidence, 3),
            percentile_rank=percentile,
            score_breakdown=breakdown,
            model_version=self.MODEL_VERSION,
        )

        if persist:
            await self._persist_score(result, components, db)

        logger.info(
            "asset_scored",
            asset_id=str(asset_id),
            score=result.overall_score,
            band=result.risk_band.value,
            confidence=result.confidence,
        )

        return result

    def compute_component_scores(self, asset_data: dict[str, Any]) -> ComponentScores:
        """Compute all four component scores from gathered asset data."""

        # 1. Reserve Transparency (35%)
        reserve_score, reserve_breakdown = compute_reserve_transparency_score(
            reserve_composition=asset_data.get("reserve_composition", {}),
            collateralization_ratio=asset_data.get("collateralization_ratio"),
            last_attestation_date=asset_data.get("last_attestation_date"),
            attester_quality=asset_data.get("attester_quality", "unknown"),
            has_real_time_feed=asset_data.get("has_real_time_feed", False),
        )

        # 2. Peg Stability + Liquidity (30%)
        peg_score, peg_breakdown = compute_peg_liquidity_score(
            prices=asset_data.get("prices", []),
            peg_target=asset_data.get("peg_target", 1.0),
            depth_1pct=asset_data.get("depth_1pct"),
            depth_2pct=asset_data.get("depth_2pct"),
            market_cap=asset_data.get("market_cap"),
            slippage_bps=asset_data.get("slippage_bps"),
            spread_bps=asset_data.get("spread_bps"),
            venues=asset_data.get("venues"),
        )

        # 3. Network Velocity (20%)
        network_score, network_breakdown = compute_network_velocity_score(
            velocity=asset_data.get("velocity"),
            active_addresses_24h=asset_data.get("active_addresses_24h"),
            total_holders=asset_data.get("holder_count"),
            transfer_count_24h=asset_data.get("transfer_count_24h"),
            gini=asset_data.get("gini_coefficient"),
            hhi=asset_data.get("hhi_score"),
            top_10_pct=asset_data.get("top_10_pct"),
            asset_type=asset_data.get("asset_type", "stablecoin"),
        )

        # 4. Security & Compliance (15%)
        security_score, security_breakdown = compute_security_compliance_score(
            smart_contract_data=asset_data.get("smart_contract_data"),
            issuer_data=asset_data.get("issuer_data"),
            custodian_data=asset_data.get("custodian_data"),
            compliance_data=asset_data.get("compliance_data"),
        )

        return ComponentScores(
            reserve_transparency=reserve_score,
            peg_liquidity=peg_score,
            network_velocity=network_score,
            security_compliance=security_score,
            reserve_breakdown=reserve_breakdown,
            peg_breakdown=peg_breakdown,
            network_breakdown=network_breakdown,
            security_breakdown=security_breakdown,
        )

    def apply_weights(self, components: ComponentScores) -> float:
        """Apply category weights to component scores and return composite score."""
        composite = (
            components.reserve_transparency * self.weights.reserve_transparency
            + components.peg_liquidity * self.weights.peg_liquidity
            + components.network_velocity * self.weights.network_velocity
            + components.security_compliance * self.weights.security_compliance
        )
        return float(max(0.0, min(100.0, composite)))

    def calculate_confidence(self, asset_data: dict[str, Any]) -> float:
        """
        Calculate scoring confidence based on data completeness and staleness.

        Returns value between 0 and 1, where 1 = fully complete, fresh data.
        Staleness: attestation data older than 30 days is penalised linearly.
        """
        completeness = {
            "market_data": 1.0 if asset_data.get("prices") else 0.0,
            "reserve_data": (
                1.0
                if asset_data.get("reserve_composition")
                else 0.5
                if asset_data.get("collateralization_ratio")
                else 0.0
            ),
            "blockchain_data": 1.0 if asset_data.get("velocity") is not None else 0.0,
            "security_data": (
                1.0
                if asset_data.get("smart_contract_data")
                else 0.3
                if asset_data.get("issuer_data")
                else 0.0
            ),
        }

        from app.scoring.weights import CONFIDENCE_THRESHOLDS

        raw_confidence = sum(completeness[k] * w for k, w in CONFIDENCE_THRESHOLDS.items())

        # Apply staleness penalty to reserve_data component
        attestation_date = asset_data.get("last_attestation_date")
        staleness_penalty = 0.0
        if attestation_date is not None:
            today = datetime.now(UTC).date()
            if isinstance(attestation_date, datetime):
                attestation_date = attestation_date.date()
            age_days = (today - attestation_date).days
            if age_days > 30:
                # Linear decay: 0% penalty at 30 days, 35% at 90+ days
                staleness_penalty = min(0.35, (age_days - 30) / 60 * 0.35)

        return float(max(0.0, min(1.0, raw_confidence - staleness_penalty)))

    def assign_risk_band(self, score: float) -> RiskBand:
        """Assign a risk band enum value based on composite score."""
        for band_name, (lo, hi) in RISK_BAND_THRESHOLDS.items():
            if lo <= score <= hi:
                return RiskBand(band_name)
        return RiskBand.critical

    def calculate_percentile(self, score: float, all_scores: list[float]) -> float:
        """
        Compute a score's percentile rank within a list of scores.

        Args:
            score: The score to rank.
            all_scores: Distribution of all scores (including this one).

        Returns:
            Percentile rank 0–100 (100 = best, i.e., safest).
        """
        if not all_scores:
            return 50.0

        # Inclusive rank (at-or-below), not strict: the distribution contains
        # this asset's own score, so with a strict < the best asset of N could
        # only ever reach (N-1)/N — "100 = best" would be unsatisfiable.
        at_or_below = sum(1 for s in all_scores if s <= score)
        return float(at_or_below / len(all_scores) * 100.0)

    async def _calculate_percentile(self, score: float, db: AsyncSession) -> float | None:
        """Query today's scores and compute percentile rank."""
        try:
            today = datetime.now(UTC).date()
            result = await db.execute(
                select(RiskScore.overall_score).where(RiskScore.score_date == today)
            )
            all_scores = [float(row[0]) for row in result.all()]
            if not all_scores:
                return None
            all_scores.append(score)
            return self.calculate_percentile(score, all_scores)
        except Exception as exc:
            logger.warning("percentile_calculation_failed", error=str(exc))
            return None

    async def _gather_asset_data(self, asset_id: uuid.UUID, db: AsyncSession) -> dict[str, Any]:
        """
        Load all relevant data for an asset from the database.
        All five category queries run concurrently via asyncio.gather.

        Returns a flat dict of feature values ready for component scorers.
        """
        data: dict[str, Any] = {"asset_id": str(asset_id)}

        (
            asset_result,
            md_result,
            liq_result,
            bm_result,
            wc_result,
            ra_result,
        ) = await asyncio.gather(
            db.execute(select(Asset).where(Asset.id == asset_id)),
            db.execute(
                select(MarketData)
                .where(MarketData.asset_id == asset_id)
                .order_by(desc(MarketData.timestamp))
                .limit(self.PRICE_HISTORY_POINTS)
            ),
            db.execute(
                select(LiquidityMetric)
                .where(LiquidityMetric.asset_id == asset_id)
                .order_by(desc(LiquidityMetric.timestamp))
                .limit(1)
            ),
            db.execute(
                select(BlockchainMetric)
                .where(BlockchainMetric.asset_id == asset_id)
                .order_by(desc(BlockchainMetric.timestamp))
                .limit(1)
            ),
            db.execute(
                select(WalletConcentration)
                .where(WalletConcentration.asset_id == asset_id)
                .order_by(desc(WalletConcentration.timestamp))
                .limit(1)
            ),
            db.execute(
                select(ReserveAttestation)
                .where(ReserveAttestation.asset_id == asset_id)
                .order_by(desc(ReserveAttestation.attestation_date))
                .limit(1)
            ),
        )

        asset = asset_result.scalar_one_or_none()
        if asset:
            data["asset_type"] = asset.asset_type.value if asset.asset_type else "stablecoin"
            meta = asset.asset_metadata or {}
            data["peg_target"] = float(meta.get("peg_target", 1.0))
            data["smart_contract_data"] = meta.get("smart_contract")
            data["issuer_data"] = meta.get("issuer")
            data["custodian_data"] = meta.get("custodian")
            data["compliance_data"] = meta.get("compliance")
            data["has_real_time_feed"] = bool(meta.get("has_real_time_feed", False))

        market_rows = md_result.scalars().all()
        if market_rows:
            prices = [float(r.price_usd) for r in reversed(market_rows) if r.price_usd is not None]
            data["prices"] = prices
            latest_md = market_rows[0]
            data["market_cap"] = float(latest_md.market_cap) if latest_md.market_cap else None
            data["depth_1pct"] = (
                float(latest_md.liquidity_depth_1pct) if latest_md.liquidity_depth_1pct else None
            )
            data["depth_2pct"] = (
                float(latest_md.liquidity_depth_2pct) if latest_md.liquidity_depth_2pct else None
            )
            data["spread_bps"] = (
                float(latest_md.bid_ask_spread_bps) if latest_md.bid_ask_spread_bps else None
            )

        liq = liq_result.scalar_one_or_none()
        if liq:
            data["slippage_bps"] = float(liq.slippage_1pct) if liq.slippage_1pct else None
            data["venues"] = liq.top_venues or []

        bm = bm_result.scalar_one_or_none()
        if bm:
            data["velocity"] = float(bm.velocity) if bm.velocity else None
            data["holder_count"] = int(bm.holder_count) if bm.holder_count else None
            data["active_addresses_24h"] = (
                int(bm.active_addresses_24h) if bm.active_addresses_24h else None
            )
            data["transfer_count_24h"] = (
                int(bm.transfer_count_24h) if getattr(bm, "transfer_count_24h", None) else None
            )

        wc = wc_result.scalar_one_or_none()
        if wc:
            data["gini_coefficient"] = float(wc.gini_coefficient) if wc.gini_coefficient else None
            data["hhi_score"] = float(wc.hhi_score) if wc.hhi_score else None
            data["top_10_pct"] = float(wc.top_10_pct) if wc.top_10_pct else None

        ra = ra_result.scalar_one_or_none()
        if ra:
            data["reserve_composition"] = ra.reserve_composition or {}
            data["collateralization_ratio"] = (
                float(ra.collateralization_ratio) if ra.collateralization_ratio else None
            )
            data["last_attestation_date"] = ra.attestation_date
            data["attester_quality"] = getattr(ra, "attester_type", None) or "unknown"

        return data

    async def _persist_score(
        self,
        result: RiskScoreResult,
        components: ComponentScores,
        db: AsyncSession,
    ) -> None:
        """Atomically upsert today's score record using ON CONFLICT DO UPDATE."""
        today = datetime.now(UTC).date()
        now = datetime.now(UTC)

        values = {
            "asset_id": result.asset_id,
            "score_date": today,
            "overall_score": result.overall_score,
            "reserve_score": round(components.reserve_transparency, 2),
            "peg_score": round(components.peg_liquidity, 2),
            "network_score": round(components.network_velocity, 2),
            "security_score": round(components.security_compliance, 2),
            "risk_band": result.risk_band,
            "confidence": result.confidence,
            "percentile_rank": result.percentile_rank,
            "score_breakdown": result.score_breakdown,
            "model_version": result.model_version,
            "updated_at": now,
        }

        stmt = pg_insert(RiskScore).values(**values)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_risk_score_asset_date",
            set_={k: stmt.excluded[k] for k in values if k not in ("asset_id", "score_date")},
        )
        await db.execute(stmt)
        await db.flush()
