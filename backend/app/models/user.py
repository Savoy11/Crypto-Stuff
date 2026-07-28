"""
User model with RBAC roles and optional MFA.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class UserRole(str, enum.Enum):
    viewer = "viewer"
    analyst = "analyst"
    admin = "admin"

    def __str__(self) -> str:
        # str(UserRole.admin) is "UserRole.admin" by default on a str-mixin
        # enum in Python 3.11 — which made has_role() and every
        # str(user.role) call site (role_checker, login token minting, the
        # alerts admin checks) see an unknown role and deny admins their own
        # endpoints. Return the bare value so str() round-trips.
        return self.value


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    organization: Mapped[str | None] = mapped_column(String(255), nullable=True)

    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role_enum"),
        default=UserRole.viewer,
        nullable=False,
        index=True,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # MFA
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Activity tracking
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    failed_login_attempts: Mapped[int] = mapped_column(default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Relationships ────────────────────────────────────────────────────────
    watchlists: Mapped[list[Watchlist]] = relationship(  # noqa: F821
        "Watchlist", back_populates="user", lazy="noload"
    )
    api_keys: Mapped[list[APIKey]] = relationship(  # noqa: F821
        "APIKey", back_populates="user", lazy="noload"
    )
    alerts: Mapped[list[Alert]] = relationship(  # noqa: F821
        "Alert", back_populates="user", lazy="noload"
    )
    audit_logs: Mapped[list[AuditLog]] = relationship(  # noqa: F821
        "AuditLog", back_populates="user", lazy="noload"
    )

    def __repr__(self) -> str:
        return f"<User {self.email} role={self.role}>"
