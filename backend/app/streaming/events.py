"""
WebSocket event type definitions and broadcast message schemas.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EventType(str, Enum):
    METRIC_UPDATE = "metric_update"
    PRICE_UPDATE = "price_update"
    RISK_SCORE_UPDATE = "risk_score_update"
    ALERT_TRIGGERED = "alert_triggered"
    PEG_DEVIATION = "peg_deviation"
    ANOMALY_DETECTED = "anomaly_detected"
    SYSTEM_STATUS = "system_status"
    SUBSCRIPTION_CONFIRMED = "subscription_confirmed"
    PING = "ping"
    PONG = "pong"


class BaseEvent(BaseModel):
    event_type: EventType
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))


class MetricUpdateEvent(BaseEvent):
    event_type: EventType = EventType.METRIC_UPDATE
    asset_id: uuid.UUID
    asset_symbol: str
    metrics: dict[str, Any]


class PriceUpdateEvent(BaseEvent):
    event_type: EventType = EventType.PRICE_UPDATE
    asset_id: uuid.UUID
    asset_symbol: str
    price_usd: float
    peg_deviation_bps: float | None
    peg_target: float | None
    market_cap: float | None


class RiskScoreUpdateEvent(BaseEvent):
    event_type: EventType = EventType.RISK_SCORE_UPDATE
    asset_id: uuid.UUID
    asset_symbol: str
    overall_score: float
    risk_band: str
    confidence: float
    component_scores: dict[str, float]


class AlertEvent(BaseEvent):
    event_type: EventType = EventType.ALERT_TRIGGERED
    alert_id: uuid.UUID
    asset_id: uuid.UUID
    asset_symbol: str
    alert_type: str
    severity: str
    title: str
    message: str
    actual_value: float | None
    threshold_value: float | None


class PegDeviationEvent(BaseEvent):
    event_type: EventType = EventType.PEG_DEVIATION
    asset_id: uuid.UUID
    asset_symbol: str
    current_price: float
    peg_target: float
    deviation_bps: float
    is_critical: bool


class AnomalyEvent(BaseEvent):
    event_type: EventType = EventType.ANOMALY_DETECTED
    asset_id: uuid.UUID
    asset_symbol: str
    metric_name: str
    anomaly_value: float
    z_score: float
    severity: str


class SystemStatusEvent(BaseEvent):
    event_type: EventType = EventType.SYSTEM_STATUS
    status: str
    pipeline_statuses: dict[str, str]
    message: str | None = None


class SubscriptionConfirmedEvent(BaseEvent):
    event_type: EventType = EventType.SUBSCRIPTION_CONFIRMED
    subscribed_assets: list[str]
    message: str = "Subscription active"
