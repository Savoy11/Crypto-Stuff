"""
Security and compliance component (15% weight).
Aggregates smart contract risk and counterparty/regulatory scoring.
"""
from __future__ import annotations

from typing import Any

from app.analytics.smart_contract_risk import composite_smart_contract_score
from app.analytics.counterparty_risk import composite_counterparty_score


def compute_security_compliance_score(
    smart_contract_data: dict[str, Any] | None,
    issuer_data: dict[str, Any] | None,
    custodian_data: dict[str, Any] | None,
    compliance_data: dict[str, Any] | None,
) -> tuple[float, dict[str, Any]]:
    """
    Compute the security and compliance component score (0–100).

    Weights within component:
    - Smart contract risk: 50%
    - Counterparty/issuer: 50%

    Args:
        smart_contract_data: Dict with audit, upgrade, admin key, oracle fields.
        issuer_data: Dict with issuer credibility fields.
        custodian_data: Dict with custodian type and insurance fields.
        compliance_data: Dict with regulatory/compliance fields.

    Returns:
        Tuple of (score, breakdown_dict).
    """
    if smart_contract_data:
        sc_scores = composite_smart_contract_score(
            audits=smart_contract_data.get("audits", []),
            upgrade_type=smart_contract_data.get("upgrade_type"),
            is_multisig=smart_contract_data.get("is_multisig", False),
            signer_count=smart_contract_data.get("signer_count"),
            threshold=smart_contract_data.get("threshold"),
            has_timelock=smart_contract_data.get("has_timelock", False),
            timelock_hours=smart_contract_data.get("timelock_hours"),
            oracle_count=smart_contract_data.get("oracle_count", 1),
            oracle_types=smart_contract_data.get("oracle_types", []),
            has_circuit_breaker=smart_contract_data.get("has_circuit_breaker", False),
        )
        sc_score = sc_scores["composite_score"]
    else:
        sc_scores = {}
        sc_score = 30.0  # Penalise lack of data

    if issuer_data or custodian_data or compliance_data:
        cp_scores = composite_counterparty_score(
            issuer_data=issuer_data or {},
            custodian_data=custodian_data or {},
            compliance_data=compliance_data or {},
        )
        cp_score = cp_scores["composite_score"]
    else:
        cp_scores = {}
        cp_score = 30.0  # Penalise lack of data

    composite = sc_score * 0.50 + cp_score * 0.50

    breakdown = {
        "component": "security_compliance",
        "weight": 0.15,
        "score": round(composite, 2),
        "smart_contract_score": round(sc_score, 2),
        "counterparty_score": round(cp_score, 2),
        "smart_contract_detail": sc_scores,
        "counterparty_detail": cp_scores,
    }

    return float(max(0.0, min(100.0, composite))), breakdown
