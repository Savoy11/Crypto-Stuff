"""
WalletConcentration model — Gini, HHI, and top-N holder concentration metrics.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class WalletConcentration(Base, UUIDMixin):
    __tablename__ = "wallet_concentrations"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    # Top-N holder share (percentage of total supply)
    top_10_pct: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)
    top_50_pct: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)
    top_100_pct: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)
    top_1000_pct: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)

    # Gini coefficient (0 = perfect equality, 1 = maximum concentration)
    gini_coefficient: Mapped[float | None] = mapped_column(Numeric(6, 4), nullable=True)

    # Herfindahl-Hirschman Index (0–10000)
    hhi_score: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)

    # ── Indexes ──────────────────────────────────────────────────────────────
    __table_args__ = (Index("ix_wallet_conc_asset_ts", "asset_id", "timestamp"),)

    # ── Relationships ────────────────────────────────────────────────────────
    asset: Mapped[Asset] = relationship(  # noqa: F821
        "Asset", back_populates="wallet_concentrations"
    )

    def __repr__(self) -> str:
        return f"<WalletConcentration asset={self.asset_id} gini={self.gini_coefficient}>"
