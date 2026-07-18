/**
 * The composite scoring engine. Profile-agnostic: give it a versioned
 * profile spec and per-dimension scores, get back one composite score with
 * band, confidence, coverage, and a full audit trail.
 *
 * Design mirrors the backend ScoringEngine (weighted components, confidence
 * from data completeness) but is pure and asset-class-neutral, so every
 * module in the suite — and the /api/v1 + MCP surfaces — can share it.
 */
import {
  RISK_BAND_THRESHOLDS,
  type CompositeDimension,
  type CompositeRisk,
  type DimensionScore,
  type RiskBand,
  type RiskProfileSpec,
} from './types'

export function bandForScore(score: number): RiskBand {
  for (const { band, min } of RISK_BAND_THRESHOLDS) {
    if (score >= min) return band
  }
  return 'critical'
}

/** @throws RangeError on duplicate keys or weights not summing to 1. */
export function validateProfile(spec: RiskProfileSpec): void {
  const keys = new Set<string>()
  let total = 0
  for (const dim of spec.dimensions) {
    if (keys.has(dim.key)) {
      throw new RangeError(`Profile "${spec.id}" has duplicate dimension key "${dim.key}"`)
    }
    keys.add(dim.key)
    if (dim.weight < 0 || dim.weight > 1) {
      throw new RangeError(`Dimension "${dim.key}" weight must be in [0, 1], got ${dim.weight}`)
    }
    total += dim.weight
  }
  if (Math.abs(total - 1) > 1e-6) {
    throw new RangeError(`Profile "${spec.id}" dimension weights must sum to 1, got ${total}`)
  }
}

/**
 * Combine per-dimension scores into a composite.
 *
 * - Dimensions with `score: null` (no data) are excluded and the remaining
 *   weights are renormalized, so missing data never drags the score itself.
 * - Instead it shows up in `coverage` (fraction of profile weight that had
 *   data) and in `confidence` (weighted dimension confidence × coverage).
 * - Scores for keys not in the profile are rejected — that's a wiring bug.
 *
 * @throws RangeError if the profile is invalid, a score key is unknown, or
 *   no dimension has data at all.
 */
export function composeRisk(spec: RiskProfileSpec, scores: DimensionScore[]): CompositeRisk {
  validateProfile(spec)

  const byKey = new Map<string, DimensionScore>()
  for (const score of scores) {
    if (!spec.dimensions.some((d) => d.key === score.key)) {
      throw new RangeError(`Score for unknown dimension "${score.key}" (profile "${spec.id}")`)
    }
    byKey.set(score.key, score)
  }

  const dimensions: CompositeDimension[] = []
  const warnings: string[] = []
  let scoredWeight = 0
  let weightedScore = 0
  let weightedConfidence = 0

  for (const dim of spec.dimensions) {
    const result = byKey.get(dim.key)
    const score = result?.score ?? null
    if (result === undefined || score === null) {
      warnings.push(`No data for dimension "${dim.label}" — excluded from composite`)
      dimensions.push({
        key: dim.key,
        label: dim.label,
        weight: dim.weight,
        score: null,
        band: null,
        confidence: 0,
        evidence: result?.evidence ?? [],
      })
      continue
    }
    const clamped = Math.min(100, Math.max(0, score))
    scoredWeight += dim.weight
    weightedScore += clamped * dim.weight
    weightedConfidence += Math.min(1, Math.max(0, result.confidence)) * dim.weight
    dimensions.push({
      key: dim.key,
      label: dim.label,
      weight: dim.weight,
      score: clamped,
      band: bandForScore(clamped),
      confidence: result.confidence,
      evidence: result.evidence,
    })
  }

  if (scoredWeight === 0) {
    throw new RangeError(`No dimension of profile "${spec.id}" had any data — cannot score`)
  }

  const composite = weightedScore / scoredWeight
  const coverage = scoredWeight
  const confidence = (weightedConfidence / scoredWeight) * coverage

  return {
    profileId: spec.id,
    profileVersion: spec.version,
    assetClass: spec.assetClass,
    score: Math.round(composite * 100) / 100,
    band: bandForScore(composite),
    confidence: Math.round(confidence * 1000) / 1000,
    coverage: Math.round(coverage * 1000) / 1000,
    dimensions,
    warnings,
  }
}
