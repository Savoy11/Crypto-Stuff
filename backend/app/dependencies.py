"""
FastAPI dependency injection: database session, Redis cache, current user, and RBAC.
"""
from __future__ import annotations

import uuid
from typing import Annotated

import structlog
from fastapi import Depends, Header, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import (
    InvalidTokenError,
    TokenExpiredError,
    http_401,
    http_403,
)
from app.core.rate_limiter import SlidingWindowRateLimiter, get_redis
from app.core.security import has_role, verify_token_not_revoked
from app.db.session import get_db_session
from app.models.user import User

logger = structlog.get_logger(__name__)

# HTTP Bearer token extractor
bearer_scheme = HTTPBearer(auto_error=False)

# ── Re-export database session dependency ─────────────────────────────────────
DBSession = Annotated[AsyncSession, Depends(get_db_session)]


# ── Redis cache ───────────────────────────────────────────────────────────────


async def get_cache():
    """Yield the shared async Redis client."""
    return await get_redis()


Cache = Annotated[object, Depends(get_cache)]


# ── Authentication ─────────────────────────────────────────────────────────────


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
    db: AsyncSession = Depends(get_db_session),
) -> User:
    """
    Validate a Bearer JWT token and return the authenticated User.

    Raises:
        HTTPException 401: If no token or invalid/expired token.
        HTTPException 401: If user not found or inactive.
    """
    if credentials is None:
        raise http_401("Authorization header with Bearer token required")

    token = credentials.credentials
    try:
        payload = await verify_token_not_revoked(token, expected_type="access")
    except TokenExpiredError:
        raise http_401("Access token has expired") from None
    except InvalidTokenError:
        raise http_401("Invalid authentication token") from None

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise http_401("Token missing subject claim")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise http_401("Invalid user ID in token") from None

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise http_401("User not found")
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
    db: AsyncSession = Depends(get_db_session),
) -> User | None:
    """
    Like get_current_user but returns None instead of raising for missing tokens.
    Useful for endpoints that can serve both authenticated and anonymous requests.
    """
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None


OptionalUser = Annotated[User | None, Depends(get_current_user_optional)]


# ── RBAC ──────────────────────────────────────────────────────────────────────


def require_role(minimum_role: str):
    """
    Return a FastAPI dependency that enforces a minimum role.

    Usage::

        @router.get("/admin-only")
        async def endpoint(current_user: User = Depends(require_role("admin"))):
            ...
    """

    async def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if not has_role(str(current_user.role), minimum_role):
            raise http_403(f"Insufficient permissions. Required role: {minimum_role}")
        return current_user

    return role_checker


RequireAnalyst = Depends(require_role("analyst"))
RequireAdmin = Depends(require_role("admin"))


# ── Rate limiting ─────────────────────────────────────────────────────────────


async def rate_limit_dependency(
    current_user: User | None = Depends(get_current_user_optional),
    x_forwarded_for: str | None = Header(None),
    x_real_ip: str | None = Header(None),
) -> None:
    """
    Apply sliding-window rate limiting per user (authenticated) or per IP.

    Raises:
        HTTPException 429: If the rate limit is exceeded.
    """
    redis = await get_redis()
    limiter = SlidingWindowRateLimiter(redis)

    identifier = (
        f"user:{current_user.id}"
        if current_user
        else f"ip:{x_forwarded_for or x_real_ip or 'unknown'}"
    )

    allowed, info = await limiter.is_allowed(identifier)
    if not allowed:
        from app.core.exceptions import http_429

        raise http_429(settings.RATE_LIMIT_REQUESTS, settings.RATE_LIMIT_WINDOW)


RateLimited = Depends(rate_limit_dependency)


# ── Pagination ────────────────────────────────────────────────────────────────


class PaginationParams:
    """Standardised pagination query parameters."""

    def __init__(
        self,
        page: int = 1,
        page_size: int = settings.DEFAULT_PAGE_SIZE,
    ) -> None:
        if page < 1:
            raise HTTPException(status_code=400, detail="page must be >= 1")
        max_size = settings.MAX_PAGE_SIZE
        if page_size < 1 or page_size > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"page_size must be between 1 and {max_size}",
            )
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


Pagination = Annotated[PaginationParams, Depends(PaginationParams)]
