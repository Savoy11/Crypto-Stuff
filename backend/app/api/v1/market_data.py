"""
Market data endpoints: price feeds, liquidity snapshots, and peg stability.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Query
from sqlalchemy import desc, select

from app.core.exceptions import http_404
from app.dependencies import CurrentUser, DBSession
from app.models.asset import Asset
from app.models.liquidity_metric import LiquidityMetric
from app.models.market_data import MarketData

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/market-data", tags=["Market Data"])


def _envelope(data, meta=None):
    return {
        "success": True,
        "data": data,
        "meta": meta or {},
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("/prices/latest", response_model=dict, summary="Latest prices for all assets")
async def get_latest_prices(
    db: DBSession,
    current_user: CurrentUser,
    symbols: list[str] | None = Query(None, description="Filter by symbol list"),
) -> dict:
    """
    Return the most recent price record for each active asset.
    """
    from sqlalchemy import func

    # Subquery: latest timestamp per asset
    latest_subq = (
        select(MarketData.asset_id, func.max(MarketData.timestamp).label("latest_ts"))
        .group_by(MarketData.asset_id)
        .subquery()
    )
    query = (
        select(MarketData, Asset)
        .join(Asset, Asset.id == MarketData.asset_id)
        .join(
            latest_subq,
            (latest_subq.c.asset_id == MarketData.asset_id)
            & (latest_subq.c.latest_ts == MarketData.timestamp),
        )
        .where(Asset.is_active.is_(True))
    )

    if symbols:
        upper_syms = [s.upper() for s in symbols]
        query = query.where(Asset.symbol.in_(upper_syms))

    result = await db.execute(query)
    rows = result.all()

    prices = []
    for md, asset in rows:
        peg_target = float((asset.asset_metadata or {}).get("peg_target", 1.0))
        prices.append(
            {
                "asset_id": str(asset.id),
                "symbol": asset.symbol,
                "name": asset.name,
                "price_usd": float(md.price_usd) if md.price_usd else None,
                "peg_target": peg_target,
                "peg_deviation_bps": float(md.peg_deviation_bps) if md.peg_deviation_bps else None,
                "market_cap": float(md.market_cap) if md.market_cap else None,
                "volume_24h": float(md.volume_24h) if md.volume_24h else None,
                "last_updated": md.timestamp.isoformat(),
            }
        )

    return _envelope(prices)


@router.get("/{asset_id}/liquidity", response_model=dict, summary="Liquidity metrics for an asset")
async def get_asset_liquidity(
    asset_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Return the latest liquidity depth and venue breakdown for an asset."""
    asset_result = await db.execute(select(Asset).where(Asset.id == asset_id))
    if not asset_result.scalar_one_or_none():
        raise http_404("Asset", str(asset_id))

    liq_result = await db.execute(
        select(LiquidityMetric)
        .where(LiquidityMetric.asset_id == asset_id)
        .order_by(desc(LiquidityMetric.timestamp))
        .limit(1)
    )
    liq = liq_result.scalar_one_or_none()

    if not liq:
        return _envelope(
            {"asset_id": str(asset_id), "data": None, "message": "No liquidity data available"}
        )

    return _envelope(
        {
            "asset_id": str(asset_id),
            "timestamp": liq.timestamp.isoformat(),
            "dex_liquidity_usd": float(liq.dex_liquidity_usd) if liq.dex_liquidity_usd else None,
            "cex_liquidity_usd": float(liq.cex_liquidity_usd) if liq.cex_liquidity_usd else None,
            "total_liquidity_usd": float(liq.total_liquidity_usd)
            if liq.total_liquidity_usd
            else None,
            "slippage_1pct": float(liq.slippage_1pct) if liq.slippage_1pct else None,
            "slippage_2pct": float(liq.slippage_2pct) if liq.slippage_2pct else None,
            "bid_ask_spread_bps": float(liq.bid_ask_spread_bps) if liq.bid_ask_spread_bps else None,
            "depth_1pct_usd": float(liq.depth_1pct_usd) if liq.depth_1pct_usd else None,
            "depth_2pct_usd": float(liq.depth_2pct_usd) if liq.depth_2pct_usd else None,
            "top_venues": liq.top_venues or [],
        }
    )


@router.get("/{asset_id}/peg-status", response_model=dict, summary="Current peg status")
async def get_peg_status(
    asset_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Return a real-time peg stability snapshot for an asset."""
    asset_result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise http_404("Asset", str(asset_id))

    # Get last 24 prices
    md_result = await db.execute(
        select(MarketData)
        .where(MarketData.asset_id == asset_id)
        .order_by(desc(MarketData.timestamp))
        .limit(24)
    )
    md_rows = md_result.scalars().all()

    if not md_rows:
        return _envelope(
            {
                "asset_id": str(asset_id),
                "status": "no_data",
            }
        )

    latest = md_rows[0]
    peg_target = float((asset.asset_metadata or {}).get("peg_target", 1.0))
    current_price = float(latest.price_usd) if latest.price_usd else None
    dev_bps = float(latest.peg_deviation_bps) if latest.peg_deviation_bps else None

    warning_bps = 50.0
    critical_bps = 200.0

    is_depegged = abs(dev_bps) > warning_bps if dev_bps is not None else False
    is_critical = abs(dev_bps) > critical_bps if dev_bps is not None else False

    return _envelope(
        {
            "asset_id": str(asset_id),
            "asset_symbol": asset.symbol,
            "current_price": current_price,
            "peg_target": peg_target,
            "deviation_bps": dev_bps,
            "status": "critical" if is_critical else "warning" if is_depegged else "stable",
            "last_updated": latest.timestamp.isoformat(),
        }
    )
