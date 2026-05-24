"""
Watchlist management endpoints.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.exceptions import http_404, http_409
from app.dependencies import CurrentUser, DBSession
from app.models.watchlist import Watchlist
from app.schemas.watchlist import WatchlistAddAsset, WatchlistCreate, WatchlistResponse, WatchlistUpdate

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/watchlists", tags=["Watchlists"])


def _envelope(data, meta=None):
    return {
        "success": True,
        "data": data,
        "meta": meta or {},
        "timestamp": datetime.now(UTC).isoformat(),
    }


def _to_response(wl: Watchlist) -> dict:
    return {
        "id": str(wl.id),
        "user_id": str(wl.user_id),
        "name": wl.name,
        "description": wl.description,
        "asset_ids": [str(a) for a in (wl.asset_ids or [])],
        "is_default": wl.is_default,
        "asset_count": len(wl.asset_ids or []),
        "created_at": wl.created_at.isoformat(),
        "updated_at": wl.updated_at.isoformat(),
    }


@router.get("", response_model=dict, summary="List user's watchlists")
async def list_watchlists(
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    result = await db.execute(
        select(Watchlist)
        .where(Watchlist.user_id == current_user.id)
        .order_by(Watchlist.is_default.desc(), Watchlist.name)
    )
    watchlists = result.scalars().all()
    return _envelope([_to_response(w) for w in watchlists])


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED, summary="Create a watchlist")
async def create_watchlist(
    body: WatchlistCreate,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    # Check duplicate name for user
    existing = await db.execute(
        select(Watchlist).where(
            Watchlist.user_id == current_user.id, Watchlist.name == body.name
        )
    )
    if existing.scalar_one_or_none():
        raise http_409(f"Watchlist named '{body.name}' already exists")

    # If setting as default, clear existing defaults
    if body.is_default:
        from sqlalchemy import update
        await db.execute(
            update(Watchlist)
            .where(Watchlist.user_id == current_user.id, Watchlist.is_default == True)
            .values(is_default=False)
        )

    wl = Watchlist(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        asset_ids=[str(a) for a in body.asset_ids],
        is_default=body.is_default,
    )
    db.add(wl)
    await db.flush()
    return _envelope(_to_response(wl))


@router.get("/{watchlist_id}", response_model=dict, summary="Get watchlist detail")
async def get_watchlist(
    watchlist_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    result = await db.execute(
        select(Watchlist).where(
            Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id
        )
    )
    wl = result.scalar_one_or_none()
    if not wl:
        raise http_404("Watchlist", str(watchlist_id))
    return _envelope(_to_response(wl))


@router.patch("/{watchlist_id}", response_model=dict, summary="Update a watchlist")
async def update_watchlist(
    watchlist_id: uuid.UUID,
    body: WatchlistUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    result = await db.execute(
        select(Watchlist).where(
            Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id
        )
    )
    wl = result.scalar_one_or_none()
    if not wl:
        raise http_404("Watchlist", str(watchlist_id))

    if body.name is not None:
        wl.name = body.name
    if body.description is not None:
        wl.description = body.description
    if body.asset_ids is not None:
        wl.asset_ids = [str(a) for a in body.asset_ids]
    if body.is_default is not None:
        wl.is_default = body.is_default

    await db.flush()
    return _envelope(_to_response(wl))


@router.delete("/{watchlist_id}", response_model=dict, summary="Delete a watchlist")
async def delete_watchlist(
    watchlist_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    result = await db.execute(
        select(Watchlist).where(
            Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id
        )
    )
    wl = result.scalar_one_or_none()
    if not wl:
        raise http_404("Watchlist", str(watchlist_id))

    await db.delete(wl)
    await db.flush()
    return _envelope({"message": "Watchlist deleted", "id": str(watchlist_id)})


@router.post("/{watchlist_id}/assets", response_model=dict, summary="Add asset to watchlist")
async def add_asset(
    watchlist_id: uuid.UUID,
    body: WatchlistAddAsset,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    result = await db.execute(
        select(Watchlist).where(
            Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id
        )
    )
    wl = result.scalar_one_or_none()
    if not wl:
        raise http_404("Watchlist", str(watchlist_id))

    current_ids = [str(a) for a in (wl.asset_ids or [])]
    asset_id_str = str(body.asset_id)
    if asset_id_str not in current_ids:
        current_ids.append(asset_id_str)
        wl.asset_ids = current_ids
        await db.flush()

    return _envelope(_to_response(wl))


@router.delete("/{watchlist_id}/assets/{asset_id}", response_model=dict, summary="Remove asset from watchlist")
async def remove_asset(
    watchlist_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    result = await db.execute(
        select(Watchlist).where(
            Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id
        )
    )
    wl = result.scalar_one_or_none()
    if not wl:
        raise http_404("Watchlist", str(watchlist_id))

    current_ids = [str(a) for a in (wl.asset_ids or [])]
    asset_id_str = str(asset_id)
    if asset_id_str in current_ids:
        current_ids.remove(asset_id_str)
        wl.asset_ids = current_ids
        await db.flush()

    return _envelope(_to_response(wl))
