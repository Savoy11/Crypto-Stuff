/**
 * Options trade risk profile v1 — scores a single- or multi-leg options
 * position for the equities module's options helper. Research/education
 * output: it explains risk, it does not recommend trades.
 *
 * Calibration anchors follow common practitioner heuristics (open interest
 * >= 100 contracts and tight spreads for liquidity; IV-crush risk when long
 * premium into high IV rank or earnings; gamma/assignment pressure near
 * expiry). See docs/architecture/risk-framework.md.
 */
import { composeRisk } from '../engine'
import { piecewise } from '../normalize'
import type { CompositeRisk, DimensionScore, Evidence, RiskProfileSpec } from '../types'

export const OPTIONS_TRADE_RISK_PROFILE: RiskProfileSpec = {
  id: 'options-trade',
  name: 'Options Trade Risk Profile',
  assetClass: 'options',
  version: '1.0.0',
  dimensions: [
    {
      key: 'liquidity',
      label: 'Liquidity',
      description: 'Open interest, volume, and bid/ask spread of the worst leg',
      weight: 0.3,
    },
    {
      key: 'ivEnvironment',
      label: 'IV Environment',
      description: 'IV rank fit for the trade direction, plus earnings IV-crush exposure',
      weight: 0.2,
    },
    {
      key: 'assignment',
      label: 'Assignment',
      description: 'Early-assignment exposure of short legs (moneyness, dividends)',
      weight: 0.15,
    },
    {
      key: 'timeDecay',
      label: 'Time Decay',
      description: 'Theta exposure given days to expiry and net premium direction',
      weight: 0.15,
    },
    {
      key: 'definedRisk',
      label: 'Defined Risk',
      description: 'Whether maximum loss is bounded, and how it compares to maximum profit',
      weight: 0.2,
    },
  ],
}

export interface OptionLegInput {
  side: 'long' | 'short'
  type: 'call' | 'put'
  strike: number
  bid: number
  ask: number
  openInterest?: number
  volume?: number
  /** Signed delta per contract, e.g. -0.30 for an OTM short put. */
  delta?: number
}

export interface OptionsTradeInputs {
  underlyingPrice: number
  daysToExpiry: number
  legs: OptionLegInput[]
  /** IV rank 0–100 (where today's IV sits in its 52-week range). */
  ivRank?: number
  /** Days until the next earnings report, if within the trade horizon. */
  earningsInDays?: number
  /** Days until the underlying's ex-dividend date, if known. */
  exDividendInDays?: number
  /** Worst-case loss in USD, or 'unbounded' for naked short exposure. */
  maxLossUsd?: number | 'unbounded'
  maxProfitUsd?: number
}

export function scoreOptionsTrade(inputs: OptionsTradeInputs): CompositeRisk {
  if (inputs.legs.length === 0) {
    throw new RangeError('An options trade needs at least one leg')
  }
  return composeRisk(OPTIONS_TRADE_RISK_PROFILE, [
    scoreLiquidity(inputs),
    scoreIvEnvironment(inputs),
    scoreAssignment(inputs),
    scoreTimeDecay(inputs),
    scoreDefinedRisk(inputs),
  ])
}

/** True when the position collects net premium (credit trade). */
export function isNetShortPremium(legs: OptionLegInput[]): boolean {
  let net = 0
  for (const leg of legs) {
    const mid = (leg.bid + leg.ask) / 2
    net += leg.side === 'short' ? mid : -mid
  }
  return net > 0
}

