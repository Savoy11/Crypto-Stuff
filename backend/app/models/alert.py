"""
Alert model — triggered alerts for peg deviations, reserve issues, etc.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class AlertType(str, enum.Enum):
    peg_deviation = "peg_deviation"
    reserve_ratio = "reserve_ratio"
    liquidity_drop = "liquidity_drop"
    anomaly_detected = "anomaly_detected"
    score_change = "score_change"
    volume_spike = "volume_spike"
    holder_concentration = "holder_concentration"
    attestation_stale = "attestation_stale"
    smart_contract = "smart_contract"
    custom = "custom"


class AlertSeverity(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class Alert(Base, UUIDMixin):
    __tablename__ = "alerts"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    alert_type: Mapped[AlertType] = mapped_column(
        Enum(AlertType, name="alert_type_enum"),
        nullable=False,
        index=True,
    )
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(AlertSeverity, name="alert_severity_enum"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    threshold_value: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)
    actual_value: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)

    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.utcnow(),
        nullable=False,
        index=True,
    )

    # ── Indexes ──────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("ix_alert_asset_severity", "asset_id", "severity"),
        Index("ix_alert_user_read", "user_id", "is_read"),
        Index("ix_alert_triggered", "triggered_at"),
    )

    # ── Relationships ────────────────────────────────────────────────────────
    asset: Mapped["Asset"] = relationship("Asset", back_populates="alerts")  # noqa: F821
    user: Mapped["User | None"] = relationship("User", back_populates="alerts")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Alert {self.alert_type} severity={self.severity} asset={self.asset_id}>"
