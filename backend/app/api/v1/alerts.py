"""
Alert management endpoints.
"""
from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Query
from sqlalchemy import desc, func, select, update

from app.core.exceptions import http_404
from app.dependencies import CurrentUser, DBSession, Pagination
from app.models.alert import Alert, AlertSeverity, AlertType
from app.models.asset import Asset
from app.schemas.alert import AlertCreate, AlertResponse, AlertSummary, AlertUpdate

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/alerts", tags=["Alerts"])


def _envelope(data, meta=None):
    return {
        "success": True,
        "data": data,
        "meta": meta or {},
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("", response_model=dict, summary="List alerts")
async def list_alerts(
    db: DBSession,
    current_user: CurrentUser,
    pagination: Pagination,
    asset_id: uuid.UUID | None = Query(None),
    severity: AlertSeverity | None = Query(None),
    alert_type: AlertType | None = Query(None),
    is_read: bool | None = Query(None),
    is_resolved: bool | None = Query(None),
) -> dict:
    """
    List alerts for the current user (or system-wide for admin).
    """
    query = select(Alert)

    # Non-admin users only see their own alerts or asset-level alerts with no user
    if str(current_user.role) != "admin":
        query = query.where((Alert.user_id == current_user.id) | (Alert.user_id.is_(None)))

    if asset_id:
        query = query.where(Alert.asset_id == asset_id)
    if severity:
        query = query.where(Alert.severity == severity)
    if alert_type:
        query = query.where(Alert.alert_type == alert_type)
    if is_read is not None:
        query = query.where(Alert.is_read == is_read)
    if is_resolved is not None:
        query = query.where(Alert.is_resolved == is_resolved)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    # Summary counts
    summary_result = await db.execute(
        select(
            Alert.severity,
            func.count().label("cnt"),
            func.sum(func.cast(~Alert.is_read, func.Integer())).label("unread"),
        )
        .where(Alert.is_resolved.is_(False))
        .group_by(Alert.severity)
    )

    severity_counts: dict[str, int] = {"info": 0, "warning": 0, "critical": 0}
    total_unread = 0
    for row in summary_result.all():
        severity_counts[row.severity.value] = row.cnt
        total_unread += row.unread or 0

    query = query.order_by(desc(Alert.triggered_at))
    query = query.offset(pagination.offset).limit(pagination.page_size)
    result = await db.execute(query)
    alerts = result.scalars().all()

    summary = AlertSummary(
        total=total,
        info=severity_counts.get("info", 0),
        warning=severity_counts.get("warning", 0),
        critical=severity_counts.get("critical", 0),
        unread=total_unread,
    )

    return _envelope(
        {
            "items": [AlertResponse.model_validate(a).model_dump() for a in alerts],
            "summary": summary.model_dump(),
        },
        meta={
            "total": total,
            "page": pagination.page,
            "page_size": pagination.page_size,
            "pages": math.ceil(total / pagination.page_size) if total > 0 else 0,
        },
    )


@router.get("/{alert_id}", response_model=dict, summary="Get alert detail")
async def get_alert(
    alert_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Get a single alert by ID."""
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise http_404("Alert", str(alert_id))

    # Ownership check for non-admin
    if str(current_user.role) != "admin" and alert.user_id and alert.user_id != current_user.id:
        raise http_404("Alert", str(alert_id))

    return _envelope(AlertResponse.model_validate(alert).model_dump())


@router.patch("/{alert_id}", response_model=dict, summary="Update alert (mark read/resolved)")
async def update_alert(
    alert_id: uuid.UUID,
    body: AlertUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Mark an alert as read or resolved."""
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise http_404("Alert", str(alert_id))

    if str(current_user.role) != "admin" and alert.user_id and alert.user_id != current_user.id:
        raise http_404("Alert", str(alert_id))

    if body.is_read is not None:
        alert.is_read = body.is_read
    if body.is_resolved is not None:
        alert.is_resolved = body.is_resolved
        if body.is_resolved:
            alert.resolved_at = datetime.now(UTC)

    await db.flush()
    return _envelope(AlertResponse.model_validate(alert).model_dump())


@router.post("", response_model=dict, summary="Create an alert (system use)")
async def create_alert(
    body: AlertCreate,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Create a new alert record. Used by internal pipeline triggers."""
    asset_result = await db.execute(select(Asset).where(Asset.id == body.asset_id))
    if not asset_result.scalar_one_or_none():
        raise http_404("Asset", str(body.asset_id))

    alert = Alert(
        asset_id=body.asset_id,
        user_id=body.user_id,
        alert_type=body.alert_type,
        severity=body.severity,
        title=body.title,
        message=body.message,
        threshold_value=body.threshold_value,
        actual_value=body.actual_value,
        triggered_at=datetime.now(UTC),
    )
    db.add(alert)
    await db.flush()

    # Broadcast via WebSocket
    from app.streaming.manager import connection_manager

    await connection_manager.broadcast_alert(
        alert_id=str(alert.id),
        asset_id=str(alert.asset_id),
        asset_symbol="",  # Would look up asset symbol in prod
        alert_type=alert.alert_type.value,
        severity=alert.severity.value,
        title=alert.title,
        message=alert.message,
        actual_value=float(alert.actual_value) if alert.actual_value else None,
        threshold_value=float(alert.threshold_value) if alert.threshold_value else None,
    )

    return _envelope(AlertResponse.model_validate(alert).model_dump())


@router.post("/mark-all-read", response_model=dict, summary="Mark all alerts as read")
async def mark_all_read(
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Mark all unread alerts for the current user as read."""
    stmt = (
        update(Alert)
        .where(Alert.user_id == current_user.id, Alert.is_read.is_(False))
        .values(is_read=True)
    )
    result = await db.execute(stmt)
    return _envelope({"updated_count": result.rowcount})
