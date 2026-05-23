"""
Pydantic schemas for risk score endpoints.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.risk_score import RiskBand


class ComponentScores(BaseModel):
    reserve_transparency: float = Field(..., ge=0, le=100)
    peg_liquidity: float = Field(..., ge=0, le=100)
    network_velocity: float = Field(..., ge=0, le=100)
    security_compliance: float = Field(..., ge=0, le=100)


class RiskScoreResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    asset_id: uuid.UUID
    score_date: date
    overall_score: float
    reserve_score: float | None
    peg_score: float | None
    network_score: float | None
    security_score: float | None
    risk_band: RiskBand
    confidence: float
    percentile_rank: float | None
    score_breakdown: dict[str, Any]
    model_version: str
    created_at: datetime


class RiskScoreLatest(RiskScoreResponse):
    """Latest score with asset summary."""
    asset_symbol: str | None = None
    asset_name: str | None = None
    asset_type: str | None = None


class RiskScoreHistory(BaseModel):
    asset_id: uuid.UUID
    history: list[RiskScoreResponse]
    total_records: int


class RecalculateRequest(BaseModel):
    force: bool = Field(default=False, description="Force recalculation even if score is recent")
    model_version: str | None = None


class RecalculateResponse(BaseModel):
    asset_id: uuid.UUID
    previous_score: float | None
    new_score: float
    risk_band: RiskBand
    recalculated_at: datetime
    components: ComponentScores


class PaginatedRiskScores(BaseModel):
    items: list[RiskScoreLatest]
    total: int
    page: int
    page_size: int
    pages: int
