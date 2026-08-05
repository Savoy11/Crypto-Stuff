/**
 * Commodity risk profile v1 — scores a commodity futures market (the macro
 * module's front-month contracts) on the canonical 0–100 higher-is-safer
 * scale.
 *
 * Calibration anchors (documented like optionsTrade.ts so the numbers are
 * arguable rather than mysterious):
 * - Category character reflects how each market has actually behaved:
 *   precious metals are the diversifier class but still see 30% drawdowns
 *   (the reason `portfolioBuilder.ts` counts commodities in GROWTH_CLASSES);
 *   energy is the wild end — NYMEX natural gas is nicknamed the widow-maker;
 *   agriculture sits between, weather-driven with hard limit-move days.
 * - Liquidity anchors on the thin-market set the catalog already maintains
 *   (`THINLY_TRADED_COMMODITIES` — the six contracts whose single-commodity
 *   ETFs were delisted). Same knowledge the macro TA scanner keys on; one
 *   source of truth, two consumers.
 * - Volatility, when price history is supplied, uses wider anchors than the
 *   equity profile: 15% annualized is calm for a stock but ordinary for a
 *   commodity, and 60%+ (nat gas territory) is routine rather than
 *   speculative-fringe.
 */
import { composeRisk } from '../engine'
import { annualizedVolatility, maxDrawdown, piecewise, canonicalToRiskTier } from '../normalize'
import type { CompositeRisk, DimensionScore, RiskProfileSpec } from '../types'
import type { CommodityCategoryId } from '@/lib/data/commodityCatalog'

export const COMMODITY_RISK_PROFILE: RiskProfileSpec = {
  id: 'commodity',
  name: 'Commodity Risk Profile',
  assetClass: 'commodities',
  version: '1.0.0',
  dimensions: [
    {
      key: 'volatility',
      label: 'Volatility',
      description: 'Annualized volatility and worst drawdown of the supplied price history',
      weight: 0.35,
    },
    {
      key: 'category',
      label: 'Market Character',
      description: 'How this commodity class behaves — demand drivers, squeeze history, limit moves',
      weight: 0.35,
    },
    {
      key: 'liquidity',
      label: 'Liquidity',
      description: 'Front-month depth; thin contracts gap and slip',
      weight: 0.3,
    },
  ],
}

export interface CommodityRiskInputs {
  category: CommodityCategoryId
  /** In the catalog's thin-market set (delisted-ETF contracts). */
  thinlyTraded: boolean
  /** Daily closes, oldest first — optional; without them volatility is unscored. */
  dailyCloses?: number[]
}

export function scoreCommodity(inputs: CommodityRiskInputs): CompositeRisk {
  return composeRisk(COMMODITY_RISK_PROFILE, [
    scoreVolatility(inputs),
    scoreCategory(inputs),
    scoreLiquidity(inputs),
  ])
}

function scoreVolatility(inputs: CommodityRiskInputs): DimensionScore {
  const vol = inputs.dailyCloses ? annualizedVolatility(inputs.dailyCloses) : null
  if (vol === null) return { key: 'volatility', score: null, confidence: 0, evidence: [] }
  // Commodity-calibrated: 12% ann. vol is a quiet metal, 60%+ is nat-gas-like.
  let score = piecewise(vol, [
    [0.12, 88],
    [0.2, 72],
    [0.35, 52],
    [0.6, 30],
    [1.0, 10],
  ])
  const evidence = [{ metric: 'annualizedVolatility', value: Math.round(vol * 1e4) / 1e4 }]
  const dd = maxDrawdown(inputs.dailyCloses!)
  if (dd !== null) {
    evidence.push({ metric: 'maxDrawdown', value: Math.round(dd * 1e4) / 1e4 })
    // A deep drawdown caps what volatility alone would score.
    score = Math.min(score, piecewise(dd, [
      [0.15, 90],
      [0.3, 65],
      [0.5, 40],
      [0.7, 18],
    ]))
  }
  return {
    key: 'volatility',
    score,
    confidence: Math.min(1, inputs.dailyCloses!.length / 120),
    evidence,
  }
}

// Class-level character. Precious metals ≠ safe — gold is a diversifier with
// 30% drawdown history — but energy's squeeze-and-collapse record (negative
// WTI, 2020; nat gas ±50% quarters) earns the bottom slot.
const CATEGORY_SCORES: Record<CommodityCategoryId, number> = {
  'precious-metals': 58,
  'industrial-metals': 50,
  'agriculture': 46,
  'livestock': 44, // disease/weather shocks; both catalog entries are also thin
  'energy': 36,
}

function scoreCategory(inputs: CommodityRiskInputs): DimensionScore {
  const score = CATEGORY_SCORES[inputs.category] ?? 46
  return {
    key: 'category',
    score,
    confidence: 0.8, // class-level heuristic, not instrument-measured
    evidence: [{ metric: 'category', value: inputs.category }],
  }
}

function scoreLiquidity(inputs: CommodityRiskInputs): DimensionScore {
  return {
    key: 'liquidity',
    score: inputs.thinlyTraded ? 32 : 85,
    confidence: 0.8,
    evidence: [{
      metric: 'thinlyTraded',
      value: inputs.thinlyTraded,
      note: inputs.thinlyTraded
        ? 'In the catalog thin-market set — the macro TA scanner excludes it for the same reason'
        : 'Liquid front-month contract',
    }],
  }
}

/**
 * Static class-level riskTier for the instruments layer (1–10 higher-is-
 * riskier), derived from this profile on catalog facts alone — no price
 * history, so volatility is unscored and coverage/confidence reflect that.
 * `instruments.ts` calls this instead of hardcoding tiers, so the tier and
 * the profile can never disagree.
 */
export function commodityInstrumentRiskTier(
  category: CommodityCategoryId,
  thinlyTraded: boolean,
): number {
  return canonicalToRiskTier(scoreCommodity({ category, thinlyTraded }).score)
}
