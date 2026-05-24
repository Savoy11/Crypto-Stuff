"""
DefiLlama ingestion pipeline: stablecoin circulating supply, TVL, and peg prices.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import structlog

from app.config import settings
from app.models.asset import Asset
from app.pipelines.base import BasePipeline

logger = structlog.get_logger(__name__)


class DefiLlamaPipeline(BasePipeline):
    """
    Fetches stablecoin and protocol TVL data from DefiLlama.

    Key endpoints:
    - /stablecoins                     → all stablecoin circulating supply
    - /stablecoin/{id}                 → historical supply for one stablecoin
    - /protocols                       → all protocol TVL
    - /protocol/{name}                 → historical TVL for one protocol
    """

    name = "defillama"
    MIN_REQUEST_INTERVAL: float = 0.5  # DefiLlama is generous on rate limits

    def __init__(self) -> None:
        super().__init__()
        self.base_url = settings.DEFILLAMA_BASE_URL
        self.stablecoins_url = settings.DEFILLAMA_STABLECOINS_URL

    async def fetch_all_stablecoins(self) -> list[dict[str, Any]]:
        """
        Fetch the full stablecoin circulating supply list.

        Returns:
            List of stablecoin summary dicts.
        """
        data = await self.rate_limited_request(
            f"{self.stablecoins_url}/stablecoins",
            params={"includePrices": True},
            min_interval=self.MIN_REQUEST_INTERVAL,
        )
        self.validate_response(data, ["peggedAssets"], source="stablecoins")
        return data.get("peggedAssets", [])

    async def fetch_stablecoin_detail(self, stablecoin_id: str) -> dict[str, Any]:
        """
        Fetch historical supply data for a single stablecoin.

        Args:
            stablecoin_id: DefiLlama stablecoin numeric ID (e.g., "1").

        Returns:
            Dict with historical "tokens" supply data.
        """
        data = await self.rate_limited_request(
            f"{self.stablecoins_url}/stablecoin/{stablecoin_id}",
            min_interval=self.MIN_REQUEST_INTERVAL,
        )
        return data

    async def fetch_all_protocols(self) -> list[dict[str, Any]]:
        """
        Fetch the full TVL protocol list.

        Returns:
            List of protocol summary dicts.
        """
        data = await self.rate_limited_request(
            f"{self.base_url}/protocols",
            min_interval=self.MIN_REQUEST_INTERVAL,
        )
        self.validate_list_response(data, source="protocols")
        return data

    async def fetch_protocol_tvl(self, protocol_slug: str) -> dict[str, Any]:
        """
        Fetch historical TVL for a specific protocol.

        Args:
            protocol_slug: Protocol slug (e.g., "makerdao").

        Returns:
            Dict with "tvl" historical array.
        """
        data = await self.rate_limited_request(
            f"{self.base_url}/protocol/{protocol_slug}",
            min_interval=self.MIN_REQUEST_INTERVAL,
        )
        return data

    def _map_stablecoin_to_supply(
        self, asset: Asset, row: dict[str, Any]
    ) -> dict[str, Any] | None:
        """
        Extract circulating supply figures from a DefiLlama stablecoin row.

        Returns supply dict or None if mapping fails.
        """
        circulating = row.get("circulating", {})
        peg_type = row.get("pegType", "")
        peg_mechanism = row.get("pegMechanism", "")

        # Prefer USD-denominated peg values
        usd_circulating = (
            circulating.get("peggedUSD")
            or circulating.get("peggedEUR")
            or 0.0
        )

        if usd_circulating == 0:
            return None

        price = row.get("price")
        peg_target = float((asset.asset_metadata or {}).get("peg_target", 1.0))

        peg_dev_pct = None
        peg_dev_bps = None
        if price is not None and peg_target > 0:
            peg_dev_pct = (float(price) - peg_target) / peg_target * 100.0
            peg_dev_bps = peg_dev_pct * 100.0

        return {
            "asset_id": str(asset.id),
            "timestamp": datetime.now(UTC),
            "price_usd": price,
            "market_cap": usd_circulating,
            "peg_deviation_pct": peg_dev_pct,
            "peg_deviation_bps": peg_dev_bps,
            "source": "defillama",
            "peg_type": peg_type,
            "peg_mechanism": peg_mechanism,
        }

    def _build_defillama_id_map(
        self,
        assets: list[Asset],
        stablecoins: list[dict[str, Any]],
    ) -> dict[str, tuple[Asset, dict[str, Any]]]:
        """
        Match assets to DefiLlama stablecoin rows by symbol or defillama_id.

        Returns:
            Dict mapping defillama_id → (Asset, stablecoin_row).
        """
        result: dict[str, tuple[Asset, dict[str, Any]]] = {}

        for sc in stablecoins:
            sc_symbol = sc.get("symbol", "").upper()
            sc_id = str(sc.get("id", ""))
            sc_name = sc.get("name", "").lower()

            for asset in assets:
                # Try explicit defillama_id first
                if asset.defillama_id and str(asset.defillama_id) == sc_id:
                    result[sc_id] = (asset, sc)
                    break
                # Fallback: match by symbol
                if asset.symbol.upper() == sc_symbol:
                    result[sc_id] = (asset, sc)
                    break

        return result

    async def ingest(self, assets: list[Asset]) -> list[dict[str, Any]]:
        """
        Fetch stablecoin data from DefiLlama for all eligible assets.

        Args:
            assets: List of Asset ORM objects.

        Returns:
            List of market data record dicts enriched with DefiLlama supply figures.
        """
        try:
            all_stablecoins = await self.fetch_all_stablecoins()
        except Exception as exc:
            logger.error("defillama_fetch_failed", error=str(exc))
            return []

        id_map = self._build_defillama_id_map(assets, all_stablecoins)
        records: list[dict[str, Any]] = []

        for sc_id, (asset, sc_row) in id_map.items():
            record = self._map_stablecoin_to_supply(asset, sc_row)
            if record:
                records.append(record)

        logger.info(
            "defillama_ingest_complete",
            stablecoins_available=len(all_stablecoins),
            assets_matched=len(id_map),
            records_created=len(records),
        )
        return records

    async def ingest_historical_supply(
        self,
        asset: Asset,
    ) -> list[dict[str, Any]]:
        """
        Fetch historical supply data for a single asset from DefiLlama.

        Args:
            asset: Asset ORM object with defillama_id set.

        Returns:
            List of supply history records.
        """
        if not asset.defillama_id:
            logger.warning("defillama_no_id", asset_id=str(asset.id))
            return []

        try:
            detail = await self.fetch_stablecoin_detail(str(asset.defillama_id))
        except Exception as exc:
            logger.error(
                "defillama_historical_failed",
                asset_id=str(asset.id),
                error=str(exc),
            )
            return []

        tokens = detail.get("tokens", [])
        peg_target = float((asset.asset_metadata or {}).get("peg_target", 1.0))
        records: list[dict[str, Any]] = []

        for entry in tokens:
            ts_str = entry.get("date")
            supply_data = entry.get("tokens", {})

            if ts_str is None:
                continue

            try:
                ts = datetime.fromtimestamp(float(ts_str), tz=UTC)
            except (ValueError, TypeError):
                continue

            usd_supply = float(
                supply_data.get("peggedUSD") or supply_data.get("peggedEUR") or 0.0
            )

            records.append({
                "asset_id": str(asset.id),
                "timestamp": ts,
                "market_cap": usd_supply,
                "source": "defillama_historical",
            })

        deduped = self.deduplicate_records(records, key_fields=["asset_id", "timestamp"])
        logger.info(
            "defillama_historical_loaded",
            asset_id=str(asset.id),
            records=len(deduped),
        )
        return deduped
