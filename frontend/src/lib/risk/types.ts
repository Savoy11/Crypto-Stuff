/**
 * Unified risk framework — core types.
 *
 * One vocabulary for risk across every asset class in the suite (crypto
 * today; equities, options, funds, bonds, commodities as they land).
 *
 * CONVENTIONS (canonical for the whole suite):
 * - All scores are 0–100 where HIGHER = SAFER. This matches the existing
 *   backend scoring engine and the risk-scores UI. Sources that express
 *   risk the other way (e.g. staking's 1–10 higher-is-riskier profiles)
 *   are converted at the adapter boundary — never mixed internally.
 * - Bands use the frontend thresholds (80/60/40/20) everywhere.
 * - A score says how risky something is; `confidence` says how much data
 *   backs that claim. Missing data lowers confidence, never the score.
 */

export type RiskBand = 'low' | 'moderate' | 'elevated' | 'high' | 'critical'

/** Canonical band thresholds: score >= min → band. Ordered best → worst. */
export const RISK_BAND_THRESHOLDS: ReadonlyArray<{ band: RiskBand; min: number }> = [
  { band: 'low', min: 80 },
  { band: 'moderate', min: 60 },
  { band: 'elevated', min: 40 },
  { band: 'high', min: 20 },
  { band: 'critical', min: 0 },
]

/** Asset classes the suite plans to cover. */
export type SuiteAssetClass =
  | 'crypto'
  | 'equities'
  | 'options'
  | 'funds'
  | 'bonds'
  | 'commodities'
  | 'forex'

/** One weighted dimension of a risk profile (e.g. "liquidity"). */
export interface RiskDimensionSpec {
  key: string
  label: string
  description: string
  /** 0–1. All dimension weights in a profile sum to 1. */
  weight: number
}

/**
 * A versioned recipe for scoring one kind of thing (an equity, an options
 * trade, a staking provider). Version bumps whenever weights or dimension
 * semantics change, so stored scores stay comparable.
 */
export interface RiskProfileSpec {
  /** Stable id, e.g. "equity". */
  id: string
  name: string
  assetClass: SuiteAssetClass
  /** Semver of the scoring recipe, e.g. "1.0.0". */
  version: string
  dimensions: RiskDimensionSpec[]
}

/** A single observable fact that contributed to a dimension score. */
export interface Evidence {
  metric: string
  value: number | string | boolean | null
  note?: string
}

/** The scored result of one dimension. */
export interface DimensionScore {
  key: string
  /** 0–100 higher = safer, or null when no data was available. */
  score: number | null
  /** 0–1: how complete/fresh the inputs behind this score were. */
  confidence: number
  evidence: Evidence[]
}

/** A dimension score joined with its spec, as it appears in a composite. */
export interface CompositeDimension extends DimensionScore {
  label: string
  weight: number
  band: RiskBand | null
}

/** The final output: one composite score with a full audit trail. */
export interface CompositeRisk {
  profileId: string
  profileVersion: string
  assetClass: SuiteAssetClass
  /** 0–100 higher = safer, weighted across scored dimensions. */
  score: number
  band: RiskBand
  /** 0–1: weighted dimension confidence × data coverage. */
  confidence: number
  /** 0–1: fraction of profile weight backed by actual data. */
  coverage: number
  dimensions: CompositeDimension[]
  /** Human-readable notes, e.g. which dimensions had no data. */
  warnings: string[]
}
