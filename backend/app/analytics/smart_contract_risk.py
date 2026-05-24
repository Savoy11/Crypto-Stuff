"""
Smart contract risk assessment: upgrade risk, admin key exposure,
oracle dependency, and code audit scoring.
"""
from __future__ import annotations

from typing import Any


# Audit firm quality scores (0-100)
AUDIT_FIRM_QUALITY: dict[str, float] = {
    "trail_of_bits": 95.0,
    "consensys_diligence": 93.0,
    "openzeppelin": 92.0,
    "certik": 80.0,
    "peckshield": 82.0,
    "slowmist": 78.0,
    "halborn": 85.0,
    "quantstamp": 83.0,
    "chainsecurity": 90.0,
    "spearbit": 94.0,
    "code4rena": 75.0,
    "unknown": 20.0,
    "none": 0.0,
}

# Upgrade mechanism risk levels
UPGRADE_RISK: dict[str, float] = {
    "immutable": 100.0,          # No upgradability — most secure
    "timelock_48h": 85.0,        # 48h timelock before upgrade
    "timelock_24h": 70.0,        # 24h timelock
    "timelock_12h": 55.0,        # 12h timelock
    "multisig_proxy": 60.0,      # Multisig-controlled upgradeable proxy
    "single_admin_proxy": 20.0,  # Single admin upgradeable proxy
    "transparent_proxy": 50.0,   # Standard transparent proxy without timelock
    "unknown": 10.0,
}


def score_audit_coverage(
    audits: list[dict[str, Any]],
) -> float:
    """
    Score the quality and recency of smart contract audits.

    Args:
        audits: List of audit records:
                [{"firm": "trail_of_bits", "date": "2024-01-01",
                  "findings_critical": 0, "findings_high": 0, "resolved": True}]

    Returns:
        Score 0–100.
    """
    if not audits:
        return 0.0

    from datetime import date, datetime, timezone
    today = datetime.now(timezone.utc).date()

    best_score = 0.0
    for audit in audits:
        firm = audit.get("firm", "unknown").lower().replace(" ", "_")
        firm_quality = AUDIT_FIRM_QUALITY.get(firm, 20.0)

        # Freshness penalty
        audit_date = audit.get("date")
        if isinstance(audit_date, str):
            try:
                audit_date = date.fromisoformat(audit_date)
            except ValueError:
                audit_date = None

        freshness_multiplier = 1.0
        if audit_date:
            days_old = (today - audit_date).days
            if days_old > 730:   # >2 years
                freshness_multiplier = 0.5
            elif days_old > 365:  # >1 year
                freshness_multiplier = 0.75
            elif days_old > 180:  # >6 months
                freshness_multiplier = 0.90

        # Finding penalty
        critical = int(audit.get("findings_critical", 0))
        high = int(audit.get("findings_high", 0))
        resolved = bool(audit.get("resolved", False))

        if not resolved and (critical > 0 or high > 0):
            finding_penalty = min(50.0, critical * 20.0 + high * 10.0)
        else:
            finding_penalty = 0.0  # Resolved findings don't penalise

        audit_score = firm_quality * freshness_multiplier - finding_penalty
        best_score = max(best_score, audit_score)

    return float(max(0.0, min(100.0, best_score)))


def score_upgrade_mechanism(upgrade_type: str | None) -> float:
    """Score the smart contract upgrade mechanism risk."""
    if upgrade_type is None:
        return 10.0
    return UPGRADE_RISK.get(upgrade_type.lower().replace(" ", "_"), 10.0)


def score_admin_key_risk(
    is_multisig: bool,
    signer_count: int | None,
    threshold: int | None,
    has_timelock: bool,
    timelock_hours: int | None,
) -> float:
    """
    Score admin key risk based on multisig setup and timelock configuration.

    Args:
        is_multisig: Whether admin is a multisig.
        signer_count: Total number of signers.
        threshold: Required signatures (M of N).
        has_timelock: Whether admin actions have a timelock.
        timelock_hours: Timelock delay in hours.

    Returns:
        Score 0–100 (100 = lowest risk).
    """
    if not is_multisig:
        return 10.0  # Single EOA is very high risk

    score = 40.0  # Base score for having any multisig

    # M-of-N scoring
    if signer_count is not None and threshold is not None and signer_count > 0:
        ratio = threshold / signer_count
        if ratio >= 0.67:  # 2/3 or more
            score += 30.0
        elif ratio >= 0.5:  # majority
            score += 20.0
        else:
            score += 10.0

        # Absolute signer count bonus
        if signer_count >= 7:
            score += 10.0
        elif signer_count >= 5:
            score += 5.0

    # Timelock bonus
    if has_timelock and timelock_hours is not None:
        if timelock_hours >= 48:
            score += 20.0
        elif timelock_hours >= 24:
            score += 15.0
        elif timelock_hours >= 12:
            score += 8.0
        else:
            score += 3.0

    return float(max(0.0, min(100.0, score)))


def score_oracle_dependency(
    oracle_count: int,
    oracle_types: list[str],
    has_circuit_breaker: bool,
) -> float:
    """
    Score oracle risk based on oracle diversity and safety mechanisms.

    Args:
        oracle_count: Number of independent price oracle sources.
        oracle_types: List of oracle types (e.g., ["chainlink", "band", "uniswap_twap"]).
        has_circuit_breaker: Whether the contract has price staleness/deviation circuit breakers.

    Returns:
        Score 0–100.
    """
    if oracle_count == 0:
        return 0.0

    # Oracle count scoring
    if oracle_count >= 3:
        count_score = 70.0
    elif oracle_count == 2:
        count_score = 50.0
    else:
        count_score = 25.0

    # Oracle type diversity
    reputable = {"chainlink", "band", "pyth", "api3", "dia", "chronicle"}
    reputable_count = sum(1 for o in oracle_types if o.lower() in reputable)
    diversity_score = min(30.0, reputable_count / max(oracle_count, 1) * 30.0)

    # Circuit breaker bonus
    cb_score = 15.0 if has_circuit_breaker else 0.0

    # Cap at 100 but allow individual bonuses to stack
    total = count_score + diversity_score + cb_score
    return float(max(0.0, min(100.0, total)))


def composite_smart_contract_score(
    audits: list[dict[str, Any]],
    upgrade_type: str | None,
    is_multisig: bool,
    signer_count: int | None,
    threshold: int | None,
    has_timelock: bool,
    timelock_hours: int | None,
    oracle_count: int = 1,
    oracle_types: list[str] | None = None,
    has_circuit_breaker: bool = False,
) -> dict[str, float]:
    """
    Composite smart contract risk score.

    Weights:
    - Audit coverage:       35%
    - Upgrade mechanism:    25%
    - Admin key risk:       25%
    - Oracle dependency:    15%
    """
    audit_score = score_audit_coverage(audits)
    upgrade_score = score_upgrade_mechanism(upgrade_type)
    admin_score = score_admin_key_risk(
        is_multisig, signer_count, threshold, has_timelock, timelock_hours
    )
    oracle_score = score_oracle_dependency(
        oracle_count, oracle_types or [], has_circuit_breaker
    )

    composite = (
        audit_score * 0.35
        + upgrade_score * 0.25
        + admin_score * 0.25
        + oracle_score * 0.15
    )

    return {
        "audit_score": round(audit_score, 2),
        "upgrade_mechanism_score": round(upgrade_score, 2),
        "admin_key_score": round(admin_score, 2),
        "oracle_score": round(oracle_score, 2),
        "composite_score": round(float(max(0.0, min(100.0, composite))), 2),
    }
