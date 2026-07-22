"""
BlockchainMetric model — on-chain supply and activity metrics.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class BlockchainMetric(Base, UUIDMixin):
    __tablename__ = "blockchain_metrics"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    # Supply
    total_supply: Mapped[float | None] = mapped_column(Numeric(30, 8), nullable=True)
    circulating_supply: Mapped[float | None] = mapped_column(Numeric(30, 8), nullable=True)
    burned_supply: Mapped[float | None] = mapped_column(Numeric(30, 8), nullable=True)

    # Holders / addresses
    holder_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    active_addresses_24h: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    new_addresses_24h: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # Transfer activity
    transfer_volume_24h: Mapped[float | None] = mapped_column(Numeric(30, 2), nullable=True)
    transfer_count_24h: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    avg_transfer_size: Mapped[float | None] = mapped_column(Numeric(20, 4), nullable=True)

    # Velocity: transfer_volume / circulating_supply (daily)
    velocity: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)

    # ── Indexes ──────────────────────────────────────────────────────────────
    __table_args__ = (Index("ix_blockchain_metric_asset_ts", "asset_id", "timestamp"),)

    # ── Relationships ────────────────────────────────────────────────────────
    asset: Mapped[Asset] = relationship(  # noqa: F821
        "Asset", back_populates="blockchain_metrics"
    )

    def __repr__(self) -> str:
        return f"<BlockchainMetric asset={self.asset_id} ts={self.timestamp}>"
