"""
Pydantic schemas for Asset CRUD and analytics responses.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.models.asset import AssetType
from app.models.risk_score import RiskBand


class AssetBase(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20, examples=["USDC"])
    name: str = Field(..., min_length=1, max_length=255, examples=["USD Coin"])
    asset_type: AssetType
    blockchain: str | None = Field(None, max_length=100, examples=["Ethereum"])
    contract_address: str | None = Field(None, max_length=255)
    coingecko_id: str | None = None
    defillama_id: str | None = None
    description: str | None = None
    website_url: str | None = None
    logo_url: str | None = None
    asset_metadata: dict[str, Any] | None = Field(None, alias="metadata")

    model_config = ConfigDict(populate_by_name=True)


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    name: str | None = None
    asset_type: AssetType | None = None
    blockchain: str | None = None
    contract_address: str | None = None
    coingecko_id: str | None = None
    defillama_id: str | None = None
    description: str | None = None
    website_url: str | None = None
    logo_url: str | None = None
    is_active: bool | None = None
    asset_metadata: dict[str, Any] | None = None


class AssetResponse(AssetBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AssetSummary(BaseModel):
    """Lightweight asset representation for list views."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    symbol: str
    name: str
    asset_type: AssetType
    blockchain: str | None = None
    is_active: bool
    logo_url: str | None = None


class LatestMetrics(BaseModel):
    """Snapshot of the most recent metrics for an asset."""
    price_usd: float | None = None
    market_cap: float | None = None
    volume_24h: float | None = None
    peg_deviation_bps: float | None = None
    liquidity_depth_1pct: float | None = None
    risk_score: float | None = None
    risk_band: RiskBand | None = None
    data_as_of: datetime | None = None


class AssetDetailResponse(AssetResponse):
    """Full asset detail including latest metrics."""
    latest_metrics: LatestMetrics | None = None


class AssetAnalyticsBundle(BaseModel):
    """Comprehensive analytics response for a single asset."""
    asset: AssetResponse
    latest_metrics: LatestMetrics | None = None
    peg_stability: dict[str, Any] | None = None
    reserve_summary: dict[str, Any] | None = None
    liquidity_summary: dict[str, Any] | None = None
    network_summary: dict[str, Any] | None = None
    wallet_concentration: dict[str, Any] | None = None
    risk_score: dict[str, Any] | None = None
    anomaly_flags: list[dict[str, Any]] = Field(default_factory=list)


class AssetComparisonResponse(BaseModel):
    """Multi-asset comparison result."""
    assets: list[AssetDetailResponse]
    comparison_metrics: dict[str, dict[str, Any]] = Field(default_factory=dict)
    rankings: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)


class PaginatedAssets(BaseModel):
    items: list[AssetSummary]
    total: int
    page: int
    page_size: int
    pages: int
