/**
 * Stablecoin risk profile — the five-pillar composite the Risk Scores page
 * was designed around: Reserve, Peg, Structure, Adoption, News.
 *
 * Inputs are free-tier observables: DefiLlama supply/price/mechanism, a
 * 7-day price sparkline (CoinGecko), curated issuer disclosures
 * (lib/data/stablecoinMeta — snapshot data, scored at reduced confidence),
 * and the news pipeline's per-asset sentiment tags.
 *
 * Risks here are multiplicative, not additive: perfect sentiment cannot
 * rescue an empty reserve. applyFatalFlaws() slashes the weighted composite
 * when a structural pillar falls below its critical threshold.
 */
import { bandForScore } from '../engine'
import { clamp, piecewise } from '../normalize'
import type { CompositeRisk, DimensionScore, RiskProfileSpec } from '../types'

export const STABLECOIN_RISK_PROFILE: RiskProfileSpec = {
  id: 'stablecoin',
  name: 'Stablecoin Composite Risk',
  assetClass: 'crypto',
  version: '1.0.0',
  dimensions: [
    { key: 'reserve', label: 'Reserve Quality', weight: 0.30,
      description: 'Liquidity and counterparty quality of the backing assets — cash and short-term Treasuries score highest, crypto collateral and opaque holdings lower, with attestation freshness applied as a multiplier.' },
    { key: 'peg', label: 'Peg Stability', weight: 0.25,
      description: 'Deviation from $1.00 — current basis-point distance plus the worst deviation across the trailing 7-day price history.' },
    { key: 'structure', label: 'Structure & Mechanism', weight: 0.20,
      description: 'How the peg is maintained (fiat-backed > crypto-backed > algorithmic), prudential regulation of the issuer, and historical incidents.' },
    { key: 'adoption', label: 'Adoption & Liquidity', weight: 0.15,
      description: 'Circulating supply and multi-chain distribution — larger, battle-tested footprints absorb redemption shocks better.' },
    { key: 'news', label: 'News Sentiment', weight: 0.10,
      description: 'Net sentiment of recent articles tagged to this asset by the CAEP news pipeline.' },
  ],
}

// ─── Reserve Quality ─────────────────────────────────────────────────────────

/**
 * Safety weight per disclosed reserve category (1 = as good as cash).
 *
 * ORDER IS SIGNIFICANT — categoryWeight returns the first match. Keep the more
 * specific patterns above the general ones: `rwa` sits above `treasur` because
 * the only RWA row in the data is DAI's "RWA (Treasuries)", which the broad
 * cash/treasury pattern would otherwise claim first and score as good as cash,
 * making this 0.85 entry dead code.
 */
const CATEGORY_WEIGHTS: ReadonlyArray<readonly [RegExp, number]> = [
  [/rwa/i, 0.85],
  [/cash|deposit|treasur/i, 1.0],
  [/usdc|stablecoin collateral/i, 0.8],
  [/eth|crypto/i, 0.55],
  [/corporate bond/i, 0.5],
  [/secured loan|other investment/i, 0.35],
]

function categoryWeight(category: string): number {
  for (const [re, w] of CATEGORY_WEIGHTS) if (re.test(category)) return w
  return 0.35 // undisclosed / unrecognized holdings score as opaque
}

export interface ReserveInputs {
  /** Disclosed composition, percentages summing to ~100. Empty = no breakdown published. */
  composition: Array<{ category: string; percentage: number }>
  /** Collateralization ratio from issuer disclosure (1.0 = fully backed), null = undisclosed. */
  collateralizationRatio: number | null
  /** 'fiat-backed' | 'crypto-backed' | 'algorithmic' (DefiLlama pegMechanism). */
  pegMechanism: string
  /** Days between the last attestation and the curated snapshot date; null = continuous on-chain. */
  attestationAgeDays: number | null
}

