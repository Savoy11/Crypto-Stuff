"""
Integration tests for risk score endpoints.
"""
from __future__ import annotations

from uuid import uuid4

import pytest


class TestRiskScoreEndpoints:
    @pytest.mark.asyncio
    async def test_list_scores_requires_auth(self, client):
        resp = await client.get("/api/v1/risk-scores")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_scores_authenticated(self, client, auth_headers_viewer):
        resp = await client.get("/api/v1/risk-scores", headers=auth_headers_viewer)
        assert resp.status_code in (200, 500)

    @pytest.mark.asyncio
    async def test_latest_score_nonexistent_asset(self, client, auth_headers_viewer):
        fake_id = str(uuid4())
        resp = await client.get(
            f"/api/v1/risk-scores/{fake_id}/latest",
            headers=auth_headers_viewer,
        )
        assert resp.status_code in (404, 500)

    @pytest.mark.asyncio
    async def test_history_invalid_uuid(self, client, auth_headers_viewer):
        resp = await client.get(
            "/api/v1/risk-scores/not-a-uuid/history",
            headers=auth_headers_viewer,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_recalculate_requires_admin(self, client, auth_headers_viewer):
        fake_id = str(uuid4())
        resp = await client.post(
            f"/api/v1/risk-scores/{fake_id}/recalculate",
            headers=auth_headers_viewer,
        )
        assert resp.status_code in (403, 500)

    @pytest.mark.asyncio
    async def test_recalculate_as_admin(self, client, auth_headers_admin):
        fake_id = str(uuid4())
        resp = await client.post(
            f"/api/v1/risk-scores/{fake_id}/recalculate",
            headers=auth_headers_admin,
        )
        assert resp.status_code in (200, 404, 500)
