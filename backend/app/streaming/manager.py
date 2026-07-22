"""
WebSocket connection manager: per-user and per-asset subscription registry,
connection lifecycle management, and broadcast helpers.
"""
from __future__ import annotations

import asyncio
import uuid
from collections import defaultdict
from typing import Any

import structlog
from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.streaming.events import (
    AlertEvent,
    BaseEvent,
    MetricUpdateEvent,
    PriceUpdateEvent,
    SystemStatusEvent,
)

logger = structlog.get_logger(__name__)


class ConnectionManager:
    """
    Manages active WebSocket connections with per-user and per-asset
    subscription registries.

    Registry structure:
    - connection_registry: {user_id → [WebSocket, ...]}
    - asset_subscriptions: {asset_id → {user_id, ...}}
    - user_assets: {user_id → {asset_id, ...}}
    """

    def __init__(self) -> None:
        # user_id → list of active WebSocket connections
        self.connection_registry: dict[str, list[WebSocket]] = defaultdict(list)
        # asset_id → set of user_ids subscribed to that asset
        self.asset_subscriptions: dict[str, set[str]] = defaultdict(set)
        # user_id → set of asset_ids the user is subscribed to
        self.user_assets: dict[str, set[str]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        """
        Accept and register a new WebSocket connection.

        Args:
            websocket: The WebSocket instance from FastAPI.
            user_id: Authenticated user ID (UUID string).
        """
        await websocket.accept()
        async with self._lock:
            self.connection_registry[user_id].append(websocket)

        logger.info(
            "websocket_connected",
            user_id=user_id,
            active_connections=sum(len(v) for v in self.connection_registry.values()),
        )

    async def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        """
        Remove a WebSocket connection and clean up subscriptions.

        Args:
            websocket: The WebSocket instance to remove.
            user_id: User ID associated with the connection.
        """
        async with self._lock:
            connections = self.connection_registry.get(user_id, [])
            if websocket in connections:
                connections.remove(websocket)
            if not connections:
                del self.connection_registry[user_id]
                # Clean up asset subscriptions for this user
                for asset_id in list(self.user_assets.get(user_id, [])):
                    self.asset_subscriptions[asset_id].discard(user_id)
                    if not self.asset_subscriptions[asset_id]:
                        del self.asset_subscriptions[asset_id]
                if user_id in self.user_assets:
                    del self.user_assets[user_id]

        logger.info(
            "websocket_disconnected",
            user_id=user_id,
            remaining_connections=sum(len(v) for v in self.connection_registry.values()),
        )

    async def subscribe(self, user_id: str, asset_id: str) -> None:
        """
        Subscribe a user to metric updates for a specific asset.

        Args:
            user_id: User ID string.
            asset_id: Asset ID string (UUID).
        """
        async with self._lock:
            self.asset_subscriptions[asset_id].add(user_id)
            self.user_assets[user_id].add(asset_id)

        logger.debug("asset_subscription_added", user_id=user_id, asset_id=asset_id)

    async def unsubscribe(self, user_id: str, asset_id: str) -> None:
        """Remove a user's subscription to a specific asset."""
        async with self._lock:
            self.asset_subscriptions[asset_id].discard(user_id)
            self.user_assets[user_id].discard(asset_id)

    async def _send_to_websocket(self, websocket: WebSocket, message: str) -> bool:
        """
        Send a text message to a single WebSocket.

        Returns:
            True on success, False if the connection is closed/broken.
        """
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_text(message)
                return True
        except Exception as exc:
            logger.warning("websocket_send_failed", error=str(exc))
        return False

    async def send_to_user(self, user_id: str, event: BaseEvent) -> int:
        """
        Send an event to all WebSocket connections of a specific user.

        Args:
            user_id: Target user ID.
            event: Pydantic event model to serialise.

        Returns:
            Number of connections successfully sent to.
        """
        connections = self.connection_registry.get(user_id, [])
        if not connections:
            return 0

        message = event.model_dump_json()
        sent = 0
        dead_connections: list[WebSocket] = []

        for ws in connections:
            success = await self._send_to_websocket(ws, message)
            if success:
                sent += 1
            else:
                dead_connections.append(ws)

        # Prune dead connections
        if dead_connections:
            async with self._lock:
                for ws in dead_connections:
                    if ws in self.connection_registry.get(user_id, []):
                        self.connection_registry[user_id].remove(ws)

        return sent

    async def broadcast_metric_update(
        self,
        asset_id: str,
        asset_symbol: str,
        metrics: dict[str, Any],
    ) -> int:
        """
        Broadcast a metric update to all users subscribed to an asset.

        Args:
            asset_id: Asset ID (UUID string).
            asset_symbol: Short asset symbol for the message.
            metrics: Metric key-value dict.

        Returns:
            Total number of connections reached.
        """
        subscribed_users = self.asset_subscriptions.get(asset_id, set()).copy()
        if not subscribed_users:
            return 0

        event = MetricUpdateEvent(
            asset_id=uuid.UUID(asset_id),
            asset_symbol=asset_symbol,
            metrics=metrics,
        )

        total_sent = 0
        for user_id in subscribed_users:
            total_sent += await self.send_to_user(user_id, event)

        return total_sent

    async def broadcast_price_update(
        self,
        asset_id: str,
        asset_symbol: str,
        price_usd: float,
        peg_deviation_bps: float | None = None,
        peg_target: float | None = None,
        market_cap: float | None = None,
    ) -> int:
        """Broadcast a price update to all subscribers of an asset."""
        subscribed_users = self.asset_subscriptions.get(asset_id, set()).copy()
        if not subscribed_users:
            return 0

        event = PriceUpdateEvent(
            asset_id=uuid.UUID(asset_id),
            asset_symbol=asset_symbol,
            price_usd=price_usd,
            peg_deviation_bps=peg_deviation_bps,
            peg_target=peg_target,
            market_cap=market_cap,
        )

        total_sent = 0
        for user_id in subscribed_users:
            total_sent += await self.send_to_user(user_id, event)

        return total_sent

    async def broadcast_alert(
        self,
        alert_id: str,
        asset_id: str,
        asset_symbol: str,
        alert_type: str,
        severity: str,
        title: str,
        message: str,
        actual_value: float | None = None,
        threshold_value: float | None = None,
        target_user_id: str | None = None,
    ) -> int:
        """
        Broadcast an alert event to subscribed users or a specific user.

        Args:
            target_user_id: If provided, only send to this user. Otherwise broadcast.
        """
        event = AlertEvent(
            alert_id=uuid.UUID(alert_id),
            asset_id=uuid.UUID(asset_id),
            asset_symbol=asset_symbol,
            alert_type=alert_type,
            severity=severity,
            title=title,
            message=message,
            actual_value=actual_value,
            threshold_value=threshold_value,
        )

        if target_user_id:
            return await self.send_to_user(target_user_id, event)

        # Broadcast to all subscribers of this asset
        subscribed_users = self.asset_subscriptions.get(asset_id, set()).copy()
        total_sent = 0
        for user_id in subscribed_users:
            total_sent += await self.send_to_user(user_id, event)

        return total_sent

    async def broadcast_system_status(
        self,
        status: str,
        pipeline_statuses: dict[str, str],
        message: str | None = None,
    ) -> int:
        """Broadcast a system status update to all connected users."""
        event = SystemStatusEvent(
            status=status,
            pipeline_statuses=pipeline_statuses,
            message=message,
        )

        message_str = event.model_dump_json()
        total_sent = 0

        for _user_id, connections in list(self.connection_registry.items()):
            for ws in connections:
                if await self._send_to_websocket(ws, message_str):
                    total_sent += 1

        return total_sent

    @property
    def active_connection_count(self) -> int:
        """Total number of active WebSocket connections."""
        return sum(len(v) for v in self.connection_registry.values())

    @property
    def active_user_count(self) -> int:
        """Number of distinct users with active connections."""
        return len(self.connection_registry)

    def get_subscription_stats(self) -> dict[str, Any]:
        """Return connection and subscription statistics."""
        return {
            "active_connections": self.active_connection_count,
            "active_users": self.active_user_count,
            "subscribed_assets": len(self.asset_subscriptions),
            "total_subscriptions": sum(len(v) for v in self.asset_subscriptions.values()),
        }


# Module-level singleton
connection_manager = ConnectionManager()
