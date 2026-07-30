"""
ASGI middleware stack: request ID injection, structured logging, CORS,
timing headers, and Prometheus metrics instrumentation.
"""
from __future__ import annotations

import time
import uuid
from collections.abc import Callable

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Counter, Gauge, Histogram
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.config import settings

logger = structlog.get_logger(__name__)

# ------------------------------------------------------------------ #
# Prometheus metrics
# ------------------------------------------------------------------ #

REQUEST_COUNT = Counter(
    "fn_http_requests_total",
    "Total HTTP request count",
    ["method", "endpoint", "status_code"],
)

REQUEST_LATENCY = Histogram(
    "fn_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

REQUEST_IN_PROGRESS = Gauge(
    "fn_http_requests_in_progress",
    "HTTP requests currently in progress",
    ["method", "endpoint"],
)


# ------------------------------------------------------------------ #
# Request ID middleware
# ------------------------------------------------------------------ #


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Attach a unique request ID to every incoming request.
    The ID is available via request.state.request_id and is echoed
    back in the X-Request-ID response header.
    """

    HEADER_NAME = "X-Request-ID"

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get(self.HEADER_NAME) or str(uuid.uuid4())
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers[self.HEADER_NAME] = request_id
        return response


# ------------------------------------------------------------------ #
# Structured logging middleware
# ------------------------------------------------------------------ #


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Log every request/response pair with structured JSON using structlog.
    Captures: method, path, status code, latency, client IP, request ID.
    Excludes health-check paths from verbose logging.
    """

    EXCLUDED_PATHS: set[str] = {"/health", "/metrics", "/favicon.ico"}

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.perf_counter()
        path = request.url.path

        if path in self.EXCLUDED_PATHS:
            return await call_next(request)

        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        client_ip, forwarded_for = self._client_addresses(request)

        bound_logger = logger.bind(
            request_id=request_id,
            method=request.method,
            path=path,
            client_ip=client_ip,
            user_agent=request.headers.get("user-agent", ""),
        )
        if forwarded_for:
            # Named so the field itself says the value is a claim, not a
            # finding. Dropping it would lose the only signal about clients
            # behind a proxy; merging it into client_ip is what made the field
            # spoofable in the first place.
            bound_logger = bound_logger.bind(claimed_forwarded_for=forwarded_for)

        bound_logger.info("request_started")
        normalized = self._normalize_path(path)
        REQUEST_IN_PROGRESS.labels(method=request.method, endpoint=normalized).inc()

        try:
            response = await call_next(request)
            elapsed = time.perf_counter() - start_time

            bound_logger.info(
                "request_completed",
                status_code=response.status_code,
                duration_ms=round(elapsed * 1000, 2),
            )

            REQUEST_COUNT.labels(
                method=request.method,
                endpoint=normalized,
                status_code=response.status_code,
            ).inc()
            REQUEST_LATENCY.labels(method=request.method, endpoint=normalized).observe(elapsed)

            response.headers["X-Response-Time"] = f"{elapsed * 1000:.2f}ms"
            return response

        except Exception as exc:
            elapsed = time.perf_counter() - start_time
            bound_logger.exception(
                "request_failed",
                duration_ms=round(elapsed * 1000, 2),
                error=str(exc),
            )
            raise
        finally:
            REQUEST_IN_PROGRESS.labels(method=request.method, endpoint=normalized).dec()

    @staticmethod
    def _client_addresses(request: Request) -> tuple[str, str | None]:
        """
        Resolve the address to log, plus any address the client merely *claims*.

        This used to return `X-Forwarded-For or peer` unconditionally, which
        made `client_ip` — the field an investigation pivots on — settable by
        the caller. Same defect as the /metrics allowlist bypass; milder, since
        it misleads rather than grants, but a log you cannot trust to attribute
        a request is worse than one that says less.

        Returns `(client_ip, forwarded_for)`:
          - `client_ip` is the peer address, which no client can choose, unless
            TRUST_FORWARDED_FOR says a proxy is overwriting the header.
          - `forwarded_for` is the untrusted claim, returned only when it is
            *not* being trusted, so it can be logged under its own name. The
            header is still useful for tracing real clients behind a proxy —
            it just must not masquerade as the verified address.
        """
        peer = request.client.host if request.client else "unknown"
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or None
        if settings.TRUST_FORWARDED_FOR:
            return (forwarded or peer), None
        return peer, forwarded

    @staticmethod
    def _normalize_path(path: str) -> str:
        """Replace UUID-like segments with {id} placeholder for metric cardinality."""
        import re

        return re.sub(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            "{id}",
            path,
        )


# ------------------------------------------------------------------ #
# Security headers middleware
# ------------------------------------------------------------------ #


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Inject standard security headers into every response.
    Appropriate for an API server (no HTML content).
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        return response


# ------------------------------------------------------------------ #
# Registration helper
# ------------------------------------------------------------------ #


def setup_middleware(app: FastAPI) -> None:
    """
    Register all middleware in correct LIFO order.
    Middleware added last wraps outermost — so request ID comes first.
    """
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=settings.CORS_ALLOW_METHODS,
        allow_headers=settings.CORS_ALLOW_HEADERS,
    )
