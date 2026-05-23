"""
Reserve quality analytics: composition scoring, collateralization health,
attestation freshness, and composite reserve scoring.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any


# Quality weights for reserve composition types.
# Higher is better (safer, more liquid).
COMPOSITION_QUALITY_WEIGHTS: dict[str, float] = {
    "cash": 1.00,           # Bank deposits, money market funds
    "tbills": 0.95,         # US Treasury bills (<90 days)
    "treasuries": 0.85,     # US Treasuries (longer duration)
    "repo": 0.80,           # Reverse repurchase agreements
    "agency": 0.75,         # Agency MBS / GSE debt
    "mmf": 0.90,            # Money market funds (prime)
    "corporate": 0.55,      # Investment-grade corporate bonds
    "municipal": 0.60,      # Municipal bonds
    "crypto": 0.20,         # Crypto assets (BTC, ETH, etc.)
    "stablecoin": 0.30,     # Algorithmic or partially-backed stablecoins
    "equity": 0.40,         # Equities / stocks
    "real_estate": 0.35,    # Real estate / property
    "commodities": 0.50,    # Gold, silver, etc.
    "other": 0.30,          # Uncategorised assets
}


def score_reserve_composition(composition: dict[str, Any]) -> float:
    """
    Score reserve composition quality from 0 to 100.

    Args:
        composition: Dict mapping asset type → {"pct": float, "value_usd": float}.
                     Example: {"cash": {"pct": 40.0, "value_usd": 4e8}, ...}

    Returns:
        Quality score 0–100 (100 = all cash, 0 = pure crypto).
    """
    if not composition:
        return 0.0

    total_pct = 0.0
    weighted_quality = 0.0

    for asset_class, details in composition.items():
        if isinstance(details, dict):
            pct = float(details.get("pct", details.get("percentage", 0.0)))
        elif isinstance(details, (int, float)):
            pct = float(details)
        else:
            continue

        quality = COMPOSITION_QUALITY_WEIGHTS.get(asset_class.lower(), 0.30)
        weighted_quality += pct * quality
        total_pct += pct

    if total_pct <= 0:
        return 0.0

    # Normalise to 100%
    raw_score = (weighted_quality / total_pct) * 100.0

    # Apply a penalty if composition is heavily concentrated (>80% single asset)
    max_pct = 0.0
    for asset_class, details in composition.items():
        if isinstance(details, dict):
            pct = float(details.get("pct", details.get("percentage", 0.0)))
        elif isinstance(details, (int, float)):
            pct = float(details)
        else:
            continue
        max_pct = max(max_pct, pct)

    concentration_penalty = 0.0
    if max_pct > 80.0:
        concentration_penalty = (max_pct - 80.0) / 20.0 * 10.0  # up to 10 points

    return float(max(0.0, min(100.0, raw_score - concentration_penalty)))


def calculate_collateralization_health(ratio: float | None) -> float:
    """
    Score collateralization ratio on a 0–100 scale.

    Scoring:
    - ≥ 1.10 → 100 (10%+ over-collateralised)
    - 1.05–1.10 → 80–100 (healthy buffer)
    - 1.01–1.05 → 50–80 (adequate)
    - 1.00–1.01 → 20–50 (tight, borderline)
    - < 1.00 → 0 (under-collateralised)
    - None → 0 (no data)
    """
    if ratio is None:
        return 0.0

    if ratio >= 1.10:
        return 100.0
    elif ratio >= 1.05:
        # Linear interpolation between 80 and 100
        return 80.0 + (ratio - 1.05) / 0.05 * 20.0
    elif ratio >= 1.01:
        return 50.0 + (ratio - 1.01) / 0.04 * 30.0
    elif ratio >= 1.00:
        return 20.0 + (ratio - 1.00) / 0.01 * 30.0
    else:
        # Under-collateralised — exponential decay to 0
        shortfall = (1.00 - ratio) * 100.0  # percentage points
        return float(max(0.0, 20.0 - shortfall * 4.0))


def assess_attestation_freshness(last_date: date | datetime | None) -> float:
    """
    Score attestation freshness based on days since last attestation.

    Scoring:
    - Same day / yesterday (≤1 day)  → 100
    - ≤7 days                         → 90
    - ≤14 days                        → 75
    - ≤30 days                        → 60
    - ≤60 days                        → 40
    - ≤90 days                        → 20
    - >90 days or None                → 0
    """
    if last_date is None:
        return 0.0

    if isinstance(last_date, datetime):
        last_date = last_date.date()

    today = datetime.now(timezone.utc).date()
    days_ago = (today - last_date).days

    if days_ago <= 1:
        return 100.0
    elif days_ago <= 7:
        return 90.0 - (days_ago - 1) / 6.0 * 10.0
    elif days_ago <= 14:
        return 75.0 - (days_ago - 7) / 7.0 * 15.0
    elif days_ago <= 30:
        return 60.0 - (days_ago - 14) / 16.0 * 15.0
    elif days_ago <= 60:
        return 40.0 - (days_ago - 30) / 30.0 * 20.0
    elif days_ago <= 90:
        return 20.0 - (days_ago - 60) / 30.0 * 20.0
    else:
        return 0.0


def composite_reserve_score(
    composition: dict[str, Any],
    collateralization_ratio: float | None,
    last_attestation_date: date | datetime | None,
    attester_quality: str = "unknown",
) -> dict[str, float]:
    """
    Compute a weighted composite reserve score from sub-components.

    Weights:
    - Composition quality:   35%
    - Collateralization:     40%
    - Attestation freshness: 15%
    - Attester quality:      10%

    Args:
        composition: Reserve composition dict.
        collateralization_ratio: Total reserves / total liabilities.
        last_attestation_date: Date of the most recent attestation.
        attester_quality: One of "big4", "independent", "internal", "unknown".

    Returns:
        Dict with individual sub-scores and the composite score.
    """
    composition_score = score_reserve_composition(composition)
    collateralization_score = calculate_collateralization_health(collateralization_ratio)
    freshness_score = assess_attestation_freshness(last_attestation_date)
    attester_score = _score_attester_quality(attester_quality)

    composite = (
        composition_score * 0.35
        + collateralization_score * 0.40
        + freshness_score * 0.15
        + attester_score * 0.10
    )

    return {
        "composition_score": round(composition_score, 2),
        "collateralization_score": round(collateralization_score, 2),
        "freshness_score": round(freshness_score, 2),
        "attester_score": round(attester_score, 2),
        "composite_score": round(float(max(0.0, min(100.0, composite))), 2),
        "collateralization_ratio": collateralization_ratio,
        "days_since_attestation": (
            (datetime.now(timezone.utc).date() - (
                last_attestation_date.date()
                if isinstance(last_attestation_date, datetime)
                else last_attestation_date
            )).days
            if last_attestation_date is not None
            else None
        ),
    }


def _score_attester_quality(attester_type: str) -> float:
    """Score the credibility of the attestation source."""
    quality_map = {
        "big4": 100.0,         # Big-4 auditors (Deloitte, PwC, KPMG, EY)
        "independent": 75.0,   # Reputable independent auditors
        "regulator": 90.0,     # Regulatory attestation
        "internal": 25.0,      # Self-reported
        "unknown": 10.0,       # Unverified
    }
    return quality_map.get(attester_type.lower(), 10.0)


def identify_reserve_risk_flags(
    composition: dict[str, Any],
    collateralization_ratio: float | None,
    days_since_attestation: int | None,
) -> list[str]:
    """
    Return a list of risk flag strings for display in risk reports.
    """
    flags: list[str] = []

    if collateralization_ratio is not None and collateralization_ratio < 1.0:
        flags.append("UNDER_COLLATERALISED")
    elif collateralization_ratio is not None and collateralization_ratio < 1.02:
        flags.append("CRITICALLY_LOW_COLLATERAL")

    if days_since_attestation is None:
        flags.append("NO_ATTESTATION")
    elif days_since_attestation > 90:
        flags.append("STALE_ATTESTATION_90D")
    elif days_since_attestation > 30:
        flags.append("STALE_ATTESTATION_30D")

    # Check for high-risk composition
    crypto_pct = 0.0
    for key, val in composition.items():
        if key.lower() in ("crypto", "stablecoin", "equity"):
            if isinstance(val, dict):
                crypto_pct += float(val.get("pct", val.get("percentage", 0.0)))
            elif isinstance(val, (int, float)):
                crypto_pct += float(val)

    if crypto_pct > 50.0:
        flags.append("HIGH_RISK_ASSET_COMPOSITION")
    elif crypto_pct > 20.0:
        flags.append("ELEVATED_RISK_ASSET_COMPOSITION")

    return flags
