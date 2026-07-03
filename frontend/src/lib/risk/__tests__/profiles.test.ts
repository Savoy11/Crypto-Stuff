import { describe, expect, it } from 'vitest'
import { computeOverallRisk, type RiskProfile } from '../../data/stakingProviders'
import { scoreEquity } from '../profiles/equity'
import {
  isNetShortPremium,
  scoreOptionsTrade,
  type OptionsTradeInputs,
} from '../profiles/optionsTrade'
import { scoreStakingProvider } from '../profiles/stakingAdapter'

// ---------------------------------------------------------------- equities

describe('scoreEquity', () => {
  const megaCap = {
    dailyCloses: Array.from({ length: 120 }, (_, i) => 200 + Math.sin(i / 5) * 4),
    beta: 1.05,
    avgDollarVolume: 9_000_000_000,
    spreadBps: 2,
    marketCap: 3_400_000_000_000,
    debtToEquity: 0.4,
    netMargin: 0.25,
  }

  const speculativeMicroCap = {
    // Violent swings and an 60%+ drawdown baked into the series
    dailyCloses: Array.from({ length: 120 }, (_, i) => 10 + Math.sin(i / 3) * 6 + (i > 60 ? -4 : 0)),
    avgDollarVolume: 250_000,
    spreadBps: 220,
    marketCap: 45_000_000,
    debtToEquity: 4.2,
    netMargin: -0.4,
  }

  it('scores a liquid mega cap as much safer than a speculative micro cap', () => {
    const safe = scoreEquity(megaCap)
    const risky = scoreEquity(speculativeMicroCap)
    expect(safe.score).toBeGreaterThan(risky.score + 25)
    expect(safe.band === 'low' || safe.band === 'moderate').toBe(true)
    expect(risky.band === 'high' || risky.band === 'critical').toBe(true)
  })

  it('scores with partial data at reduced coverage, not a distorted score', () => {
    const partial = scoreEquity({ marketCap: 3_400_000_000_000 })
    expect(partial.coverage).toBeCloseTo(0.15, 5)
    expect(partial.warnings.length).toBe(4)
    expect(partial.dimensions.find((d) => d.key === 'size')?.score).toBeGreaterThan(90)
  })

  it('throws when there is no data at all', () => {
    expect(() => scoreEquity({})).toThrow(/cannot score/)
  })

  it('penalizes wide spreads even with high volume', () => {
    const tight = scoreEquity({ avgDollarVolume: 100_000_000, spreadBps: 3 })
    const wide = scoreEquity({ avgDollarVolume: 100_000_000, spreadBps: 300 })
    const tightLiq = tight.dimensions.find((d) => d.key === 'liquidity')!.score!
    const wideLiq = wide.dimensions.find((d) => d.key === 'liquidity')!.score!
    expect(tightLiq).toBeGreaterThan(wideLiq + 15)
  })
})

// ----------------------------------------------------------------- options

