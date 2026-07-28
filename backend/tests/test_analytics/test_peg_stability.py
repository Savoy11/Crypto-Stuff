"""
Unit tests for peg stability analytics module.
"""
from __future__ import annotations

import math

import pytest

from app.analytics.peg_stability import (
    PegDeviationStats,
    calculate_peg_deviation,
    calculate_peg_score,
    calculate_rolling_volatility,
    detect_depeg_events,
)


class TestCalculatePegDeviation:
    def test_perfect_peg(self):
        prices = [1.0] * 100
        result = calculate_peg_deviation(prices, peg=1.0)
        assert isinstance(result, PegDeviationStats)
        assert result.mean_deviation_bps == pytest.approx(0.0, abs=1e-6)
        assert result.std_deviation_bps == pytest.approx(0.0, abs=1e-6)
        assert result.is_depegged is False

    def test_stable_peg_small_deviations(self, sample_price_series_stable):
        result = calculate_peg_deviation(sample_price_series_stable, peg=1.0)
        assert result.max_deviation_bps < 50.0
        assert result.is_depegged is False
        assert result.mean_deviation_bps >= 0.0

    def test_depeg_detected(self, sample_price_series_depegged):
        result = calculate_peg_deviation(sample_price_series_depegged, peg=1.0, threshold_bps=50.0)
        assert result.max_deviation_bps > 50.0
        assert result.is_depegged is True

    def test_empty_series_returns_zero_stats(self):
        result = calculate_peg_deviation([], peg=1.0)
        assert result.mean_deviation_bps == 0.0
        assert result.is_depegged is False

    def test_single_price_at_peg(self):
        result = calculate_peg_deviation([1.0], peg=1.0)
        assert result.mean_deviation_bps == pytest.approx(0.0, abs=1e-6)

    def test_single_price_depegged(self):
        result = calculate_peg_deviation([0.98], peg=1.0, threshold_bps=50.0)
        assert result.mean_deviation_bps == pytest.approx(200.0, rel=0.01)
        assert result.is_depegged is True

    def test_upward_deviation(self):
        prices = [1.01] * 50
        result = calculate_peg_deviation(prices, peg=1.0)
        assert result.mean_deviation_bps == pytest.approx(100.0, rel=0.01)

    def test_returns_correct_z_score_shape(self, sample_price_series_stable):
        result = calculate_peg_deviation(sample_price_series_stable, peg=1.0)
        assert isinstance(result.z_score, float)
        assert result.percentile_95 >= result.mean_deviation_bps

    def test_known_deviation_bps(self):
        prices = [1.0050] * 100  # exactly 50 bps above peg
        result = calculate_peg_deviation(prices, peg=1.0)
        assert result.mean_deviation_bps == pytest.approx(50.0, rel=0.01)


class TestCalculateRollingVolatility:
    def test_constant_price_zero_volatility(self):
        prices = [1.0] * 50
        result = calculate_rolling_volatility(prices, window=10)
        assert all(v == pytest.approx(0.0, abs=1e-9) for v in result if not math.isnan(v))

    def test_output_length_matches_input(self, sample_price_series_stable):
        result = calculate_rolling_volatility(sample_price_series_stable, window=24)
        assert len(result) == len(sample_price_series_stable)

    def test_volatile_series_has_positive_vol(self, sample_price_series_depegged):
        result = calculate_rolling_volatility(sample_price_series_depegged, window=24)
        non_none = [v for v in result if v is not None and v > 0]
        assert len(non_none) > 0

    def test_empty_series(self):
        result = calculate_rolling_volatility([], window=24)
        assert result == []

    def test_window_larger_than_series(self):
        prices = [1.0, 1.001, 0.999]
        result = calculate_rolling_volatility(prices, window=24)
        assert len(result) == 3


class TestDetectDepegEvents:
    def test_stable_series_no_events(self, sample_price_series_stable):
        events = detect_depeg_events(sample_price_series_stable, peg=1.0, threshold_bps=50.0)
        assert events == []

    def test_depeg_detected(self, sample_price_series_depegged):
        events = detect_depeg_events(sample_price_series_depegged, peg=1.0, threshold_bps=50.0)
        assert len(events) >= 1

    def test_depeg_event_has_magnitude(self, sample_price_series_depegged):
        events = detect_depeg_events(sample_price_series_depegged, peg=1.0, threshold_bps=50.0)
        for event in events:
            assert event.magnitude_bps >= 50.0
            assert event.duration_periods >= 1

    def test_empty_series(self):
        events = detect_depeg_events([], peg=1.0, threshold_bps=50.0)
        assert events == []

    def test_all_depegged(self):
        prices = [0.90] * 100
        events = detect_depeg_events(prices, peg=1.0, threshold_bps=50.0)
        assert len(events) >= 1
        assert events[0].magnitude_bps > 900  # ~1000 bps from $0.90

    def test_event_direction_below(self):
        prices = [1.0] * 50 + [0.97] * 20 + [1.0] * 50
        events = detect_depeg_events(prices, peg=1.0, threshold_bps=50.0)
        assert any(e.direction == "below" for e in events)


class TestCalculatePegScore:
    # calculate_peg_score takes the raw price series (it derives its own
    # deviation stats internally) — not a PegDeviationStats object.
    def test_perfect_peg_score_100(self):
        score = calculate_peg_score([1.0] * 100, peg=1.0)
        assert score == pytest.approx(100.0, abs=1.0)

    def test_large_depeg_low_score(self, sample_price_series_depegged):
        score = calculate_peg_score(sample_price_series_depegged, peg=1.0)
        assert score < 70.0

    def test_score_bounded_0_100(self, sample_price_series_stable):
        score = calculate_peg_score(sample_price_series_stable, peg=1.0)
        assert 0.0 <= score <= 100.0

    def test_moderate_deviation_mid_score(self):
        prices = [1.0 + 0.003 * (i % 2) for i in range(100)]  # 30bps oscillation
        score = calculate_peg_score(prices, peg=1.0)
        assert 50.0 <= score <= 95.0
