"""
Redis-backed sliding window rate limiter.

Uses a sorted set in Redis where each member is a unique request ID
and the score is the Unix timestamp of the request. Expired entries
are pruned on every check to maintain the sliding window.
"""
from __future__ import annotations

import time
import uuid
from typing import Any

import redis.asyncio as aioredis
import structlog

from app.config import settings
from app.core.exceptions import RateLimitExceededError

logger = structlog.get_logger(__name__)

_redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Return the shared async Redis client, creating it on first call."""
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            decode_responses=True,
        )
    return _redis_client


async def close_redis() -> None:
    """Close the Redis client connection pool."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None


class SlidingWindowRateLimiter:
    """
    Sliding window rate limiter backed by Redis sorted sets.

    Each call is recorded as a member of a sorted set keyed by
    the identifier (e.g., IP address or user ID). Members older
    than the window are evicted before counting.
    """

    def __init__(
        self,
        redis_client: aioredis.Redis,
        limit: int = settings.RATE_LIMIT_REQUESTS,
        window_seconds: int = settings.RATE_LIMIT_WINDOW,
    ) -> None:
        self.redis = redis_client
        self.limit = limit
        self.window = window_seconds

    async def is_allowed(self, identifier: str) -> tuple[bool, dict[str, Any]]:
        """
        Check whether the identifier is within its rate limit.

        Args:
            identifier: Unique key (IP, user ID, API key, etc.)

        Returns:
            Tuple of (allowed: bool, info: dict) where info contains
            remaining requests, reset time, and current count.
        """
        key = f"rl:{identifier}"
        now = time.time()
        window_start = now - self.window

        pipe = self.redis.pipeline(transaction=True)
        # Remove entries outside the sliding window
        pipe.zremrangebyscore(key, "-inf", window_start)
        # Count remaining entries in window
        pipe.zcard(key)
        # Add current request
        request_id = str(uuid.uuid4())
        pipe.zadd(key, {request_id: now})
        # Set TTL so keys auto-expire
        pipe.expire(key, self.window + 1)
        results = await pipe.execute()

        current_count: int = results[1]  # count before adding current request
        reset_at = int(now) + self.window

        info = {
            "limit": self.limit,
            "remaining": max(0, self.limit - current_count - 1),
            "reset_at": reset_at,
            "current_count": current_count + 1,
        }

        if current_count >= self.limit:
            # Remove the request we just added since it's rejected
            await self.redis.zrem(key, request_id)
            info["remaining"] = 0
            return False, info

        return True, info

    async def get_current_count(self, identifier: str) -> int:
        """Return the current request count for an identifier without incrementing."""
        key = f"rl:{identifier}"
        now = time.time()
        window_start = now - self.window
        await self.redis.zremrangebyscore(key, "-inf", window_start)
        return await self.redis.zcard(key)

    async def reset(self, identifier: str) -> None:
        """Clear all rate limit data for the given identifier."""
        key = f"rl:{identifier}"
        await self.redis.delete(key)


async def check_rate_limit(
    identifier: str,
    redis_client: aioredis.Redis,
    limit: int | None = None,
    window: int | None = None,
) -> dict[str, Any]:
    """
    Convenience function to check a rate limit and raise if exceeded.

    Args:
        identifier: Unique key for the rate limit bucket.
        redis_client: Async Redis client.
        limit: Max requests. Defaults to settings.RATE_LIMIT_REQUESTS.
        window: Window seconds. Defaults to settings.RATE_LIMIT_WINDOW.

    Returns:
        Rate limit info dict.

    Raises:
        RateLimitExceededError: If the limit is exceeded.
    """
    effective_limit = limit or settings.RATE_LIMIT_REQUESTS
    effective_window = window or settings.RATE_LIMIT_WINDOW

    limiter = SlidingWindowRateLimiter(redis_client, effective_limit, effective_window)
    allowed, info = await limiter.is_allowed(identifier)

    if not allowed:
        logger.warning(
            "rate_limit_exceeded",
            identifier=identifier,
            limit=effective_limit,
            window=effective_window,
        )
        raise RateLimitExceededError(effective_limit, effective_window)

    return info
