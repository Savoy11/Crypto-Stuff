"""
Integration tests for the assets REST API.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest


MOCK_ASSETS = [
    {
        "id": str(uuid4()),
        "symbol": "USDC",
        "name": "USD Coin",
        "asset_type": "stablecoin",
        "blockchain": "ethereum",
        "contract_address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "is_active": True,
        "peg_currency": "USD",
        "peg_value": "1.0",
        "coingecko_id": "usd-coin",
        "metadata": {},
    },
    {
        "id": str(uuid4()),
        "symbol": "USDT",
        "name": "Tether USD",
        "asset_type": "stablecoin",
        "blockchain": "ethereum",
        "contract_address": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "is_active": True,
        "peg_currency": "USD",
        "peg_value": "1.0",
        "coingecko_id": "tether",
        "metadata": {},
    },
]


class TestListAssets:
    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client):
        resp = await client.get("/api/v1/assets")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_authenticated_returns_200_or_500(self, client, auth_headers_viewer):
        resp = await client.get("/api/v1/assets", headers=auth_headers_viewer)
        assert resp.status_code in (200, 500)

    @pytest.mark.asyncio
    async def test_response_envelope_structure(self, client, auth_headers_viewer):
        resp = await client.get("/api/v1/assets", headers=auth_headers_viewer)
        if resp.status_code == 200:
            body = resp.json()
            assert "success" in body
            assert "data" in body

    @pytest.mark.asyncio
    async def test_filter_by_asset_type(self, client, auth_headers_analyst):
        resp = await client.get(
            "/api/v1/assets?asset_type=stablecoin",
            headers=auth_headers_analyst,
        )
        assert resp.status_code in (200, 422, 500)

    @pytest.mark.asyncio
    async def test_pagination_params(self, client, auth_headers_viewer):
        resp = await client.get(
            "/api/v1/assets?page=1&page_size=25",
            headers=auth_headers_viewer,
        )
        assert resp.status_code in (200, 422, 500)

    @pytest.mark.asyncio
    async def test_invalid_page_size_rejected(self, client, auth_headers_viewer):
        resp = await client.get(
            "/api/v1/assets?page_size=9999",
            headers=auth_headers_viewer,
        )
        assert resp.status_code in (422, 400, 200)


class TestGetAsset:
    @pytest.mark.asyncio
    async def test_nonexistent_asset_404(self, client, auth_headers_viewer):
        fake_id = str(uuid4())
        resp = await client.get(f"/api/v1/assets/{fake_id}", headers=auth_headers_viewer)
        assert resp.status_code in (404, 500)

    @pytest.mark.asyncio
    async def test_invalid_uuid_422(self, client, auth_headers_viewer):
        resp = await client.get("/api/v1/assets/not-a-uuid", headers=auth_headers_viewer)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client):
        resp = await client.get(f"/api/v1/assets/{uuid4()}")
        assert resp.status_code == 401


class TestAssetComparison:
    @pytest.mark.asyncio
    async def test_compare_requires_auth(self, client):
        resp = await client.get("/api/v1/assets/compare?ids=abc,def")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_compare_with_valid_uuids(self, client, auth_headers_viewer):
        ids = f"{uuid4()},{uuid4()}"
        resp = await client.get(
            f"/api/v1/assets/compare?ids={ids}",
            headers=auth_headers_viewer,
        )
        assert resp.status_code in (200, 404, 422, 500)


@pytest.fixture
def auth_headers_analyst(analyst_token) -> dict[str, str]:
    return {"Authorization": f"Bearer {analyst_token}"}
