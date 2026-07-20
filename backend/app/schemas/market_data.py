"""
Pydantic schemas for market data ingestion and API responses.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class MarketDataPoint(BaseModel):
    """A single OHLCV-style market data point."""

    timestamp: datetime
    price_usd: float | None = None
    price_open: float | None = None
    price_high: float | None = None
    price_low: float | None = None
    price_close: float | None = None
    market_cap: float | None = None
    volume_24h: float | None = None
    peg_deviation_pct: float | None = None
    peg_deviation_bps: float | None = None
    liquidity_depth_1pct: float | None = None
    liquidity_depth_2pct: float | None = None
    bid_ask_spread_bps: float | None = None


class MarketDataResponse(MarketDataPoint):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    asset_id: uuid.UUID


class MarketDataCreate(BaseModel):
    asset_id: uuid.UUID
    timestamp: datetime
    price_usd: float | None = None
    price_open: float | None = None
    price_high: float | None = None
    price_low: float | None = None
    price_close: float | None = None
    market_cap: float | None = None
    volume_24h: float | None = None
    peg_target: float | None = None
    peg_deviation_pct: float | None = None
    peg_deviation_bps: float | None = None
    liquidity_depth_1pct: float | None = None
    liquidity_depth_2pct: float | None = None
    liquidity_depth_5pct: float | None = None
    bid_ask_spread_bps: float | None = None
    market_cap_rank: int | None = None


class MarketDataHistoryRequest(BaseModel):
    from_ts: datetime
    to_ts: datetime
    interval: Literal["1h", "4h", "1d", "1w"] = "1d"
    fields: list[str] | None = None


class MarketDataHistoryResponse(BaseModel):
    asset_id: uuid.UUID
    interval: str
    from_ts: datetime
    to_ts: datetime
    data_points: list[MarketDataPoint]
    total_points: int


class PegStabilitySnapshot(BaseModel):
    """Real-time peg stability snapshot."""

    asset_id: uuid.UUID
    current_price: float
    peg_target: float
    deviation_bps: float
    deviation_pct: float
    is_depegged: bool
    last_updated: datetime
