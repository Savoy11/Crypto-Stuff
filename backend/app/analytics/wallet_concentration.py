"""
Wallet concentration analytics: Gini coefficient, HHI, top-N concentration,
and composite concentration scoring.
"""
from __future__ import annotations

import numpy as np


def calculate_gini(balances: list[float]) -> float:
    """
    Calculate the Gini coefficient for a distribution of wallet balances.

    Gini = 0 → perfect equality (all wallets hold equal amounts)
    Gini = 1 → maximum inequality (one wallet holds everything)

    Args:
        balances: List of wallet balances (non-negative floats).

    Returns:
        Gini coefficient in [0, 1].
    """
    if not balances:
        return 0.0

    arr = np.asarray([b for b in balances if b > 0], dtype=np.float64)
    if len(arr) == 0:
        return 0.0
    if len(arr) == 1:
        return 1.0

    arr = np.sort(arr)
    n = len(arr)
    cumulative = np.cumsum(arr)
    total = cumulative[-1]

    if total == 0:
        return 0.0

    # Standard Gini formula using sorted array
    # G = (2 * sum(i * x_i) - (n+1) * sum(x_i)) / (n * sum(x_i))
    index = np.arange(1, n + 1)
    gini = (2.0 * np.sum(index * arr) - (n + 1) * total) / (n * total)
    return float(max(0.0, min(1.0, gini)))


def calculate_hhi(balances: list[float]) -> float:
    """
    Calculate the Herfindahl-Hirschman Index for wallet concentration.

    HHI = 0 → perfectly dispersed
    HHI = 10000 → one entity holds 100%

    Args:
        balances: List of wallet balances (non-negative floats).

    Returns:
        HHI in [0, 10000].
    """
    if not balances:
        return 0.0

    arr = np.asarray([b for b in balances if b > 0], dtype=np.float64)
    if len(arr) == 0:
        return 0.0

    total = arr.sum()
    if total == 0:
        return 0.0

    shares = arr / total  # fraction held by each wallet
    hhi = float(np.sum(shares ** 2) * 10_000.0)
    return max(0.0, min(10_000.0, hhi))


def calculate_top_n_concentration(
    balances: list[float],
    n: int,
) -> float:
    """
    Calculate the percentage of total supply held by the top-N wallets.

    Args:
        balances: All wallet balances.
        n: Number of top wallets to consider.

    Returns:
        Percentage held by top-N wallets (0–100).
    """
    if not balances or n <= 0:
        return 0.0

    arr = np.asarray([b for b in balances if b > 0], dtype=np.float64)
    if len(arr) == 0:
        return 0.0

    total = arr.sum()
    if total == 0:
        return 0.0

    arr_sorted = np.sort(arr)[::-1]  # descending
    top_n = arr_sorted[:n].sum()
    return float(min(100.0, top_n / total * 100.0))


def concentration_score(
    gini: float | None,
    hhi: float | None,
    top_10_pct: float | None,
) -> float:
    """
    Composite concentration score from 0 (worst) to 100 (best).
    Lower concentration → higher score.

    Weights:
    - Gini:        40%
    - HHI:         35%
    - Top-10 pct:  25%

    Args:
        gini: Gini coefficient (0–1).
        hhi: HHI (0–10000).
        top_10_pct: Percentage held by top 10 wallets (0–100).

    Returns:
        Score 0–100 (higher = more decentralised = lower risk).
    """
    scores: list[tuple[float, float]] = []  # (score, weight)

    # Gini score: 0 → 100, 1 → 0 (linearly)
    if gini is not None:
        gini_clamped = max(0.0, min(1.0, gini))
        gini_score = (1.0 - gini_clamped) * 100.0
        scores.append((gini_score, 0.40))

    # HHI score: 0 → 100, 10000 → 0 (logarithmic to handle skew)
    if hhi is not None:
        hhi_clamped = max(0.0, min(10_000.0, hhi))
        if hhi_clamped <= 100:
            hhi_score = 100.0
        elif hhi_clamped <= 1000:
            hhi_score = 100.0 - (hhi_clamped - 100.0) / 900.0 * 40.0
        elif hhi_clamped <= 2500:
            hhi_score = 60.0 - (hhi_clamped - 1000.0) / 1500.0 * 30.0
        else:
            hhi_score = max(0.0, 30.0 - (hhi_clamped - 2500.0) / 7500.0 * 30.0)
        scores.append((hhi_score, 0.35))

    # Top-10% score: 10% → 100, 100% → 0
    if top_10_pct is not None:
        t10 = max(0.0, min(100.0, top_10_pct))
        if t10 <= 10.0:
            t10_score = 100.0
        elif t10 <= 30.0:
            t10_score = 100.0 - (t10 - 10.0) / 20.0 * 30.0
        elif t10 <= 60.0:
            t10_score = 70.0 - (t10 - 30.0) / 30.0 * 40.0
        else:
            t10_score = max(0.0, 30.0 - (t10 - 60.0) / 40.0 * 30.0)
        scores.append((t10_score, 0.25))

    if not scores:
        return 50.0  # Neutral when no data

    # Weighted average of available scores
    total_weight = sum(w for _, w in scores)
    weighted_sum = sum(s * w for s, w in scores)

    return float(max(0.0, min(100.0, weighted_sum / total_weight)))


def full_concentration_analysis(
    balances: list[float],
) -> dict[str, float]:
    """
    Return a full concentration analysis dict for a balance distribution.

    Args:
        balances: List of all wallet balances.

    Returns:
        Dict with gini, hhi, top_10_pct, top_50_pct, top_100_pct,
        top_1000_pct, and composite concentration_score.
    """
    if not balances:
        return {
            "gini_coefficient": 0.0,
            "hhi_score": 0.0,
            "top_10_pct": 0.0,
            "top_50_pct": 0.0,
            "top_100_pct": 0.0,
            "top_1000_pct": 0.0,
            "concentration_score": 0.0,
            "holder_count": 0,
        }

    gini = calculate_gini(balances)
    hhi = calculate_hhi(balances)
    top10 = calculate_top_n_concentration(balances, 10)
    top50 = calculate_top_n_concentration(balances, 50)
    top100 = calculate_top_n_concentration(balances, 100)
    top1000 = calculate_top_n_concentration(balances, 1000)
    score = concentration_score(gini, hhi, top10)

    return {
        "gini_coefficient": round(gini, 4),
        "hhi_score": round(hhi, 2),
        "top_10_pct": round(top10, 3),
        "top_50_pct": round(top50, 3),
        "top_100_pct": round(top100, 3),
        "top_1000_pct": round(top1000, 3),
        "concentration_score": round(score, 2),
        "holder_count": len([b for b in balances if b > 0]),
    }
