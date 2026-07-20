"""
RiskScore model — stores per-asset composite risk scores and component breakdowns.
"""
from __future__ import annotations

import enum
import uuid
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class RiskBand(str, enum.Enum):
    low = "low"
    moderate = "moderate"
    elevated = "elevated"
    high = "high"
    critical = "critical"


class RiskScore(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "risk_scores"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    score_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Composite score (0–100, higher = safer)
    overall_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)

    # Component scores (0–100 each)
    reserve_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    peg_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    network_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    security_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    # Classification
    risk_band: Mapped[RiskBand] = mapped_column(
        Enum(RiskBand, name="risk_band_enum"),
        nullable=False,
        index=True,
    )

    # Confidence: 0–1, based on data completeness
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), default=1.0, nullable=False)

    # Percentile rank among all scored assets (0–100)
    percentile_rank: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    # Detailed breakdown for UI/reporting
    score_breakdown: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Model version used for traceability
    model_version: Mapped[str] = mapped_column(String(20), default="1.0.0", nullable=False)

    # ── Indexes ──────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("ix_risk_score_asset_date", "asset_id", "score_date"),
        Index("ix_risk_score_date_score", "score_date", "overall_score"),
    )

    # ── Relationships ────────────────────────────────────────────────────────
    asset: Mapped[Asset] = relationship("Asset", back_populates="risk_scores")  # noqa: F821

    def __repr__(self) -> str:
        return (
            f"<RiskScore asset={self.asset_id} "
            f"score={self.overall_score} band={self.risk_band}>"
        )
