"""
Custom exception hierarchy for CAEP.
All domain-specific exceptions map to appropriate HTTP status codes.
"""
from __future__ import annotations

from fastapi import HTTPException, status

# ------------------------------------------------------------------ #
# Base
# ------------------------------------------------------------------ #


class CAEPException(Exception):
    """Root exception for all CAEP domain errors."""

    def __init__(self, message: str, code: str = "CAEP_ERROR") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


# ------------------------------------------------------------------ #
# Authentication / Authorization
# ------------------------------------------------------------------ #


class AuthenticationError(CAEPException):
    def __init__(self, message: str = "Authentication failed") -> None:
        super().__init__(message, "AUTH_ERROR")


class TokenExpiredError(CAEPException):
    def __init__(self) -> None:
        super().__init__("Access token has expired", "TOKEN_EXPIRED")


class InvalidTokenError(CAEPException):
    def __init__(self) -> None:
        super().__init__("Invalid or malformed token", "INVALID_TOKEN")


class InsufficientPermissionsError(CAEPException):
    def __init__(self, required_role: str = "") -> None:
        msg = (
            f"Insufficient permissions. Required role: {required_role}"
            if required_role
            else "Insufficient permissions"
        )
        super().__init__(msg, "INSUFFICIENT_PERMISSIONS")


class MFARequiredError(CAEPException):
    def __init__(self) -> None:
        super().__init__("Multi-factor authentication required", "MFA_REQUIRED")


class InvalidMFACodeError(CAEPException):
    def __init__(self) -> None:
        super().__init__("Invalid MFA code", "INVALID_MFA_CODE")


# ------------------------------------------------------------------ #
# Resource errors
# ------------------------------------------------------------------ #


class NotFoundError(CAEPException):
    def __init__(self, resource: str, resource_id: str | None = None) -> None:
        msg = f"{resource} not found"
        if resource_id:
            msg = f"{resource} '{resource_id}' not found"
        super().__init__(msg, "NOT_FOUND")
        self.resource = resource
        self.resource_id = resource_id


class DuplicateResourceError(CAEPException):
    def __init__(self, resource: str, field: str = "") -> None:
        msg = f"{resource} already exists"
        if field:
            msg = f"{resource} with this {field} already exists"
        super().__init__(msg, "DUPLICATE_RESOURCE")


class ValidationError(CAEPException):
    def __init__(self, message: str, field: str = "") -> None:
        super().__init__(message, "VALIDATION_ERROR")
        self.field = field


# ------------------------------------------------------------------ #
# Pipeline / Data errors
# ------------------------------------------------------------------ #


class PipelineError(CAEPException):
    def __init__(self, pipeline: str, message: str) -> None:
        super().__init__(f"Pipeline '{pipeline}' error: {message}", "PIPELINE_ERROR")
        self.pipeline = pipeline


class ExternalAPIError(CAEPException):
    def __init__(self, service: str, message: str, status_code: int | None = None) -> None:
        super().__init__(f"External API '{service}' error: {message}", "EXTERNAL_API_ERROR")
        self.service = service
        self.status_code = status_code


class DataQualityError(CAEPException):
    def __init__(self, message: str) -> None:
        super().__init__(message, "DATA_QUALITY_ERROR")


class InsufficientDataError(CAEPException):
    def __init__(self, message: str = "Insufficient data for calculation") -> None:
        super().__init__(message, "INSUFFICIENT_DATA")


# ------------------------------------------------------------------ #
# Rate limiting
# ------------------------------------------------------------------ #


class RateLimitExceededError(CAEPException):
    def __init__(self, limit: int, window: int) -> None:
        super().__init__(
            f"Rate limit exceeded: {limit} requests per {window} seconds",
            "RATE_LIMIT_EXCEEDED",
        )
        self.limit = limit
        self.window = window


# ------------------------------------------------------------------ #
# HTTP exception factories
# ------------------------------------------------------------------ #


def http_400(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)


def http_401(message: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


def http_403(message: str = "Forbidden") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message)


def http_404(resource: str, resource_id: str | None = None) -> HTTPException:
    msg = f"{resource} not found"
    if resource_id:
        msg = f"{resource} '{resource_id}' not found"
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)


def http_409(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=message)


def http_422(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=message)


def http_429(limit: int, window: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Rate limit exceeded: {limit} requests per {window}s",
        headers={"Retry-After": str(window)},
    )


def http_500(message: str = "Internal server error") -> HTTPException:
    return HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=message)


def http_502(service: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"External service '{service}' is unavailable",
    )
