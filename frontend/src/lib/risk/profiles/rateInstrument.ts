/**
 * Rate-instrument risk profile v1 — scores the macro module's bond/rate
 * instruments (CBOE yield indices, CBOT Treasury futures) on the canonical
 * 0–100 higher-is-safer scale.
 *
 * Duration is THE bond-risk primitive and carries half the weight: price
 * sensitivity scales almost linearly with maturity, which is why the
 * Portfolio Builder's ladder runs SHY → IEI → IEF → TLT and why the
 * duration-matched funds on /macro/rates are matched by maturity band. The
 * catalog now carries `maturityYears` explicitly so this profile and those
 * surfaces key on the same number.
 *
 * Structure distinguishes what the instrument IS: a yield index (^TNX) is an
 * observation — exposure to it comes via duration funds; a Treasury future
 * (ZN=F) is a margined, levered contract where the same curve move is
 * amplified. All current entries are US Treasury credit; the credit anchors
 * for corporate/high-yield are documented for when non-treasury entries land
 * (high-yield behaves like equity in a crisis — the Portfolio Builder's bond
 * styles already say so).
 */
import { composeRisk } from '../engine'
import { piecewise, canonicalToRiskTier } from '../normalize'
import type { CompositeRisk, DimensionScore, RiskProfileSpec } from '../types'

export const RATE_INSTRUMENT_RISK_PROFILE: RiskProfileSpec = {
  id: 'rate-instrument',
  name: 'Rate Instrument Risk Profile',
  assetClass: 'bonds',
  version: '1.0.0',
  dimensions: [
    {
      key: 'duration',
      label: 'Duration',
      description: 'Interest-rate sensitivity — scales with maturity',
      weight: 0.5,
    },
    {
      key: 'structure',
      label: 'Structure',
      description: 'Yield observation vs margined futures contract',
      weight: 0.3,
    },
    {
      key: 'credit',
      label: 'Credit',
      description: 'Issuer quality — treasury, municipal, investment grade, or high yield',
      weight: 0.2,
    },
  ],
}

export type RateInstrumentKind = 'yield-index' | 'future'
/**
 * `municipal` added 2026-08-19 (items 11/13). Munis are not investment-grade
 * corporates wearing a different name: general-obligation and essential-service
 * revenue bonds default far less often than similarly-rated corporates, and the
 * federal tax exemption is the reason to hold them at all. Scoring them as
 * 'investment-grade' would have understated their quality and left the catalog
 * unable to express the distinction.
 */
export type RateCreditQuality = 'treasury' | 'municipal' | 'investment-grade' | 'high-yield'

export interface RateInstrumentRiskInputs {
  maturityYears: number
  kind: RateInstrumentKind
  credit: RateCreditQuality
}

export function scoreRateInstrument(inputs: RateInstrumentRiskInputs): CompositeRisk {
  return composeRisk(RATE_INSTRUMENT_RISK_PROFILE, [
    scoreDuration(inputs),
    scoreStructure(inputs),
    scoreCredit(inputs),
  ])
}

function scoreDuration(inputs: RateInstrumentRiskInputs): DimensionScore {
  // A 13-week bill barely moves on a rate shock; the 30-year long bond had a
  // ~-40% drawdown 2020→2023 — genuine growth-asset-scale loss.
  const score = piecewise(inputs.maturityYears, [
    [0.25, 95],
    [2, 85],
    [5, 72],
    [10, 60],
    [30, 42],
  ])
  return {
    key: 'duration',
    score,
    confidence: 1,
    evidence: [{ metric: 'maturityYears', value: inputs.maturityYears }],
  }
}

function scoreStructure(inputs: RateInstrumentRiskInputs): DimensionScore {
  const future = inputs.kind === 'future'
  return {
    key: 'structure',
    score: future ? 45 : 80,
    confidence: 1,
    evidence: [{
      metric: 'kind',
      value: inputs.kind,
      note: future
        ? 'Margined CBOT contract — leverage amplifies the same curve move'
        : 'Yield observation — exposure comes via duration-matched funds',
    }],
  }
}

const CREDIT_SCORES: Record<RateCreditQuality, number> = {
  treasury: 95,
  // Below Treasuries (no federal backing, and a thinner secondary market) but
  // above corporates on historical default experience.
  municipal: 85,
  'investment-grade': 70,
  'high-yield': 40, // behaves like equity in a crisis
}

function scoreCredit(inputs: RateInstrumentRiskInputs): DimensionScore {
  return {
    key: 'credit',
    score: CREDIT_SCORES[inputs.credit],
    confidence: 1,
    evidence: [{ metric: 'credit', value: inputs.credit }],
  }
}

/** Static riskTier for the instruments layer — see commodity.ts for the why. */
export function rateInstrumentRiskTier(
  maturityYears: number,
  kind: RateInstrumentKind,
  credit: RateCreditQuality = 'treasury',
): number {
  return canonicalToRiskTier(scoreRateInstrument({ maturityYears, kind, credit }).score)
}
