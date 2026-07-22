"""
Chainlink price feed pipeline: fetch on-chain price oracle data via RPC.
Uses ABI fragments for the AggregatorV3Interface.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import structlog

from app.config import settings
from app.models.asset import Asset
from app.pipelines.base import BasePipeline

logger = structlog.get_logger(__name__)

# AggregatorV3Interface ABI fragment for latestRoundData
AGGREGATOR_ABI_FRAGMENT = [
    {
        "inputs": [],
        "name": "latestRoundData",
        "outputs": [
            {"name": "roundId", "type": "uint80"},
            {"name": "answer", "type": "int256"},
            {"name": "startedAt", "type": "uint256"},
            {"name": "updatedAt", "type": "uint256"},
            {"name": "answeredInRound", "type": "uint80"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "description",
        "outputs": [{"name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function",
    },
]

# Well-known Chainlink price feed contract addresses on Ethereum mainnet
CHAINLINK_FEEDS: dict[str, str] = {
    "USDC": "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
    "USDT": "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
    "DAI": "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
    "BUSD": "0x833D8Eb16D306ed1FbB5D7A2E019e22881aea1DD",
    "FRAX": "0xB9E1E3A9feFf48998E45Fa90847ed4D467E8BcfD",
    "LUSD": "0x3D7aE7E594f2f2091Ad8798313450130d0Aba3a0",
    "TUSD": "0xec746eCF986E2927Abd291a2A1716c940100f8Ba",
    "USDP": "0x09023c0DA49Aaf8fc3fA3ADF34C6A7016D38D5e3",
    "GUSD": "0xa89f5d2365ce98B3cD68012b6f503ab1416245Fc",
    "MIM": "0x7A364e8770418566e3eb2001A96116E6138Eb32F",
}


class ChainlinkPipeline(BasePipeline):
    """
    Fetches price data from Chainlink price feed contracts via JSON-RPC.

    Falls back to a REST-based approach when web3 is unavailable.
    """

    name = "chainlink"

    def __init__(self) -> None:
        super().__init__()
        self.rpc_url = (
            settings.CHAINLINK_RPC_URL
            if hasattr(settings, "CHAINLINK_RPC_URL")
            else settings.ETHEREUM_RPC_URL
        )
        self._web3 = None

    async def _get_web3(self):
        """Lazily initialise web3 connection."""
        if self._web3 is not None:
            return self._web3
        try:
            from web3 import AsyncWeb3

            self._web3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(self.rpc_url))
            return self._web3
        except ImportError:
            logger.warning("web3_not_installed", msg="pip install web3 to enable Chainlink")
            return None

    async def fetch_price_from_feed(
        self,
        feed_address: str,
        asset_symbol: str,
    ) -> dict[str, Any] | None:
        """
        Fetch the latest price from a Chainlink AggregatorV3 contract.

        Args:
            feed_address: Ethereum address of the price feed contract.
            asset_symbol: Symbol for logging.

        Returns:
            Dict with price, timestamp, round_id, or None on failure.
        """
        w3 = await self._get_web3()
        if w3 is None:
            return await self._fetch_price_via_rpc(feed_address, asset_symbol)

        try:
            contract = w3.eth.contract(
                address=w3.to_checksum_address(feed_address),
                abi=AGGREGATOR_ABI_FRAGMENT,
            )
            round_data = await contract.functions.latestRoundData().call()
            decimals = await contract.functions.decimals().call()

            _, answer, _, updated_at, _ = round_data
            price = float(answer) / (10**decimals)
            ts = datetime.fromtimestamp(updated_at, tz=UTC)

            return {
                "price": price,
                "decimals": decimals,
                "timestamp": ts,
                "feed_address": feed_address,
                "asset": asset_symbol,
            }

        except Exception as exc:
            logger.error(
                "chainlink_feed_error",
                feed=feed_address,
                asset=asset_symbol,
                error=str(exc),
            )
            return None

    async def _fetch_price_via_rpc(
        self,
        feed_address: str,
        asset_symbol: str,
    ) -> dict[str, Any] | None:
        """
        Raw eth_call fallback for latestRoundData without web3.py.

        Encodes the call manually and decodes the result.
        """
        # latestRoundData() selector = keccak256("latestRoundData()") first 4 bytes
        selector = "0xfeaf968c"
        payload = {
            "jsonrpc": "2.0",
            "method": "eth_call",
            "params": [
                {"to": feed_address, "data": selector},
                "latest",
            ],
            "id": 1,
        }
        try:
            client = await self._get_client()
            response = await client.post(
                self.rpc_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            result = response.json()

            if "error" in result:
                logger.warning(
                    "chainlink_rpc_error",
                    asset=asset_symbol,
                    error=result["error"],
                )
                return None

            hex_data = result.get("result", "0x")
            if len(hex_data) < 2 + 320:  # 5 * 64 hex chars + 0x
                return None

            # Decode ABI-encoded response: (uint80, int256, uint256, uint256, uint80)
            # Each parameter is 32 bytes (64 hex chars)
            raw = hex_data[2:]  # remove 0x
            answer_hex = raw[64:128]  # second 32-byte slot
            updated_hex = raw[192:256]  # fourth 32-byte slot

            answer = int(answer_hex, 16)
            # Handle negative int256 (two's complement)
            if answer >= 2**255:
                answer -= 2**256
            updated_at = int(updated_hex, 16)

            # Assume 8 decimals (standard for USD feeds)
            price = answer / 1e8
            ts = datetime.fromtimestamp(updated_at, tz=UTC)

            return {
                "price": price,
                "decimals": 8,
                "timestamp": ts,
                "feed_address": feed_address,
                "asset": asset_symbol,
            }

        except Exception as exc:
            logger.error(
                "chainlink_rpc_call_failed",
                asset=asset_symbol,
                error=str(exc),
            )
            return None

    def _map_to_market_record(
        self,
        asset: Asset,
        price_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Transform Chainlink price data into a MarketData record dict."""
        price = price_data.get("price", 0.0)
        peg_target = float((asset.asset_metadata or {}).get("peg_target", 1.0))

        peg_dev_pct = None
        peg_dev_bps = None
        if price and peg_target > 0:
            peg_dev_pct = (price - peg_target) / peg_target * 100.0
            peg_dev_bps = peg_dev_pct * 100.0

        return {
            "asset_id": str(asset.id),
            "timestamp": price_data.get("timestamp", datetime.now(UTC)),
            "price_usd": price,
            "peg_target": peg_target,
            "peg_deviation_pct": peg_dev_pct,
            "peg_deviation_bps": peg_dev_bps,
            "source": "chainlink",
        }

    async def ingest(self, assets: list[Asset]) -> list[dict[str, Any]]:
        """
        Fetch latest Chainlink oracle prices for all assets that have a known feed.

        Args:
            assets: List of Asset ORM objects.

        Returns:
            List of market data record dicts from Chainlink feeds.
        """
        records: list[dict[str, Any]] = []

        for asset in assets:
            feed_address = CHAINLINK_FEEDS.get(asset.symbol.upper())
            if not feed_address:
                # Check metadata for custom feed address
                feed_address = (asset.asset_metadata or {}).get("chainlink_feed")

            if not feed_address:
                continue

            price_data = await self.fetch_price_from_feed(feed_address, asset.symbol)
            if price_data:
                record = self._map_to_market_record(asset, price_data)
                records.append(record)

        logger.info(
            "chainlink_ingest_complete",
            records_created=len(records),
        )
        return records
