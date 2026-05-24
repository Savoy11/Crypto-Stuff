"""
Reserve attestation endpoints.
"""
from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import desc, func, select

from app.core.exceptions import http_404
from app.dependencies import CurrentUser, DBSession, Pagination, require_role
from app.models.asset import Asset
from app.models.reserve_attestation import ReserveAttestation
from app.schemas.reserve import (
    ReserveAttestationCreate,
    ReserveAttestationResponse,
    ReserveQualityScore,
)

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/reserves", tags=["Reserves"])


def _envelope(data, meta=None):
    return {
        "success": True,
        "data": data,
        "meta": meta or {},
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("/{asset_id}", response_model=dict, summary="List reserve attestations for an asset")
async def list_attestations(
    asset_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
    pagination: Pagination,
) -> dict:
    """List all reserve attestations for an asset, newest first."""
    asset_result = await db.execute(select(Asset).where(Asset.id == asset_id))
    if not asset_result.scalar_one_or_none():
        raise http_404("Asset", str(asset_id))

    total_result = await db.execute(
        select(func.count()).where(ReserveAttestation.asset_id == asset_id)
    )
    total = total_result.scalar_one()

    ra_result = await db.execute(
        select(ReserveAttestation)
        .where(ReserveAttestation.asset_id == asset_id)
        .order_by(desc(ReserveAttestation.attestation_date))
        .offset(pagination.offset)
        .limit(pagination.page_size)
    )
    items = ra_result.scalars().all()

    return _envelope(
        [ReserveAttestationResponse.model_validate(r).model_dump() for r in items],
        meta={
            "total": total,
            "page": pagination.page,
            "page_size": pagination.page_size,
            "pages": math.ceil(total / pagination.page_size) if total > 0 else 0,
        },
    )


@router.get("/{asset_id}/latest", response_model=dict, summary="Latest reserve attestation")
async def get_latest_attestation(
    asset_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Return the most recent reserve attestation for an asset."""
    asset_result = await db.execute(select(Asset).where(Asset.id == asset_id))
    if not asset_result.scalar_one_or_none():
        raise http_404("Asset", str(asset_id))

    ra_result = await db.execute(
        select(ReserveAttestation)
        .where(ReserveAttestation.asset_id == asset_id)
        .order_by(desc(ReserveAttestation.attestation_date))
        .limit(1)
    )
    ra = ra_result.scalar_one_or_none()
    if not ra:
        raise http_404("Reserve attestation", str(asset_id))

    return _envelope(ReserveAttestationResponse.model_validate(ra).model_dump())


@router.get("/{asset_id}/quality-score", response_model=dict, summary="Reserve quality score")
async def get_reserve_quality_score(
    asset_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Compute and return the reserve quality score for the latest attestation."""
    asset_result = await db.execute(select(Asset).where(Asset.id == asset_id))
    if not asset_result.scalar_one_or_none():
        raise http_404("Asset", str(asset_id))

    ra_result = await db.execute(
        select(ReserveAttestation)
        .where(ReserveAttestation.asset_id == asset_id)
        .order_by(desc(ReserveAttestation.attestation_date))
        .limit(1)
    )
    ra = ra_result.scalar_one_or_none()
    if not ra:
        raise http_404("Reserve attestation", str(asset_id))

    from app.analytics.reserve_quality import (
        composite_reserve_score,
        identify_reserve_risk_flags,
    )
    from datetime import date, datetime, timezone

    today = datetime.now(timezone.utc).date()
    days_since = (today - ra.attestation_date).days

    sub_scores = composite_reserve_score(
        composition=ra.reserve_composition or {},
        collateralization_ratio=float(ra.collateralization_ratio) if ra.collateralization_ratio else None,
        last_attestation_date=ra.attestation_date,
        attester_quality=ra.attester_type or "unknown",
    )

    risk_flags = identify_reserve_risk_flags(
        composition=ra.reserve_composition or {},
        collateralization_ratio=float(ra.collateralization_ratio) if ra.collateralization_ratio else None,
        days_since_attestation=days_since,
    )

    return _envelope({
        "attestation_id": str(ra.id),
        "asset_id": str(asset_id),
        "composition_score": sub_scores["composition_score"],
        "collateralization_score": sub_scores["collateralization_score"],
        "freshness_score": sub_scores["freshness_score"],
        "attester_score": sub_scores["attester_score"],
        "composite_score": sub_scores["composite_score"],
        "days_since_attestation": days_since,
        "collateralization_ratio": float(ra.collateralization_ratio) if ra.collateralization_ratio else None,
        "composition_breakdown": ra.reserve_composition,
        "risk_flags": risk_flags,
    })


@router.post(
    "",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a new reserve attestation (analyst+)",
)
async def create_attestation(
    body: ReserveAttestationCreate,
    db: DBSession,
    _: object = Depends(require_role("analyst")),
) -> dict:
    """Submit a new reserve attestation record."""
    asset_result = await db.execute(select(Asset).where(Asset.id == body.asset_id))
    if not asset_result.scalar_one_or_none():
        raise http_404("Asset", str(body.asset_id))

    # Auto-compute collateralization ratio
    ratio = body.collateralization_ratio
    if ratio is None and body.total_liabilities_usd and body.total_liabilities_usd > 0:
        ratio = body.total_reserves_usd / body.total_liabilities_usd

    ra = ReserveAttestation(
        asset_id=body.asset_id,
        attestation_date=body.attestation_date,
        attester=body.attester,
        attester_type=body.attester_type,
        total_reserves_usd=body.total_reserves_usd,
        total_liabilities_usd=body.total_liabilities_usd,
        collateralization_ratio=ratio,
        reserve_composition=body.reserve_composition,
        report_url=body.report_url,
        report_hash=body.report_hash,
        verified=body.verified,
        verification_notes=body.verification_notes,
    )
    db.add(ra)
    await db.flush()

    return _envelope(ReserveAttestationResponse.model_validate(ra).model_dump())
