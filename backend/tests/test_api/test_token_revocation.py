"""
Regression cover for JWT revocation.

The 2026-06-14 scorecard recorded "JWT tokens not revoked on logout" as
✅ Fixed (Redis JTI blocklist). `/logout` did write `blocklist:<jti>`, and
`verify_token_not_revoked` did check it — but **nothing called that function**.
`get_current_user`, the WebSocket handshake and `/refresh` all used the plain
`verify_token`, so the blocklist was write-only and logout revoked nothing for
six weeks. The parts existed; the wiring did not, and no test covered the path
end to end.

These tests pin the behaviour rather than the presence of the pieces:
a blocklisted token must be rejected *by the dependency an endpoint actually
uses*, not merely by the helper in isolation.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.config import settings
from app.core.exceptions import InvalidTokenError
from app.core.security import create_access_token, create_refresh_token, verify_token_not_revoked
from app.dependencies import get_current_user


class FakeRedis:
    """Minimal in-memory stand-in — the suite has no fakeredis dependency."""

    def __init__(self, blocked: set[str] | None = None) -> None:
        self._blocked = blocked or set()

    async def exists(self, key: str) -> int:
        return 1 if key in self._blocked else 0

    async def setex(self, key: str, _ttl: int, _value: str) -> bool:
        self._blocked.add(key)
        return True


class BrokenRedis:
    """Stands in for an unreachable Redis."""

    async def exists(self, key: str):
        raise ConnectionError("redis down")


def _patch_redis(monkeypatch, client) -> None:
    # verify_token_not_revoked imports get_redis lazily from this module, so
    # this is the name that has to be patched.
    import app.core.rate_limiter as rl

    async def _get_redis():
        return client

    monkeypatch.setattr(rl, "get_redis", _get_redis)


def _jti(token: str) -> str:
    from jose import jwt

    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])["jti"]


# ── The helper itself ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_blocklisted_token_is_rejected(monkeypatch):
    token = create_access_token(str(uuid.uuid4()), "viewer")
    _patch_redis(monkeypatch, FakeRedis({f"blocklist:{_jti(token)}"}))

    with pytest.raises(InvalidTokenError):
        await verify_token_not_revoked(token, expected_type="access")


@pytest.mark.asyncio
async def test_untouched_token_passes(monkeypatch):
    token = create_access_token(str(uuid.uuid4()), "viewer")
    _patch_redis(monkeypatch, FakeRedis())

    payload = await verify_token_not_revoked(token, expected_type="access")
    assert payload["type"] == "access"


@pytest.mark.asyncio
async def test_refresh_tokens_are_checked_too(monkeypatch):
    """/logout blocklists the refresh jti — that is the entry that matters most,
    since a live refresh token mints new access tokens for its full 7 days."""
    token = create_refresh_token(str(uuid.uuid4()))
    _patch_redis(monkeypatch, FakeRedis({f"blocklist:{_jti(token)}"}))

    with pytest.raises(InvalidTokenError):
        await verify_token_not_revoked(token, expected_type="refresh")


# ── Redis unavailable ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_fails_open_by_default_when_redis_is_down(monkeypatch):
    """Deliberate: a Redis outage degrades revocation rather than locking every
    user out. The short access-token lifetime is what bounds the exposure."""
    monkeypatch.setattr(settings, "BLOCKLIST_FAIL_CLOSED", False)
    token = create_access_token(str(uuid.uuid4()), "viewer")
    _patch_redis(monkeypatch, BrokenRedis())

    payload = await verify_token_not_revoked(token, expected_type="access")
    assert payload["type"] == "access"


@pytest.mark.asyncio
async def test_fails_closed_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "BLOCKLIST_FAIL_CLOSED", True)
    token = create_access_token(str(uuid.uuid4()), "viewer")
    _patch_redis(monkeypatch, BrokenRedis())

    with pytest.raises(InvalidTokenError):
        await verify_token_not_revoked(token, expected_type="access")


# ── Wiring: the part that was actually missing ────────────────────────────────


@pytest.mark.asyncio
async def test_get_current_user_rejects_a_revoked_token(monkeypatch):
    """
    The regression that matters. `get_current_user` guards every protected
    route; before the fix it called plain `verify_token` and a revoked token
    sailed through.

    `db=None` is intentional: the revocation check runs before any database
    access, so a correctly-wired dependency raises 401 without ever touching
    it. An unwired one would get past the check and fail on the None instead —
    which is a different error, and that difference is the assertion.
    """
    token = create_access_token(str(uuid.uuid4()), "viewer")
    _patch_redis(monkeypatch, FakeRedis({f"blocklist:{_jti(token)}"}))
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as exc:
        await get_current_user(creds, db=None)  # type: ignore[arg-type]
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_access_token_lifetime_is_short():
    """
    Not style — the blocklist fails open when Redis is unreachable, so this
    value is the only bound on a revoked token that always holds. 30 minutes
    was the old default; anything above 15 reopens the window this closes.
    """
    assert settings.ACCESS_TOKEN_EXPIRE_MINUTES <= 15
