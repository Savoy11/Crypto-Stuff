"""
Pydantic schemas for authentication endpoints.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    mfa_code: str | None = Field(None, min_length=6, max_length=6)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user_id: uuid.UUID
    role: UserRole


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class LogoutRequest(BaseModel):
    refresh_token: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=12)
    full_name: str | None = Field(None, max_length=255)
    organization: str | None = Field(None, max_length=255)
    role: UserRole = UserRole.viewer


class TokenPayload(BaseModel):
    """Decoded JWT payload."""

    sub: str  # user ID
    role: str
    type: str
    exp: datetime
    jti: str
