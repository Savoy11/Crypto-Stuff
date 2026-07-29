"""
Regression cover for the client IP recorded in request logs.

`RequestLoggingMiddleware._get_client_ip` returned `X-Forwarded-For or peer`
unconditionally, so `client_ip` — the field an investigation pivots on — was
whatever the caller chose to send. Found while fixing the same defect in the
/metrics allowlist guard (see test_metrics_guard.py); milder, because a forged
log entry misleads rather than grants access, but a log that cannot attribute a
request is worse than one that says less.

The fix keeps the header's diagnostic value instead of discarding it: the
verified peer address is logged as `client_ip`, and any untrusted claim is
logged separately as `claimed_forwarded_for`, under a name that says what it is.
"""
from __future__ import annotations

import pytest
import structlog
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import create_app


@pytest.fixture
def log_events():
    """Capture structlog events emitted during the request."""
    captured: list[dict] = []

    def sink(_logger, _method, event_dict):
        captured.append(dict(event_dict))
        raise structlog.DropEvent

    original = structlog.get_config()["processors"]
    structlog.configure(processors=[sink])
    yield captured
    structlog.configure(processors=original)


def _client(app, peer_ip: str) -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=app, client=(peer_ip, 12345)),
        base_url="http://test",
    )


def _started(events: list[dict]) -> dict:
    """The request_started entry, which carries the bound address fields."""
    return next(e for e in events if e.get("event") == "request_started")


@pytest.mark.asyncio
async def test_forged_header_does_not_become_client_ip(log_events, monkeypatch):
    """The bug: a caller picks the address that lands in the logs."""
    monkeypatch.setattr(settings, "TRUST_FORWARDED_FOR", False)
    app = create_app()
    async with _client(app, "203.0.113.9") as ac:
        await ac.get("/api/v1/assets", headers={"X-Forwarded-For": "10.1.1.1"})

    entry = _started(log_events)
    assert entry["client_ip"] == "203.0.113.9"
    # Not discarded — recorded under a name that marks it as unverified.
    assert entry["claimed_forwarded_for"] == "10.1.1.1"


@pytest.mark.asyncio
async def test_peer_address_is_used_when_no_header_present(log_events, monkeypatch):
    monkeypatch.setattr(settings, "TRUST_FORWARDED_FOR", False)
    app = create_app()
    async with _client(app, "203.0.113.9") as ac:
        await ac.get("/api/v1/assets")

    entry = _started(log_events)
    assert entry["client_ip"] == "203.0.113.9"
    # Nothing was claimed, so there is nothing to qualify.
    assert "claimed_forwarded_for" not in entry


@pytest.mark.asyncio
async def test_header_is_used_when_explicitly_trusted(log_events, monkeypatch):
    """Behind a proxy that overwrites the header, the forwarded address is the
    real client and should be the one logged — with no redundant claim field."""
    monkeypatch.setattr(settings, "TRUST_FORWARDED_FOR", True)
    app = create_app()
    async with _client(app, "203.0.113.9") as ac:
        await ac.get("/api/v1/assets", headers={"X-Forwarded-For": "10.1.1.1"})

    entry = _started(log_events)
    assert entry["client_ip"] == "10.1.1.1"
    assert "claimed_forwarded_for" not in entry


@pytest.mark.asyncio
async def test_trusted_mode_falls_back_to_peer_without_the_header(log_events, monkeypatch):
    """Trusting the header must not mean logging nothing when it is absent."""
    monkeypatch.setattr(settings, "TRUST_FORWARDED_FOR", True)
    app = create_app()
    async with _client(app, "203.0.113.9") as ac:
        await ac.get("/api/v1/assets")

    entry = _started(log_events)
    assert entry["client_ip"] == "203.0.113.9"
