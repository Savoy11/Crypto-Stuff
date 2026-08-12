"""
Application configuration using Pydantic Settings.
All settings are read from environment variables with sensible defaults.
"""
from __future__ import annotations

import secrets
from functools import lru_cache
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ------------------------------------------------------------------ #
    # Application
    # ------------------------------------------------------------------ #
    APP_NAME: str = "Crypto Asset Evaluation Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "production"

    # ------------------------------------------------------------------ #
    # Security
    # ------------------------------------------------------------------ #
    SECRET_KEY: str = Field(default_factory=lambda: secrets.token_urlsafe(64))
    ALGORITHM: str = "HS256"

    # 10, not 30. A JWT is self-validating, so the only bound on a stolen or
    # logged-out access token that the server can always enforce is its expiry —
    # the revocation blocklist depends on Redis being reachable, and fails open
    # when it is not (see BLOCKLIST_FAIL_CLOSED). Shortening this shrinks the
    # exposure window in every failure mode at once, including the ones
    # revocation cannot cover. The cost is more /refresh calls, which are cheap:
    # one signature check plus one indexed user lookup.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # What to do when the Redis revocation blocklist cannot be reached.
    #
    # False (default) — allow the request and log a warning. A Redis outage
    # degrades revocation rather than locking every user out; the 10-minute
    # access-token lifetime above is what bounds the damage. This is the
    # deliberate trade, not an oversight.
    #
    # True — reject. Choose this only if a Redis outage causing a total auth
    # outage is preferable to a logged-out token surviving that outage, and
    # only with Redis deployed for high availability.
    BLOCKLIST_FAIL_CLOSED: bool = False

    # ------------------------------------------------------------------ #
    # Database
    # ------------------------------------------------------------------ #
    DATABASE_URL: str = "postgresql+asyncpg://fn:fn@localhost:5432/fn"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10
    DATABASE_POOL_TIMEOUT: int = 30
    DATABASE_ECHO: bool = False

    # ------------------------------------------------------------------ #
    # Redis
    # ------------------------------------------------------------------ #
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_MAX_CONNECTIONS: int = 50

    # ------------------------------------------------------------------ #
    # Rate Limiting
    # ------------------------------------------------------------------ #
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW: int = 60  # seconds

    # ------------------------------------------------------------------ #
    # Proxy trust
    # ------------------------------------------------------------------ #
    # Whether to treat X-Forwarded-For as the client's real address.
    #
    # Only enable behind a proxy that OVERWRITES the header. If anything can
    # reach the app directly, the header is attacker-controlled: a client sends
    # `X-Forwarded-For: 127.0.0.1` and both walks past the /metrics allowlist
    # and writes a false client_ip into every log line. Off by default, so
    # neither is silently spoofable.
    #
    # Deliberately one flag rather than one per consumer: "is this header
    # trustworthy?" is a property of the deployment's network topology, and the
    # answer cannot differ between two readers of the same header.
    TRUST_FORWARDED_FOR: bool = False

    # Extra source IPs allowed to scrape /metrics, on top of loopback. Set this
    # to the Prometheus scraper's address when it is not co-located.
    METRICS_ALLOWED_IPS: list[str] = []

    # ------------------------------------------------------------------ #
    # CORS
    # ------------------------------------------------------------------ #
    CORS_ORIGINS: list[str] = Field(default=["http://localhost:3000", "http://localhost:8080"])
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: list[str] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    CORS_ALLOW_HEADERS: list[str] = [
        "Accept",
        "Authorization",
        "Content-Type",
        "X-Request-ID",
        "X-API-Key",
    ]

    # ------------------------------------------------------------------ #
    # External APIs
    # ------------------------------------------------------------------ #
    COINGECKO_API_KEY: str = ""
    COINGECKO_BASE_URL: str = "https://api.coingecko.com/api/v3"
    COINGECKO_PRO_BASE_URL: str = "https://pro-api.coingecko.com/api/v3"
    COINGECKO_RATE_LIMIT_RPM: int = 30  # requests per minute (free tier)

    DEFILLAMA_BASE_URL: str = "https://api.llama.fi"
    DEFILLAMA_STABLECOINS_URL: str = "https://stablecoins.llama.fi"

    CHAINLINK_BASE_URL: str = "https://api.chain.link"

    # ------------------------------------------------------------------ #
    # On-chain RPC
    # ------------------------------------------------------------------ #
    ETHEREUM_RPC_URL: str = "https://eth-mainnet.g.alchemy.com/v2/your-key"
    ETHEREUM_RPC_TIMEOUT: int = 30

    # ------------------------------------------------------------------ #
    # Pipeline Scheduling
    # ------------------------------------------------------------------ #
    MARKET_DATA_INTERVAL_MINUTES: int = 5
    ONCHAIN_DATA_INTERVAL_MINUTES: int = 15
    RISK_SCORE_INTERVAL_HOURS: int = 1
    RESERVE_DATA_INTERVAL_HOURS: int = 6

    # ------------------------------------------------------------------ #
    # Pagination
    # ------------------------------------------------------------------ #
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    @property
    def coingecko_base(self) -> str:
        """Return appropriate CoinGecko base URL based on API key presence."""
        if self.COINGECKO_API_KEY:
            return self.COINGECKO_PRO_BASE_URL
        return self.COINGECKO_BASE_URL

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT in ("development", "dev", "local")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings singleton."""
    return Settings()


settings = get_settings()
