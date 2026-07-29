"""
Authentication endpoints: login, refresh, logout, register, and current user.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import http_401, http_409
from app.core.rate_limiter import get_redis
from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_mfa_secret,
    get_mfa_uri,
    get_password_hash,
    verify_mfa_code,
    verify_password,
    verify_token,
    verify_token_not_revoked,
)
from app.dependencies import CurrentUser, DBSession, require_role
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RefreshResponse,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.user import (
    ChangePasswordRequest,
    MFASetupResponse,
    MFAVerifyRequest,
)

# Maximum failed attempts before account lockout
_MAX_FAILED_ATTEMPTS = 5
_LOCKOUT_MINUTES = 30

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


def _build_response(data, meta=None):
    return {
        "success": True,
        "data": data,
        "meta": meta or {},
        "timestamp": datetime.now(UTC).isoformat(),
    }


async def _log_audit(
    db: AsyncSession,
    user_id: uuid.UUID | None,
    action: str,
    resource_type: str,
    request: Request,
    success: bool = True,
    details: dict | None = None,
) -> None:
    ip = None
    if request.client:
        ip = request.client.host
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()

    log = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        ip_address=ip,
        user_agent=request.headers.get("user-agent", ""),
        request_id=getattr(request.state, "request_id", None),
        success=success,
        details=details or {},
    )
    db.add(log)
    await db.flush()


@router.post("/login", response_model=dict, summary="Authenticate and obtain JWT tokens")
async def login(
    request: Request,
    body: LoginRequest,
    db: DBSession,
) -> dict:
    """
    Authenticate a user with email + password (and optional MFA code).

    Returns JWT access token and refresh token on success.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Validate credentials — do not reveal whether email exists
    credential_valid = user is not None and verify_password(body.password, user.hashed_password)

    if not credential_valid:
        if user is not None:
            new_attempts = (user.failed_login_attempts or 0) + 1
            updates: dict = {"failed_login_attempts": new_attempts}
            if new_attempts >= _MAX_FAILED_ATTEMPTS:
                updates["locked_until"] = datetime.now(UTC) + timedelta(minutes=_LOCKOUT_MINUTES)
                logger.warning(
                    "account_locked",
                    user_id=str(user.id),
                    attempts=new_attempts,
                )
            await db.execute(update(User).where(User.id == user.id).values(**updates))
        await _log_audit(
            db,
            user.id if user else None,
            "login_failed",
            "auth",
            request,
            success=False,
            details={"email": body.email, "reason": "invalid_credentials"},
        )
        raise http_401("Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    # Check account lock
    if user.locked_until and user.locked_until > datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account locked until {user.locked_until.isoformat()}",
        )

    # MFA check
    if user.mfa_enabled:
        if not body.mfa_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="MFA code required",
                headers={"X-MFA-Required": "true"},
            )
        if not user.mfa_secret or not verify_mfa_code(user.mfa_secret, body.mfa_code):
            await _log_audit(
                db,
                user.id,
                "login_failed",
                "auth",
                request,
                success=False,
                details={"reason": "invalid_mfa"},
            )
            raise http_401("Invalid MFA code")

    # Update last login
    await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(
            last_login_at=datetime.now(UTC),
            last_login_ip=request.client.host if request.client else None,
            failed_login_attempts=0,
            locked_until=None,
        )
    )

    access_token = create_access_token(str(user.id), str(user.role))
    refresh_token = create_refresh_token(str(user.id))

    await _log_audit(
        db, user.id, "login_success", "auth", request, details={"role": str(user.role)}
    )

    token_data = TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        role=user.role,
    )
    return _build_response(token_data.model_dump())


@router.post("/refresh", response_model=dict, summary="Refresh access token")
async def refresh_token(
    body: RefreshRequest,
    db: DBSession,
) -> dict:
    """Exchange a valid refresh token for a new access token."""
    try:
        # NOT plain verify_token. /logout blocklists the refresh token's jti,
        # and this endpoint used to skip that check entirely — so a logged-out
        # refresh token kept minting fresh access tokens for its full 7-day
        # life. This is the single most important call site of the blocklist:
        # without it, revocation is decorative.
        payload = await verify_token_not_revoked(body.refresh_token, expected_type="refresh")
    except Exception:
        raise http_401("Invalid or expired refresh token") from None

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise http_401("Invalid refresh token")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id_str)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise http_401("User not found or inactive")

    new_token = create_access_token(str(user.id), str(user.role))

    return _build_response(
        RefreshResponse(
            access_token=new_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        ).model_dump()
    )


