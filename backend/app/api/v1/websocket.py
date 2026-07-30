"""
WebSocket streaming endpoint for real-time metric updates and alerts.
"""
from __future__ import annotations

import structlog
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.core.security import verify_token_not_revoked
from app.streaming.events import EventType, SubscriptionConfirmedEvent
from app.streaming.manager import connection_manager

logger = structlog.get_logger(__name__)

ws_router = APIRouter(prefix="/ws", tags=["Streaming"])


@ws_router.websocket("/stream")
async def stream_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token for authentication"),
) -> None:
    """
    WebSocket endpoint for real-time streaming.

    Subscribe to asset channels after connecting:
      {"action": "subscribe", "asset_id": "<uuid>"}
      {"action": "unsubscribe", "asset_id": "<uuid>"}
    """
    # Authenticate before accepting the connection
    try:
        payload = await verify_token_not_revoked(token, expected_type="access")
        user_id: str = payload["sub"]
    except Exception as exc:
        logger.warning("ws_auth_failed", error=str(exc))
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await connection_manager.connect(websocket, user_id)
    logger.info("ws_connected", user_id=user_id)

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            asset_id = data.get("asset_id", "")

            if action == "subscribe" and asset_id:
                await connection_manager.subscribe(user_id, asset_id)
                await websocket.send_json(
                    SubscriptionConfirmedEvent(
                        event_type=EventType.SUBSCRIPTION_CONFIRMED,
                        asset_id=asset_id,
                        action="subscribed",
                    ).model_dump()
                )

            elif action == "unsubscribe" and asset_id:
                await connection_manager.unsubscribe(user_id, asset_id)
                await websocket.send_json(
                    SubscriptionConfirmedEvent(
                        event_type=EventType.SUBSCRIPTION_CONFIRMED,
                        asset_id=asset_id,
                        action="unsubscribed",
                    ).model_dump()
                )

            elif action == "ping":
                await websocket.send_json({"action": "pong"})

    except WebSocketDisconnect:
        logger.info("ws_disconnected", user_id=user_id)
    except Exception as exc:
        logger.error("ws_error", user_id=user_id, error=str(exc))
    finally:
        await connection_manager.disconnect(websocket, user_id)
