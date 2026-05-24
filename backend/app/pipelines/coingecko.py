"""
CoinGecko ingestion pipeline: market data, coin details, and historical OHLCV.
Respects the free-tier rate limit of 30 req/min (2s between requests).
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.asset import Asset
from app.models.market_data import MarketData
from app.pipelines.base import BasePipeline

logger = structlog.get_logger(__name__)


class CoinGeckoPipeline(BasePipeline):
    """
    Fetches price, market cap, volume, and historical data from CoinGecko.

    For the free tier, the minimum interval between requests is 2s
    to stay within the 30 req/min limit. The Pro tier allows higher throughput.
    """

    name = "coingecko"
    # Free tier: 30 req/min → 2s between requests
    MIN_REQUEST_INTERVAL: float = 2.0

    def __init__(self) -> None:
        super().__init__()
        self.base_url = settings.coingecko_base

    def _auth_headers(self) -> dict[str, str]:
        if settings.COINGECKO_API_KEY:
            return {"x-cg-pro-api-key": settings.COINGECKO_API_KEY}
        return {}

    async def fetch_markets(
        self,
        vs_currency: str = "usd",
        ids: list[str] | None = None,
        page: int = 1,
        per_page: int = 250,
    ) -> list[dict[str, Any]]:
        """
        Fetch coins/markets endpoint.

        Args:
            vs_currency: Quote currency (default "usd").
            ids: Optional list of CoinGecko coin IDs to filter.
            page: Page number.
            per_page: Results per page (max 250).

        Returns:
            List of market data dicts.
        """
        params: dict[str, Any] = {
            "vs_currency": vs_currency,
            "order": "market_cap_desc",
            "per_page": per_page,
            "page": page,
            "sparkline": False,
            "price_change_percentage": "24h",
        }
        if ids:
            params["ids"] = ",".join(ids)

        data = await self.rate_limited_request(
            f"{self.base_url}/coins/markets",
            params=params,
            headers=self._auth_headers(),
            min_interval=self.MIN_REQUEST_INTERVAL,
        )
        self.validate_list_response(data, source="coins/markets")
        return data

    async def fetch_coin_detail(self, coin_id: str) -> dict[str, Any]:
        """
        Fetch full coin details including community/developer data.

        Args:
            coin_id: CoinGecko coin ID (e.g., "usd-coin").

        Returns:
            Coin detail dict.
        """
        data = await self.rate_limited_request(
            f"{self.base_url}/coins/{coin_id}",
            params={
                "localization": False,
                "tickers": False,
                "market_data": True,
                "community_data": False,
                "developer_data": False,
                "sparkline": False,
            },
            headers=self._auth_headers(),
            min_interval=self.MIN_REQUEST_INTERVAL,
        )
        self.validate_response(data, ["id", "symbol", "name"], source=f"coins/{coin_id}")
        return data

    async def fetch_market_chart(
        self,
        coin_id: str,
        vs_currency: str = "usd",
        days: int = 7,
        interval: str = "hourly",
    ) -> dict[str, Any]:
        """
        Fetch historical OHLCV chart data.

        Args:
            coin_id: CoinGecko coin ID.
            vs_currency: Quote currency.
            days: Number of days of history.
            interval: Data granularity ("hourly" or "daily").

        Returns:
            Dict with "prices", "market_caps", "total_volumes" time series.
        """
        data = await self.rate_limited_request(
            f"{self.base_url}/coins/{coin_id}/market_chart",
            params={
                "vs_currency": vs_currency,
                "days": days,
                "interval": interval,
            },
            headers=self._auth_headers(),
            min_interval=self.MIN_REQUEST_INTERVAL,
        )
        self.validate_response(data, ["prices"], source=f"market_chart/{coin_id}")
        return data

    def _map_market_row_to_record(
        self,
        asset: Asset,
        row: dict[str, Any],
    ) -> dict[str, Any]:
        """Transform a CoinGecko markets row into a MarketData insert dict."""
        price = row.get("current_price")
        peg_target = float((asset.asset_metadata or {}).get("peg_target", 1.0))

        peg_dev_pct = None
        peg_dev_bps = None
        if price is not None and peg_target > 0:
            peg_dev_pct = (price - peg_target) / peg_target * 100.0
            peg_dev_bps = peg_dev_pct * 100.0

        return {
            "asset_id": str(asset.id),
            "timestamp": datetime.now(UTC),
            "price_usd": price,
            "market_cap": row.get("market_cap"),
            "volume_24h": row.get("total_volume"),
            "peg_target": peg_target,
            "peg_deviation_pct": peg_dev_pct,
            "peg_deviation_bps": peg_dev_bps,
            "market_cap_rank": row.get("market_cap_rank"),
        }

    def _map_chart_to_records(
        self,
        asset: Asset,
        chart_data: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Transform CoinGecko market chart data into MarketData insert dicts."""
        prices = chart_data.get("prices", [])
        market_caps = {ts: cap for ts, cap in chart_data.get("market_caps", [])}
        volumes = {ts: vol for ts, vol in chart_data.get("total_volumes", [])}

        peg_target = float((asset.asset_metadata or {}).get("peg_target", 1.0))
        records = []

        for ts_ms, price in prices:
            ts = datetime.fromtimestamp(ts_ms / 1000.0, tz=UTC)
            peg_dev_pct = None
            peg_dev_bps = None
            if price is not None and peg_target > 0:
                peg_dev_pct = (price - peg_target) / peg_target * 100.0
                peg_dev_bps = peg_dev_pct * 100.0

            records.append({
                "asset_id": str(asset.id),
                "timestamp": ts,
                "price_usd": price,
                "market_cap": market_caps.get(ts_ms),
                "volume_24h": volumes.get(ts_ms),
                "peg_target": peg_target,
                "peg_deviation_pct": peg_dev_pct,
                "peg_deviation_bps": peg_dev_bps,
            })

        return records

    async def ingest(self, assets: list[Asset]) -> list[dict[str, Any]]:
        """
        Fetch latest market data for a list of assets and return transformed records.

        Args:
            assets: List of Asset ORM objects with coingecko_id populated.

        Returns:
            List of MarketData record dicts.
        """
        # Filter assets that have a CoinGecko ID
        eligible = [a for a in assets if a.coingecko_id]
        if not eligible:
            logger.info("coingecko_no_eligible_assets")
            return []

        coin_id_map = {a.coingecko_id: a for a in eligible}
        ids = list(coin_id_map.keys())

        # Batch requests in chunks of 250 (CoinGecko per_page limit)
        all_records: list[dict[str, Any]] = []
        chunk_size = 250

        for i in range(0, len(ids), chunk_size):
            chunk_ids = ids[i : i + chunk_size]
            try:
                market_rows = await self.fetch_markets(ids=chunk_ids)
                for row in market_rows:
                    coin_id = row.get("id")
                    asset = coin_id_map.get(coin_id)
                    if asset:
                        record = self._map_market_row_to_record(asset, row)
                        all_records.append(record)
            except Exception as exc:
                logger.error(
                    "coingecko_batch_failed",
                    chunk_start=i,
                    error=str(exc),
                )
                continue

        logger.info(
            "coingecko_ingest_complete",
            assets_processed=len(eligible),
            records_created=len(all_records),
        )
        return all_records

    async def ingest_historical(
        self,
        asset: Asset,
        days: int = 7,
        db: AsyncSession | None = None,
    ) -> list[dict[str, Any]]:
        """
        Fetch and optionally persist full historical chart data for one asset.

        Args:
            asset: Asset ORM object.
            days: Number of days of history.
            db: If provided, records are upserted into the database.

        Returns:
            List of MarketData record dicts.
        """
        if not asset.coingecko_id:
            logger.warning("coingecko_no_id", asset=str(asset.id))
            return []

        try:
            chart = await self.fetch_market_chart(
                coin_id=asset.coingecko_id,
                days=days,
                interval="hourly" if days <= 90 else "daily",
            )
            records = self._map_chart_to_records(asset, chart)
            deduplicated = self.deduplicate_records(
                records, key_fields=["asset_id", "timestamp"]
            )

            logger.info(
                "coingecko_historical_fetched",
                asset_id=str(asset.id),
                coin_id=asset.coingecko_id,
                records=len(deduplicated),
            )
            return deduplicated

        except Exception as exc:
            logger.error(
                "coingecko_historical_failed",
                asset_id=str(asset.id),
                error=str(exc),
            )
            return []
