import { describe, it, expect } from 'vitest'
import { validateProfile } from '../engine'
import { canonicalToRiskTier } from '../normalize'
import {
  COMMODITY_RISK_PROFILE, scoreCommodity, commodityInstrumentRiskTier,
} from '../profiles/commodity'
import {
  RATE_INSTRUMENT_RISK_PROFILE, scoreRateInstrument, rateInstrumentRiskTier,
} from '../profiles/rateInstrument'
import {
  CURRENCY_RISK_PROFILE, scoreCurrency, currencyInstrumentRiskTier,
} from '../profiles/currency'
import { INSTRUMENTS } from '@/lib/data/instruments'

// P2-R3 — the macro risk profiles. Direction assertions are the point: a
// hand-calibrated table's characteristic failure is entries that drift into
// incomparability, and a direction test is the cheapest guard against it.

/** Synthetic daily closes with a given daily step pattern, oldest first. */
function closes(steps: number[], start = 100): number[] {
  const out = [start]
  for (let i = 0; i < 130; i++) {
    out.push(out[out.length - 1] * (1 + steps[i % steps.length]))
  }
  return out
}
const CALM = closes([0.001, -0.001])
const WILD = closes([0.04, -0.038, 0.03, -0.05])

describe('profile specs', () => {
  it('are valid (weights sum to 1, keys unique)', () => {
    expect(() => validateProfile(COMMODITY_RISK_PROFILE)).not.toThrow()
    expect(() => validateProfile(RATE_INSTRUMENT_RISK_PROFILE)).not.toThrow()
    expect(() => validateProfile(CURRENCY_RISK_PROFILE)).not.toThrow()
  })
})

describe('canonicalToRiskTier', () => {
  it('maps the canonical scale onto 1–10 higher-is-riskier', () => {
    expect(canonicalToRiskTier(100)).toBe(1)
    expect(canonicalToRiskTier(0)).toBe(10)
    expect(canonicalToRiskTier(50)).toBe(6)
  })

  it('is monotonic — a safer score never yields a riskier tier', () => {
    let prev = canonicalToRiskTier(0)
    for (let s = 1; s <= 100; s++) {
      const tier = canonicalToRiskTier(s)
      expect(tier).toBeLessThanOrEqual(prev)
      prev = tier
    }
  })

  it('clamps out-of-range input', () => {
    expect(canonicalToRiskTier(150)).toBe(1)
    expect(canonicalToRiskTier(-20)).toBe(10)
  })
})

describe('commodity profile', () => {
  it('scores energy riskier than precious metals', () => {
    const gold = scoreCommodity({ category: 'precious-metals', thinlyTraded: false })
    const gas = scoreCommodity({ category: 'energy', thinlyTraded: false })
    expect(gas.score).toBeLessThan(gold.score)
  })

  it('scores a thin market riskier than a liquid one — heating oil vs gold', () => {
    const gold = scoreCommodity({ category: 'precious-metals', thinlyTraded: false })
    const heatingOil = scoreCommodity({ category: 'energy', thinlyTraded: true })
    expect(heatingOil.score).toBeLessThan(gas().score)
    expect(heatingOil.score).toBeLessThan(gold.score)
    function gas() { return scoreCommodity({ category: 'energy', thinlyTraded: false }) }
  })

  it('leaves volatility unscored without price history, and coverage says so', () => {
    const r = scoreCommodity({ category: 'agriculture', thinlyTraded: false })
    const vol = r.dimensions.find((d) => d.key === 'volatility')!
    expect(vol.score).toBeNull()
    expect(r.coverage).toBeCloseTo(0.65, 5)
    expect(r.warnings.some((w) => w.includes('Volatility'))).toBe(true)
  })

  it('scores calm history safer than wild history', () => {
    const calm = scoreCommodity({ category: 'agriculture', thinlyTraded: false, dailyCloses: CALM })
    const wild = scoreCommodity({ category: 'agriculture', thinlyTraded: false, dailyCloses: WILD })
    expect(calm.coverage).toBe(1)
    expect(wild.score).toBeLessThan(calm.score)
  })
})