export function scoreReserve(inputs: ReserveInputs): DimensionScore {
  const { composition, collateralizationRatio, pegMechanism, attestationAgeDays } = inputs
  const evidence: DimensionScore['evidence'] = []

  let base: number | null = null
  let confidence = 0

  if (composition.length > 0) {
    base = composition.reduce((sum, c) => sum + categoryWeight(c.category) * c.percentage, 0)
    confidence = 0.6 // full breakdown, but from a curated disclosure snapshot
    evidence.push({ metric: 'disclosed composition', value: composition.map((c) => `${c.category} ${c.percentage}%`).join(', ') })
  } else if (pegMechanism === 'fiat-backed') {
    base = collateralizationRatio != null && collateralizationRatio >= 1 ? 72 : 55
    confidence = 0.4 // attested but no public breakdown to grade
    evidence.push({ metric: 'composition', value: null, note: 'No public reserve breakdown — scored from mechanism + attestation only' })
  } else if (pegMechanism === 'crypto-backed') {
    base = 52
    confidence = 0.45
    evidence.push({ metric: 'composition', value: 'on-chain crypto collateral', note: 'Collateral visible on-chain but volatile' })
  } else if (pegMechanism === 'algorithmic') {
    base = 12
    confidence = 0.6
    evidence.push({ metric: 'composition', value: 'algorithmic', note: 'No hard reserve backing' })
  }

  if (base === null) {
    return { key: 'reserve', score: null, confidence: 0, evidence: [{ metric: 'reserve data', value: null, note: 'No disclosure or mechanism data available' }] }
  }

  // Over-collateralization buys real protection (DAI at 150% > fiat at 100%).
  if (collateralizationRatio != null && collateralizationRatio > 1) {
    const bonus = Math.min(15, (collateralizationRatio - 1) * 30)
    base += bonus
    evidence.push({ metric: 'collateralization ratio', value: collateralizationRatio, note: `+${bonus.toFixed(0)} over-collateralization` })
  }

  // Stale attestations are worth less — a reserve claim ages badly.
  let freshness = 1.0
  if (attestationAgeDays === null) {
    evidence.push({ metric: 'attestation', value: 'continuous on-chain' })
  } else if (attestationAgeDays <= 60) {
    evidence.push({ metric: 'attestation age', value: `${attestationAgeDays}d` })
  } else if (attestationAgeDays <= 120) {
    freshness = 0.85
    evidence.push({ metric: 'attestation age', value: `${attestationAgeDays}d`, note: 'Aging attestation — ×0.85' })
  } else {
    freshness = 0.6
    evidence.push({ metric: 'attestation age', value: `${attestationAgeDays}d`, note: 'Stale attestation — ×0.6' })
  }

  return { key: 'reserve', score: clamp(base * freshness, 0, 100), confidence, evidence }
}

// ─── Peg Stability ───────────────────────────────────────────────────────────

export interface PegInputs {
  /** Latest traded price in USD, null if unavailable. */
  price: number | null
  /** Trailing ~7d price series (any regular interval), oldest first. */
  history: number[]
}

export function scorePeg(inputs: PegInputs): DimensionScore {
  const { price, history } = inputs
  if (price === null || price <= 0) {
    return { key: 'peg', score: null, confidence: 0, evidence: [{ metric: 'price', value: null, note: 'No live price available' }] }
  }

  const currentBps = Math.abs(price - 1) * 10_000
  let score = 100 - currentBps / 10
  const evidence: DimensionScore['evidence'] = [
    { metric: 'current deviation', value: `${currentBps.toFixed(0)}bps`, note: `$${price.toFixed(4)}` },
  ]

  let confidence = 0.5 // spot price alone is a thin basis
  const valid = history.filter((p) => p > 0)
  if (valid.length >= 24) {
    const worst = valid.reduce((max, p) => Math.max(max, Math.abs(p - 1)), 0) * 10_000
    score -= worst / 20
    confidence = 0.85
    evidence.push({ metric: 'worst 7d deviation', value: `${worst.toFixed(0)}bps` })
  } else {
    evidence.push({ metric: '7d history', value: null, note: 'Insufficient history — scored from spot price only' })
  }

  return { key: 'peg', score: clamp(score, 0, 100), confidence, evidence }
}

// ─── Structure & Mechanism ───────────────────────────────────────────────────

export interface StructureInputs {
  pegMechanism: string
  regulatedIssuer: boolean
  incidentPenalty: number
  incidentNote?: string
}

export function scoreStructure(inputs: StructureInputs): DimensionScore {
  const mechanismBase: Record<string, number> = { 'fiat-backed': 80, 'crypto-backed': 60, 'algorithmic': 25 }
  const base = mechanismBase[inputs.pegMechanism]
  if (base === undefined) {
    return { key: 'structure', score: null, confidence: 0, evidence: [{ metric: 'peg mechanism', value: inputs.pegMechanism, note: 'Unrecognized mechanism' }] }
  }
  const evidence: DimensionScore['evidence'] = [{ metric: 'peg mechanism', value: inputs.pegMechanism }]
  let score = base
  if (inputs.regulatedIssuer) {
    score += 10
    evidence.push({ metric: 'regulated issuer', value: true, note: 'Prudentially regulated (e.g. NYDFS trust charter) +10' })
  }
  if (inputs.incidentPenalty > 0) {
    score -= inputs.incidentPenalty
    evidence.push({ metric: 'incident history', value: -inputs.incidentPenalty, note: inputs.incidentNote })
  }
  return { key: 'structure', score: clamp(score, 0, 100), confidence: 0.7, evidence }
}

