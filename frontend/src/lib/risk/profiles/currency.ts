/**
 * Currency risk profile v1 — scores the macro module's FX pairs and the
 * dollar index on the canonical 0–100 higher-is-safer scale.
 *
 * Calibration anchors:
 * - Regime carries the most weight because it is what actually separates FX
 *   risk tiers: G10 majors float freely with deep central-bank credibility;
 *   crosses add a second policy regime (and the violent history of pairs
 *   like GBP/JPY); EM currencies carry devaluation, capital-control and
 *   convertibility risk that no volatility number shows until it happens —
 *   the risk is the gap, not the wiggle.
 * - Volatility anchors are FX-scale: 5% annualized is a calm major (a third
 *   of a calm equity), 15%+ is EM-stress territory. Reusing equity anchors
 *   here would score every currency "safe", which is exactly the
 *   overstated-specificity trap.
 * - The standing Portfolio Builder warning applies to the class as a whole
 *   and is carried as evidence: foreign cash has no long-run expected
 *   return — risk without compensation is a different proposition from
 *   equity risk, and the note travels with every score.
 */
import { composeRisk } from '../engine'
import { annualizedVolatility, piecewise, canonicalToRiskTier } from '../normalize'
import type { CompositeRisk, DimensionScore, RiskProfileSpec } from '../types'
import type { CurrencyCategoryId } from '@/lib/data/currencyCatalog'

export const CURRENCY_RISK_PROFILE: RiskProfileSpec = {
  id: 'currency',
  name: 'Currency Risk Profile',
  assetClass: 'forex',
  version: '1.0.0',
  dimensions: [
    {
      key: 'regime',
      label: 'Regime',
      description: 'Free-floating major, cross, EM, or diversified index',
      weight: 0.4,
    },
    {
      key: 'volatility',
      label: 'Volatility',
      description: 'Annualized volatility on FX-scale anchors',
      weight: 0.3,
    },
    {
      key: 'liquidity',
      label: 'Liquidity',
      description: 'Market depth — majors are the deepest market on earth',
      weight: 0.3,
    },
  ],
}

export interface CurrencyRiskInputs {
  category: CurrencyCategoryId
  /** Daily closes, oldest first — optional; without them volatility is unscored. */
  dailyCloses?: number[]
}

export function scoreCurrency(inputs: CurrencyRiskInputs): CompositeRisk {
  return composeRisk(CURRENCY_RISK_PROFILE, [
    scoreRegime(inputs),
    scoreVolatility(inputs),
    scoreLiquidity(inputs),
  ])
}

const REGIME_SCORES: Record<CurrencyCategoryId, number> = {
  index: 78,    // DXY — a diversified basket, but still a directional dollar bet
  major: 72,    // free float, credible central bank
  cross: 64,    // two non-USD regimes; GBP/JPY is "the Beast" for a reason
  emerging: 48, // devaluation / capital-control gap risk that vol doesn't show
}

const NO_RETURN_NOTE =
  'Foreign cash has no long-run expected return — risk here is uncompensated (see Portfolio Builder currency sleeve)'

function scoreRegime(inputs: CurrencyRiskInputs): DimensionScore {
  return {
    key: 'regime',
    score: REGIME_SCORES[inputs.category] ?? 60,
    confidence: 0.85,
    evidence: [
      { metric: 'category', value: inputs.category },
      { metric: 'expectedReturn', value: null, note: NO_RETURN_NOTE },
    ],
  }
}

function scoreVolatility(inputs: CurrencyRiskInputs): DimensionScore {
  const vol = inputs.dailyCloses ? annualizedVolatility(inputs.dailyCloses) : null
  if (vol === null) return { key: 'volatility', score: null, confidence: 0, evidence: [] }
  // FX-scale: 5% ann. vol is a calm major; 15%+ is EM stress.
  const score = piecewise(vol, [
    [0.05, 90],
    [0.08, 75],
    [0.12, 55],
    [0.2, 30],
    [0.35, 10],
  ])
  return {
    key: 'volatility',
    score,
    confidence: Math.min(1, inputs.dailyCloses!.length / 120),
    evidence: [{ metric: 'annualizedVolatility', value: Math.round(vol * 1e4) / 1e4 }],
  }
}

const LIQUIDITY_SCORES: Record<CurrencyCategoryId, number> = {
  major: 95,
  index: 88,
  cross: 78,
  emerging: 50,
}

function scoreLiquidity(inputs: CurrencyRiskInputs): DimensionScore {
  return {
    key: 'liquidity',
    score: LIQUIDITY_SCORES[inputs.category] ?? 60,
    confidence: 0.8,
    evidence: [{ metric: 'category', value: inputs.category }],
  }
}

/** Static class-level riskTier for the instruments layer — see commodity.ts. */
export function currencyInstrumentRiskTier(category: CurrencyCategoryId): number {
  return canonicalToRiskTier(scoreCurrency({ category }).score)
}
