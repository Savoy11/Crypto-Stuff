"""
On-chain RPC pipeline: supply metrics, holder counts, and transfer velocity
via JSON-RPC calls to Ethereum (and EVM-compatible) nodes.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import structlog

from app.config import settings
from app.models.asset import Asset
from app.pipelines.base import BasePipeline

logger = structlog.get_logger(__name__)

# ERC-20 function selectors
TOTAL_SUPPLY_SELECTOR = "0x18160ddd"   # totalSupply()
BALANCE_OF_SELECTOR = "0x70a08231"    # balanceOf(address)
DECIMALS_SELECTOR = "0x313ce567"       # decimals()


class OnChainPipeline(BasePipeline):
    """
    Fetches on-chain metrics directly via Ethereum JSON-RPC.

    Computes:
    - Total supply (from ERC-20 totalSupply)
    - Token decimals
    - Estimated transfer velocity using Etherscan-compatible API where available
    """

    name = "onchain"

    def __init__(self) -> None:
        super().__init__()
        self.rpc_url = settings.ETHEREUM_RPC_URL

    async def _eth_call(
        self,
        to: str,
        data: str,
        block: str = "latest",
    ) -> str | None:
        """
        Perform an eth_call JSON-RPC request.

        Args:
            to: Contract address.
            data: ABI-encoded calldata (hex string).
            block: Block number or "latest".

        Returns:
            Hex result string, or None on failure.
        """
        payload = {
            "jsonrpc": "2.0",
            "method": "eth_call",
            "params": [{"to": to, "data": data}, block],
            "id": 1,
        }
        try:
            client = await self._get_client()
            resp = await client.post(
                self.rpc_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            result = resp.json()
            if "error" in result:
                logger.warning("eth_call_error", to=to, error=result["error"])
                return None
            return result.get("result")
        except Exception as exc:
            logger.error("eth_call_failed", to=to, error=str(exc))
            return None

    async def fetch_total_supply(
        self,
        contract_address: str,
        decimals: int = 18,
    ) -> float | None:
        """
        Fetch ERC-20 totalSupply() for a contract.

        Args:
            contract_address: Token contract address.
            decimals: Token decimal places.

        Returns:
            Total supply as a float, or None on error.
        """
        result = await self._eth_call(contract_address, TOTAL_SUPPLY_SELECTOR)
        if result is None or result == "0x":
            return None
        try:
            raw = int(result, 16)
            return raw / (10 ** decimals)
        except (ValueError, TypeError) as exc:
            logger.error("total_supply_parse_error", error=str(exc))
            return None

    async def fetch_decimals(self, contract_address: str) -> int:
        """Fetch ERC-20 decimals() for a contract."""
        result = await self._eth_call(contract_address, DECIMALS_SELECTOR)
        if result is None or result == "0x":
            return 18  # Default
        try:
            return int(result, 16)
        except (ValueError, TypeError):
            return 18

    async def fetch_supply_metrics(self, asset: Asset) -> dict[str, Any] | None:
        """
        Fetch supply-related metrics for a single asset.

        Args:
            asset: Asset ORM object with contract_address set.

        Returns:
            Dict with total_supply, circulating_supply, timestamp.
        """
        contract = asset.contract_address
        if not contract:
            logger.debug("no_contract_address", asset_id=str(asset.id))
            return None

        decimals = await self.fetch_decimals(contract)
        total_supply = await self.fetch_total_supply(contract, decimals)

        if total_supply is None:
            return None

        return {
            "asset_id": str(asset.id),
            "timestamp": datetime.now(UTC),
            "total_supply": total_supply,
            "circulating_supply": total_supply,  # For stablecoins, total ≈ circulating
            "decimals": decimals,
            "source": "rpc",
        }

    async def fetch_eth_block_number(self) -> int | None:
        """Fetch the current Ethereum block number."""
        payload = {
            "jsonrpc": "2.0",
            "method": "eth_blockNumber",
            "params": [],
            "id": 1,
        }
        try:
            client = await self._get_client()
            resp = await client.post(
                self.rpc_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            result = resp.json()
            return int(result.get("result", "0x0"), 16)
        except Exception as exc:
            logger.error("block_number_failed", error=str(exc))
            return None

    def _compute_velocity(
        self,
        transfer_volume: float | None,
        total_supply: float | None,
    ) -> float | None:
        """Compute velocity = transfer_volume / total_supply."""
        if transfer_volume is None or total_supply is None or total_supply <= 0:
            return None
        return transfer_volume / total_supply

    async def ingest(self, assets: list[Asset]) -> list[dict[str, Any]]:
        """
        Fetch on-chain supply metrics for all assets with contract addresses.

        Args:
            assets: List of Asset ORM objects.

        Returns:
            List of blockchain metric record dicts.
        """
        records: list[dict[str, Any]] = []

        for asset in assets:
            if not asset.contract_address:
                continue

            try:
                metrics = await self.fetch_supply_metrics(asset)
                if metrics:
                    records.append(metrics)
            except Exception as exc:
                logger.error(
                    "onchain_asset_failed",
                    asset_id=str(asset.id),
                    error=str(exc),
                )
                continue

        logger.info(
            "onchain_ingest_complete",
            assets_queried=sum(1 for a in assets if a.contract_address),
            records_created=len(records),
        )
        return records
