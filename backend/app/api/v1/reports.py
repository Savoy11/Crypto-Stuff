"""
Institutional reporting endpoints: portfolio summary, peer comparison, and export.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import structlog
from fastapi import APIRouter, Query
from sqlalchemy import desc, func, select

from app.dependencies import CurrentUser, DBSession
from app.models.asset import Asset, AssetType
from app.models.risk_score import RiskBand, RiskScore

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/reports", tags=["Reports"])


def _envelope(data, meta=None):
    return {
        "success": True,
        "data": data,
        "meta": meta or {},
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("/portfolio-summary", response_model=dict, summary="Portfolio risk summary")
async def get_portfolio_summary(
    db: DBSession,
    current_user: CurrentUser,
    asset_type: AssetType | None = Query(None),
) -> dict:
    """
    Aggregate risk summary across all assets (or filtered by type).
    Returns distribution of risk bands, average scores, and key metrics.
    """
    today = datetime.now(UTC).date()

    # Latest score per asset
    latest_subq = (
        select(RiskScore.asset_id, func.max(RiskScore.score_date).label("latest"))
        .group_by(RiskScore.asset_id)
        .subquery()
    )

    query = (
        select(RiskScore, Asset)
        .join(Asset, Asset.id == RiskScore.asset_id)
        .join(
            latest_subq,
            (latest_subq.c.asset_id == RiskScore.asset_id)
            & (latest_subq.c.latest == RiskScore.score_date),
        )
        .where(Asset.is_active is True)
    )
    if asset_type:
        query = query.where(Asset.asset_type == asset_type)

    result = await db.execute(query)
    rows = result.all()

    if not rows:
        return _envelope({"message": "No scored assets found", "total_assets": 0})

    scores = [float(rs.overall_score) for rs, _ in rows]
    bands: dict[str, int] = {b.value: 0 for b in RiskBand}
    for rs, _ in rows:
        bands[rs.risk_band.value] += 1

    avg_score = sum(scores) / len(scores)
    min_score = min(scores)
    max_score = max(scores)

    # Assets at risk (score < 50)
    at_risk = [
        {"symbol": asset.symbol, "score": float(rs.overall_score), "band": rs.risk_band.value}
        for rs, asset in rows
        if float(rs.overall_score) < 50.0
    ]
    at_risk.sort(key=lambda x: x["score"])

    return _envelope(
        {
            "total_assets": len(rows),
            "average_score": round(avg_score, 2),
            "min_score": round(min_score, 2),
            "max_score": round(max_score, 2),
            "risk_band_distribution": bands,
            "assets_at_risk": at_risk[:10],
            "report_date": today.isoformat(),
        }
    )


@router.get("/peer-comparison", response_model=dict, summary="Peer group comparison")
async def peer_comparison(
    db: DBSession,
    current_user: CurrentUser,
    asset_type: AssetType = Query(AssetType.stablecoin),
) -> dict:
    """
    Compare all assets within a peer group (same asset type).
    Returns ranking table sorted by risk score.
    """
    today = datetime.now(UTC).date()
    latest_subq = (
        select(RiskScore.asset_id, func.max(RiskScore.score_date).label("latest"))
        .group_by(RiskScore.asset_id)
        .subquery()
    )

    result = await db.execute(
        select(RiskScore, Asset)
        .join(Asset, Asset.id == RiskScore.asset_id)
        .join(
            latest_subq,
            (latest_subq.c.asset_id == RiskScore.asset_id)
            & (latest_subq.c.latest == RiskScore.score_date),
        )
        .where(Asset.is_active is True, Asset.asset_type == asset_type)
        .order_by(desc(RiskScore.overall_score))
    )
    rows = result.all()

    peer_list = []
    for rank, (rs, asset) in enumerate(rows, start=1):
        peer_list.append(
            {
                "rank": rank,
                "asset_id": str(asset.id),
                "symbol": asset.symbol,
                "name": asset.name,
                "overall_score": float(rs.overall_score),
                "risk_band": rs.risk_band.value,
                "reserve_score": float(rs.reserve_score) if rs.reserve_score else None,
                "peg_score": float(rs.peg_score) if rs.peg_score else None,
                "network_score": float(rs.network_score) if rs.network_score else None,
                "security_score": float(rs.security_score) if rs.security_score else None,
                "confidence": float(rs.confidence),
                "percentile_rank": float(rs.percentile_rank) if rs.percentile_rank else None,
            }
        )

    return _envelope(
        {
            "asset_type": asset_type.value,
            "peer_count": len(peer_list),
            "report_date": today.isoformat(),
            "rankings": peer_list,
        }
    )


@router.get("/risk-trend", response_model=dict, summary="Risk score trend over time")
async def get_risk_trend(
    db: DBSession,
    current_user: CurrentUser,
    asset_id: uuid.UUID | None = Query(None, description="Asset ID (None = aggregate)"),
    days: int = Query(30, ge=7, le=365),
) -> dict:
    """Return daily average risk scores over the specified lookback period."""
    since = datetime.now(UTC).date() - timedelta(days=days)

    if asset_id:
        query = (
            select(RiskScore.score_date, func.avg(RiskScore.overall_score).label("avg_score"))
            .where(RiskScore.asset_id == asset_id, RiskScore.score_date >= since)
            .group_by(RiskScore.score_date)
            .order_by(RiskScore.score_date)
        )
    else:
        query = (
            select(RiskScore.score_date, func.avg(RiskScore.overall_score).label("avg_score"))
            .join(Asset, Asset.id == RiskScore.asset_id)
            .where(Asset.is_active is True, RiskScore.score_date >= since)
            .group_by(RiskScore.score_date)
            .order_by(RiskScore.score_date)
        )

    result = await db.execute(query)
    rows = result.all()

    trend = [
        {"date": row.score_date.isoformat(), "avg_score": round(float(row.avg_score), 2)}
        for row in rows
    ]

    return _envelope(
        {
            "asset_id": str(asset_id) if asset_id else None,
            "period_days": days,
            "data_points": len(trend),
            "trend": trend,
        }
    )