// ─── Adoption & Liquidity ────────────────────────────────────────────────────

export interface AdoptionInputs {
  circulatingUsd: number | null
  chainCount: number
}

export function scoreAdoption(inputs: AdoptionInputs): DimensionScore {
  const { circulatingUsd, chainCount } = inputs
  if (circulatingUsd === null || circulatingUsd <= 0) {
    return { key: 'adoption', score: null, confidence: 0, evidence: [{ metric: 'circulating supply', value: null }] }
  }
  let score = piecewise(circulatingUsd, [
    [1e8, 20], [1e9, 45], [5e9, 65], [2e10, 80], [5e10, 90], [1.2e11, 95],
  ])
  const evidence: DimensionScore['evidence'] = [
    { metric: 'circulating supply', value: `$${(circulatingUsd / 1e9).toFixed(1)}B` },
    { metric: 'chains', value: chainCount },
  ]
  if (chainCount >= 5) score = Math.min(100, score + 5)
  return { key: 'adoption', score, confidence: 0.9, evidence }
}

// ─── News Sentiment (shared with the major-asset profile) ────────────────────

export interface NewsSentimentInputs {
  positive: number
  negative: number
  total: number
}

export function scoreNewsSentiment(inputs: NewsSentimentInputs, key = 'news'): DimensionScore {
  const { positive, negative, total } = inputs
  if (total < 3) {
    return { key, score: null, confidence: 0, evidence: [{ metric: 'tagged articles', value: total, note: 'Fewer than 3 recent articles — not enough signal' }] }
  }
  const net = (positive - negative) / total
  return {
    key,
    score: clamp(50 + net * 50, 0, 100),
    confidence: Math.min(1, total / 10) * 0.8,
    evidence: [
      { metric: 'tagged articles', value: total },
      { metric: 'positive / negative', value: `${positive} / ${negative}` },
    ],
  }
}

// ─── Fatal-flaw override ─────────────────────────────────────────────────────

export interface FatalFlawRule {
  /** Dimension key to inspect. */
  key: string
  /** Slash when the dimension's score is non-null and below this. */
  below: number
  /** Composite multiplier applied when triggered. */
  multiplier: number
  reason: string
}

/** A stablecoin with no reserve is collapsing regardless of its sentiment. */
export const STABLECOIN_FATAL_FLAWS: FatalFlawRule[] = [
  { key: 'reserve', below: 30, multiplier: 0.3, reason: 'Reserve quality critical — backing is weak, opaque, or absent' },
  { key: 'structure', below: 20, multiplier: 0.2, reason: 'Structural mechanism critical — peg design is fragile' },
  { key: 'peg', below: 40, multiplier: 0.5, reason: 'Active peg instability' },
]

export interface SlashedFlaw {
  reason: string
  multiplier: number
}

export interface OverriddenRisk extends CompositeRisk {
  /** Composite before any fatal-flaw slashing. */
  baseScore: number
  slashed: SlashedFlaw[]
}

/**
 * Apply multiplicative fatal-flaw slashing to a weighted composite.
 * Pure: returns a new object; score/band reflect the slashed value.
 */
export function applyFatalFlaws(composite: CompositeRisk, rules: FatalFlawRule[]): OverriddenRisk {
  const slashed: SlashedFlaw[] = []
  let score = composite.score
  for (const rule of rules) {
    const dim = composite.dimensions.find((d) => d.key === rule.key)
    if (dim?.score != null && dim.score < rule.below) {
      score *= rule.multiplier
      slashed.push({ reason: rule.reason, multiplier: rule.multiplier })
    }
  }
  score = Math.round(score * 100) / 100
  return {
    ...composite,
    baseScore: composite.score,
    score,
    band: bandForScore(score),
    slashed,
    warnings: [...composite.warnings, ...slashed.map((s) => `Fatal flaw: ${s.reason} (composite ×${s.multiplier})`)],
  }
}
