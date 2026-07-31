"""
Custom exception hierarchy for Finance Now Free.
All domain-specific exceptions map to appropriate HTTP status codes.
"""
from __future__ import annotations

from fastapi import HTTPException, status

# ------------------------------------------------------------------ #
# Base
# ------------------------------------------------------------------ #


class FinanceNowError(Exception):
    """Root exception for all Finance Now Free domain errors."""

    # HTTP status the global handler maps this to. Subclasses override; the
    # base is a 500. The handler in main.py used to read `.detail`/`.status_code`,
    # which this class never had — so EVERY FinanceNowError reaching it raised
    # AttributeError *inside* the handler and turned an intended 4xx into a bare
    # 500. Declaring the fields here is what makes the handler work at all.
    status_code: int = 500

    def __init__(self, message: str, code: str = "FN_ERROR") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


# ------------------------------------------------------------------ #
# Authentication / Authorization
# ------------------------------------------------------------------ #


class AuthenticationError(FinanceNowError):
    status_code = 401

    def __init__(self, message: str = "Authentication failed") -> None:
        super().__init__(message, "AUTH_ERROR")


class TokenExpiredError(FinanceNowError):
    status_code = 401

    def __init__(self) -> None:
        super().__init__("Access token has expired", "TOKEN_EXPIRED")


class InvalidTokenError(FinanceNowError):
    status_code = 401

    def __init__(self) -> None:
        super().__init__("Invalid or malformed token", "INVALID_TOKEN")


class InsufficientPermissionsError(FinanceNowError):
    status_code = 403

    def __init__(self, required_role: str = "") -> None:
        msg = (
            f"Insufficient permissions. Required role: {required_role}"
            if required_role
            else "Insufficient permissions"
        )
        super().__init__(msg, "INSUFFICIENT_PERMISSIONS")


class MFARequiredError(FinanceNowError):
    status_code = 401

    def __init__(self) -> None:
        super().__init__("Multi-factor authentication required", "MFA_REQUIRED")


class InvalidMFACodeError(FinanceNowError):
    status_code = 401

    def __init__(self) -> None:
        super().__init__("Invalid MFA code", "INVALID_MFA_CODE")


# ------------------------------------------------------------------ #
# Resource errors
# ------------------------------------------------------------------ #


class NotFoundError(FinanceNowError):
    status_code = 404

    def __init__(self, resource: str, resource_id: str | None = None) -> None:
        msg = f"{resource} not found"
        if resource_id:
            msg = f"{resource} '{resource_id}' not found"
        super().__init__(msg, "NOT_FOUND")
        self.resource = resource
        self.resource_id = resource_id


class DuplicateResourceError(FinanceNowError):
    status_code = 409

    def __init__(self, resource: str, field: str = "") -> None:
        msg = f"{resource} already exists"
        if field:
            msg = f"{resource} with this {field} already exists"
        super().__init__(msg, "DUPLICATE_RESOURCE")


class ValidationError(FinanceNowError):
    status_code = 422

    def __init__(self, message: str, field: str = "") -> None:
        super().__init__(message, "VALIDATION_ERROR")
        self.field = field


# ------------------------------------------------------------------ #
# Pipeline / Data errors
# ------------------------------------------------------------------ #


class PipelineError(FinanceNowError):
    def __init__(self, pipeline: str, message: str) -> None:
        super().__init__(f"Pipeline '{pipeline}' error: {message}", "PIPELINE_ERROR")
        self.pipeline = pipeline


class ExternalAPIError(FinanceNowError):
    status_code = 502  # our response status; the upstream's code is upstream_status

    def __init__(self, service: str, message: str, upstream_status: int | None = None) -> None:
        super().__init__(f"External API '{service}' error: {message}", "EXTERNAL_API_ERROR")
        self.service = service
        # The upstream service's status, kept for diagnostics. Deliberately NOT
        # named status_code: it can be None, which would shadow the class-level
        # response status and drop the handler back to a 500.
        self.upstream_status = upstream_status


class DataQualityError(FinanceNowError):
    status_code = 422

    def __init__(self, message: str) -> None:
        super().__init__(message, "DATA_QUALITY_ERROR")


class InsufficientDataError(FinanceNowError):
    status_code = 422

    def __init__(self, message: str = "Insufficient data for calculation") -> None:
        super().__init__(message, "INSUFFICIENT_DATA")


# ------------------------------------------------------------------ #
# Rate limiting
# ------------------------------------------------------------------ #


class RateLimitExceededError(FinanceNowError):
    status_code = 429

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
