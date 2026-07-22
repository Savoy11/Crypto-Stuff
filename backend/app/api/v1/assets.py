"""
Asset CRUD and analytics endpoints.
"""
from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.anomaly_detection import detect_metric_anomalies
from app.analytics.peg_stability import compute_peg_analytics_summary
from app.core.exceptions import http_404
from app.dependencies import CurrentUser, DBSession, Pagination, require_role
from app.models.asset import Asset, AssetType
from app.models.blockchain_metric import BlockchainMetric
from app.models.liquidity_metric import LiquidityMetric
from app.models.market_data import MarketData
from app.models.reserve_attestation import ReserveAttestation
from app.models.risk_score import RiskScore
from app.models.wallet_concentration import WalletConcentration
from app.schemas.asset import (
    AssetCreate,
    AssetResponse,
    AssetSummary,
)

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/assets", tags=["Assets"])


def _envelope(data: Any, meta: dict | None = None) -> dict:
    return {
        "success": True,
        "data": data,
        "meta": meta or {},
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("", response_model=dict, summary="List assets with pagination and filtering")
async def list_assets(
    db: DBSession,
    current_user: CurrentUser,
    pagination: Pagination,
    asset_type: AssetType | None = Query(None, description="Filter by asset type"),
    blockchain: str | None = Query(None, description="Filter by blockchain"),
    is_active: bool = Query(True, description="Filter by active status"),
    search: str | None = Query(None, description="Search by symbol or name"),
    sort_by: str = Query("symbol", description="Sort field: symbol, name, created_at"),
    sort_dir: str = Query("desc", description="Sort direction: asc or desc"),
) -> dict:
    """
    List assets with optional filtering, search, sorting, and pagination.

    NOTE: `risk_band` filtering and `market_cap`/`risk_score` sorting are not
    offered here because both require joining each asset to its LATEST risk/
    market snapshot. They were previously DECLARED (a risk_band query param, a
    sort_by default of "market_cap") but silently ignored — the query never
    applied risk_band and sorted only by symbol or created_at regardless of
    sort_by, so `sort_by=market_cap` returned creation order. Rather than
    accept parameters that do nothing, this endpoint now only advertises what
    it actually implements; the snapshot-join versions are a separate change.
    """
    query = select(Asset)

    if is_active is not None:
        query = query.where(Asset.is_active == is_active)
    if asset_type:
        query = query.where(Asset.asset_type == asset_type)
    if blockchain:
        query = query.where(Asset.blockchain.ilike(f"%{blockchain}%"))
    if search:
        pattern = f"%{search.upper()}%"
        query = query.where(Asset.symbol.ilike(pattern) | Asset.name.ilike(f"%{search}%"))

    # Count total
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    # Sort over real Asset columns only. Unknown sort_by falls back to symbol
    # rather than being silently ignored.
    sort_columns = {"symbol": Asset.symbol, "name": Asset.name, "created_at": Asset.created_at}
    sort_col = sort_columns.get(sort_by, Asset.symbol)
    query = query.order_by(asc(sort_col) if sort_dir == "asc" else desc(sort_col))

    query = query.offset(pagination.offset).limit(pagination.page_size)
    result = await db.execute(query)
    assets = result.scalars().all()

    items = [AssetSummary.model_validate(a) for a in assets]
    pages = math.ceil(total / pagination.page_size) if total > 0 else 0

    return _envelope(
        [i.model_dump() for i in items],
        meta={
            "page": pagination.page,
            "page_size": pagination.page_size,
            "total": total,
            "pages": pages,
        },
    )


@router.get("/compare", response_model=dict, summary="Compare multiple assets")
async def compare_assets(
    db: DBSession,
    current_user: CurrentUser,
    ids: list[uuid.UUID] = Query(..., description="List of asset IDs to compare (2–10)"),
) -> dict:
    """
    Fetch detail and latest metrics for multiple assets side-by-side.
    """
    if len(ids) < 2 or len(ids) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide between 2 and 10 asset IDs for comparison",
        )

    result = await db.execute(select(Asset).where(Asset.id.in_(ids)))
    assets = result.scalars().all()

    if len(assets) != len(ids):
        found_ids = {str(a.id) for a in assets}
        missing = [str(i) for i in ids if str(i) not in found_ids]
        raise http_404("Assets", ", ".join(missing))

    asset_details: list[dict] = []
    comparison_metrics: dict[str, dict] = {}
    today = datetime.now(UTC).date()

    for asset in assets:
        detail = await _build_asset_detail(asset, db, today)
        asset_details.append(detail)

        sym = asset.symbol
        comparison_metrics[sym] = {
            "price_usd": detail.get("latest_metrics", {}).get("price_usd"),
            "market_cap": detail.get("latest_metrics", {}).get("market_cap"),
            "peg_deviation_bps": detail.get("latest_metrics", {}).get("peg_deviation_bps"),
            "risk_score": detail.get("latest_metrics", {}).get("risk_score"),
            "risk_band": detail.get("latest_metrics", {}).get("risk_band"),
        }

    return _envelope(
        {
            "assets": asset_details,
            "comparison_metrics": comparison_metrics,
        }
    )


