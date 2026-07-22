"""
Unit tests for the CoinGecko data pipeline.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

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
        "last_updated": "2024-01-01T00:00:00.000Z",
    }
]


class TestCoinGeckoPipeline:
    def setup_method(self):
        self.pipeline = CoinGeckoPipeline()

    @pytest.mark.asyncio
    async def test_fetch_market_data_parses_response(self):
        with patch.object(
            self.pipeline,
            "fetch_with_retry",
            new=AsyncMock(return_value=MOCK_COINGECKO_MARKET_RESPONSE),
        ):
            result = await self.pipeline.fetch_market_data(["usd-coin"])
        assert isinstance(result, list)
        assert len(result) >= 1

    @pytest.mark.asyncio
    async def test_empty_ids_returns_empty(self):
        with patch.object(
            self.pipeline,
            "fetch_with_retry",
            new=AsyncMock(return_value=[]),
        ):
            result = await self.pipeline.fetch_market_data([])
        assert result == []

    @pytest.mark.asyncio
    async def test_retry_on_failure(self):
        call_count = 0

        async def flaky(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise Exception("Simulated network error")
            return MOCK_COINGECKO_MARKET_RESPONSE

        with patch.object(self.pipeline, "_raw_fetch", new=flaky):
            result = await self.pipeline.fetch_with_retry("/coins/markets", max_retries=3)
        assert call_count == 3
        assert result == MOCK_COINGECKO_MARKET_RESPONSE

    def test_map_market_item_to_internal(self):
        raw = MOCK_COINGECKO_MARKET_RESPONSE[0]
        mapped = self.pipeline._map_market_item(raw)
        assert mapped["symbol"].upper() == "USDC"
        assert 0.95 <= mapped["price_usd"] <= 1.05

    def test_calculate_peg_deviation_from_price(self):
        deviation = self.pipeline._calc_peg_deviation_bps(price=1.001, peg=1.0)
        assert deviation == pytest.approx(10.0, rel=0.1)

    def test_peg_deviation_below_peg(self):
        deviation = self.pipeline._calc_peg_deviation_bps(price=0.99, peg=1.0)
        assert deviation == pytest.approx(100.0, rel=0.1)

    def test_rate_limit_header_parsing(self):
        headers = {"x-ratelimit-remaining": "5", "x-ratelimit-reset": "60"}
        remaining = self.pipeline._parse_rate_limit_headers(headers)
        assert remaining == 5

    def test_deduplication_removes_duplicate_timestamps(self):
        records = [
            {"asset_id": "abc", "timestamp": "2024-01-01T00:00:00Z", "price_usd": 1.0},
            {"asset_id": "abc", "timestamp": "2024-01-01T00:00:00Z", "price_usd": 1.001},
            {"asset_id": "abc", "timestamp": "2024-01-01T01:00:00Z", "price_usd": 0.999},
        ]
        deduped = self.pipeline.deduplicate_records(records, key=("asset_id", "timestamp"))
        assert len(deduped) == 2
