"""
Macro stress composite indicators: cross-asset stress detection,
correlation regime analysis, and systemic risk signals.
"""
from __future__ import annotations

from typing import Any

import numpy as np


def calculate_stress_composite(
    peg_deviation_bps: float | None,
    liquidity_change_pct: float | None,   # negative = drop in liquidity
    volume_spike_ratio: float | None,     # current_vol / avg_vol
    price_volatility_30d: float | None,   # annualised vol
    holder_change_pct: float | None,      # recent % change in holder count
) -> dict[str, Any]:
    """
    Compute a composite macro stress indicator from multiple signals.

    Each signal is normalised to 0–100 stress scale (0 = calm, 100 = severe stress).

    Args:
        peg_deviation_bps: Current peg deviation in basis points.
        liquidity_change_pct: Change in liquidity depth (negative = liquidity flight).
        volume_spike_ratio: Volume relative to 30-day average (1.0 = normal).
        price_volatility_30d: 30-day price volatility (annualised).
        holder_change_pct: Change in holder count over 7 days.

    Returns:
        Dict with individual signal stress scores and composite stress level.
    """
    signals: list[tuple[str, float, float]] = []  # (name, stress_score, weight)

    # 1. Peg deviation stress (0 bps = 0 stress, 200+ bps = 100 stress)
    if peg_deviation_bps is not None:
        abs_dev = abs(peg_deviation_bps)
        peg_stress = min(100.0, abs_dev / 200.0 * 100.0)
        signals.append(("peg_deviation", peg_stress, 0.35))

    # 2. Liquidity change stress (0% change = 0 stress, -50% = 100 stress)
    if liquidity_change_pct is not None:
        # Only negative (outflow) creates stress
        liquidity_stress = max(0.0, min(100.0, -liquidity_change_pct / 50.0 * 100.0))
        signals.append(("liquidity_flight", liquidity_stress, 0.30))

    # 3. Volume spike stress (1x = 0 stress, 5x+ = 100 stress)
    if volume_spike_ratio is not None:
        if volume_spike_ratio <= 1.0:
            vol_spike_stress = 0.0
        else:
            vol_spike_stress = min(100.0, (volume_spike_ratio - 1.0) / 4.0 * 100.0)
        signals.append(("volume_spike", vol_spike_stress, 0.20))

    # 4. Price volatility stress (0% = 0 stress, 100%+ annualised = 100 stress)
    if price_volatility_30d is not None:
        # For stablecoins, any vol > 10% annualised is unusual
        vol_stress = min(100.0, price_volatility_30d / 10.0 * 100.0)
        signals.append(("price_volatility", vol_stress, 0.10))

    # 5. Holder change stress (5%+ decrease is alarming)
    if holder_change_pct is not None:
        if holder_change_pct >= 0:
            holder_stress = 0.0
        else:
            holder_stress = min(100.0, -holder_change_pct / 5.0 * 100.0)
        signals.append(("holder_flight", holder_stress, 0.05))

    if not signals:
        return {
            "composite_stress": 0.0,
            "stress_level": "calm",
            "signals": {},
        }

    # Weighted composite
    total_weight = sum(w for _, _, w in signals)
    composite = sum(s * w for _, s, w in signals) / total_weight

    # Classify stress level
    if composite < 20:
        stress_level = "calm"
    elif composite < 40:
        stress_level = "elevated"
    elif composite < 60:
        stress_level = "stressed"
    elif composite < 80:
        stress_level = "crisis"
    else:
        stress_level = "extreme"

    return {
        "composite_stress": round(float(composite), 2),
        "stress_level": stress_level,
        "signals": {name: round(stress, 2) for name, stress, _ in signals},
        "dominant_signal": max(signals, key=lambda x: x[1])[0] if signals else None,
    }


def detect_regime_change(
    price_series: list[float],
    window_short: int = 7,
    window_long: int = 30,
) -> dict[str, Any]:
    """
    Detect volatility regime changes using short vs. long window comparison.

    Args:
        price_series: Historical price data.
        window_short: Short-term window (periods).
        window_long: Long-term window (periods).

    Returns:
        Dict with regime classification and volatility metrics.
    """
    if len(price_series) < window_long:
        return {"regime": "insufficient_data", "vol_ratio": None, "is_regime_change": False}

    arr = np.asarray(price_series, dtype=np.float64)
    returns = np.diff(arr) / arr[:-1]

    short_vol = float(np.std(returns[-window_short:], ddof=1)) if len(returns) >= window_short else None
    long_vol = float(np.std(returns[-window_long:], ddof=1)) if len(returns) >= window_long else None

    if short_vol is None or long_vol is None or long_vol == 0:
        return {"regime": "insufficient_data", "vol_ratio": None, "is_regime_change": False}

    vol_ratio = short_vol / long_vol

    if vol_ratio > 2.0:
        regime = "high_vol_regime"
        is_change = True
    elif vol_ratio > 1.5:
        regime = "elevated_vol_regime"
        is_change = True
    elif vol_ratio < 0.5:
        regime = "low_vol_compression"
        is_change = False
    else:
        regime = "normal"
        is_change = False

    return {
        "regime": regime,
        "vol_ratio": round(vol_ratio, 4),
        "short_vol_annualised": round(short_vol * (252 ** 0.5) * 100, 4),
        "long_vol_annualised": round(long_vol * (252 ** 0.5) * 100, 4),
        "is_regime_change": is_change,
    }
