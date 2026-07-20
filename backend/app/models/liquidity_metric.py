"""
LiquidityMetric model — DEX/CEX market depth and slippage data.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class LiquidityMetric(Base, UUIDMixin):
    __tablename__ = "liquidity_metrics"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    # Aggregated liquidity
    dex_liquidity_usd: Mapped[float | None] = mapped_column(Numeric(30, 2), nullable=True)
    cex_liquidity_usd: Mapped[float | None] = mapped_column(Numeric(30, 2), nullable=True)
    total_liquidity_usd: Mapped[float | None] = mapped_column(Numeric(30, 2), nullable=True)

    # Slippage (in basis points) for a $1M notional trade
    slippage_1pct: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    slippage_2pct: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    slippage_5pct: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)

    # Bid-ask spread
    bid_ask_spread_bps: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)

    # Market depth at price levels
    depth_1pct_usd: Mapped[float | None] = mapped_column(Numeric(20, 2), nullable=True)
    depth_2pct_usd: Mapped[float | None] = mapped_column(Numeric(20, 2), nullable=True)

    # Venue breakdown: [{"name": "Uniswap v3", "type": "dex", "liquidity_usd": 5e7, "pct": 40.0}]
    top_venues: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)

    # ── Indexes ──────────────────────────────────────────────────────────────
    __table_args__ = (Index("ix_liquidity_asset_ts", "asset_id", "timestamp"),)

    # ── Relationships ────────────────────────────────────────────────────────
    asset: Mapped[Asset] = relationship("Asset", back_populates="liquidity_metrics")  # noqa: F821

    def __repr__(self) -> str:
        return f"<LiquidityMetric asset={self.asset_id} ts={self.timestamp}>"
