"""
Crypto Asset Evaluation Platform — FastAPI application entry point.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from prometheus_client import make_asgi_app

from app.api.v1.router import api_router
from app.config import settings
from app.core.exceptions import CAEPException
from app.core.middleware import setup_middleware
from app.db.session import close_db, get_engine
from app.pipelines.scheduler import start_scheduler, stop_scheduler
from app.streaming.manager import connection_manager

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown hooks."""
    logger.info("caep_starting", version=settings.APP_VERSION, env=settings.ENVIRONMENT)

    # Initialise DB engine (creates pool)
    get_engine()

    # Start background ingestion scheduler
    if not settings.DEBUG:
        await start_scheduler()

    logger.info("caep_ready")
    yield

    # Graceful shutdown
    await stop_scheduler()
    await connection_manager.broadcast_system_status(
        status="offline",
        pipeline_statuses={},
        message="Server shutting down",
    )
    await close_db()
    logger.info("caep_stopped")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description=(
            "Institutional-grade analytics platform for stablecoins, tokenized assets, "
            "CBDCs, and digital asset liquidity systems."
        ),
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        openapi_url="/openapi.json" if settings.DEBUG else None,
        lifespan=lifespan,
    )

    setup_middleware(app)

    # ------------------------------------------------------------------ #
    # API routes
    # ------------------------------------------------------------------ #
    app.include_router(api_router, prefix="/api")

    # ------------------------------------------------------------------ #
    # Prometheus metrics endpoint — internal only, guarded by IP allowlist
    # ------------------------------------------------------------------ #
    metrics_app = make_asgi_app()

    async def metrics_guard(scope, receive, send):  # type: ignore[type-arg]
        """Allow /metrics only from localhost or explicitly configured IPs."""
        from starlette.requests import Request as SRequest
        from starlette.responses import Response as SResponse

        req = SRequest(scope, receive)
        client_ip = (
            req.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (req.client.host if req.client else "")
        )
        allowed_ips = {"127.0.0.1", "::1", "localhost"}
        if client_ip not in allowed_ips and not settings.DEBUG:
            resp = SResponse(content="Forbidden", status_code=403)
            await resp(scope, receive, send)
            return
        await metrics_app(scope, receive, send)

    app.mount("/metrics", metrics_guard)

    # ------------------------------------------------------------------ #
    # Health probes
    # ------------------------------------------------------------------ #
    @app.get("/health", include_in_schema=False)
    async def health() -> JSONResponse:
        return JSONResponse({"status": "ok", "version": settings.APP_VERSION})

    @app.get("/ready", include_in_schema=False)
    async def ready() -> JSONResponse:
        return JSONResponse({"status": "ready"})

    # ------------------------------------------------------------------ #
    # Global exception handler
    # ------------------------------------------------------------------ #
    @app.exception_handler(CAEPException)
    async def caep_exception_handler(request, exc: CAEPException) -> JSONResponse:  # type: ignore[type-arg]
        logger.warning("caep_exception", detail=exc.detail, code=exc.status_code)
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    return app


app = create_app()
