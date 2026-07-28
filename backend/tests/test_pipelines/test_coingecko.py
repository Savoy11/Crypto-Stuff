"""
Unit tests for the CoinGecko data pipeline.

These test the CURRENT pipeline API (fetch_markets / rate_limited_request /
_map_market_row_to_record / deduplicate_records(key_fields=...)). An earlier
version of this file tested methods that no longer exist after the pipeline
refactor (fetch_market_data, _raw_fetch, _calc_peg_deviation_bps,
_parse_rate_limit_headers) and failed at attribute lookup.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import pytest

from app.pipelines.coingecko import CoinGeckoPipeline

MOCK_COINGECKO_MARKET_RESPONSE = [
    {
        "id": "usd-coin",
        "symbol": "usdc",
        "name": "USD Coin",
        "current_price": 1.000,
        "market_cap": 32_000_000_000,
        "total_volume": 5_000_000_000,
        "price_change_percentage_24h": 0.01,
        "circulating_supply": 32_000_000_000,
        "total_supply": 32_000_000_000,
        "market_cap_rank": 6,
        "last_updated": "2024-01-01T00:00:00.000Z",
    }
]


def _mock_asset(peg_target: float = 1.0) -> MagicMock:
    asset = MagicMock()
    asset.id = uuid4()
    asset.asset_metadata = {"peg_target": peg_target}
    return asset


class TestCoinGeckoPipeline:
    def setup_method(self):
        self.pipeline = CoinGeckoPipeline()

    @pytest.mark.asyncio
    async def test_fetch_markets_parses_response(self):
        with patch.object(
            self.pipeline,
            "rate_limited_request",
            new=AsyncMock(return_value=MOCK_COINGECKO_MARKET_RESPONSE),
        ):
            result = await self.pipeline.fetch_markets(ids=["usd-coin"])
        assert isinstance(result, list)
        assert len(result) >= 1
        assert result[0]["symbol"] == "usdc"

    @pytest.mark.asyncio
    async def test_empty_upstream_returns_empty(self):
        with patch.object(
            self.pipeline,
            "rate_limited_request",
            new=AsyncMock(return_value=[]),
        ):
            result = await self.pipeline.fetch_markets(ids=[])
        assert result == []

    @pytest.mark.asyncio
    async def test_retry_on_timeout(self):
        ok = MagicMock()
        ok.status_code = 200
        ok.json.return_value = MOCK_COINGECKO_MARKET_RESPONSE

        client = MagicMock()
        client.get = AsyncMock(
            side_effect=[httpx.TimeoutException("t"), httpx.TimeoutException("t"), ok]
        )

        with (
            patch.object(self.pipeline, "_get_client", new=AsyncMock(return_value=client)),
            patch("app.pipelines.base.asyncio.sleep", new=AsyncMock()),
        ):
            result = await self.pipeline.fetch_with_retry("/coins/markets", max_retries=3)
        assert client.get.await_count == 3
        assert result == MOCK_COINGECKO_MARKET_RESPONSE

    def test_map_market_row_to_record(self):
        asset = _mock_asset()
        record = self.pipeline._map_market_row_to_record(asset, MOCK_COINGECKO_MARKET_RESPONSE[0])
        assert record["asset_id"] == str(asset.id)
        assert 0.95 <= record["price_usd"] <= 1.05
        assert record["peg_deviation_bps"] == pytest.approx(0.0, abs=1e-9)

    def test_peg_deviation_above_peg(self):
        asset = _mock_asset()
        row = dict(MOCK_COINGECKO_MARKET_RESPONSE[0], current_price=1.001)
        record = self.pipeline._map_market_row_to_record(asset, row)
        assert record["peg_deviation_bps"] == pytest.approx(10.0, rel=0.1)

    def test_peg_deviation_below_peg(self):
        asset = _mock_asset()
        row = dict(MOCK_COINGECKO_MARKET_RESPONSE[0], current_price=0.99)
        record = self.pipeline._map_market_row_to_record(asset, row)
        assert record["peg_deviation_bps"] == pytest.approx(-100.0, rel=0.1)

    @pytest.mark.asyncio
    async def test_rate_limited_request_delegates_to_fetch(self):
        with patch.object(
            self.pipeline,
            "fetch_with_retry",
            new=AsyncMock(return_value=MOCK_COINGECKO_MARKET_RESPONSE),
        ) as fetch:
            result = await self.pipeline.rate_limited_request(
                "https://example.test/coins/markets", min_interval=0.0
            )
        fetch.assert_awaited_once()
        assert result == MOCK_COINGECKO_MARKET_RESPONSE

    def test_deduplication_removes_duplicate_key_fields(self):
        records = [
            {"asset_id": "abc", "timestamp": "2024-01-01T00:00:00Z", "price_usd": 1.0},
            {"asset_id": "abc", "timestamp": "2024-01-01T00:00:00Z", "price_usd": 1.001},
            {"asset_id": "abc", "timestamp": "2024-01-01T01:00:00Z", "price_usd": 0.999},
        ]
        deduped = self.pipeline.deduplicate_records(records, key_fields=["asset_id", "timestamp"])
        assert len(deduped) == 2