describe('rate instrument profile', () => {
  it('scores duration monotonically — the 30Y is riskier than the 13-week bill', () => {
    const bill = scoreRateInstrument({ maturityYears: 0.25, kind: 'yield-index', credit: 'treasury' })
    const belly = scoreRateInstrument({ maturityYears: 5, kind: 'yield-index', credit: 'treasury' })
    const long = scoreRateInstrument({ maturityYears: 30, kind: 'yield-index', credit: 'treasury' })
    expect(bill.score).toBeGreaterThan(belly.score)
    expect(belly.score).toBeGreaterThan(long.score)
  })

  it('scores a margined future riskier than the same-maturity yield index', () => {
    const index = scoreRateInstrument({ maturityYears: 10, kind: 'yield-index', credit: 'treasury' })
    const future = scoreRateInstrument({ maturityYears: 10, kind: 'future', credit: 'treasury' })
    expect(future.score).toBeLessThan(index.score)
  })

  it('scores credit quality in order: treasury > investment grade > high yield', () => {
    const t = scoreRateInstrument({ maturityYears: 10, kind: 'yield-index', credit: 'treasury' })
    const ig = scoreRateInstrument({ maturityYears: 10, kind: 'yield-index', credit: 'investment-grade' })
    const hy = scoreRateInstrument({ maturityYears: 10, kind: 'yield-index', credit: 'high-yield' })
    expect(t.score).toBeGreaterThan(ig.score)
    expect(ig.score).toBeGreaterThan(hy.score)
  })

  it('has full coverage — every dimension scores from static facts', () => {
    const r = scoreRateInstrument({ maturityYears: 2, kind: 'future', credit: 'treasury' })
    expect(r.coverage).toBe(1)
  })
})

describe('currency profile', () => {
  it('scores regimes in order: index/major > cross > emerging', () => {
    const major = scoreCurrency({ category: 'major' })
    const cross = scoreCurrency({ category: 'cross' })
    const em = scoreCurrency({ category: 'emerging' })
    expect(major.score).toBeGreaterThan(cross.score)
    expect(cross.score).toBeGreaterThan(em.score)
  })

  it('carries the no-expected-return warning as evidence on every score', () => {
    const r = scoreCurrency({ category: 'major' })
    const regime = r.dimensions.find((d) => d.key === 'regime')!
    expect(regime.evidence.some((e) => e.note?.includes('no long-run expected return'))).toBe(true)
  })

  it('scores calm FX history safer than EM-stress history', () => {
    const calm = scoreCurrency({ category: 'major', dailyCloses: CALM })
    const wild = scoreCurrency({ category: 'major', dailyCloses: WILD })
    expect(wild.score).toBeLessThan(calm.score)
  })
})

describe('derived instrument riskTiers', () => {
  it('every macro instrument derives a tier in 1–10', () => {
    const macro = INSTRUMENTS.filter((i) => ['commodity', 'currency', 'rate'].includes(i.class))
    expect(macro.length).toBeGreaterThanOrEqual(45)
    for (const inst of macro) {
      expect(inst.riskTier).toBeGreaterThanOrEqual(1)
      expect(inst.riskTier).toBeLessThanOrEqual(10)
    }
  })

  it('tier direction survives derivation — thin > energy > gold, EM > major, 30Y future > bill', () => {
    expect(commodityInstrumentRiskTier('energy', true))
      .toBeGreaterThan(commodityInstrumentRiskTier('energy', false))
    expect(commodityInstrumentRiskTier('energy', false))
      .toBeGreaterThan(commodityInstrumentRiskTier('precious-metals', false))
    expect(currencyInstrumentRiskTier('emerging'))
      .toBeGreaterThan(currencyInstrumentRiskTier('major'))
    expect(rateInstrumentRiskTier(30, 'future'))
      .toBeGreaterThan(rateInstrumentRiskTier(0.25, 'yield-index'))
  })

  it('pins the headline derived values so drift is a visible decision', () => {
    // These replaced hand-set tiers (energy 6/others 5; EM 4/others 3; all
    // rates 2). If a calibration change moves them, this test makes that an
    // explicit diff, not a silent shift in every portfolio's weighted risk.
    expect(commodityInstrumentRiskTier('precious-metals', false)).toBe(4)
    expect(commodityInstrumentRiskTier('energy', false)).toBe(5)
    expect(commodityInstrumentRiskTier('livestock', true)).toBe(7)
    expect(currencyInstrumentRiskTier('major')).toBe(3)
    expect(currencyInstrumentRiskTier('emerging')).toBe(6)
    expect(rateInstrumentRiskTier(0.25, 'yield-index')).toBe(2)
    expect(rateInstrumentRiskTier(30, 'yield-index')).toBe(4)
    expect(rateInstrumentRiskTier(30, 'future')).toBe(5)
  })
})