@router.get("/{asset_id}", response_model=dict, summary="Get asset detail")
async def get_asset(
    asset_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Return full asset detail with latest metrics snapshot."""
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if asset is None:
        raise http_404("Asset", str(asset_id))

    today = datetime.now(UTC).date()
    detail = await _build_asset_detail(asset, db, today)
    return _envelope(detail)


@router.get("/{asset_id}/analytics", response_model=dict, summary="Comprehensive analytics bundle")
async def get_asset_analytics(
    asset_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """
    Return a comprehensive analytics bundle for a single asset including:
    peg stability, reserve summary, liquidity, network metrics, and anomaly flags.
    """
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if asset is None:
        raise http_404("Asset", str(asset_id))

    # Gather all data concurrently (sequential queries)
    peg_target = float((asset.asset_metadata or {}).get("peg_target", 1.0))

    # Price history (last 7 days hourly)
    md_result = await db.execute(
        select(MarketData)
        .where(MarketData.asset_id == asset_id)
        .order_by(desc(MarketData.timestamp))
        .limit(168)
    )
    md_rows = md_result.scalars().all()
    prices = [float(r.price_usd) for r in reversed(md_rows) if r.price_usd is not None]
    latest_md = md_rows[0] if md_rows else None

    # Peg analytics
    peg_analytics = None
    if prices:
        peg_analytics = compute_peg_analytics_summary(prices, peg_target)

    # Reserve summary
    ra_result = await db.execute(
        select(ReserveAttestation)
        .where(ReserveAttestation.asset_id == asset_id)
        .order_by(desc(ReserveAttestation.attestation_date))
        .limit(1)
    )
    ra = ra_result.scalar_one_or_none()
    reserve_summary = None
    if ra:
        from app.analytics.reserve_quality import composite_reserve_score

        reserve_summary = composite_reserve_score(
            composition=ra.reserve_composition or {},
            collateralization_ratio=float(ra.collateralization_ratio)
            if ra.collateralization_ratio
            else None,
            last_attestation_date=ra.attestation_date,
            attester_quality=ra.attester_type or "unknown",
        )
        reserve_summary["attester"] = ra.attester
        reserve_summary["attestation_date"] = ra.attestation_date.isoformat()

    # Latest liquidity
    liq_result = await db.execute(
        select(LiquidityMetric)
        .where(LiquidityMetric.asset_id == asset_id)
        .order_by(desc(LiquidityMetric.timestamp))
        .limit(1)
    )
    liq = liq_result.scalar_one_or_none()
    liquidity_summary = None
    if liq:
        from app.analytics.liquidity_depth import composite_liquidity_score

        mc = float(latest_md.market_cap) if latest_md and latest_md.market_cap else None
        liquidity_summary = composite_liquidity_score(
            depth_1pct=float(liq.depth_1pct_usd) if liq.depth_1pct_usd else None,
            depth_2pct=float(liq.depth_2pct_usd) if liq.depth_2pct_usd else None,
            market_cap=mc,
            slippage_bps=float(liq.slippage_1pct) if liq.slippage_1pct else None,
            spread_bps=float(liq.bid_ask_spread_bps) if liq.bid_ask_spread_bps else None,
            venues=liq.top_venues,
        )
        liquidity_summary["dex_liquidity_usd"] = (
            float(liq.dex_liquidity_usd) if liq.dex_liquidity_usd else None
        )
        liquidity_summary["cex_liquidity_usd"] = (
            float(liq.cex_liquidity_usd) if liq.cex_liquidity_usd else None
        )

    # Network summary
    bm_result = await db.execute(
        select(BlockchainMetric)
        .where(BlockchainMetric.asset_id == asset_id)
        .order_by(desc(BlockchainMetric.timestamp))
        .limit(1)
    )
    bm = bm_result.scalar_one_or_none()
    network_summary = None
    if bm:
        from app.analytics.velocity_metrics import composite_network_score

        network_summary = composite_network_score(
            velocity=float(bm.velocity) if bm.velocity else None,
            active_addresses_24h=bm.active_addresses_24h,
            total_holders=bm.holder_count,
            transfer_count_24h=bm.transfer_count_24h,
            asset_type=str(asset.asset_type.value),
        )
        network_summary["holder_count"] = bm.holder_count
        network_summary["circulating_supply"] = (
            float(bm.circulating_supply) if bm.circulating_supply else None
        )

    # Wallet concentration
    wc_result = await db.execute(
        select(WalletConcentration)
        .where(WalletConcentration.asset_id == asset_id)
        .order_by(desc(WalletConcentration.timestamp))
        .limit(1)
    )
    wc = wc_result.scalar_one_or_none()
    wallet_concentration = None
    if wc:
        from app.analytics.wallet_concentration import concentration_score

        c_score = concentration_score(
            gini=float(wc.gini_coefficient) if wc.gini_coefficient else None,
            hhi=float(wc.hhi_score) if wc.hhi_score else None,
            top_10_pct=float(wc.top_10_pct) if wc.top_10_pct else None,
        )
        wallet_concentration = {
            "gini_coefficient": float(wc.gini_coefficient) if wc.gini_coefficient else None,
            "hhi_score": float(wc.hhi_score) if wc.hhi_score else None,
            "top_10_pct": float(wc.top_10_pct) if wc.top_10_pct else None,
            "top_50_pct": float(wc.top_50_pct) if wc.top_50_pct else None,
            "top_100_pct": float(wc.top_100_pct) if wc.top_100_pct else None,
            "concentration_score": round(c_score, 2),
        }

    # Risk score summary
    today = datetime.now(UTC).date()
    rs_result = await db.execute(
        select(RiskScore).where(RiskScore.asset_id == asset_id, RiskScore.score_date == today)
    )
    rs = rs_result.scalar_one_or_none()
    risk_score_summary = None
    if rs:
        risk_score_summary = {
            "overall_score": float(rs.overall_score),
            "risk_band": rs.risk_band.value,
            "reserve_score": float(rs.reserve_score) if rs.reserve_score else None,
            "peg_score": float(rs.peg_score) if rs.peg_score else None,
            "network_score": float(rs.network_score) if rs.network_score else None,
            "security_score": float(rs.security_score) if rs.security_score else None,
            "confidence": float(rs.confidence),
            "percentile_rank": float(rs.percentile_rank) if rs.percentile_rank else None,
            "score_date": rs.score_date.isoformat(),
        }

    # Anomaly detection on price series
    anomaly_flags: list[dict] = []
    if prices and len(prices) > 10:
        report = detect_metric_anomalies(prices, "price_usd")
        if report.anomaly_count > 0:
            anomaly_flags.append(
                {
                    "metric": "price_usd",
                    "anomaly_count": report.anomaly_count,
                    "severity": report.severity,
                    "flagged_pct": report.flagged_pct,
                    "anomaly_indices": report.anomaly_indices[:10],
                }
            )

    bundle = {
        "asset": AssetResponse.model_validate(asset).model_dump(),
        "peg_stability": peg_analytics,
        "reserve_summary": reserve_summary,
        "liquidity_summary": liquidity_summary,
        "network_summary": network_summary,
        "wallet_concentration": wallet_concentration,
        "risk_score": risk_score_summary,
        "anomaly_flags": anomaly_flags,
    }

    return _envelope(bundle)


@router.get("/{asset_id}/market-data", response_model=dict, summary="Historical market data")
async def get_market_data_history(
    asset_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
    from_ts: datetime = Query(..., description="Start timestamp (ISO 8601)"),
    to_ts: datetime = Query(..., description="End timestamp (ISO 8601)"),
    interval: str = Query("1d", description="Interval: 1h, 4h, 1d, 1w"),
) -> dict:
    """
    Return historical OHLCV-style market data for an asset.
    """
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    if not result.scalar_one_or_none():
        raise http_404("Asset", str(asset_id))

    md_result = await db.execute(
        select(MarketData)
        .where(
            MarketData.asset_id == asset_id,
            MarketData.timestamp >= from_ts,
            MarketData.timestamp <= to_ts,
        )
        .order_by(asc(MarketData.timestamp))
    )
    rows = md_result.scalars().all()

    data_points = [
        {
            "timestamp": r.timestamp.isoformat(),
            "price_usd": float(r.price_usd) if r.price_usd else None,
            "price_open": float(r.price_open) if r.price_open else None,
            "price_high": float(r.price_high) if r.price_high else None,
            "price_low": float(r.price_low) if r.price_low else None,
            "price_close": float(r.price_close) if r.price_close else None,
            "market_cap": float(r.market_cap) if r.market_cap else None,
            "volume_24h": float(r.volume_24h) if r.volume_24h else None,
            "peg_deviation_bps": float(r.peg_deviation_bps) if r.peg_deviation_bps else None,
        }
        for r in rows
    ]

    return _envelope(
        {
            "asset_id": str(asset_id),
            "interval": interval,
            "from_ts": from_ts.isoformat(),
            "to_ts": to_ts.isoformat(),
            "data_points": data_points,
            "total_points": len(data_points),
        }
    )


@router.get("/{asset_id}/risk-history", response_model=dict, summary="Risk score history")
async def get_risk_history(
    asset_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
    pagination: Pagination,
) -> dict:
    """Return paginated risk score history for an asset."""
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    if not result.scalar_one_or_none():
        raise http_404("Asset", str(asset_id))

    total_result = await db.execute(select(func.count()).where(RiskScore.asset_id == asset_id))
    total = total_result.scalar_one()

    rs_result = await db.execute(
        select(RiskScore)
        .where(RiskScore.asset_id == asset_id)
        .order_by(desc(RiskScore.score_date))
        .offset(pagination.offset)
        .limit(pagination.page_size)
    )
    scores = rs_result.scalars().all()

    history = [
        {
            "score_date": r.score_date.isoformat(),
            "overall_score": float(r.overall_score),
            "risk_band": r.risk_band.value,
            "reserve_score": float(r.reserve_score) if r.reserve_score else None,
            "peg_score": float(r.peg_score) if r.peg_score else None,
            "network_score": float(r.network_score) if r.network_score else None,
            "security_score": float(r.security_score) if r.security_score else None,
            "confidence": float(r.confidence),
        }
        for r in scores
    ]

    return _envelope(
        {"asset_id": str(asset_id), "history": history},
        meta={
            "total": total,
            "page": pagination.page,
            "page_size": pagination.page_size,
            "pages": math.ceil(total / pagination.page_size) if total > 0 else 0,
        },
    )


@router.post(
    "",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new asset (admin only)",
)
async def create_asset(
    body: AssetCreate,
    db: DBSession,
    _: object = Depends(require_role("admin")),
) -> dict:
    """Create a new asset. Requires admin role."""
    from sqlalchemy.exc import IntegrityError

    asset = Asset(
        symbol=body.symbol.upper(),
        name=body.name,
        asset_type=body.asset_type,
        blockchain=body.blockchain,
        contract_address=body.contract_address,
        coingecko_id=body.coingecko_id,
        defillama_id=body.defillama_id,
        description=body.description,
        website_url=body.website_url,
        logo_url=body.logo_url,
        asset_metadata=body.asset_metadata or {},
        is_active=True,
    )
    db.add(asset)
    try:
        await db.flush()
    except IntegrityError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Asset with symbol '{body.symbol}' already exists",
        ) from err

    return _envelope(AssetResponse.model_validate(asset).model_dump())


# ── Internal helpers ──────────────────────────────────────────────────────────


async def _build_asset_detail(
    asset: Asset,
    db: AsyncSession,
    today: Any,
) -> dict:
    """Build the asset detail dict including latest metrics."""
    # Latest market data
    md_result = await db.execute(
        select(MarketData)
        .where(MarketData.asset_id == asset.id)
        .order_by(desc(MarketData.timestamp))
        .limit(1)
    )
    latest_md = md_result.scalar_one_or_none()

    # Latest risk score
    rs_result = await db.execute(
        select(RiskScore)
        .where(RiskScore.asset_id == asset.id)
        .order_by(desc(RiskScore.score_date))
        .limit(1)
    )
    latest_rs = rs_result.scalar_one_or_none()

    latest_metrics: dict = {}
    if latest_md:
        latest_metrics.update(
            {
                "price_usd": float(latest_md.price_usd) if latest_md.price_usd else None,
                "market_cap": float(latest_md.market_cap) if latest_md.market_cap else None,
                "volume_24h": float(latest_md.volume_24h) if latest_md.volume_24h else None,
                "peg_deviation_bps": float(latest_md.peg_deviation_bps)
                if latest_md.peg_deviation_bps
                else None,
                "liquidity_depth_1pct": float(latest_md.liquidity_depth_1pct)
                if latest_md.liquidity_depth_1pct
                else None,
                "data_as_of": latest_md.timestamp.isoformat(),
            }
        )
    if latest_rs:
        latest_metrics.update(
            {
                "risk_score": float(latest_rs.overall_score),
                "risk_band": latest_rs.risk_band.value,
            }
        )

    asset_dict = AssetResponse.model_validate(asset).model_dump()
    asset_dict["latest_metrics"] = latest_metrics
    return asset_dict
