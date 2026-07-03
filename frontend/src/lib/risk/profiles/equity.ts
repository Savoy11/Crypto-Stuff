/**
 * Equity risk profile v1 — scores a single stock or ETF from market data
 * available on FMP-class providers. Calibration points are v1 heuristics,
 * documented in docs/architecture/risk-framework.md; tune with real data.
 */
import { composeRisk } from '../engine'
import { annualizedVolatility, maxDrawdown, piecewise } from '../normalize'
import type { CompositeRisk, DimensionScore, Evidence, RiskProfileSpec } from '../types'

export const EQUITY_RISK_PROFILE: RiskProfileSpec = {
  id: 'equity',
  name: 'Equity Risk Profile',
  assetClass: 'equities',
  version: '1.0.0',
  dimensions: [
    {
      key: 'volatility',
      label: 'Volatility',
      description: 'Annualized volatility of daily returns; beta as supporting evidence',
      weight: 0.25,
    },
    {
      key: 'drawdown',
      label: 'Drawdown',
      description: 'Maximum peak-to-trough loss over the supplied price history',
      weight: 0.2,
    },
    {
      key: 'liquidity',
      label: 'Liquidity',
      description: 'Average daily dollar volume and bid/ask spread',
      weight: 0.2,
    },
    {
      key: 'size',
      label: 'Size',
      description: 'Market capitalization tier',
      weight: 0.15,
    },
    {
      key: 'fundamentals',
      label: 'Fundamentals',
      description: 'Balance-sheet leverage and profitability',
      weight: 0.2,
    },
  ],
}

export interface EquityRiskInputs {
  /** Daily closes, oldest first. >= 10 points to score volatility/drawdown. */
  dailyCloses?: number[]
  beta?: number
  /** Average daily traded value in USD. */
  avgDollarVolume?: number
  /** Bid/ask spread in basis points of mid. */
  spreadBps?: number
  marketCap?: number
  debtToEquity?: number
  /** Trailing net profit margin as a fraction (0.12 = 12%). */
  netMargin?: number
}

export function scoreEquity(inputs: EquityRiskInputs): CompositeRisk {
  return composeRisk(EQUITY_RISK_PROFILE, [
    scoreVolatility(inputs),
    scoreDrawdown(inputs),
    scoreLiquidity(inputs),
    scoreSize(inputs),
    scoreFundamentals(inputs),
  ])
}

function scoreVolatility(inputs: EquityRiskInputs): DimensionScore {
  const vol = inputs.dailyCloses ? annualizedVolatility(inputs.dailyCloses) : null
  if (vol === null) return noData('volatility')
  const evidence: Evidence[] = [
    { metric: 'annualizedVolatility', value: round(vol, 4) },
  ]
  // ~15% ann. vol is a calm large cap; >80% is speculative territory.
  let score = piecewise(vol, [
    [0.15, 95],
    [0.25, 78],
    [0.4, 58],
    [0.6, 38],
    [0.8, 22],
    [1.2, 8],
  ])
  let confidence = Math.min(1, inputs.dailyCloses!.length / 60)
  if (inputs.beta !== undefined) {
    evidence.push({ metric: 'beta', value: inputs.beta })
    confidence = Math.min(1, confidence + 0.1)
  }
  return { key: 'volatility', score, confidence, evidence }
}

function scoreDrawdown(inputs: EquityRiskInputs): DimensionScore {
  const dd = inputs.dailyCloses ? maxDrawdown(inputs.dailyCloses) : null
  if (dd === null) return noData('drawdown')
  const score = piecewise(dd, [
    [0.1, 90],
    [0.2, 75],
    [0.35, 55],
    [0.5, 35],
    [0.7, 15],
  ])
  return {
    key: 'drawdown',
    score,
    confidence: Math.min(1, inputs.dailyCloses!.length / 120),
    evidence: [{ metric: 'maxDrawdown', value: round(dd, 4) }],
  }
}

function scoreLiquidity(inputs: EquityRiskInputs): DimensionScore {
  if (inputs.avgDollarVolume === undefined) return noData('liquidity')
  const evidence: Evidence[] = [
    { metric: 'avgDollarVolume', value: inputs.avgDollarVolume },
  ]
  let score = piecewise(inputs.avgDollarVolume, [
    [100_000, 10],
    [1_000_000, 45],
    [10_000_000, 75],
    [50_000_000, 90],
    [500_000_000, 98],
  ])
  let confidence = 0.8
  if (inputs.spreadBps !== undefined) {
    evidence.push({ metric: 'spreadBps', value: inputs.spreadBps })
    // Wide spreads cap the liquidity score regardless of volume.
    const spreadScore = piecewise(inputs.spreadBps, [
      [5, 98],
      [20, 85],
      [50, 60],
      [150, 30],
      [400, 10],
    ])
    score = Math.min(score, (score + spreadScore) / 2)
    confidence = 1
  }
  return { key: 'liquidity', score, confidence, evidence }
}

function scoreSize(inputs: EquityRiskInputs): DimensionScore {
  if (inputs.marketCap === undefined) return noData('size')
  const score = piecewise(inputs.marketCap, [
    [50_000_000, 10], // nano cap
    [300_000_000, 40], // micro cap
    [2_000_000_000, 65], // small cap
    [10_000_000_000, 82], // mid cap
    [200_000_000_000, 95], // mega cap
  ])
  return {
    key: 'size',
    score,
    confidence: 1,
    evidence: [{ metric: 'marketCap', value: inputs.marketCap }],
  }
}

function scoreFundamentals(inputs: EquityRiskInputs): DimensionScore {
  if (inputs.debtToEquity === undefined && inputs.netMargin === undefined) {
    return noData('fundamentals')
  }
  const evidence: Evidence[] = []
  const parts: number[] = []
  if (inputs.debtToEquity !== undefined) {
    evidence.push({ metric: 'debtToEquity', value: inputs.debtToEquity })
    parts.push(
      piecewise(inputs.debtToEquity, [
        [0.25, 92],
        [0.75, 80],
        [1.5, 60],
        [3, 35],
        [6, 12],
      ]),
    )
  }
  if (inputs.netMargin !== undefined) {
    evidence.push({ metric: 'netMargin', value: inputs.netMargin })
    parts.push(
      piecewise(inputs.netMargin, [
        [-0.3, 10],
        [-0.05, 35],
        [0.02, 60],
        [0.1, 80],
        [0.25, 95],
      ]),
    )
  }
  return {
    key: 'fundamentals',
    score: parts.reduce((a, b) => a + b, 0) / parts.length,
    confidence: parts.length / 2,
    evidence,
  }
}

function noData(key: string): DimensionScore {
  return { key, score: null, confidence: 0, evidence: [] }
}

function round(n: number, places: number): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}
