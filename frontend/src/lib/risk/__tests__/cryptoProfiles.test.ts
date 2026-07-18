import { describe, expect, it } from 'vitest'
import { composeRisk, validateProfile } from '../engine'
import {
  CRYPTO_ASSET_RISK_PROFILE,
  hourlyAnnualizedVolatility,
  scoreLiquidity,
  scoreScale,
  scoreTrend,
  scoreVolatility,
} from '../profiles/cryptoAsset'
import {
  applyFatalFlaws,
  scoreAdoption,
  scoreNewsSentiment,
  scorePeg,
  scoreReserve,
  scoreStructure,
  STABLECOIN_FATAL_FLAWS,
  STABLECOIN_RISK_PROFILE,
} from '../profiles/stablecoin'

// ---------------------------------------------------------------- profiles

describe('profile specs', () => {
  it('stablecoin and crypto-asset profiles validate (weights sum to 1)', () => {
    expect(() => validateProfile(STABLECOIN_RISK_PROFILE)).not.toThrow()
    expect(() => validateProfile(CRYPTO_ASSET_RISK_PROFILE)).not.toThrow()
  })
})

// ---------------------------------------------------------------- reserve

describe('scoreReserve', () => {
  it('scores a cash/Treasury reserve near the top', () => {
    const result = scoreReserve({
      composition: [{ category: 'Cash', percentage: 15 }, { category: 'US Treasuries', percentage: 85 }],
      collateralizationRatio: 1.0,
      pegMechanism: 'fiat-backed',
      attestationAgeDays: 1,
    })
    expect(result.score).toBeGreaterThan(90)
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('scores crypto-collateral mixes lower than cash but credits over-collateralization', () => {
    const dai = scoreReserve({
      composition: [
        { category: 'USDC Collateral', percentage: 32 },
        { category: 'ETH Collateral', percentage: 28 },
        { category: 'RWA (Treasuries)', percentage: 27 },
        { category: 'Other Crypto', percentage: 13 },
      ],
      collateralizationRatio: 1.5,
      pegMechanism: 'crypto-backed',
      attestationAgeDays: null,
    })
    const noBonus = scoreReserve({
      composition: [
        { category: 'USDC Collateral', percentage: 32 },
        { category: 'ETH Collateral', percentage: 28 },
        { category: 'RWA (Treasuries)', percentage: 27 },
        { category: 'Other Crypto', percentage: 13 },
      ],
      collateralizationRatio: 1.0,
      pegMechanism: 'crypto-backed',
      attestationAgeDays: null,
    })
    expect(dai.score).not.toBeNull()
    expect(dai.score!).toBeLessThan(95)
    expect(dai.score!).toBeGreaterThan(noBonus.score!)
  })

  it('discounts stale attestations', () => {
    const inputs = {
      composition: [{ category: 'US Treasuries', percentage: 100 }],
      collateralizationRatio: 1.0,
      pegMechanism: 'fiat-backed',
    }
    const fresh = scoreReserve({ ...inputs, attestationAgeDays: 10 })
    const stale = scoreReserve({ ...inputs, attestationAgeDays: 200 })
    expect(stale.score!).toBeLessThan(fresh.score!)
    expect(stale.score!).toBeCloseTo(fresh.score! * 0.6, 5)
  })

  it('scores algorithmic backing as near-zero and unknown mechanisms as null', () => {
    const algo = scoreReserve({ composition: [], collateralizationRatio: null, pegMechanism: 'algorithmic', attestationAgeDays: null })
    expect(algo.score).not.toBeNull()
    expect(algo.score!).toBeLessThan(20)
    const unknown = scoreReserve({ composition: [], collateralizationRatio: null, pegMechanism: 'unknown', attestationAgeDays: null })
    expect(unknown.score).toBeNull()
    expect(unknown.confidence).toBe(0)
  })
})

// ---------------------------------------------------------------- peg

describe('scorePeg', () => {
  const flatWeek = Array.from({ length: 168 }, () => 1.0)

  it('scores a clean $1.00 peg near 100', () => {
    const result = scorePeg({ price: 1.0002, history: flatWeek })
    expect(result.score!).toBeGreaterThan(95)
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('punishes an active depeg hard', () => {
    const result = scorePeg({ price: 0.97, history: flatWeek })
    expect(result.score!).toBeLessThan(75)
  })

  it('includes the worst 7d excursion, not just the spot price', () => {
    const crashWeek = [...flatWeek.slice(0, 100), 0.94, 0.95, ...flatWeek.slice(102)]
    const calm = scorePeg({ price: 1.0, history: flatWeek })
    const scarred = scorePeg({ price: 1.0, history: crashWeek })
    expect(scarred.score!).toBeLessThan(calm.score!)
  })

  it('falls back to spot-only at reduced confidence with thin history', () => {
    const result = scorePeg({ price: 1.0, history: [1, 1, 1] })
    expect(result.score).not.toBeNull()
    expect(result.confidence).toBeLessThan(0.6)
  })

  it('returns null with no price', () => {
    expect(scorePeg({ price: null, history: flatWeek }).score).toBeNull()
  })
})

// ---------------------------------------------------------------- structure / adoption / news

describe('scoreStructure', () => {
  it('ranks regulated fiat > unregulated fiat > crypto > algorithmic', () => {
    const regulated = scoreStructure({ pegMechanism: 'fiat-backed', regulatedIssuer: true, incidentPenalty: 0 })
    const fiat = scoreStructure({ pegMechanism: 'fiat-backed', regulatedIssuer: false, incidentPenalty: 0 })
    const crypto = scoreStructure({ pegMechanism: 'crypto-backed', regulatedIssuer: false, incidentPenalty: 0 })
    const algo = scoreStructure({ pegMechanism: 'algorithmic', regulatedIssuer: false, incidentPenalty: 0 })
    expect(regulated.score!).toBeGreaterThan(fiat.score!)
    expect(fiat.score!).toBeGreaterThan(crypto.score!)
    expect(crypto.score!).toBeGreaterThan(algo.score!)
  })

  it('applies incident penalties and returns null for unknown mechanisms', () => {
    const clean = scoreStructure({ pegMechanism: 'fiat-backed', regulatedIssuer: false, incidentPenalty: 0 })
    const scarred = scoreStructure({ pegMechanism: 'fiat-backed', regulatedIssuer: false, incidentPenalty: 15 })
    expect(clean.score! - scarred.score!).toBe(15)
    expect(scoreStructure({ pegMechanism: 'mystery', regulatedIssuer: false, incidentPenalty: 0 }).score).toBeNull()
  })
})

describe('scoreAdoption', () => {
  it('scores USDT-scale supply near the top and micro-caps low', () => {
    expect(scoreAdoption({ circulatingUsd: 1.2e11, chainCount: 60 }).score!).toBeGreaterThan(90)
    expect(scoreAdoption({ circulatingUsd: 5e7, chainCount: 1 }).score!).toBeLessThanOrEqual(20)
    expect(scoreAdoption({ circulatingUsd: null, chainCount: 0 }).score).toBeNull()
  })
})

describe('scoreNewsSentiment', () => {
  it('needs at least 3 tagged articles', () => {
    expect(scoreNewsSentiment({ positive: 2, negative: 0, total: 2 }).score).toBeNull()
  })
  it('maps net sentiment onto 0–100 around a neutral 50', () => {
    expect(scoreNewsSentiment({ positive: 5, negative: 5, total: 12 }).score!).toBe(50)
    expect(scoreNewsSentiment({ positive: 8, negative: 0, total: 8 }).score!).toBe(100)
    expect(scoreNewsSentiment({ positive: 0, negative: 10, total: 10 }).score!).toBe(0)
  })
})

// ---------------------------------------------------------------- fatal flaws

describe('applyFatalFlaws', () => {
  const scoresFor = (reserve: number) => [
    { key: 'reserve', score: reserve, confidence: 0.6, evidence: [] },
    { key: 'peg', score: 95, confidence: 0.8, evidence: [] },
    { key: 'structure', score: 80, confidence: 0.7, evidence: [] },
    { key: 'adoption', score: 90, confidence: 0.9, evidence: [] },
    { key: 'news', score: 90, confidence: 0.8, evidence: [] },
  ]

  it('slashes a dead reserve multiplicatively — sentiment cannot rescue it', () => {
    const composite = composeRisk(STABLECOIN_RISK_PROFILE, scoresFor(10))
    const result = applyFatalFlaws(composite, STABLECOIN_FATAL_FLAWS)
    expect(result.baseScore).toBeGreaterThan(60) // weighted average alone looks fine…
    expect(result.score).toBeCloseTo(result.baseScore * 0.3, 1) // …the override does not
    expect(result.band).toBe('critical') // 65×0.3 ≈ 20 — slashed into the bottom band
    expect(result.slashed).toHaveLength(1)
  })

  it('leaves healthy composites untouched', () => {
    const composite = composeRisk(STABLECOIN_RISK_PROFILE, scoresFor(95))
    const result = applyFatalFlaws(composite, STABLECOIN_FATAL_FLAWS)
    expect(result.score).toBe(result.baseScore)
    expect(result.slashed).toHaveLength(0)
  })

  it('ignores rules for null-scored dimensions (no data ≠ critical)', () => {
    const composite = composeRisk(STABLECOIN_RISK_PROFILE, [
      { key: 'reserve', score: null, confidence: 0, evidence: [] },
      ...scoresFor(0).slice(1),
    ])
    const result = applyFatalFlaws(composite, STABLECOIN_FATAL_FLAWS)
    expect(result.slashed).toHaveLength(0)
  })
})

// ---------------------------------------------------------------- major assets

describe('crypto-asset scorers', () => {
  it('computes near-zero volatility for a flat series and scores it safe', () => {
    const flat = Array.from({ length: 168 }, () => 100)
    expect(hourlyAnnualizedVolatility(flat)).toBeCloseTo(0, 5)
    expect(scoreVolatility(flat).score!).toBe(90)
  })

  it('scores a violent series as risky and thin series as null', () => {
    const wild = Array.from({ length: 168 }, (_, i) => 100 * (1 + 0.05 * Math.sin(i)))
    expect(scoreVolatility(wild).score!).toBeLessThan(40)
    expect(scoreVolatility([100, 101]).score).toBeNull()
  })

  it('caps liquidity for thin absolute volume regardless of ratio', () => {
    const thin = scoreLiquidity(5e6, 5e7) // 10% ratio but only $5M volume
    expect(thin.score!).toBeLessThanOrEqual(30)
    const deep = scoreLiquidity(3e10, 2e12)
    expect(deep.score!).toBeGreaterThan(40)
  })

  it('scores scale and trend on their calibration curves', () => {
    expect(scoreScale(1e12).score!).toBe(95)
    expect(scoreScale(5e8).score!).toBe(25)
    expect(scoreScale(null).score).toBeNull()
    expect(scoreTrend(0).score!).toBe(70)
    expect(scoreTrend(-50).score!).toBe(15)
    expect(scoreTrend(null).score).toBeNull()
  })

  it('composes a BTC-like asset into the low-risk band', () => {
    const calm = Array.from({ length: 168 }, (_, i) => 60_000 * (1 + 0.002 * Math.sin(i / 6)))
    const composite = composeRisk(CRYPTO_ASSET_RISK_PROFILE, [
      scoreVolatility(calm),
      scoreLiquidity(4e10, 1.2e12),
      scoreScale(1.2e12),
      scoreTrend(3),
      scoreNewsSentiment({ positive: 6, negative: 2, total: 10 }),
    ])
    expect(composite.score).toBeGreaterThan(75)
    expect(composite.coverage).toBe(1)
  })
})
