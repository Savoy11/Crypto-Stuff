"""
Counterparty risk analytics: issuer quality, custodian assessment,
regulatory standing, and composite counterparty scoring.
"""
from __future__ import annotations

from typing import Any


# Regulatory jurisdiction quality tiers
JURISDICTION_QUALITY: dict[str, float] = {
    "us": 90.0,        # SEC/OCC/Federal Reserve regulated
    "eu": 85.0,        # MiCA / MiFID II framework
    "uk": 82.0,        # FCA regulated
    "sg": 80.0,        # MAS regulated
    "jp": 78.0,        # FSA regulated
    "ch": 75.0,        # FINMA regulated
    "hk": 75.0,        # SFC regulated
    "bvi": 30.0,       # Offshore minimal regulation
    "cayman": 30.0,    # Offshore minimal regulation
    "seychelles": 20.0,
    "unknown": 10.0,
}

# Custodian tier scores
CUSTODIAN_TIER: dict[str, float] = {
    "bank": 95.0,           # Regulated bank custody
    "prime_broker": 80.0,   # Regulated prime broker
    "qualified_custodian": 85.0,  # SEC qualified custodian
    "trust_company": 88.0,  # State or federal trust company
    "crypto_custodian": 65.0,  # Regulated crypto custodian (Anchorage, Fireblocks)
    "self_custody": 30.0,   # Issuer self-custodies reserves
    "unknown": 15.0,
}


def score_issuer_credibility(
    is_regulated: bool,
    jurisdiction: str | None,
    years_operational: float | None,
    has_audited_financials: bool,
    credit_rating: str | None,
) -> float:
    """
    Score issuer credibility from 0 to 100.

    Args:
        is_regulated: Whether the issuer is regulated by a recognised regulator.
        jurisdiction: ISO country code or descriptive string.
        years_operational: Years the issuer has been operating.
        has_audited_financials: Whether annual financials are publicly audited.
        credit_rating: Credit rating (e.g., "AAA", "A+", "BBB").

    Returns:
        Score 0–100.
    """
    score = 0.0

    # Regulatory status (40 points max)
    if is_regulated:
        score += 25.0
        jur_score = JURISDICTION_QUALITY.get(
            (jurisdiction or "unknown").lower(), 10.0
        )
        score += (jur_score / 100.0) * 15.0  # up to 15 more points

    # Operational track record (20 points max)
    if years_operational is not None:
        if years_operational >= 5:
            score += 20.0
        elif years_operational >= 3:
            score += 15.0
        elif years_operational >= 1:
            score += 8.0
        else:
            score += 3.0

    # Audited financials (20 points)
    if has_audited_financials:
        score += 20.0

    # Credit rating (20 points max)
    if credit_rating:
        rating_scores = {
            "aaa": 20.0, "aa+": 19.0, "aa": 18.0, "aa-": 17.0,
            "a+": 15.0, "a": 14.0, "a-": 13.0,
            "bbb+": 10.0, "bbb": 9.0, "bbb-": 8.0,
            "bb+": 4.0, "bb": 3.0, "bb-": 2.0,
        }
        score += rating_scores.get(credit_rating.lower(), 0.0)

    return float(max(0.0, min(100.0, score)))


def score_custodian(
    custodian_type: str | None,
    custodian_count: int = 1,
    has_insurance: bool = False,
    insurance_coverage_pct: float = 0.0,
) -> float:
    """
    Score custody arrangement quality.

    Args:
        custodian_type: Type of custodian arrangement.
        custodian_count: Number of independent custodians.
        has_insurance: Whether reserves have insurance coverage.
        insurance_coverage_pct: Percentage of reserves covered by insurance.

    Returns:
        Score 0–100.
    """
    base_score = CUSTODIAN_TIER.get(
        (custodian_type or "unknown").lower().replace(" ", "_"), 15.0
    )

    # Multi-custodian bonus
    if custodian_count >= 3:
        diversity_bonus = 15.0
    elif custodian_count == 2:
        diversity_bonus = 8.0
    else:
        diversity_bonus = 0.0

    # Insurance bonus
    insurance_bonus = 0.0
    if has_insurance:
        insurance_bonus = min(10.0, insurance_coverage_pct / 100.0 * 10.0)

    total = base_score + diversity_bonus + insurance_bonus
    return float(max(0.0, min(100.0, total)))


def score_regulatory_compliance(
    has_mtl: bool,
    has_banking_charter: bool,
    is_vasp_registered: bool,
    enforcement_actions: int,
    sar_filings_current: bool,
) -> float:
    """
    Score regulatory compliance posture.

    Args:
        has_mtl: Has Money Transmitter License (or equivalent).
        has_banking_charter: Has banking charter.
        is_vasp_registered: Registered as a Virtual Asset Service Provider.
        enforcement_actions: Number of regulatory enforcement actions (last 3 years).
        sar_filings_current: AML/SAR filings are current.

    Returns:
        Score 0–100.
    """
    score = 0.0

    if has_banking_charter:
        score += 40.0
    elif has_mtl:
        score += 25.0

    if is_vasp_registered:
        score += 15.0

    if sar_filings_current:
        score += 20.0

    # Enforcement action penalties
    score -= min(30.0, enforcement_actions * 10.0)

    # Minimum floor of 5 for any regulated entity
    if has_mtl or has_banking_charter:
        score = max(5.0, score)

    return float(max(0.0, min(100.0, score)))


def composite_counterparty_score(
    issuer_data: dict[str, Any],
    custodian_data: dict[str, Any],
    compliance_data: dict[str, Any],
) -> dict[str, float]:
    """
    Composite counterparty risk score.

    Weights:
    - Issuer credibility:  40%
    - Custodian quality:   35%
    - Regulatory:          25%
    """
    issuer_score = score_issuer_credibility(
        is_regulated=issuer_data.get("is_regulated", False),
        jurisdiction=issuer_data.get("jurisdiction"),
        years_operational=issuer_data.get("years_operational"),
        has_audited_financials=issuer_data.get("has_audited_financials", False),
        credit_rating=issuer_data.get("credit_rating"),
    )
    custodian_score = score_custodian(
        custodian_type=custodian_data.get("type"),
        custodian_count=custodian_data.get("count", 1),
        has_insurance=custodian_data.get("has_insurance", False),
        insurance_coverage_pct=custodian_data.get("insurance_coverage_pct", 0.0),
    )
    compliance_score = score_regulatory_compliance(
        has_mtl=compliance_data.get("has_mtl", False),
        has_banking_charter=compliance_data.get("has_banking_charter", False),
        is_vasp_registered=compliance_data.get("is_vasp_registered", False),
        enforcement_actions=compliance_data.get("enforcement_actions", 0),
        sar_filings_current=compliance_data.get("sar_filings_current", False),
    )

    composite = (
        issuer_score * 0.40
        + custodian_score * 0.35
        + compliance_score * 0.25
    )

    return {
        "issuer_score": round(issuer_score, 2),
        "custodian_score": round(custodian_score, 2),
        "compliance_score": round(compliance_score, 2),
        "composite_score": round(float(max(0.0, min(100.0, composite))), 2),
    }
