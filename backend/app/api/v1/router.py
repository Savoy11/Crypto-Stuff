"""
Versioned API router — aggregates all v1 endpoint modules.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import alerts, assets, auth, market_data, reports, reserves, risk_scores, watchlists
from app.api.v1.websocket import ws_router

api_router = APIRouter()

# REST v1
v1 = APIRouter(prefix="/v1")
v1.include_router(auth.router)
v1.include_router(assets.router)
v1.include_router(risk_scores.router)
v1.include_router(market_data.router)
v1.include_router(reserves.router)
v1.include_router(alerts.router)
v1.include_router(watchlists.router)
v1.include_router(reports.router)

api_router.include_router(v1)

# WebSocket (not under /v1 prefix to keep WS URLs clean)
api_router.include_router(ws_router)
