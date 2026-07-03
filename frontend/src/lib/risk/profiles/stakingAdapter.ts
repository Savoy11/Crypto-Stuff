/**
 * Adapter: expresses the existing staking-provider risk model
 * (lib/data/stakingProviders.ts — six 1–10 higher-is-riskier dimensions)
 * in the unified framework, without touching the staking page.
 *
 * Same weights as computeOverallRisk(), same relative ordering of
 * providers (verified by tests) — just converted to the canonical 0–100
 * higher-is-safer scale with bands, confidence, and evidence attached.
 */
import type { RiskProfile } from '../../data/stakingProviders'
import { composeRisk } from '../engine'
import { tenPointRiskToSafety } from '../normalize'
import type { CompositeRisk, DimensionScore, RiskProfileSpec } from '../types'

export const STAKING_PROVIDER_RISK_PROFILE: RiskProfileSpec = {
  id: 'staking-provider',
  name: 'Staking Provider Risk Profile',
  assetClass: 'crypto',
  version: '1.0.0',
  dimensions: [
    {
      key: 'counterpartyRisk',
      label: 'Counterparty',
      description: 'Risk of provider insolvency or misuse of funds',
      weight: 0.25,
    },
    {
      key: 'custodyRisk',
      label: 'Custody',
      description: 'Who controls the keys while assets are staked',
      weight: 0.2,
    },
    {
      key: 'liquidityRisk',
      label: 'Liquidity',
      description: 'Ability to exit the position quickly',
      weight: 0.2,
    },
    {
      key: 'contractRisk',
      label: 'Smart Contract',
      description: 'Bug or exploit risk in staking contracts',
      weight: 0.15,
    },
    {
      key: 'slashingRisk',
      label: 'Slashing',
      description: 'Validator penalty risk',
      weight: 0.1,
    },
    {
      key: 'regulatoryRisk',
      label: 'Regulatory',
      description: 'Regulatory and legal exposure',
      weight: 0.1,
    },
  ],
}

/** Convert a staking RiskProfile into a unified composite score. */
export function scoreStakingProvider(risks: RiskProfile): CompositeRisk {
  const scores: DimensionScore[] = (
    Object.keys(risks) as Array<keyof RiskProfile>
  ).map((key) => ({
    key,
    score: tenPointRiskToSafety(risks[key]),
    confidence: 1, // curated editorial ratings — complete by construction
    evidence: [{ metric: `${key} (1–10, higher = riskier)`, value: risks[key] }],
  }))
  return composeRisk(STAKING_PROVIDER_RISK_PROFILE, scores)
}
