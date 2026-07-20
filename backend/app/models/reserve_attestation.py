"""
ReserveAttestation model — stores reserve proof and composition records.
"""
from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class ReserveAttestation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "reserve_attestations"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    attestation_date: Mapped[date] = mapped_column(Date, nullable=False)
    attester: Mapped[str] = mapped_column(String(255), nullable=False)
    attester_type: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # big4, independent, internal

    # Reserve financials
    total_reserves_usd: Mapped[float] = mapped_column(Numeric(30, 2), nullable=False)
    total_liabilities_usd: Mapped[float | None] = mapped_column(Numeric(30, 2), nullable=True)
    collateralization_ratio: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)

    # Composition: { "cash": {"pct": 40.0, "value_usd": 1e9}, "tbills": {...}, ... }
    reserve_composition: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Document references
    report_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    report_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)  # SHA-256

    # Verification
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verification_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Indexes ──────────────────────────────────────────────────────────────
    __table_args__ = (Index("ix_reserve_asset_date", "asset_id", "attestation_date"),)

    # ── Relationships ────────────────────────────────────────────────────────
    asset: Mapped[Asset] = relationship(  # noqa: F821
        "Asset", back_populates="reserve_attestations"
    )

    def __repr__(self) -> str:
        return f"<ReserveAttestation asset={self.asset_id} date={self.attestation_date}>"
