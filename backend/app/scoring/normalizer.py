"""
Score normalisation utilities: min-max scaling and Z-score normalisation.
"""
from __future__ import annotations

import math

import numpy as np


def min_max_normalize(
    value: float,
    min_val: float,
    max_val: float,
    target_min: float = 0.0,
    target_max: float = 100.0,
) -> float:
    """
    Scale a value from [min_val, max_val] to [target_min, target_max].

    Args:
        value: Input value.
        min_val: Domain minimum.
        max_val: Domain maximum.
        target_min: Target range minimum.
        target_max: Target range maximum.

    Returns:
        Normalised value clamped to [target_min, target_max].
    """
    if max_val == min_val:
        return (target_min + target_max) / 2.0

    scaled = (value - min_val) / (max_val - min_val)
    scaled = max(0.0, min(1.0, scaled))
    return target_min + scaled * (target_max - target_min)


def z_score_normalize(
    value: float,
    mean: float,
    std: float,
    clip_sigma: float = 3.0,
) -> float:
    """
    Compute the Z-score and clip to [-clip_sigma, clip_sigma].

    Args:
        value: Input value.
        mean: Distribution mean.
        std: Distribution standard deviation.
        clip_sigma: Clipping threshold in standard deviations.

    Returns:
        Clipped Z-score.
    """
    if std == 0:
        return 0.0
    z = (value - mean) / std
    return float(max(-clip_sigma, min(clip_sigma, z)))


def normalize_series(
    series: list[float],
    method: str = "minmax",
    clip_sigma: float = 3.0,
) -> list[float]:
    """
    Normalise an entire series using the specified method.

    Args:
        series: Input series.
        method: "minmax" or "zscore".
        clip_sigma: Only used when method="zscore".

    Returns:
        Normalised series as a list of floats.
    """
    if not series:
        return []

    arr = np.asarray([v for v in series if not math.isnan(v)], dtype=np.float64)

    if method == "minmax":
        lo, hi = arr.min(), arr.max()
        return [
            min_max_normalize(v, float(lo), float(hi))
            if not math.isnan(v)
            else float("nan")
            for v in series
        ]
    elif method == "zscore":
        mean = float(arr.mean())
        std = float(arr.std(ddof=1)) if len(arr) > 1 else 1.0
        return [
            z_score_normalize(v, mean, std, clip_sigma)
            if not math.isnan(v)
            else float("nan")
            for v in series
        ]
    else:
        raise ValueError(f"Unknown normalisation method: {method!r}")


def clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    """Clamp a value to [lo, hi]."""
    return float(max(lo, min(hi, value)))