function scoreLiquidity(inputs: OptionsTradeInputs): DimensionScore {
  const evidence: Evidence[] = []
  let worst = 100
  let sawAnyData = false
  let confidence = 0

  for (const [i, leg] of inputs.legs.entries()) {
    const label = `leg${i + 1}(${leg.side} ${leg.type} ${leg.strike})`
    const mid = (leg.bid + leg.ask) / 2
    const parts: number[] = []

    if (leg.openInterest !== undefined) {
      // Practitioner rule of thumb: >= 100 contracts of OI is tradeable.
      parts.push(piecewise(leg.openInterest, [
        [10, 12],
        [100, 60],
        [500, 82],
        [1000, 90],
        [5000, 97],
      ]))
      evidence.push({ metric: `${label}.openInterest`, value: leg.openInterest })
    }
    if (mid > 0) {
      const spreadPct = (leg.ask - leg.bid) / mid
      parts.push(piecewise(spreadPct, [
        [0.02, 95],
        [0.05, 82],
        [0.1, 60],
        [0.2, 32],
        [0.4, 10],
      ]))
      evidence.push({ metric: `${label}.spreadPct`, value: Math.round(spreadPct * 1000) / 10 })
    }
    if (leg.volume !== undefined) {
      evidence.push({ metric: `${label}.volume`, value: leg.volume })
    }
    if (parts.length > 0) {
      sawAnyData = true
      // A trade is only as liquid as its least liquid leg.
      worst = Math.min(worst, parts.reduce((a, b) => a + b, 0) / parts.length)
      confidence = Math.max(confidence, parts.length / 2)
    }
  }

  if (!sawAnyData) return noData('liquidity')
  return { key: 'liquidity', score: worst, confidence, evidence }
}

function scoreIvEnvironment(inputs: OptionsTradeInputs): DimensionScore {
  if (inputs.ivRank === undefined) return noData('ivEnvironment')
  const shortPremium = isNetShortPremium(inputs.legs)
  const evidence: Evidence[] = [
    { metric: 'ivRank', value: inputs.ivRank },
    { metric: 'netPremiumSide', value: shortPremium ? 'short' : 'long' },
  ]
  // Selling premium is better compensated when IV rank is high; buying
  // premium into a high IV rank risks IV crush.
  let score = shortPremium
    ? piecewise(inputs.ivRank, [
        [10, 45],
        [30, 65],
        [50, 80],
        [70, 90],
        [95, 85],
      ])
    : piecewise(inputs.ivRank, [
        [10, 85],
        [30, 75],
        [50, 60],
        [70, 40],
        [95, 25],
      ])
  let confidence = 0.9
  if (inputs.earningsInDays !== undefined && inputs.earningsInDays <= inputs.daysToExpiry) {
    score = Math.max(5, score - 18)
    evidence.push({
      metric: 'earningsInDays',
      value: inputs.earningsInDays,
      note: 'Earnings before expiry — elevated IV-crush / gap risk',
    })
    confidence = 1
  }
  return { key: 'ivEnvironment', score, confidence, evidence }
}

function scoreAssignment(inputs: OptionsTradeInputs): DimensionScore {
  const shortLegs = inputs.legs.filter((leg) => leg.side === 'short')
  if (shortLegs.length === 0) {
    return {
      key: 'assignment',
      score: 95,
      confidence: 1,
      evidence: [{ metric: 'shortLegs', value: 0, note: 'No short legs — no assignment risk' }],
    }
  }

  const evidence: Evidence[] = []
  let worst = 100
  for (const leg of shortLegs) {
    let legScore: number
    if (leg.delta !== undefined) {
      const absDelta = Math.abs(leg.delta)
      legScore = piecewise(absDelta, [
        [0.15, 92],
        [0.3, 78],
        [0.5, 55],
        [0.7, 32],
        [0.9, 12],
      ])
      evidence.push({ metric: `short ${leg.type} ${leg.strike}.absDelta`, value: absDelta })
    } else {
      // Fall back to moneyness: how far ITM is the short strike?
      const itmFraction =
        leg.type === 'call'
          ? (inputs.underlyingPrice - leg.strike) / inputs.underlyingPrice
          : (leg.strike - inputs.underlyingPrice) / inputs.underlyingPrice
      legScore = piecewise(itmFraction, [
        [-0.1, 90], // 10% OTM
        [0, 65], // at the money
        [0.05, 40],
        [0.15, 15],
      ])
      evidence.push({
        metric: `short ${leg.type} ${leg.strike}.itmFraction`,
        value: Math.round(itmFraction * 1000) / 1000,
      })
    }
    if (
      leg.type === 'call' &&
      inputs.exDividendInDays !== undefined &&
      inputs.exDividendInDays <= inputs.daysToExpiry
    ) {
      legScore = Math.max(5, legScore - 15)
      evidence.push({
        metric: 'exDividendInDays',
        value: inputs.exDividendInDays,
        note: 'Ex-dividend before expiry raises early-assignment risk on short calls',
      })
    }
    worst = Math.min(worst, legScore)
  }
  return { key: 'assignment', score: worst, confidence: 0.9, evidence }
}

