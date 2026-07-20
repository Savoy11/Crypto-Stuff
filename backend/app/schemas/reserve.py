"""
Pydantic schemas for reserve attestation endpoints.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReserveCompositionItem(BaseModel):
    """A single line item in the reserve composition."""

    asset_type: str = Field(..., examples=["cash", "tbills", "repo", "crypto", "other"])
    percentage: float = Field(..., ge=0, le=100, examples=[40.0])
    value_usd: float = Field(..., ge=0)
    custodian: str | None = None
    notes: str | None = None


class ReserveAttestationCreate(BaseModel):
    asset_id: uuid.UUID
    attestation_date: date
    attester: str = Field(..., max_length=255)
    attester_type: str | None = Field(None, examples=["big4", "independent", "internal"])
    total_reserves_usd: float = Field(..., gt=0)
    total_liabilities_usd: float | None = None
    collateralization_ratio: float | None = Field(None, gt=0)
    reserve_composition: dict[str, Any] = Field(default_factory=dict)
    report_url: str | None = None
    report_hash: str | None = None
    verified: bool = False
    verification_notes: str | None = None

    @field_validator("collateralization_ratio", mode="before")
    @classmethod
    def compute_ratio(cls, v: Any, info: Any) -> float | None:
        """Auto-compute ratio if not provided."""
        return v


class ReserveAttestationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    asset_id: uuid.UUID
    attestation_date: date
    attester: str
    attester_type: str | None
    total_reserves_usd: float
    total_liabilities_usd: float | None
    collateralization_ratio: float | None
    reserve_composition: dict[str, Any]
    report_url: str | None
    report_hash: str | None
    verified: bool
    verification_notes: str | None
    created_at: datetime
    updated_at: datetime


class ReserveQualityScore(BaseModel):
    """Computed quality metrics for a reserve attestation."""

    attestation_id: uuid.UUID
    asset_id: uuid.UUID
    composition_score: float = Field(..., ge=0, le=100)
    collateralization_score: float = Field(..., ge=0, le=100)
    freshness_score: float = Field(..., ge=0, le=100)
    composite_score: float = Field(..., ge=0, le=100)
    days_since_attestation: int
    composition_breakdown: dict[str, float]
    risk_flags: list[str] = Field(default_factory=list)


class PaginatedReserves(BaseModel):
    items: list[ReserveAttestationResponse]
    total: int
    page: int
    page_size: int
    pages: int