describe('scoreOptionsTrade', () => {
  const liquidCoveredCallish: OptionsTradeInputs = {
    underlyingPrice: 100,
    daysToExpiry: 30,
    ivRank: 55,
    legs: [
      {
        side: 'short',
        type: 'call',
        strike: 110,
        bid: 1.2,
        ask: 1.25,
        openInterest: 4200,
        volume: 900,
        delta: 0.22,
      },
    ],
    maxLossUsd: 500,
    maxProfitUsd: 125,
  }

  const illiquidLongLotto: OptionsTradeInputs = {
    underlyingPrice: 100,
    daysToExpiry: 4,
    ivRank: 92,
    earningsInDays: 2,
    legs: [
      {
        side: 'long',
        type: 'call',
        strike: 130,
        bid: 0.05,
        ask: 0.25,
        openInterest: 12,
        volume: 3,
        delta: 0.04,
      },
    ],
  }

  it('scores a liquid OTM short call far safer than an illiquid earnings lotto ticket', () => {
    const safe = scoreOptionsTrade(liquidCoveredCallish)
    const risky = scoreOptionsTrade(illiquidLongLotto)
    expect(safe.score).toBeGreaterThan(risky.score + 30)
    expect(risky.band === 'high' || risky.band === 'critical').toBe(true)
  })

  it('flags unbounded loss as the dominant defined-risk factor', () => {
    const naked = scoreOptionsTrade({
      ...liquidCoveredCallish,
      maxLossUsd: 'unbounded',
      maxProfitUsd: undefined,
    })
    const definedRisk = naked.dimensions.find((d) => d.key === 'definedRisk')!
    expect(definedRisk.score).toBeLessThan(15)
  })

  it('treats long-only positions as inherently defined-risk', () => {
    const result = scoreOptionsTrade(illiquidLongLotto)
    const definedRisk = result.dimensions.find((d) => d.key === 'definedRisk')!
    expect(definedRisk.score).toBeGreaterThanOrEqual(85)
  })

  it('penalizes earnings within the trade horizon', () => {
    const withEarnings = scoreOptionsTrade(illiquidLongLotto)
    const without = scoreOptionsTrade({ ...illiquidLongLotto, earningsInDays: undefined })
    const ivWith = withEarnings.dimensions.find((d) => d.key === 'ivEnvironment')!.score!
    const ivWithout = without.dimensions.find((d) => d.key === 'ivEnvironment')!.score!
    expect(ivWith).toBeLessThan(ivWithout)
  })

  it('gives no-short-leg trades a clean assignment score', () => {
    const result = scoreOptionsTrade(illiquidLongLotto)
    const assignment = result.dimensions.find((d) => d.key === 'assignment')!
    expect(assignment.score).toBe(95)
  })

  it('scores deep-ITM short legs as high assignment risk', () => {
    const deepItmShortPut = scoreOptionsTrade({
      underlyingPrice: 100,
      daysToExpiry: 20,
      legs: [
        { side: 'short', type: 'put', strike: 130, bid: 29.8, ask: 30.4, openInterest: 800, delta: -0.93 },
      ],
    })
    const assignment = deepItmShortPut.dimensions.find((d) => d.key === 'assignment')!
    expect(assignment.score).toBeLessThan(25)
  })

  it('classifies net premium direction from leg mids', () => {
    expect(isNetShortPremium(liquidCoveredCallish.legs)).toBe(true)
    expect(isNetShortPremium(illiquidLongLotto.legs)).toBe(false)
  })

  it('rejects a trade with no legs', () => {
    expect(() => scoreOptionsTrade({ underlyingPrice: 100, daysToExpiry: 30, legs: [] })).toThrow()
  })
})

// ----------------------------------------------------------------- staking

describe('scoreStakingProvider', () => {
  const lidoLike: RiskProfile = {
    custodyRisk: 3,
    counterpartyRisk: 3,
    contractRisk: 4,
    slashingRisk: 3,
    liquidityRisk: 2,
    regulatoryRisk: 4,
  }

  const celsiusLike: RiskProfile = {
    custodyRisk: 10,
    counterpartyRisk: 10,
    contractRisk: 7,
    slashingRisk: 5,
    liquidityRisk: 10,
    regulatoryRisk: 10,
  }

  it('preserves the ordering of the legacy computeOverallRisk()', () => {
    // Legacy: higher = riskier. Unified: higher = safer. Order must invert.
    expect(computeOverallRisk(lidoLike)).toBeLessThan(computeOverallRisk(celsiusLike))
    const unifiedLido = scoreStakingProvider(lidoLike)
    const unifiedCelsius = scoreStakingProvider(celsiusLike)
    expect(unifiedLido.score).toBeGreaterThan(unifiedCelsius.score)
  })

  it('maps the exact legacy weighting onto the unified scale', () => {
    // safety = (10 - legacyComposite) / 9 * 100 because the adapter reuses
    // the same weights and the conversion is linear.
    const legacy = computeOverallRisk(lidoLike)
    const unified = scoreStakingProvider(lidoLike)
    expect(unified.score).toBeCloseTo(((10 - legacy) / 9) * 100, 1)
  })

  it('produces full coverage and confidence for curated profiles', () => {
    const result = scoreStakingProvider(lidoLike)
    expect(result.coverage).toBe(1)
    expect(result.confidence).toBe(1)
    expect(result.dimensions).toHaveLength(6)
  })

  it('puts a Celsius-like provider in the critical band', () => {
    expect(scoreStakingProvider(celsiusLike).band).toBe('critical')
  })
})