function scoreTimeDecay(inputs: OptionsTradeInputs): DimensionScore {
  const shortPremium = isNetShortPremium(inputs.legs)
  const dte = inputs.daysToExpiry
  const evidence: Evidence[] = [
    { metric: 'daysToExpiry', value: dte },
    { metric: 'netPremiumSide', value: shortPremium ? 'short' : 'long' },
  ]
  // Long premium bleeds theta hardest in the last two weeks. Short premium
  // is paid for that decay but takes on gamma risk right before expiry.
  let score = shortPremium
    ? piecewise(dte, [
        [1, 55],
        [7, 72],
        [21, 85],
        [45, 80],
        [90, 70],
      ])
    : piecewise(dte, [
        [3, 15],
        [7, 30],
        [14, 50],
        [30, 70],
        [60, 85],
        [180, 92],
      ])
  if (!shortPremium) {
    // Deep-OTM long premium is near-certain to decay to zero: bounded loss,
    // but the most probable outcome is losing all of it.
    const longDeltas = inputs.legs
      .filter((leg) => leg.side === 'long' && leg.delta !== undefined)
      .map((leg) => Math.abs(leg.delta!))
    if (longDeltas.length > 0) {
      const maxAbsDelta = Math.max(...longDeltas)
      evidence.push({ metric: 'maxLongAbsDelta', value: maxAbsDelta })
      if (maxAbsDelta < 0.15) {
        score = Math.min(score, 10)
        evidence.push({
          metric: 'deepOtm',
          value: true,
          note: 'Deep OTM — premium most likely expires worthless',
        })
      }
    }
  }
  return { key: 'timeDecay', score, confidence: 1, evidence }
}

function scoreDefinedRisk(inputs: OptionsTradeInputs): DimensionScore {
  const evidence: Evidence[] = []
  if (inputs.maxLossUsd === 'unbounded') {
    return {
      key: 'definedRisk',
      score: 8,
      confidence: 1,
      evidence: [
        { metric: 'maxLoss', value: 'unbounded', note: 'Naked short exposure — loss is theoretically unlimited' },
      ],
    }
  }
  if (inputs.maxLossUsd === undefined) {
    // Every all-long position is inherently defined-risk (premium paid).
    if (inputs.legs.every((leg) => leg.side === 'long')) {
      return {
        key: 'definedRisk',
        score: 90,
        confidence: 0.9,
        evidence: [{ metric: 'maxLoss', value: 'net debit', note: 'Long-only: risk capped at premium paid' }],
      }
    }
    return noData('definedRisk')
  }

  evidence.push({ metric: 'maxLossUsd', value: inputs.maxLossUsd })
  let score = 85
  if (inputs.maxProfitUsd !== undefined && inputs.maxProfitUsd > 0) {
    const lossToProfit = inputs.maxLossUsd / inputs.maxProfitUsd
    evidence.push({ metric: 'lossToProfitRatio', value: Math.round(lossToProfit * 100) / 100 })
    // Risking $5 to make $1 (common in far-OTM credit spreads) is a
    // materially worse risk shape than an even payoff.
    score = piecewise(lossToProfit, [
      [0.5, 95],
      [1, 88],
      [3, 72],
      [6, 55],
      [12, 38],
    ])
  }
  return { key: 'definedRisk', score, confidence: 1, evidence }
}

function noData(key: string): DimensionScore {
  return { key, score: null, confidence: 0, evidence: [] }
}
