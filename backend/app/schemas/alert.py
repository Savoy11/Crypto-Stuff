"""
Pydantic schemas for alert management.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.alert import AlertSeverity, AlertType


class AlertCreate(BaseModel):
    asset_id: uuid.UUID
    user_id: uuid.UUID | None = None
    alert_type: AlertType
    severity: AlertSeverity
    title: str = Field(..., max_length=255)
    message: str
    threshold_value: float | None = None
    actual_value: float | None = None


class AlertUpdate(BaseModel):
    is_read: bool | None = None
    is_resolved: bool | None = None


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    asset_id: uuid.UUID
    user_id: uuid.UUID | None
    alert_type: AlertType
    severity: AlertSeverity
    title: str
    message: str
    threshold_value: float | None
    actual_value: float | None
    is_read: bool
    is_resolved: bool
    resolved_at: datetime | None
    triggered_at: datetime


class AlertSummary(BaseModel):
    """Alert counts by severity for a dashboard widget."""

    total: int = 0
    info: int = 0
    warning: int = 0
    critical: int = 0
    unread: int = 0
    last_critical_at: datetime | None = None


class PaginatedAlerts(BaseModel):
    items: list[AlertResponse]
    total: int
    page: int
    page_size: int
    pages: int
    summary: AlertSummary
