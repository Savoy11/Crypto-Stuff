"""
Regression cover for the /metrics IP allowlist.

The 2026-06-14 scorecard recorded "`/metrics` endpoint publicly exposed" as
✅ Fixed (IP allowlist guard). The guard existed, but it read the client IP as

    x-forwarded-for  or  peer address

with no opt-in and no notion of a trusted proxy — so any caller could send
`X-Forwarded-For: 127.0.0.1` and scrape the endpoint the allowlist was there to
protect. It shipped with no test, which is why it survived six weeks of being
cited as a completed control.

These tests pin the properties the fix depends on: the header is ignored unless
explicitly trusted, the peer address is what actually decides, and the
configured allowlist is honoured.
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import create_app


@pytest.fixture
def prod_app(monkeypatch):
    """The guard only engages when DEBUG is off — that is the shipped posture."""
    monkeypatch.setattr(settings, "DEBUG", False)
    return create_app()


def _client(app, peer_ip: str) -> AsyncClient:
    # ASGITransport lets us set the peer address, which is the value a real
    # client cannot choose and the only one the guard should trust by default.
    return AsyncClient(
        transport=ASGITransport(app=app, client=(peer_ip, 12345)),
        base_url="http://test",
    )


@pytest.mark.asyncio
async def test_spoofed_forwarded_for_does_not_grant_access(prod_app, monkeypatch):
    """The original bypass: claim to be localhost via a header anyone can set."""
    monkeypatch.setattr(settings, "TRUST_FORWARDED_FOR", False)
    async with _client(prod_app, "203.0.113.9") as ac:
        resp = await ac.get("/metrics/", headers={"X-Forwarded-For": "127.0.0.1"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_loopback_peer_is_allowed(prod_app, monkeypatch):
    monkeypatch.setattr(settings, "TRUST_FORWARDED_FOR", False)
    async with _client(prod_app, "127.0.0.1") as ac:
        resp = await ac.get("/metrics/")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_unknown_peer_is_refused(prod_app, monkeypatch):
    monkeypatch.setattr(settings, "TRUST_FORWARDED_FOR", False)
    async with _client(prod_app, "203.0.113.9") as ac:
        resp = await ac.get("/metrics/")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_configured_ip_is_allowed(prod_app, monkeypatch):
    """The docstring promised "explicitly configured IPs"; now they exist."""
    monkeypatch.setattr(settings, "TRUST_FORWARDED_FOR", False)
    monkeypatch.setattr(settings, "METRICS_ALLOWED_IPS", ["10.0.0.7"])
    async with _client(prod_app, "10.0.0.7") as ac:
        resp = await ac.get("/metrics/")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_forwarded_for_is_honoured_when_explicitly_trusted(prod_app, monkeypatch):
    """Opting in is still supported — for deployments behind a proxy that
    overwrites the header. The point of the fix is that it is a choice."""
    monkeypatch.setattr(settings, "TRUST_FORWARDED_FOR", True)
    async with _client(prod_app, "203.0.113.9") as ac:
        resp = await ac.get("/metrics/", headers={"X-Forwarded-For": "127.0.0.1"})
    assert resp.status_code == 200
