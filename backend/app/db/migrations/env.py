"""Alembic environment configuration for async migrations."""
from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

# Import all models so Alembic can detect them
from app.config import settings
from app.models.base import Base  # noqa: F401
from app.models import (  # noqa: F401
    alert, api_key, asset, audit_log, blockchain_metric,
    liquidity_metric, market_data, reserve_attestation,
    risk_score, user, wallet_concentration, watchlist,
)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = settings.DATABASE_URL
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    engine = create_async_engine(settings.DATABASE_URL, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(_run_migrations_sync)
    await engine.dispose()


def _run_migrations_sync(connection):  # type: ignore[no-untyped-def]
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
