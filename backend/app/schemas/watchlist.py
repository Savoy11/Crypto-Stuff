"""
Pydantic schemas for watchlist management.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class WatchlistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=512)
    asset_ids: list[uuid.UUID] = Field(default_factory=list)
    is_default: bool = False


class WatchlistUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    asset_ids: list[uuid.UUID] | None = None
    is_default: bool | None = None


class WatchlistAddAsset(BaseModel):
    asset_id: uuid.UUID


class WatchlistResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    description: str | None
    asset_ids: list[uuid.UUID]
    is_default: bool
    created_at: datetime
    updated_at: datetime
    asset_count: int = 0

    @property
    def asset_count(self) -> int:  # type: ignore[override]
        return len(self.asset_ids) if self.asset_ids else 0
