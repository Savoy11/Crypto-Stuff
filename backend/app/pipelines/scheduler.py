"""
APScheduler job orchestration for all data ingestion pipelines.
"""
from __future__ import annotations

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select

from app.config import settings
from app.db.session import get_session_factory
from app.models.asset import Asset
from app.models.blockchain_metric import BlockchainMetric
from app.models.market_data import MarketData
from app.pipelines.coingecko import CoinGeckoPipeline
from app.pipelines.defillama import DefiLlamaPipeline
from app.pipelines.onchain import OnChainPipeline
from app.scoring.engine import ScoringEngine

logger = structlog.get_logger(__name__)

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    """Return the singleton APScheduler instance."""
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="UTC")
    return _scheduler


async def _load_active_assets() -> list[Asset]:
    """Load all active assets from the database."""
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(select(Asset).where(Asset.is_active is True))
        return list(result.scalars().all())


async def _upsert_market_data(records: list[dict]) -> int:
    """Bulk-insert market data records, ignoring duplicates."""
    if not records:
        return 0

    factory = get_session_factory()
    async with factory() as session:
        inserted = 0
        for record in records:
            # Remove non-model fields
            record.pop("source", None)
            record.pop("peg_type", None)
            record.pop("peg_mechanism", None)

            row = MarketData(**{k: v for k, v in record.items() if hasattr(MarketData, k)})
            session.add(row)
            inserted += 1
        await session.commit()
        return inserted


async def _upsert_blockchain_metrics(records: list[dict]) -> int:
    """Bulk-insert blockchain metric records."""
    if not records:
        return 0

    factory = get_session_factory()
    async with factory() as session:
        inserted = 0
        for record in records:
            record.pop("source", None)
            record.pop("decimals", None)
            row = BlockchainMetric(
                **{k: v for k, v in record.items() if hasattr(BlockchainMetric, k)}
            )
            session.add(row)
            inserted += 1
        await session.commit()
        return inserted


async def job_market_data() -> None:
    """
    Scheduled job: fetch market data from CoinGecko and DefiLlama.
    Runs every MARKET_DATA_INTERVAL_MINUTES minutes.
    """
    logger.info("scheduler_job_started", job="market_data")
    try:
        assets = await _load_active_assets()
        if not assets:
            logger.info("scheduler_no_assets")
            return

        coingecko = CoinGeckoPipeline()
        defillama = DefiLlamaPipeline()

        try:
            cg_records = await coingecko.ingest(assets)
            dl_records = await defillama.ingest(assets)
        finally:
            await coingecko.close()
            await defillama.close()

        all_records = cg_records + dl_records
        inserted = await _upsert_market_data(all_records)

        logger.info(
            "scheduler_job_complete",
            job="market_data",
            records_inserted=inserted,
        )
    except Exception as exc:
        logger.exception("scheduler_job_failed", job="market_data", error=str(exc))


async def job_onchain_metrics() -> None:
    """
    Scheduled job: fetch on-chain supply metrics via RPC.
    Runs every ONCHAIN_DATA_INTERVAL_MINUTES minutes.
    """
    logger.info("scheduler_job_started", job="onchain")
    try:
        assets = await _load_active_assets()
        pipeline = OnChainPipeline()
        try:
            records = await pipeline.ingest(assets)
        finally:
            await pipeline.close()

        inserted = await _upsert_blockchain_metrics(records)
        logger.info("scheduler_job_complete", job="onchain", records_inserted=inserted)
    except Exception as exc:
        logger.exception("scheduler_job_failed", job="onchain", error=str(exc))


async def job_risk_scores() -> None:
    """
    Scheduled job: recalculate risk scores for all active assets.
    Runs every RISK_SCORE_INTERVAL_HOURS hours.
    """
    logger.info("scheduler_job_started", job="risk_scores")
    try:
        assets = await _load_active_assets()
        engine = ScoringEngine()
        factory = get_session_factory()

        scored = 0
        async with factory() as session:
            for asset in assets:
                try:
                    await engine.score_asset(asset.id, session, persist=True)
                    scored += 1
                except Exception as exc:
                    logger.error(
                        "risk_score_failed",
                        asset_id=str(asset.id),
                        error=str(exc),
                    )

        logger.info("scheduler_job_complete", job="risk_scores", assets_scored=scored)
    except Exception as exc:
        logger.exception("scheduler_job_failed", job="risk_scores", error=str(exc))


async def start_scheduler() -> None:
    """Configure and start the background scheduler."""
    scheduler = setup_scheduler()
    scheduler.start()
    logger.info("scheduler_started")


async def stop_scheduler() -> None:
    """Gracefully shut down the scheduler if it is running."""
    scheduler = get_scheduler()
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("scheduler_stopped")


def setup_scheduler() -> AsyncIOScheduler:
    """
    Register all scheduled jobs and return the configured scheduler.
    """
    scheduler = get_scheduler()

    # Market data every N minutes
    scheduler.add_job(
        job_market_data,
        trigger=IntervalTrigger(minutes=settings.MARKET_DATA_INTERVAL_MINUTES),
        id="market_data",
        name="Market Data Ingestion",
        replace_existing=True,
        misfire_grace_time=60,
    )

    # On-chain metrics
    scheduler.add_job(
        job_onchain_metrics,
        trigger=IntervalTrigger(minutes=settings.ONCHAIN_DATA_INTERVAL_MINUTES),
        id="onchain_metrics",
        name="On-Chain Metrics Ingestion",
        replace_existing=True,
        misfire_grace_time=120,
    )

    # Risk scores hourly
    scheduler.add_job(
        job_risk_scores,
        trigger=IntervalTrigger(hours=settings.RISK_SCORE_INTERVAL_HOURS),
        id="risk_scores",
        name="Risk Score Recalculation",
        replace_existing=True,
        misfire_grace_time=300,
    )

    logger.info(
        "scheduler_configured",
        jobs=[j.id for j in scheduler.get_jobs()],
    )
    return scheduler
