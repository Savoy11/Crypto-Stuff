"""
MarketData model — time-series price and liquidity data.
Designed as a TimescaleDB hypertable partitioned on timestamp.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class MarketData(Base, UUIDMixin):
    __tablename__ = "market_data"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    # Price data
    price_usd: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    price_open: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    price_high: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    price_low: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    price_close: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)

    # Market cap & volume
    market_cap: Mapped[float | None] = mapped_column(Numeric(30, 2), nullable=True)
    volume_24h: Mapped[float | None] = mapped_column(Numeric(30, 2), nullable=True)

    # Peg stability
    peg_target: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    peg_deviation_pct: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    peg_deviation_bps: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)

    # Liquidity depth (in USD)
    liquidity_depth_1pct: Mapped[float | None] = mapped_column(Numeric(20, 2), nullable=True)
    liquidity_depth_2pct: Mapped[float | None] = mapped_column(Numeric(20, 2), nullable=True)
    liquidity_depth_5pct: Mapped[float | None] = mapped_column(Numeric(20, 2), nullable=True)

    # Market structure
    bid_ask_spread_bps: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    market_cap_rank: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # ── Composite indexes for time-range queries ─────────────────────────────
    __table_args__ = (
        Index("ix_market_data_asset_ts", "asset_id", "timestamp"),
        Index("ix_market_data_ts_desc", "timestamp"),
    )

    # ── Relationships ────────────────────────────────────────────────────────
    asset: Mapped[Asset] = relationship("Asset", back_populates="market_data")  # noqa: F821

    def __repr__(self) -> str:
        return f"<MarketData asset={self.asset_id} ts={self.timestamp}>"
