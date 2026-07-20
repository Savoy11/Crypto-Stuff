"""
Anomaly detection: Z-score, IQR, and rolling Z-score methods for
identifying outliers in time-series metric data.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass
class AnomalyReport:
    metric_name: str
    total_observations: int
    anomaly_count: int
    anomaly_indices: list[int]
    anomaly_values: list[float]
    method: str
    threshold: float
    mean: float
    std: float
    z_scores: list[float]
    severity: str  # "low" | "moderate" | "high" | "critical"
    flagged_pct: float


def z_score_anomalies(
    series: list[float],
    threshold: float = 3.0,
) -> list[int]:
    """
    Detect anomalies using the global Z-score method.

    Args:
        series: Time-series of float observations.
        threshold: Z-score threshold above which a point is anomalous.

    Returns:
        List of indices where |z_score| > threshold.
    """
    if len(series) < 3:
        return []

    arr = np.asarray(series, dtype=np.float64)
    # Remove NaN for statistics
    valid = arr[~np.isnan(arr)]
    if len(valid) < 3:
        return []

    mean = float(np.mean(valid))
    std = float(np.std(valid, ddof=1))

    if std == 0:
        return []

    anomaly_indices: list[int] = []
    for i, val in enumerate(arr):
        if not math.isnan(val):
            z = abs(val - mean) / std
            if z > threshold:
                anomaly_indices.append(i)

    return anomaly_indices


def iqr_anomalies(
    series: list[float],
    multiplier: float = 1.5,
) -> list[int]:
    """
    Detect anomalies using the IQR (Tukey fence) method.

    Bounds: [Q1 - multiplier * IQR, Q3 + multiplier * IQR]
    Values outside these bounds are anomalies.

    Args:
        series: Time-series of float observations.
        multiplier: IQR multiplier (1.5 = standard, 3.0 = extreme outliers only).

    Returns:
        List of indices where the value is outside IQR fences.
    """
    if len(series) < 4:
        return []

    arr = np.asarray(series, dtype=np.float64)
    valid = arr[~np.isnan(arr)]
    if len(valid) < 4:
        return []

    q1 = float(np.percentile(valid, 25))
    q3 = float(np.percentile(valid, 75))
    iqr = q3 - q1

    if iqr == 0:
        return []

    lower = q1 - multiplier * iqr
    upper = q3 + multiplier * iqr

    return [i for i, v in enumerate(arr) if not math.isnan(v) and (v < lower or v > upper)]


def rolling_z_score(
    series: list[float],
    window: int = 24,
) -> list[float]:
    """
    Compute a rolling Z-score for each point relative to the preceding window.

    Points within the first (window-1) observations return NaN.

    Args:
        series: Time-series of float observations.
        window: Number of prior periods to compute mean/std from.

    Returns:
        List of rolling Z-scores (same length as series).
    """
    if len(series) < 2:
        return [float("nan")] * len(series)

    arr = np.asarray(series, dtype=np.float64)
    result: list[float] = [float("nan")] * len(arr)

    for i in range(window, len(arr)):
        window_data = arr[i - window : i]
        valid = window_data[~np.isnan(window_data)]
        if len(valid) < 2:
            continue
        mean = float(np.mean(valid))
        std = float(np.std(valid, ddof=1))
        if std > 0 and not math.isnan(arr[i]):
            result[i] = (arr[i] - mean) / std
        else:
            result[i] = 0.0

    return result


def detect_metric_anomalies(
    metric_history: list[float],
    metric_name: str = "metric",
    z_threshold: float = 3.0,
    iqr_multiplier: float = 1.5,
    rolling_window: int = 24,
) -> AnomalyReport:
    """
    Comprehensive anomaly detection combining multiple methods.

    Uses both global Z-score and IQR methods, then unions the detected anomalies.
    Also computes rolling Z-scores for trending analysis.

    Args:
        metric_history: Historical metric values (chronological order).
        metric_name: Human-readable name for the metric.
        z_threshold: Z-score threshold.
        iqr_multiplier: IQR multiplier for fence computation.
        rolling_window: Window for rolling Z-score.

    Returns:
        AnomalyReport with all anomaly metadata.
    """
    if not metric_history:
        return AnomalyReport(
            metric_name=metric_name,
            total_observations=0,
            anomaly_count=0,
            anomaly_indices=[],
            anomaly_values=[],
            method="none",
            threshold=z_threshold,
            mean=0.0,
            std=0.0,
            z_scores=[],
            severity="low",
            flagged_pct=0.0,
        )

    arr = np.asarray(metric_history, dtype=np.float64)
    valid = arr[~np.isnan(arr)]

    mean = float(np.mean(valid)) if len(valid) > 0 else 0.0
    std = float(np.std(valid, ddof=1)) if len(valid) > 1 else 0.0

    # Union of Z-score and IQR anomalies
    z_indices = set(z_score_anomalies(metric_history, z_threshold))
    iqr_indices = set(iqr_anomalies(metric_history, iqr_multiplier))
    combined_indices = sorted(z_indices | iqr_indices)

    # Rolling Z-scores
    rolling_z = rolling_z_score(metric_history, rolling_window)

    # Global Z-scores for reporting
    global_z: list[float] = []
    for v in arr:
        if math.isnan(v) or std == 0:
            global_z.append(0.0)
        else:
            global_z.append(float(abs(v - mean) / std))

    flagged_pct = len(combined_indices) / len(metric_history) * 100.0

    # Severity classification
    if flagged_pct > 10.0 or (
        combined_indices and max(global_z[i] for i in combined_indices) > 5.0
    ):
        severity = "critical"
    elif flagged_pct > 5.0:
        severity = "high"
    elif flagged_pct > 2.0:
        severity = "moderate"
    else:
        severity = "low"

    return AnomalyReport(
        metric_name=metric_name,
        total_observations=len(metric_history),
        anomaly_count=len(combined_indices),
        anomaly_indices=combined_indices,
        anomaly_values=[metric_history[i] for i in combined_indices],
        method="z_score+iqr",
        threshold=z_threshold,
        mean=round(mean, 6),
        std=round(std, 6),
        z_scores=[round(z, 4) for z in global_z],
        severity=severity,
        flagged_pct=round(flagged_pct, 2),
    )


def detect_multivariate_anomalies(
    metrics: dict[str, list[float]],
    z_threshold: float = 3.0,
) -> dict[str, AnomalyReport]:
    """
    Run anomaly detection across multiple metric time series.

    Args:
        metrics: Dict mapping metric name → time series.
        z_threshold: Z-score threshold for each metric.

    Returns:
        Dict mapping metric name → AnomalyReport.
    """
    reports: dict[str, AnomalyReport] = {}
    for name, series in metrics.items():
        reports[name] = detect_metric_anomalies(series, metric_name=name, z_threshold=z_threshold)
    return reports
