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


# Per-asset-type weight calibration.
#
# app/scoring/engine.py has imported this symbol since it was written, but it
# was never defined — so `app.scoring.engine` raised ImportError on import,
# and because api/v1/risk_scores.py imports ScoringEngine at module level and
# router.py imports risk_scores, THE WHOLE FASTAPI APP FAILED TO START. Not
# just the test suite (which died at collection and so was blamed for it):
# `uvicorn app.main:app` never came up either.
#
# Restored as an identity mapping on purpose. The four asset types plausibly
# deserve different weightings — a CBDC has no meaningful reserve attestation
# in the sense a fiat-backed stablecoin does, and a DeFi token's risk is
# mostly contract and liquidity — but choosing those numbers is a risk-model
# calibration decision with real consequences for what the product tells
# users, and it belongs to the scoring owner, not to whoever unblocked the
# import. Returning DEFAULT_WEIGHTS reproduces exactly the behaviour the rest
# of the engine already assumes, so nothing silently changes meaning.
#
# To calibrate: add an entry here per type. `validate()` enforces the sum.
_WEIGHTS_BY_ASSET_TYPE: dict[str, ScoringWeights] = {
    "stablecoin": DEFAULT_WEIGHTS,
    "tokenized": DEFAULT_WEIGHTS,
    "cbdc": DEFAULT_WEIGHTS,
    "defi": DEFAULT_WEIGHTS,
}


def get_weights_for_asset_type(asset_type: str | None) -> ScoringWeights:
    """Return the scoring weights calibrated for an asset type.

    Falls back to DEFAULT_WEIGHTS for an unknown or missing type rather than
    raising: an unrecognised asset should still get a score, and the caller
    (engine.score_asset) has no path to handle an exception here.
    """
    if not asset_type:
        return DEFAULT_WEIGHTS
    return _WEIGHTS_BY_ASSET_TYPE.get(str(asset_type).lower(), DEFAULT_WEIGHTS)
