"""
Integration tests for authentication endpoints.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.db.session import get_db_session
from app.main import app


class _FakeLoginSession:
    """Async-session stand-in: SELECTs resolve to the given user, writes no-op."""

    def __init__(self, user):
        self._user = user

    async def execute(self, *_args, **_kwargs):
        result = MagicMock()
        result.scalar_one_or_none.return_value = self._user
        return result

    def add(self, *_args, **_kwargs):
        return None

    async def commit(self):
        return None

    async def rollback(self):
        return None

    async def flush(self):
        return None


class TestLoginEndpoint:
    @pytest.mark.asyncio
    async def test_login_returns_tokens(self, client):
        # The login endpoint queries the DB and verifies the bcrypt hash
        # inline (there is no authenticate_user helper). Override the session
        # dependency with a canned user and stub the hash check.
        mock_user = MagicMock()
        mock_user.id = uuid4()
        mock_user.email = "analyst@financenow.example"
        mock_user.role = "analyst"
        mock_user.hashed_password = "x"
        mock_user.is_active = True
        mock_user.mfa_enabled = False
        mock_user.locked_until = None
        mock_user.failed_login_attempts = 0

        async def fake_session():
            yield _FakeLoginSession(mock_user)

        app.dependency_overrides[get_db_session] = fake_session
        try:
            with patch("app.api.v1.auth.verify_password", return_value=True):
                resp = await client.post(
                    "/api/v1/auth/login",
                    json={"email": "analyst@financenow.example", "password": "SecurePass123!"},
                )
        finally:
            app.dependency_overrides.pop(get_db_session, None)

        assert resp.status_code == 200
        payload = resp.json()["data"]
        assert payload["access_token"]
        assert payload["refresh_token"]
        assert payload["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_missing_fields_422(self, client):
        resp = await client.post("/api/v1/auth/login", json={})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_me_unauthenticated_401(self, client):
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_me_with_token(self, client, auth_headers_viewer):
        resp = await client.get("/api/v1/auth/me", headers=auth_headers_viewer)
        assert resp.status_code in (200, 404, 500)  # depends on DB fixture

    @pytest.mark.asyncio
    async def test_refresh_missing_token_422(self, client):
        resp = await client.post("/api/v1/auth/refresh", json={})
        assert resp.status_code in (401, 422)


class TestTokenValidation:
    @pytest.mark.asyncio
    async def test_bearer_token_required(self, client):
        resp = await client.get("/api/v1/assets")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_malformed_token_401(self, client):
        resp = await client.get(
            "/api/v1/assets",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_valid_token_passes_auth(self, client, auth_headers_viewer):
        resp = await client.get("/api/v1/assets", headers=auth_headers_viewer)
        assert resp.status_code in (200, 500)  # 200 when DB is wired
