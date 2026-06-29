"""
Peg stability analytics: deviation calculation, rolling volatility,
depeg event detection, and peg score computation.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np


@dataclass
class DepegEvent:
    start_index: int
    end_index: int
    start_time: datetime | None
    end_time: datetime | None
    magnitude_bps: float
    duration_periods: int
    mean_deviation_bps: float
    max_deviation_bps: float
    direction: str  # "above" | "below"


@dataclass
class PegDeviationStats:
    mean_deviation_bps: float
    std_deviation_bps: float
    max_deviation_bps: float
    min_deviation_bps: float
    z_score: float
    percentile_95: float
    percentile_99: float
    current_deviation_bps: float
    is_depegged: bool


def calculate_peg_deviation(
    prices: list[float],
    peg: float,
    threshold_bps: float = 50.0,
) -> PegDeviationStats:
    """
    Compute peg deviation statistics for a price series.

    Args:
        prices: List of price observations (e.g., hourly USD prices).
        peg: Target peg price (e.g., 1.0 for USD-pegged stablecoin).
        threshold_bps: Basis-point threshold for classifying a depeg.

    Returns:
        PegDeviationStats with mean, std, max, z_score, percentiles.
    """
    if not prices:
        return PegDeviationStats(
            mean_deviation_bps=0.0,
            std_deviation_bps=0.0,
            max_deviation_bps=0.0,
            min_deviation_bps=0.0,
            z_score=0.0,
            percentile_95=0.0,
            percentile_99=0.0,
            current_deviation_bps=0.0,
            is_depegged=False,
        )

    arr = np.asarray(prices, dtype=np.float64)
    # Deviation in basis points: (price - peg) / peg * 10_000
    deviations_bps = (arr - peg) / peg * 10_000.0
    abs_deviations = np.abs(deviations_bps)

    mean_dev = float(np.mean(abs_deviations))
    std_dev = float(np.std(abs_deviations, ddof=1)) if len(prices) > 1 else 0.0

    current_dev = deviations_bps[-1]
    z_score = (abs(current_dev) - mean_dev) / std_dev if std_dev > 0 else 0.0

    return PegDeviationStats(
        mean_deviation_bps=mean_dev,
        std_deviation_bps=std_dev,
        max_deviation_bps=float(np.max(abs_deviations)),
        min_deviation_bps=float(np.min(abs_deviations)),
        z_score=z_score,
        percentile_95=float(np.percentile(abs_deviations, 95)),
        percentile_99=float(np.percentile(abs_deviations, 99)),
        current_deviation_bps=float(current_dev),
        is_depegged=abs(current_dev) > threshold_bps,
    )


def calculate_rolling_volatility(
    prices: list[float],
    peg: float = 1.0,
    window: int = 24,
) -> list[float]:
    """
    Compute rolling standard deviation of peg deviations in basis points.

    Args:
        prices: Price observations.
        peg: Peg target price.
        window: Rolling window size (default 24 periods).

    Returns:
        List of rolling std values, NaN for the first (window-1) periods.
    """
    if len(prices) < 2:
        return [float("nan")] * len(prices)

    arr = np.asarray(prices, dtype=np.float64)
    deviations_bps = (arr - peg) / peg * 10_000.0

    result: list[float] = []
    for i in range(len(deviations_bps)):
        if i < window - 1:
            result.append(float("nan"))
        else:
            window_data = deviations_bps[i - window + 1 : i + 1]
            result.append(float(np.std(window_data, ddof=1)))
    return result


def detect_depeg_events(
    prices: list[float],
    peg: float,
    threshold_bps: float = 50.0,
    timestamps: list[datetime] | None = None,
) -> list[DepegEvent]:
    """
    Identify contiguous periods where price deviation exceeds threshold.

    Args:
        prices: Price observations.
        peg: Peg target price.
        threshold_bps: Basis points above which a period is considered depegged.
        timestamps: Optional list of timestamps aligned to prices.

    Returns:
        List of DepegEvent records.
    """
    if not prices:
        return []

    arr = np.asarray(prices, dtype=np.float64)
    deviations_bps = (arr - peg) / peg * 10_000.0
    is_depegged = np.abs(deviations_bps) > threshold_bps

    events: list[DepegEvent] = []
    in_event = False
    event_start = 0

    for i, depegged in enumerate(is_depegged):
        if depegged and not in_event:
            in_event = True
            event_start = i
        elif not depegged and in_event:
            # Event ended at i-1
            event_slice = deviations_bps[event_start:i]
            abs_slice = np.abs(event_slice)
            direction = "above" if float(np.mean(event_slice)) > 0 else "below"

            events.append(
                DepegEvent(
                    start_index=event_start,
                    end_index=i - 1,
                    start_time=timestamps[event_start] if timestamps else None,
                    end_time=timestamps[i - 1] if timestamps else None,
                    magnitude_bps=float(np.max(abs_slice)),
                    duration_periods=i - event_start,
                    mean_deviation_bps=float(np.mean(abs_slice)),
                    max_deviation_bps=float(np.max(abs_slice)),
                    direction=direction,
                )
            )
            in_event = False

    # Handle event that extends to the end of the series
    if in_event:
        event_slice = deviations_bps[event_start:]
        abs_slice = np.abs(event_slice)
        direction = "above" if float(np.mean(event_slice)) > 0 else "below"
        n = len(prices)
        events.append(
            DepegEvent(
                start_index=event_start,
                end_index=n - 1,
                start_time=timestamps[event_start] if timestamps else None,
                end_time=timestamps[n - 1] if timestamps else None,
                magnitude_bps=float(np.max(abs_slice)),
                duration_periods=n - event_start,
                mean_deviation_bps=float(np.mean(abs_slice)),
                max_deviation_bps=float(np.max(abs_slice)),
                direction=direction,
            )
        )

    return events


def calculate_peg_score(
    prices: list[float],
    peg: float = 1.0,
    threshold_warning_bps: float = 50.0,
    threshold_critical_bps: float = 200.0,
) -> float:
    """
    Score peg stability from 0 (worst) to 100 (best).

    Scoring logic:
    - Base score starts at 100
    - Penalise for mean deviation, max deviation, and depeg event frequency
    - Score floors at 0

    Args:
        prices: Price observations.
        peg: Peg target.
        threshold_warning_bps: Warning threshold in basis points.
        threshold_critical_bps: Critical threshold in basis points.

    Returns:
        Float score in [0, 100].
    """
    if not prices:
        return 50.0  # Neutral when no data

    stats = calculate_peg_deviation(prices, peg, threshold_warning_bps)
    events = detect_depeg_events(prices, peg, threshold_warning_bps)

    score = 100.0

    # Penalise mean deviation (up to -40 points for mean ≥ 200bps)
    mean_penalty = min(40.0, stats.mean_deviation_bps / threshold_critical_bps * 40.0)
    score -= mean_penalty

    # Penalise max deviation (up to -30 points)
    max_penalty = min(30.0, max(0.0, (stats.max_deviation_bps - threshold_warning_bps) / threshold_critical_bps * 30.0))
    score -= max_penalty

    # Penalise depeg event frequency (up to -20 points)
    normalised_window = max(len(prices), 168)
    event_rate = len(events) / normalised_window * 100  # events per 100 periods
    event_penalty = min(20.0, event_rate * 10.0)
    score -= event_penalty

    # Penalise rolling volatility (up to -10 points)
    rolling_vol = calculate_rolling_volatility(prices, peg, window=min(24, len(prices)))
    valid_vol = [v for v in rolling_vol if not math.isnan(v)]
    if valid_vol:
        avg_vol = float(np.mean(valid_vol))
        vol_penalty = min(10.0, avg_vol / threshold_warning_bps * 10.0)
        score -= vol_penalty

    return float(max(0.0, min(100.0, score)))


def compute_peg_analytics_summary(
    prices: list[float],
    peg: float,
    timestamps: list[datetime] | None = None,
) -> dict[str, Any]:
    """
    Return a comprehensive analytics dict for API responses.
    """
    if not prices:
        return {
            "status": "no_data",
            "score": 50.0,
            "stats": None,
            "depeg_events": [],
            "rolling_volatility": [],
        }

    stats = calculate_peg_deviation(prices, peg)
    events = detect_depeg_events(prices, peg, timestamps=timestamps)
    score = calculate_peg_score(prices, peg)
    rolling_vol = calculate_rolling_volatility(prices, peg)

    return {
        "status": "depegged" if stats.is_depegged else "stable",
        "score": round(score, 2),
        "peg_target": peg,
        "current_deviation_bps": round(stats.current_deviation_bps, 4),
        "mean_deviation_bps": round(stats.mean_deviation_bps, 4),
        "std_deviation_bps": round(stats.std_deviation_bps, 4),
        "max_deviation_bps": round(stats.max_deviation_bps, 4),
        "z_score": round(stats.z_score, 4),
        "percentile_95_bps": round(stats.percentile_95, 4),
        "percentile_99_bps": round(stats.percentile_99, 4),
        "depeg_events": [
            {
                "start_index": e.start_index,
                "end_index": e.end_index,
                "start_time": e.start_time.isoformat() if e.start_time else None,
                "end_time": e.end_time.isoformat() if e.end_time else None,
                "magnitude_bps": round(e.magnitude_bps, 4),
                "duration_periods": e.duration_periods,
                "direction": e.direction,
            }
            for e in events
        ],
        "rolling_volatility_bps": [
            round(v, 4) if not math.isnan(v) else None for v in rolling_vol
        ],
        "data_points": len(prices),
    }
