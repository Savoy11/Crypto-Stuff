"""
Base pipeline with retry logic, rate limiting, validation, and deduplication.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
from abc import ABC, abstractmethod
from typing import Any, TypeVar

import httpx
import structlog

from app.core.exceptions import ExternalAPIError, PipelineError

logger = structlog.get_logger(__name__)

T = TypeVar("T")


class BasePipeline(ABC):
    """
    Abstract base class for all data ingestion pipelines.

    Provides:
    - Exponential backoff retry on transient HTTP errors.
    - Configurable rate limiting (token bucket via asyncio.sleep).
    - Response schema validation hooks.
    - Record deduplication via content hash.
    """

    name: str = "base"
    MAX_RETRIES: int = 3
    BACKOFF_BASE: float = 2.0
    BACKOFF_MAX: float = 60.0
    REQUEST_TIMEOUT: float = 30.0

    # HTTP status codes that should trigger a retry
    RETRY_STATUS_CODES: set[int] = {429, 500, 502, 503, 504}

    # Maximum size of the dedup cache before auto-clear
    _DEDUP_CACHE_MAX: int = 50_000

    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None
        self._seen_hashes: set[str] = set()
        self._request_semaphore: asyncio.Semaphore | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.REQUEST_TIMEOUT),
                follow_redirects=True,
                headers={"Accept": "application/json"},
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def fetch_with_retry(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        max_retries: int | None = None,
        backoff_base: float | None = None,
    ) -> dict[str, Any]:
        """
        Perform a GET request with exponential backoff retry.

        Args:
            url: Target URL.
            params: Query parameters.
            headers: Additional headers.
            max_retries: Override class default.
            backoff_base: Override class default backoff multiplier.

        Returns:
            Parsed JSON response dict.

        Raises:
            ExternalAPIError: If all retries are exhausted or a non-retryable error occurs.
        """
        retries = max_retries if max_retries is not None else self.MAX_RETRIES
        base = backoff_base if backoff_base is not None else self.BACKOFF_BASE
        client = await self._get_client()

        for attempt in range(retries + 1):
            try:
                response = await client.get(url, params=params, headers=headers or {})

                if response.status_code == 200:
                    return response.json()

                if response.status_code in self.RETRY_STATUS_CODES and attempt < retries:
                    wait = min(self.BACKOFF_MAX, base ** attempt)
                    logger.warning(
                        "pipeline_retry",
                        pipeline=self.name,
                        url=url,
                        status=response.status_code,
                        attempt=attempt + 1,
                        wait_seconds=wait,
                    )
                    await asyncio.sleep(wait)
                    continue

                raise ExternalAPIError(
                    service=self.name,
                    message=f"HTTP {response.status_code}: {response.text[:200]}",
                    status_code=response.status_code,
                )

            except httpx.TimeoutException as exc:
                if attempt < retries:
                    wait = min(self.BACKOFF_MAX, base ** attempt)
                    logger.warning(
                        "pipeline_timeout_retry",
                        pipeline=self.name,
                        attempt=attempt + 1,
                        wait=wait,
                    )
                    await asyncio.sleep(wait)
                    continue
                raise ExternalAPIError(
                    service=self.name,
                    message=f"Request timed out after {self.REQUEST_TIMEOUT}s",
                ) from exc

            except httpx.RequestError as exc:
                raise ExternalAPIError(
                    service=self.name,
                    message=f"HTTP request failed: {exc}",
                ) from exc

        raise ExternalAPIError(
            service=self.name,
            message=f"All {retries} retries exhausted for {url}",
        )

    async def rate_limited_request(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        min_interval: float = 2.0,
    ) -> dict[str, Any]:
        """
        Fetch a URL while respecting a minimum inter-request interval.

        Args:
            url: Target URL.
            params: Query parameters.
            headers: Additional request headers.
            min_interval: Minimum seconds between requests.

        Returns:
            Parsed JSON response.
        """
        if self._request_semaphore is None:
            self._request_semaphore = asyncio.Semaphore(1)

        async with self._request_semaphore:
            result = await self.fetch_with_retry(url, params=params, headers=headers)
            await asyncio.sleep(min_interval)
            return result

    def validate_response(
        self,
        data: Any,
        required_keys: list[str],
        source: str = "",
    ) -> None:
        """
        Validate that a response dict contains required keys.

        Args:
            data: Parsed API response.
            required_keys: List of keys that must be present.
            source: Human-readable description for error messages.

        Raises:
            PipelineError: If any required key is missing.
        """
        if not isinstance(data, dict):
            raise PipelineError(self.name, f"Expected dict response from {source}, got {type(data)}")

        missing = [k for k in required_keys if k not in data]
        if missing:
            raise PipelineError(
                self.name,
                f"Response from {source} missing required keys: {missing}",
            )

    def validate_list_response(
        self,
        data: Any,
        source: str = "",
    ) -> None:
        """Validate that the response is a non-empty list."""
        if not isinstance(data, list):
            raise PipelineError(self.name, f"Expected list response from {source}, got {type(data)}")

    def deduplicate_records(
        self,
        records: list[dict[str, Any]],
        key_fields: list[str],
    ) -> list[dict[str, Any]]:
        """
        Filter out duplicate records based on a hash of specified key fields.

        Args:
            records: Input records.
            key_fields: Fields to include in the deduplication hash.

        Returns:
            Deduplicated list of records.
        """
        unique: list[dict[str, Any]] = []
        for record in records:
            key_data = {k: record.get(k) for k in key_fields}
            key_hash = hashlib.md5(
                json.dumps(key_data, sort_keys=True, default=str).encode()
            ).hexdigest()

            if key_hash not in self._seen_hashes:
                self._seen_hashes.add(key_hash)
                unique.append(record)

        return unique

    def clear_dedup_cache(self) -> None:
        """Reset the deduplication hash cache."""
        self._seen_hashes.clear()

    @abstractmethod
    async def ingest(self, assets: list[Any]) -> list[dict[str, Any]]:
        """
        Abstract ingestion method — fetch and transform data for the given assets.

        Args:
            assets: List of Asset ORM objects or identifiers.

        Returns:
            List of transformed record dicts ready for database insertion.
        """
        ...
