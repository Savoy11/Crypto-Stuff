"""
Scoring category weights and calibration parameters.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ScoringWeights:
    """Category weights must sum to 1.0."""

    reserve_transparency: float = 0.35
    peg_liquidity: float = 0.30
    network_velocity: float = 0.20
    security_compliance: float = 0.15

    def validate(self) -> None:
        total = (
            self.reserve_transparency
            + self.peg_liquidity
            + self.network_velocity
            + self.security_compliance
        )
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f"Scoring weights must sum to 1.0, got {total}")


# Default production weights
DEFAULT_WEIGHTS = ScoringWeights()


# Risk band thresholds (score → band)
RISK_BAND_THRESHOLDS: dict[str, tuple[float, float]] = {
    "low": (80.0, 100.0),
    "moderate": (65.0, 79.99),
    "elevated": (50.0, 64.99),
    "high": (30.0, 49.99),
    "critical": (0.0, 29.99),
}

# Confidence thresholds for data completeness
CONFIDENCE_THRESHOLDS: dict[str, float] = {
    "market_data": 0.25,  # 25% weight in confidence
    "reserve_data": 0.35,  # 35% weight
    "blockchain_data": 0.20,  # 20% weight
    "security_data": 0.20,  # 20% weight
}
