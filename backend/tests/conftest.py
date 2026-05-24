"""
Shared pytest fixtures for CAEP backend test suite.
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
import pytest_asyncio
from faker import Faker
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.base import Base

fake = Faker()

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Use a single event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DB_URL, echo=False, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    factory = async_sessionmaker(test_engine, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


# ------------------------------------------------------------------ #
# User fixtures
# ------------------------------------------------------------------ #

def _make_token(user_id: str, role: str = "viewer") -> str:
    return create_access_token(subject=user_id, extra_claims={"role": role})


@pytest.fixture
def viewer_token() -> str:
    return _make_token(str(uuid4()), "viewer")


@pytest.fixture
def analyst_token() -> str:
    return _make_token(str(uuid4()), "analyst")


@pytest.fixture
def admin_token() -> str:
    return _make_token(str(uuid4()), "admin")


@pytest.fixture
def auth_headers_viewer(viewer_token) -> dict[str, str]:
    return {"Authorization": f"Bearer {viewer_token}"}


@pytest.fixture
def auth_headers_admin(admin_token) -> dict[str, str]:
    return {"Authorization": f"Bearer {admin_token}"}


# ------------------------------------------------------------------ #
# Asset fixtures
# ------------------------------------------------------------------ #

@pytest.fixture
def sample_usdc_data() -> dict[str, Any]:
    return {
        "id": str(uuid4()),
        "symbol": "USDC",
        "name": "USD Coin",
        "asset_type": "stablecoin",
        "blockchain": "ethereum",
        "contract_address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "peg_currency": "USD",
        "peg_value": 1.0,
        "coingecko_id": "usd-coin",
        "is_active": True,
    }


@pytest.fixture
def sample_price_series_stable() -> list[float]:
    """Stable price series — tiny deviations around $1.00."""
    import random
    random.seed(42)
    return [1.0 + random.uniform(-0.0005, 0.0005) for _ in range(168)]  # 7 days hourly


@pytest.fixture
def sample_price_series_depegged() -> list[float]:
    """Price series that includes a depeg event."""
    stable = [1.0 + 0.0001 * i % 3 for i in range(100)]
    depeg = [0.985 + 0.001 * i for i in range(24)]  # -1.5% depeg
    recovery = [0.998 + 0.0002 * i for i in range(44)]
    return stable + depeg + recovery


@pytest.fixture
def sample_reserve_composition() -> dict[str, float]:
    return {
        "cash_and_equivalents": 0.25,
        "us_treasury_bills": 0.55,
        "commercial_paper": 0.10,
        "corporate_bonds": 0.05,
        "crypto": 0.05,
    }


# ------------------------------------------------------------------ #
# Mock Redis
# ------------------------------------------------------------------ #

@pytest.fixture
def mock_redis():
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock(return_value=True)
    redis.setex = AsyncMock(return_value=True)
    redis.delete = AsyncMock(return_value=1)
    redis.incr = AsyncMock(return_value=1)
    redis.expire = AsyncMock(return_value=True)
    redis.pipeline = MagicMock(return_value=redis)
    redis.execute = AsyncMock(return_value=[1, True])
    return redis
