"""
Unit tests for the risk scoring engine.
"""
from __future__ import annotations

import pytest

from app.scoring.engine import ComponentScores, ScoringEngine
from app.scoring.weights import DEFAULT_WEIGHTS, ScoringWeights


class TestScoringWeights:
    def test_default_weights_sum_to_one(self):
        w = DEFAULT_WEIGHTS
        total = (
            w.reserve_transparency + w.peg_liquidity + w.network_velocity + w.security_compliance
        )
        assert total == pytest.approx(1.0, abs=1e-9)

    def test_custom_weights_must_sum_to_one(self):
        with pytest.raises((ValueError, Exception)):
            ScoringWeights(
                reserve_transparency=0.50,
                peg_liquidity=0.50,
                network_velocity=0.10,
                security_compliance=0.10,
            )

    def test_default_reserve_weight(self):
        assert DEFAULT_WEIGHTS.reserve_transparency == pytest.approx(0.35, abs=1e-9)

    def test_default_peg_weight(self):
        assert DEFAULT_WEIGHTS.peg_liquidity == pytest.approx(0.30, abs=1e-9)


class TestComponentScores:
    def test_all_fields_present(self):
        cs = ComponentScores(
            reserve_transparency=80.0,
            peg_liquidity=75.0,
            network_velocity=90.0,
            security_compliance=85.0,
        )
        assert cs.reserve_transparency == 80.0
        assert cs.peg_liquidity == 75.0
        assert cs.network_velocity == 90.0
        assert cs.security_compliance == 85.0

    def test_scores_bounded(self):
        cs = ComponentScores(
            reserve_transparency=100.0,
            peg_liquidity=0.0,
            network_velocity=50.0,
            security_compliance=75.0,
        )
        assert 0.0 <= cs.reserve_transparency <= 100.0
        assert 0.0 <= cs.peg_liquidity <= 100.0


class TestScoringEngineApplyWeights:
    def setup_method(self):
        self.engine = ScoringEngine()

    def test_all_100_gives_100(self):
        cs = ComponentScores(
            reserve_transparency=100.0,
            peg_liquidity=100.0,
            network_velocity=100.0,
            security_compliance=100.0,
        )
        result = self.engine.apply_weights(cs)
        assert result == pytest.approx(100.0, abs=1e-6)

    def test_all_zero_gives_zero(self):
        cs = ComponentScores(
            reserve_transparency=0.0,
            peg_liquidity=0.0,
            network_velocity=0.0,
            security_compliance=0.0,
        )
        result = self.engine.apply_weights(cs)
        assert result == pytest.approx(0.0, abs=1e-6)

    def test_weighted_average_correctness(self):
        cs = ComponentScores(
            reserve_transparency=80.0,  # * 0.35 = 28
            peg_liquidity=60.0,  # * 0.30 = 18
            network_velocity=100.0,  # * 0.20 = 20
            security_compliance=80.0,  # * 0.15 = 12
        )
        result = self.engine.apply_weights(cs)
        expected = 80.0 * 0.35 + 60.0 * 0.30 + 100.0 * 0.20 + 80.0 * 0.15
        assert result == pytest.approx(expected, abs=0.001)

    def test_result_bounded_between_0_and_100(self):
        cs = ComponentScores(
            reserve_transparency=50.0,
            peg_liquidity=50.0,
            network_velocity=50.0,
            security_compliance=50.0,
        )
        result = self.engine.apply_weights(cs)
        assert 0.0 <= result <= 100.0


class TestRiskBandAssignment:
    def setup_method(self):
        self.engine = ScoringEngine()

    def test_score_90_is_low(self):
        assert self.engine.assign_risk_band(90.0).value == "low"

    def test_score_75_is_moderate(self):
        assert self.engine.assign_risk_band(75.0).value == "moderate"

    def test_score_55_is_elevated(self):
        assert self.engine.assign_risk_band(55.0).value == "elevated"

    def test_score_35_is_high(self):
        assert self.engine.assign_risk_band(35.0).value == "high"

    def test_score_15_is_critical(self):
        assert self.engine.assign_risk_band(15.0).value == "critical"

    def test_boundary_80(self):
        band = self.engine.assign_risk_band(80.0)
        assert band.value in ("low", "moderate")

    def test_boundary_0(self):
        band = self.engine.assign_risk_band(0.0)
        assert band.value == "critical"

    def test_boundary_100(self):
        band = self.engine.assign_risk_band(100.0)
        assert band.value == "low"


class TestConfidenceCalculation:
    def setup_method(self):
        self.engine = ScoringEngine()

    def test_complete_data_full_confidence(self):
        data = {
            "prices": [1.0] * 168,
            "reserve_composition": {"cash": 0.8, "treasuries": 0.2},
            "velocity": 1.2,
            "smart_contract_data": {"audited": True},
        }
        confidence = self.engine.calculate_confidence(data)
        assert confidence >= 0.9

    def test_empty_data_low_confidence(self):
        data: dict = {}
        confidence = self.engine.calculate_confidence(data)
        assert confidence < 0.5

    def test_confidence_bounded_0_1(self):
        for data in [{}, {"market_data": [1] * 168}]:
            c = self.engine.calculate_confidence(data)
            assert 0.0 <= c <= 1.0


class TestPercentileCalculation:
    def setup_method(self):
        self.engine = ScoringEngine()

    @pytest.mark.asyncio
    async def test_highest_score_100th_percentile(self):
        all_scores = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
        percentile = self.engine.calculate_percentile(100.0, all_scores)
        assert percentile == pytest.approx(100.0, abs=1.0)

    @pytest.mark.asyncio
    async def test_lowest_score_0th_percentile(self):
        all_scores = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
        percentile = self.engine.calculate_percentile(10.0, all_scores)
        assert percentile <= 15.0

    @pytest.mark.asyncio
    async def test_single_score_in_list(self):
        percentile = self.engine.calculate_percentile(75.0, [75.0])
        assert 0.0 <= percentile <= 100.0

    @pytest.mark.asyncio
    async def test_empty_scores_returns_50(self):
        percentile = self.engine.calculate_percentile(75.0, [])
        assert percentile == pytest.approx(50.0, abs=1.0)
