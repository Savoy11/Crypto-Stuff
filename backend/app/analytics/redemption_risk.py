"""
Redemption risk analytics: queue depth, stress scenarios, and redemption health scoring.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class RedemptionStressResult:
    scenario: str
    redemption_pct: float        # % of supply redeemed
    redemption_usd: float
    reserves_remaining_usd: float
    is_solvent: bool
    remaining_ratio: float
    stress_score: float          # 0-100


def assess_redemption_solvency(
    total_reserves_usd: float,
    total_supply_usd: float,
    daily_volume_usd: float | None = None,
    redemption_queue_usd: float = 0.0,
) -> dict[str, Any]:
    """
    Assess redemption solvency under baseline and stress scenarios.

    Args:
        total_reserves_usd: Total reserve value in USD.
        total_supply_usd: Total outstanding supply in USD.
        daily_volume_usd: Average daily redemption volume.
        redemption_queue_usd: Current pending redemption queue size.

    Returns:
        Dict with baseline ratio, stress scenario results, and overall assessment.
    """
    if total_supply_usd <= 0 or total_reserves_usd < 0:
        return {"error": "Invalid inputs: supply must be positive"}

    baseline_ratio = total_reserves_usd / total_supply_usd

    # Stress scenarios
    scenarios = [
        ("mild_stress", 0.10),     # 10% simultaneous redemption
        ("moderate_stress", 0.25), # 25% simultaneous redemption
        ("severe_stress", 0.50),   # 50% simultaneous redemption
        ("extreme_stress", 0.75),  # 75% simultaneous redemption
    ]

    stress_results = []
    for scenario_name, redemption_pct in scenarios:
        redemption_usd = total_supply_usd * redemption_pct
        reserves_after = total_reserves_usd - redemption_usd
        remaining_supply = total_supply_usd - redemption_usd

        if remaining_supply > 0:
            remaining_ratio = max(0.0, reserves_after / remaining_supply)
        else:
            remaining_ratio = float("inf") if reserves_after > 0 else 0.0

        is_solvent = reserves_after >= 0
        # Stress score: 100 = comfortably solvent, 0 = deeply insolvent
        if is_solvent:
            stress_score = min(100.0, remaining_ratio * 90.0)
        else:
            shortfall_pct = abs(reserves_after) / total_supply_usd * 100
            stress_score = max(0.0, -shortfall_pct * 2.0)

        stress_results.append(
            RedemptionStressResult(
                scenario=scenario_name,
                redemption_pct=redemption_pct * 100,
                redemption_usd=redemption_usd,
                reserves_remaining_usd=reserves_after,
                is_solvent=is_solvent,
                remaining_ratio=remaining_ratio,
                stress_score=stress_score,
            )
        )

    # Queue risk: how many days can current reserves cover the queue
    queue_coverage_days = None
    if redemption_queue_usd > 0 and daily_volume_usd and daily_volume_usd > 0:
        queue_coverage_days = round(total_reserves_usd / daily_volume_usd, 1)

    # Composite redemption health score
    # Weight the worst scenario that is still survivable
    solvent_results = [r for r in stress_results if r.is_solvent]
    if not solvent_results:
        health_score = 0.0
    else:
        # Average stress scores of all scenarios, penalising more for later failures
        scores = [r.stress_score for r in stress_results]
        health_score = sum(scores) / len(scores)

    return {
        "baseline_collateral_ratio": round(baseline_ratio, 4),
        "is_over_collateralised": baseline_ratio >= 1.0,
        "buffer_pct": round((baseline_ratio - 1.0) * 100, 2),
        "redemption_queue_usd": redemption_queue_usd,
        "queue_coverage_days": queue_coverage_days,
        "stress_scenarios": [
            {
                "scenario": r.scenario,
                "redemption_pct": r.redemption_pct,
                "redemption_usd": r.redemption_usd,
                "is_solvent": r.is_solvent,
                "remaining_ratio": round(r.remaining_ratio, 4),
                "stress_score": round(r.stress_score, 2),
            }
            for r in stress_results
        ],
        "health_score": round(float(max(0.0, min(100.0, health_score))), 2),
        "risk_flags": _identify_redemption_flags(
            baseline_ratio, stress_results, redemption_queue_usd, total_supply_usd
        ),
    }


def _identify_redemption_flags(
    baseline_ratio: float,
    stress_results: list[RedemptionStressResult],
    queue_usd: float,
    supply_usd: float,
) -> list[str]:
    flags: list[str] = []

    if baseline_ratio < 1.0:
        flags.append("UNDER_COLLATERALISED")
    elif baseline_ratio < 1.02:
        flags.append("CRITICALLY_LOW_BUFFER")
    elif baseline_ratio < 1.05:
        flags.append("LOW_RESERVE_BUFFER")

    for r in stress_results:
        if not r.is_solvent:
            flags.append(f"INSOLVENT_UNDER_{r.scenario.upper()}")
            break  # Only flag the least severe failure

    if supply_usd > 0 and queue_usd / supply_usd > 0.05:
        flags.append("LARGE_REDEMPTION_QUEUE")
    elif supply_usd > 0 and queue_usd / supply_usd > 0.01:
        flags.append("ELEVATED_REDEMPTION_QUEUE")

    return flags
