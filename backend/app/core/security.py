"""
Security utilities: JWT tokens, password hashing, RBAC, API key validation.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from functools import wraps
from typing import Any

import pyotp
import structlog
from jose import JWTError, jwt
import bcrypt

from app.config import settings
from app.core.exceptions import (
    InsufficientPermissionsError,
    InvalidTokenError,
    TokenExpiredError,
)

logger = structlog.get_logger(__name__)

# ------------------------------------------------------------------ #
# Password hashing
# ------------------------------------------------------------------ #

# Direct bcrypt, not passlib: passlib 1.7.4 is unmaintained and its backend
# self-test crashes against bcrypt >= 4.1 (feeds a >72-byte probe that modern
# bcrypt rejects with ValueError). Hashes are the same $2b$ format either way,
# so existing stored hashes keep verifying.


def get_password_hash(password: str) -> str:
    """Hash a plaintext password using bcrypt (cost 12)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        # Malformed/legacy hash — treat as non-matching rather than erroring.
        return False


# ------------------------------------------------------------------ #
# JWT tokens
# ------------------------------------------------------------------ #

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"


def create_access_token(
    subject: str,
    role: str,
    additional_claims: dict[str, Any] | None = None,
) -> str:
    """
    Create a signed JWT access token.

    Args:
        subject: User ID (UUID string).
        role: User role for RBAC claims.
        additional_claims: Optional extra payload fields.

    Returns:
        Signed JWT string.
    """
    now = datetime.now(UTC)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "type": TOKEN_TYPE_ACCESS,
        "iat": now,
        "exp": expire,
        "jti": str(uuid.uuid4()),
    }
    if additional_claims:
        payload.update(additional_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str) -> str:
    """
    Create a signed JWT refresh token with longer expiry.

    Args:
        subject: User ID (UUID string).

    Returns:
        Signed JWT string.
    """
    now = datetime.now(UTC)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": TOKEN_TYPE_REFRESH,
        "iat": now,
        "exp": expire,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_token(token: str, expected_type: str = TOKEN_TYPE_ACCESS) -> dict[str, Any]:
    """
    Decode and validate a JWT token.

    Args:
        token: Raw JWT string.
        expected_type: Expected token type claim ("access" or "refresh").

    Returns:
        Decoded payload dict.

    Raises:
        TokenExpiredError: If the token has expired.
        InvalidTokenError: If the token is malformed or has wrong type.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as exc:
        if "expired" in str(exc).lower():
            raise TokenExpiredError() from exc
        raise InvalidTokenError() from exc

    token_type = payload.get("type")
    if token_type != expected_type:
        raise InvalidTokenError()

    return payload


async def verify_token_not_revoked(
    token: str, expected_type: str = TOKEN_TYPE_ACCESS
) -> dict[str, Any]:
    """
    Decode, validate, and check against the Redis JTI revocation blocklist.
    Use this variant for refresh-token flows where revocation must be enforced.
    """
    payload = verify_token(token, expected_type)
    jti = payload.get("jti")
    if jti:
        try:
            from app.core.rate_limiter import get_redis

            redis_client = await get_redis()
            revoked = await redis_client.exists(f"blocklist:{jti}")
            if revoked:
                raise InvalidTokenError()
        except InvalidTokenError:
            raise
        except Exception:
            # Redis unavailable: fail open with a warning (log but don't block)
            logger.warning("blocklist_check_failed", jti=jti)
    return payload


def extract_token_subject(token: str) -> str:
    """Extract the subject (user ID) from a token without raising on expiry."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_exp": False},
        )
        sub = payload.get("sub")
        if not sub:
            raise InvalidTokenError()
        return str(sub)
    except JWTError as exc:
        raise InvalidTokenError() from exc


# ------------------------------------------------------------------ #
# API key management
# ------------------------------------------------------------------ #


def generate_api_key() -> tuple[str, str]:
    """
    Generate a new API key pair.

    Returns:
        Tuple of (raw_key, key_hash). Store only the hash in the database;
        return the raw key once to the user.
    """
    raw_key = f"fn_{secrets.token_urlsafe(40)}"
    key_hash = hash_api_key(raw_key)
    return raw_key, key_hash


def hash_api_key(raw_key: str) -> str:
    """Create a SHA-256 hash of an API key for storage."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


def verify_api_key(raw_key: str, stored_hash: str) -> bool:
    """Verify a raw API key against its stored hash (constant-time comparison)."""
    computed = hash_api_key(raw_key)
    return secrets.compare_digest(computed, stored_hash)


# ------------------------------------------------------------------ #
# RBAC
# ------------------------------------------------------------------ #

ROLE_HIERARCHY: dict[str, int] = {
    "viewer": 0,
    "analyst": 1,
    "admin": 2,
}


def has_role(user_role: str, required_role: str) -> bool:
    """
    Check if a user role satisfies a required role via hierarchy.
    Admin >= Analyst >= Viewer.
    """
    user_level = ROLE_HIERARCHY.get(user_role, -1)
    required_level = ROLE_HIERARCHY.get(required_role, 999)
    return user_level >= required_level


def require_role(minimum_role: str):
    """
    Decorator factory for route handlers that enforces minimum role.

    Usage::

        @require_role("admin")
        async def admin_only_endpoint(current_user = Depends(get_current_user)):
            ...
    """

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # The current_user is expected as a kwarg injected by FastAPI DI
            current_user = kwargs.get("current_user")
            if current_user is None:
                raise InsufficientPermissionsError(minimum_role)
            user_role = getattr(current_user, "role", "viewer")
            if not has_role(str(user_role), minimum_role):
                raise InsufficientPermissionsError(minimum_role)
            return await func(*args, **kwargs)

        return wrapper

    return decorator


# ------------------------------------------------------------------ #
# MFA (TOTP)
# ------------------------------------------------------------------ #


def generate_mfa_secret() -> str:
    """Generate a new TOTP secret for MFA enrollment."""
    return pyotp.random_base32()


def get_mfa_uri(secret: str, email: str) -> str:
    """Return a provisioning URI for QR code generation."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name=settings.APP_NAME)


def verify_mfa_code(secret: str, code: str) -> bool:
    """
    Verify a TOTP code against the secret.
    Allows 1-step window drift.
    """
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)
