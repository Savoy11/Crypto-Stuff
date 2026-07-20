"""
Risk score endpoints: list, latest, history, and manual recalculation.
"""
from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select

from app.core.exceptions import http_404
from app.dependencies import CurrentUser, DBSession, Pagination, require_role
from app.models.asset import Asset, AssetType
from app.models.risk_score import RiskBand, RiskScore
from app.schemas.risk_score import (
    RecalculateRequest,
)
from app.scoring.engine import ScoringEngine

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/risk-scores", tags=["Risk Scores"])


def _envelope(data, meta=None):
    return {
        "success": True,
        "data": data,
        "meta": meta or {},
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("", response_model=dict, summary="List risk scores with filters")
async def list_risk_scores(
    db: DBSession,
    current_user: CurrentUser,
    pagination: Pagination,
    risk_band: RiskBand | None = Query(None),
    asset_type: AssetType | None = Query(None),
    min_score: float | None = Query(None, ge=0, le=100),
    max_score: float | None = Query(None, ge=0, le=100),
    score_date: str | None = Query(None, description="ISO date string YYYY-MM-DD"),
) -> dict:
    """Paginated list of latest risk scores across all assets."""
    today = datetime.now(UTC).date()

    # Subquery for latest score date per asset
    latest_subq = (
        select(RiskScore.asset_id, func.max(RiskScore.score_date).label("latest_date"))
        .group_by(RiskScore.asset_id)
        .subquery()
    )

    query = (
        select(RiskScore, Asset)
        .join(Asset, Asset.id == RiskScore.asset_id)
        .join(
            latest_subq,
            (latest_subq.c.asset_id == RiskScore.asset_id)
            & (latest_subq.c.latest_date == RiskScore.score_date),
        )
    )

    if risk_band:
        query = query.where(RiskScore.risk_band == risk_band)
    if asset_type:
        query = query.where(Asset.asset_type == asset_type)
    if min_score is not None:
        query = query.where(RiskScore.overall_score >= min_score)
    if max_score is not None:
        query = query.where(RiskScore.overall_score <= max_score)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    query = query.order_by(desc(RiskScore.overall_score))
    query = query.offset(pagination.offset).limit(pagination.page_size)

    result = await db.execute(query)
    rows = result.all()

    items = []
    for rs, asset in rows:
        item = {
            "id": str(rs.id),
            "asset_id": str(rs.asset_id),
            "asset_symbol": asset.symbol,
            "asset_name": asset.name,
            "asset_type": asset.asset_type.value,
            "score_date": rs.score_date.isoformat(),
            "overall_score": float(rs.overall_score),
            "risk_band": rs.risk_band.value,
            "reserve_score": float(rs.reserve_score) if rs.reserve_score else None,
            "peg_score": float(rs.peg_score) if rs.peg_score else None,
            "network_score": float(rs.network_score) if rs.network_score else None,
            "security_score": float(rs.security_score) if rs.security_score else None,
            "confidence": float(rs.confidence),
            "percentile_rank": float(rs.percentile_rank) if rs.percentile_rank else None,
            "model_version": rs.model_version,
            "created_at": rs.created_at.isoformat(),
        }
        items.append(item)

    return _envelope(
        items,
        meta={
            "page": pagination.page,
            "page_size": pagination.page_size,
            "total": total,
            "pages": math.ceil(total / pagination.page_size) if total > 0 else 0,
        },
    )


@router.get("/{asset_id}/latest", response_model=dict, summary="Get latest risk score for an asset")
async def get_latest_score(
    asset_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Return the most recent risk score for a specific asset."""
    asset_result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise http_404("Asset", str(asset_id))

    rs_result = await db.execute(
        select(RiskScore)
        .where(RiskScore.asset_id == asset_id)
        .order_by(desc(RiskScore.score_date))
        .limit(1)
    )
    rs = rs_result.scalar_one_or_none()
    if not rs:
        raise http_404("Risk score", str(asset_id))

    return _envelope(
        {
            "id": str(rs.id),
            "asset_id": str(rs.asset_id),
            "asset_symbol": asset.symbol,
            "asset_name": asset.name,
            "score_date": rs.score_date.isoformat(),
            "overall_score": float(rs.overall_score),
            "risk_band": rs.risk_band.value,
            "reserve_score": float(rs.reserve_score) if rs.reserve_score else None,
            "peg_score": float(rs.peg_score) if rs.peg_score else None,
            "network_score": float(rs.network_score) if rs.network_score else None,
            "security_score": float(rs.security_score) if rs.security_score else None,
            "confidence": float(rs.confidence),
            "percentile_rank": float(rs.percentile_rank) if rs.percentile_rank else None,
            "score_breakdown": rs.score_breakdown,
            "model_version": rs.model_version,
            "created_at": rs.created_at.isoformat(),
        }
    )


@router.get("/{asset_id}/history", response_model=dict, summary="Risk score history for an asset")
async def get_score_history(
    asset_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
    pagination: Pagination,
) -> dict:
    """Return paginated historical risk scores for an asset."""
    asset_result = await db.execute(select(Asset).where(Asset.id == asset_id))
    if not asset_result.scalar_one_or_none():
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
            "id": str(r.id),
            "score_date": r.score_date.isoformat(),
            "overall_score": float(r.overall_score),
            "risk_band": r.risk_band.value,
            "reserve_score": float(r.reserve_score) if r.reserve_score else None,
            "peg_score": float(r.peg_score) if r.peg_score else None,
            "network_score": float(r.network_score) if r.network_score else None,
            "security_score": float(r.security_score) if r.security_score else None,
            "confidence": float(r.confidence),
            "model_version": r.model_version,
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
    "/{asset_id}/recalculate",
    response_model=dict,
    summary="Trigger risk score recalculation (admin)",
)
async def recalculate_score(
    asset_id: uuid.UUID,
    body: RecalculateRequest,
    db: DBSession,
    _: object = Depends(require_role("admin")),
) -> dict:
    """
    Trigger an immediate risk score recalculation for an asset.
    Requires admin role.
    """
    asset_result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise http_404("Asset", str(asset_id))

    # Get previous score for comparison
    prev_result = await db.execute(
        select(RiskScore)
        .where(RiskScore.asset_id == asset_id)
        .order_by(desc(RiskScore.score_date))
        .limit(1)
    )
    prev_rs = prev_result.scalar_one_or_none()
    prev_score = float(prev_rs.overall_score) if prev_rs else None

    engine = ScoringEngine()
    result = await engine.score_asset(asset_id, db, persist=True)

    return _envelope(
        {
            "asset_id": str(asset_id),
            "previous_score": prev_score,
            "new_score": result.overall_score,
            "risk_band": result.risk_band.value,
            "recalculated_at": result.scored_at.isoformat(),
            "components": {
                "reserve_transparency": round(result.components.reserve_transparency, 2),
                "peg_liquidity": round(result.components.peg_liquidity, 2),
                "network_velocity": round(result.components.network_velocity, 2),
                "security_compliance": round(result.components.security_compliance, 2),
            },
            "confidence": result.confidence,
        }
    )