async def _revoke_jti(token: str, expected_type: str) -> bool:
    """
    Add one token's jti to the blocklist for its remaining lifetime.

    The TTL matches the token's own expiry, so entries clean themselves up:
    blocklisting can never outgrow the set of tokens that are still valid.
    Returns False when the token is unusable — callers proceed regardless,
    since a logout must not fail because the client sent a stale token.
    """
    try:
        payload = verify_token(token, expected_type=expected_type)
        jti = payload.get("jti")
        exp = payload.get("exp")
        if not jti or not exp:
            return False
        redis = await get_redis()
        ttl = max(1, int(exp) - int(datetime.now(UTC).timestamp()))
        await redis.setex(f"blocklist:{jti}", ttl, "1")
        return True
    except Exception:
        return False


@router.post("/logout", response_model=dict, summary="Revoke access + refresh tokens")
async def logout(
    request: Request,
    body: LogoutRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> dict:
    """
    Logout by blocklisting BOTH the supplied refresh token and the access token
    that authorised this call. Each entry's TTL matches its token's remaining
    lifetime.

    Revoking only the refresh token — which is all this did until 2026-07-29 —
    leaves the current access token working until it expires on its own. That
    was a 30-minute window in which a "logged out" session still had full API
    access; the lifetime is now 10 minutes, and blocklisting the access token
    closes even that.
    """
    await _revoke_jti(body.refresh_token, "refresh")

    # The bearer token on this very request. Read from the header rather than
    # taking it as a parameter: `CurrentUser` has already validated it, so it
    # is known-good, and asking the client to send its own access token back in
    # the body would be a needless way to get it wrong.
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        await _revoke_jti(auth_header[7:].strip(), "access")

    await _log_audit(db, current_user.id, "logout", "auth", request)
    return _build_response({"message": "Logged out successfully"})


@router.post(
    "/register",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user (admin only)",
)
async def register(
    request: Request,
    body: RegisterRequest,
    db: DBSession,
    _: User = Depends(require_role("admin")),
) -> dict:
    """Create a new user account. Requires admin role."""
    # Check for duplicate email
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise http_409(f"User with email '{body.email}' already exists")

    user = User(
        email=body.email,
        hashed_password=get_password_hash(body.password),
        full_name=body.full_name,
        organization=body.organization,
        role=body.role,
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    await db.flush()

    from app.schemas.user import UserResponse

    await _log_audit(
        db,
        user.id,
        "user_registered",
        "user",
        request,
        details={"email": body.email, "role": str(body.role)},
    )

    return _build_response(UserResponse.model_validate(user).model_dump())


@router.get("/me", response_model=dict, summary="Get current user profile")
async def get_me(current_user: CurrentUser) -> dict:
    """Return the authenticated user's profile."""
    from app.schemas.user import UserProfile

    return _build_response(UserProfile.model_validate(current_user).model_dump())


@router.post("/mfa/setup", response_model=dict, summary="Initiate MFA enrollment")
async def setup_mfa(
    current_user: CurrentUser,
    db: DBSession,
) -> dict:
    """Generate a new MFA secret and return the provisioning URI for QR code."""
    secret = generate_mfa_secret()
    uri = get_mfa_uri(secret, current_user.email)

    # Store secret temporarily (not yet enabled until verified)
    await db.execute(update(User).where(User.id == current_user.id).values(mfa_secret=secret))

    return _build_response(
        MFASetupResponse(
            secret=secret,
            qr_uri=uri,
            backup_codes=[],  # In production, generate and store backup codes
        ).model_dump()
    )


@router.post("/mfa/verify", response_model=dict, summary="Verify and activate MFA")
async def verify_mfa(
    body: MFAVerifyRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> dict:
    """Verify a TOTP code to complete MFA enrollment and enable MFA on the account."""
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA setup not initiated")

    if not verify_mfa_code(current_user.mfa_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid MFA code")

    await db.execute(update(User).where(User.id == current_user.id).values(mfa_enabled=True))

    return _build_response({"message": "MFA enabled successfully", "mfa_enabled": True})


@router.post("/change-password", response_model=dict, summary="Change password")
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> dict:
    """Change the current user's password."""
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    new_hash = get_password_hash(body.new_password)
    await db.execute(
        update(User).where(User.id == current_user.id).values(hashed_password=new_hash)
    )

    await _log_audit(db, current_user.id, "password_changed", "user", request)
    return _build_response({"message": "Password changed successfully"})
