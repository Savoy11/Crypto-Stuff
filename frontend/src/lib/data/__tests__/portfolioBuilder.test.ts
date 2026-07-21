import { describe, expect, it } from 'vitest'
import {
  ASSET_CLASS_INFO, bondLadder, buildPortfolio, checkDrift, consolidateLadder, MIN_RUNG_PCT,
  reviewPlan, actualWeightsFromPortfolio,
  type BuilderInputs, type BuiltPortfolio, type SavedPlan,
} from '../portfolioBuilder'
import type { Portfolio } from '../portfolioUtils'
import { FUND_CATALOG } from '../fundCatalog'
import type { SectorId } from '../equityCatalog'

const base: BuilderInputs = {
  riskTolerance: 5,
  yearsToRetirement: 25,
  yearsToFirstUse: 25,
  sectorFocus: [],
  sectorExclude: [],
  cryptoComfort: 'none',
  amount: 100_000,
}
const build = (over: Partial<BuilderInputs> = {}) => buildPortfolio({ ...base, ...over })

/** Every combination worth sweeping for the invariants that must never break. */
const SWEEP: BuilderInputs[] = []
for (const riskTolerance of [1, 3, 5, 8, 10]) {
  for (const yearsToFirstUse of [0, 1, 2, 4, 6, 10, 20, 40]) {
    for (const cryptoComfort of ['none', 'small', 'moderate'] as const) {
      SWEEP.push({ ...base, riskTolerance, yearsToFirstUse, cryptoComfort })
    }
  }
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)
const weightOf = (p: BuiltPortfolio, symbol: string) =>
  p.holdings.find((h) => h.symbol === symbol)?.weightPct ?? 0

describe('buildPortfolio invariants', () => {
  it('always allocates exactly 100% across holdings', () => {
    for (const inputs of SWEEP) {
      const total = sum(build(inputs).holdings.map((h) => h.weightPct))
      expect(Math.abs(total - 100), `risk ${inputs.riskTolerance} / ${inputs.yearsToFirstUse}y / ${inputs.cryptoComfort}`).toBeLessThan(0.05)
    }
  })

  it('reports an asset-class mix that also sums to 100', () => {
    for (const inputs of SWEEP) {
      const total = sum(build(inputs).classMix.map((c) => c.pct))
      expect(Math.abs(total - 100)).toBeLessThan(0.05)
    }
  })

  it('never emits the same symbol twice — merged sleeves collapse into one row', () => {
    for (const inputs of SWEEP) {
      const symbols = build(inputs).holdings.map((h) => h.symbol)
      expect(new Set(symbols).size).toBe(symbols.length)
    }
  })

  it('only maps to instruments that exist in the fund catalog', () => {
    const known = new Set(FUND_CATALOG.map((f) => f.symbol))
    for (const inputs of SWEEP) {
      for (const h of build(inputs).holdings) expect(known, h.symbol).toContain(h.symbol)
    }
  })

  it('gives every holding a non-empty rationale and a positive weight', () => {
    for (const inputs of SWEEP) {
      for (const h of build(inputs).holdings) {
        expect(h.weightPct).toBeGreaterThan(0)
        expect(h.rationale.length).toBeGreaterThan(10)
        expect(ASSET_CLASS_INFO[h.assetClass]).toBeDefined()
      }
    }
  })

  it('dollar amounts track the weights against the invested amount', () => {
    const plan = build({ amount: 50_000 })
    for (const h of plan.holdings) {
      expect(Math.abs(h.amountUsd - 50_000 * h.weightPct / 100)).toBeLessThanOrEqual(1)
    }
  })
})

describe('glide path', () => {
  it('holds less equity as the spend date approaches', () => {
    const equityOf = (p: BuiltPortfolio) => sum(
      p.classMix.filter((c) => ['us-equity', 'intl-equity', 'sector-tilt'].includes(c.assetClass)).map((c) => c.pct))
    const horizons = [1, 3, 5, 10, 20, 40].map((y) => equityOf(build({ yearsToFirstUse: y })))
    for (let i = 1; i < horizons.length; i++) {
      expect(horizons[i], `horizon step ${i}`).toBeGreaterThanOrEqual(horizons[i - 1])
    }
  })

  it('anchors to first use, not retirement — money due soon stays defensive', () => {
    const soon = build({ yearsToFirstUse: 2, yearsToRetirement: 30 })
    const late = build({ yearsToFirstUse: 30, yearsToRetirement: 30 })
    expect(weightOf(soon, 'VTI')).toBeLessThan(weightOf(late, 'VTI'))
    expect(soon.horizonYears).toBe(2)
    expect(soon.notes.some((n) => /binding constraint/i.test(n.message))).toBe(true)
  })

  it('refuses to let high risk tolerance override a short horizon', () => {
    const plan = build({ riskTolerance: 10, yearsToFirstUse: 2 })
    expect(plan.notes.some((n) => n.level === 'warn' && /horizon wins/i.test(n.message))).toBe(true)
    expect(weightOf(plan, 'SHY')).toBeGreaterThan(0)
  })
})

describe('bond ladder', () => {
  it('allocates the full sleeve at every horizon', () => {
    for (const h of [0, 2, 3, 6, 7, 14, 15, 40]) {
      expect(sum(bondLadder(h).map((r) => r.share))).toBeCloseTo(1, 6)
    }
  })

  it('keeps long duration away from near spend dates', () => {
    for (const h of [0, 2, 6]) {
      expect(bondLadder(h).map((r) => r.symbol)).not.toContain('TLT')
    }
    expect(bondLadder(2).map((r) => r.symbol)).toEqual(['SHY'])
  })

  it('extends duration only when the horizon is long', () => {
    expect(bondLadder(30).map((r) => r.symbol)).toContain('TLT')
    expect(bondLadder(10).map((r) => r.symbol)).toContain('IEF')
  })

  it('collapses a thin sleeve instead of splitting it into slivers', () => {
    const thin = consolidateLadder(bondLadder(30), 2)
    expect(thin).toHaveLength(1)
    expect(thin[0].share).toBe(1)
    const roomy = consolidateLadder(bondLadder(30), 40)
    expect(roomy).toHaveLength(3)
    expect(sum(roomy.map((r) => r.share))).toBeCloseTo(1, 6)
  })

  it('never leaves a bond position too small to be worth trading', () => {
    for (const inputs of SWEEP) {
      for (const h of build(inputs).holdings.filter((x) => x.assetClass === 'bonds')) {
        expect(h.weightPct, `${h.symbol} @ ${inputs.yearsToFirstUse}y`).toBeGreaterThanOrEqual(MIN_RUNG_PCT)
      }
    }
  })

  it('lengthens as the horizon grows — average rung duration is monotonic', () => {
    const YEARS: Record<string, number> = { SHY: 2, IEF: 8.5, BND: 6, TLT: 25 }
    const dur = (h: number) => sum(bondLadder(h).map((r) => r.share * YEARS[r.symbol]))
    const series = [1, 5, 10, 20].map(dur)
    for (let i = 1; i < series.length; i++) expect(series[i]).toBeGreaterThan(series[i - 1])
  })
})

describe('cash and crypto sleeves', () => {
  it('holds cash only when the money is needed soon', () => {
    expect(build({ yearsToFirstUse: 0 }).classMix.find((c) => c.assetClass === 'cash')!.pct).toBeGreaterThan(0)
    expect(build({ yearsToFirstUse: 20 }).classMix.find((c) => c.assetClass === 'cash')).toBeUndefined()
  })

  it('omits crypto entirely when the user wants none', () => {
    for (const inputs of SWEEP.filter((i) => i.cryptoComfort === 'none')) {
      expect(build(inputs).holdings.some((h) => h.assetClass === 'crypto')).toBe(false)
    }
  })

  it('caps the crypto sleeve at 8% even at maximum risk and comfort', () => {
    for (const inputs of SWEEP) {
      const crypto = build(inputs).classMix.find((c) => c.assetClass === 'crypto')?.pct ?? 0
      expect(crypto).toBeLessThanOrEqual(8)
    }
  })

  it('caps crypto at 2% and warns when the spend date is under five years', () => {
    const plan = build({ yearsToFirstUse: 3, cryptoComfort: 'moderate', riskTolerance: 10 })
    expect(plan.classMix.find((c) => c.assetClass === 'crypto')!.pct).toBeLessThanOrEqual(2)
    expect(plan.notes.some((n) => n.level === 'warn' && /capped at 2%/.test(n.message))).toBe(true)
  })
})

describe('optional macro sleeves', () => {
  it('adds nothing when neither sleeve is opted into', () => {
    const plan = build()
    expect(plan.holdings.some((h) => h.assetClass === 'commodity')).toBe(false)
    expect(plan.holdings.some((h) => h.assetClass === 'currency')).toBe(false)
  })

  it('treats a plan saved before these fields existed as opting out', () => {
    // reviewPlan()'s aged rebuild replays stored inputs; a pre-existing plan
    // has no commodityComfort key at all and must not sprout a sleeve.
    const legacyInputs = { ...base }
    delete (legacyInputs as Partial<BuilderInputs>).commodityComfort
    delete (legacyInputs as Partial<BuilderInputs>).currencyComfort
    const plan = buildPortfolio(legacyInputs)
    expect(plan.classMix.some((c) => c.assetClass === 'commodity')).toBe(false)
    expect(plan.classMix.some((c) => c.assetClass === 'currency')).toBe(false)
    expect(sum(plan.holdings.map((h) => h.weightPct))).toBeCloseTo(100, 1)
  })

  it('holds gold alone at a small allocation and adds the basket at moderate', () => {
    const small = build({ commodityComfort: 'small' })
    expect(small.holdings.filter((h) => h.assetClass === 'commodity').map((h) => h.symbol)).toEqual(['GLDM'])

    const moderate = build({ commodityComfort: 'moderate' })
    const symbols = moderate.holdings.filter((h) => h.assetClass === 'commodity').map((h) => h.symbol)
    expect(symbols).toContain('GLDM')
    expect(symbols).toContain('PDBC')
  })

  it('does not scale commodities with risk tolerance — gold is not a growth asset', () => {
    const timid = build({ commodityComfort: 'moderate', riskTolerance: 1, yearsToFirstUse: 20 })
    const bold = build({ commodityComfort: 'moderate', riskTolerance: 10, yearsToFirstUse: 20 })
    const pct = (p: BuiltPortfolio) => p.classMix.find((c) => c.assetClass === 'commodity')?.pct ?? 0
    expect(pct(timid)).toBeCloseTo(pct(bold), 1)
  })

  it('trims the commodity sleeve when the spend date is close', () => {
    const plan = build({ commodityComfort: 'moderate', yearsToFirstUse: 2 })
    expect(plan.classMix.find((c) => c.assetClass === 'commodity')!.pct).toBeLessThanOrEqual(3)
    expect(plan.notes.some((n) => n.level === 'warn' && /Commodity sleeve trimmed/.test(n.message))).toBe(true)
  })

  it('always discloses that foreign currency has no long-run expected return', () => {
    const plan = build({ currencyComfort: 'small' })
    expect(plan.holdings.filter((h) => h.assetClass === 'currency').map((h) => h.symbol)).toEqual(['FXE'])
    expect(plan.notes.some((n) => n.level === 'warn' && /no long-run expected return/.test(n.message))).toBe(true)
  })

  it('splits the currency sleeve across two reserve currencies at moderate', () => {
    const symbols = build({ currencyComfort: 'moderate' }).holdings
      .filter((h) => h.assetClass === 'currency').map((h) => h.symbol)
    expect(symbols).toEqual(['FXE', 'FXY'])
  })

  it('funds each sleeve from its own side, leaving the risk posture unchanged', () => {
    const GROWTH = ['us-equity', 'intl-equity', 'sector-tilt', 'crypto', 'commodity']
    const sideTotals = (p: BuiltPortfolio) => ({
      growth: sum(p.classMix.filter((c) => GROWTH.includes(c.assetClass)).map((c) => c.pct)),
      defensive: sum(p.classMix.filter((c) => !GROWTH.includes(c.assetClass)).map((c) => c.pct)),
    })
    const without = sideTotals(build({ yearsToFirstUse: 20 }))
    const withSleeves = sideTotals(build({
      yearsToFirstUse: 20, commodityComfort: 'moderate', currencyComfort: 'moderate',
    }))
    // Opting into diversifiers must not quietly change how much risk is taken.
    expect(withSleeves.growth).toBeCloseTo(without.growth, 0)
    expect(withSleeves.defensive).toBeCloseTo(without.defensive, 0)
  })

  it('funds commodities out of equity and currency out of the bond side', () => {
    const cls = (p: BuiltPortfolio, c: string) => p.classMix.find((x) => x.assetClass === c)?.pct ?? 0
    const without = build({ yearsToFirstUse: 20 })
    const withCommodity = build({ yearsToFirstUse: 20, commodityComfort: 'moderate' })
    const withCurrency = build({ yearsToFirstUse: 20, currencyComfort: 'moderate' })

    // Gold displaces stocks, not bonds.
    expect(cls(withCommodity, 'us-equity')).toBeLessThan(cls(without, 'us-equity'))
    expect(cls(withCommodity, 'bonds')).toBeCloseTo(cls(without, 'bonds'), 0)
    // Foreign cash displaces bonds, not stocks.
    expect(cls(withCurrency, 'bonds')).toBeLessThan(cls(without, 'bonds'))
    expect(cls(withCurrency, 'us-equity')).toBeCloseTo(cls(without, 'us-equity'), 0)
  })

  it('never emits an unbuyable sliver position with every sleeve enabled', () => {
    // The residual after max-risk funding of every sleeve can be a fraction
    // of a point; it must be absorbed, not shipped as a $200 bond fund.
    for (const riskTolerance of [1, 5, 8, 10]) {
      for (const yearsToFirstUse of [0, 2, 6, 20, 40]) {
        const plan = build({
          riskTolerance, yearsToFirstUse,
          cryptoComfort: 'moderate', commodityComfort: 'moderate', currencyComfort: 'moderate',
        })
        for (const h of plan.holdings) {
          expect(h.weightPct, `${h.symbol} @ risk ${riskTolerance}/${yearsToFirstUse}y`)
            .toBeGreaterThanOrEqual(MIN_RUNG_PCT)
        }
      }
    }
  })

  it('never exceeds 100% even at maximum risk with every sleeve enabled', () => {
    // Regression: equity(95) + crypto(8) alone used to total 103% before the
    // rounding pass silently shrank the core holding to compensate.
    for (const riskTolerance of [1, 5, 10]) {
      for (const yearsToFirstUse of [0, 2, 10, 40]) {
        const plan = build({
          riskTolerance, yearsToFirstUse,
          cryptoComfort: 'moderate', commodityComfort: 'moderate', currencyComfort: 'moderate',
        })
        const total = sum(plan.holdings.map((h) => h.weightPct))
        expect(Math.abs(total - 100), `risk ${riskTolerance} / ${yearsToFirstUse}y`).toBeLessThan(0.05)
        for (const h of plan.holdings) expect(h.weightPct).toBeGreaterThan(0)
      }
    }
  })

  it('counts commodities as growth but currency as defensive in risk drift', () => {
    const plan = build({ yearsToFirstUse: 20, commodityComfort: 'moderate', currencyComfort: 'moderate' })
    const onTarget = Object.fromEntries(plan.holdings.map((h) => [h.symbol, h.weightPct]))
    const saved: SavedPlan = {
      id: 'p', name: 'n', createdAt: new Date().toISOString(),
      lastReviewedAt: new Date().toISOString(), plan,
    }
    // Held exactly on target — neither sleeve should register as drift.
    expect(reviewPlan(saved, { weights: onTarget }).some((f) => f.id === 'risk-drift')).toBe(false)
  })
})

describe('sector focus and exclusions', () => {
  it('applies at most three tilts and warns when more were asked for', () => {
    const focus: SectorId[] = ['technology', 'financials', 'energy', 'healthcare']
    const plan = build({ sectorFocus: focus })
    expect(plan.holdings.filter((h) => h.assetClass === 'sector-tilt')).toHaveLength(3)
    expect(plan.notes.some((n) => n.level === 'warn' && /only the first three/i.test(n.message))).toBe(true)
  })

  it('does not warn about the cap when exclusions trimmed the list to three', () => {
    const plan = build({ sectorFocus: ['technology', 'financials', 'energy', 'healthcare'], sectorExclude: ['energy'] })
    expect(plan.notes.some((n) => /only the first three/i.test(n.message))).toBe(false)
    expect(plan.holdings.filter((h) => h.assetClass === 'sector-tilt')).toHaveLength(3)
  })

  it('lets exclusion beat focus when a sector is both', () => {
    const plan = build({ sectorFocus: ['energy'], sectorExclude: ['energy'] })
    expect(plan.holdings.map((h) => h.symbol)).not.toContain('XLE')
    expect(plan.notes.some((n) => n.level === 'warn' && /exclusion wins/i.test(n.message))).toBe(true)
  })

  it('admits that a broad core still holds an excluded sector', () => {
    const plan = build({ sectorExclude: ['energy'] })
    const note = plan.notes.find((n) => /still hold those companies/i.test(n.message))
    expect(note?.level).toBe('warn')
    expect(note?.message).toMatch(/screened fund/i)
    // The core is untouched — we don't pretend to have removed anything.
    expect(weightOf(plan, 'VTI')).toBeGreaterThan(0)
  })
})

describe('fees', () => {
  it('blends between the cheapest and dearest holding', () => {
    for (const inputs of SWEEP) {
      const plan = build(inputs)
      const ers = plan.holdings
        .map((h) => FUND_CATALOG.find((f) => f.symbol === h.symbol)?.expenseRatioPct)
        .filter((e): e is number => e != null)
      expect(plan.fees.blendedExpenseRatioPct).toBeGreaterThanOrEqual(Math.min(...ers) - 1e-6)
      expect(plan.fees.blendedExpenseRatioPct).toBeLessThanOrEqual(Math.max(...ers) + 1e-6)
    }
  })

  it('reports full coverage while every instrument comes from the catalog', () => {
    expect(build().fees.coveragePct).toBeCloseTo(100, 1)
  })

  it('prices the annual fee off the invested amount', () => {
    const plan = build({ amount: 200_000 })
    expect(plan.fees.annualFeeUsd).toBe(Math.round(200_000 * plan.fees.blendedExpenseRatioPct / 100))
  })

  it('charges more drag over a longer horizon', () => {
    const short = build({ yearsToFirstUse: 5 }).fees.horizonFeeDragUsd
    const long = build({ yearsToFirstUse: 40 }).fees.horizonFeeDragUsd
    expect(long).toBeGreaterThan(short)
    expect(short).toBeGreaterThanOrEqual(0)
  })

  it('stays cheap even in the most expensive configuration the builder can reach', () => {
    // This is why there is no fee warning in buildPortfolio: it could never fire.
    const worst = Math.max(...SWEEP.map((i) => build({
      ...i, sectorFocus: ['energy', 'utilities', 'real-estate'],
    }).fees.blendedExpenseRatioPct))
    expect(worst).toBeLessThan(0.2)
  })
})

describe('diversification score', () => {
  it('stays within 0–100 across the sweep', () => {
    for (const inputs of SWEEP) {
      const s = build(inputs).diversificationScore
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(100)
    }
  })

  it('rates a spread portfolio above one dominated by a single class', () => {
    const spread = build({ yearsToFirstUse: 20, sectorFocus: ['technology'], cryptoComfort: 'small' })
    const concentrated = build({ yearsToFirstUse: 45, riskTolerance: 10 })
    expect(spread.diversificationScore).toBeGreaterThan(concentrated.diversificationScore)
  })
})

describe('actualWeightsFromPortfolio', () => {
  const portfolio: Portfolio = {
    id: 'x', name: 'Real', description: '', startingCapital: 100_000,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    holdings: [
      { cgId: 'sec:VTI', symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', targetAlloc: 60, entryPrice: 300, addedAt: '2026-01-01T00:00:00Z' },
      { cgId: 'sec:BND', symbol: 'BND', name: 'Vanguard Total Bond Market ETF', targetAlloc: 40, entryPrice: 70, addedAt: '2026-01-01T00:00:00Z' },
    ],
  }

  it('weights by live value, not by target allocation', () => {
    // VTI doubled, BND flat: 120k vs 40k → 75/25 despite 60/40 targets.
    const r = actualWeightsFromPortfolio(portfolio, { 'sec:VTI': 600, 'sec:BND': 70 })
    expect(r.weights).toEqual({ VTI: 75, BND: 25 })
    expect(r.valueUsd).toBe(160_000)
    expect(r.pricedPct).toBe(100)
  })

  it('always produces weights summing to 100', () => {
    const r = actualWeightsFromPortfolio(portfolio, { 'sec:VTI': 412.34, 'sec:BND': 68.91 })
    expect(sum(Object.values(r.weights))).toBeCloseTo(100, 1)
  })

  it('drops unpriced positions rather than valuing them at cost', () => {
    const r = actualWeightsFromPortfolio(portfolio, { 'sec:VTI': 300 })
    expect(r.weights).toEqual({ VTI: 100 })
    expect(r.pricedPct).toBe(60)
    expect(r.valueUsd).toBe(60_000)
  })

  it('returns nothing usable when no position can be priced', () => {
    const r = actualWeightsFromPortfolio(portfolio, {})
    expect(r.weights).toEqual({})
    expect(r.valueUsd).toBe(0)
    expect(r.pricedPct).toBe(0)
  })

  it('feeds straight into checkDrift', () => {
    const plan = build({ yearsToFirstUse: 20 })
    const { weights, valueUsd } = actualWeightsFromPortfolio(portfolio, { 'sec:VTI': 600, 'sec:BND': 70 })
    const report = checkDrift(plan, weights, valueUsd)
    expect(report.items.length).toBe(plan.holdings.length)
    expect(report.turnoverUsd).toBeGreaterThan(0)
  })
})

describe('reviewPlan', () => {
  const T0 = Date.parse('2026-01-01T00:00:00Z')
  const YEAR = 365.25 * 86_400_000
  const saved = (plan: BuiltPortfolio, agedDays = 0): SavedPlan => ({
    id: 'p1', name: 'Test plan',
    createdAt: new Date(T0).toISOString(),
    lastReviewedAt: new Date(T0 + agedDays * 86_400_000).toISOString(),
    plan,
  })
  const plan = build({ yearsToFirstUse: 20, riskTolerance: 6, amount: 100_000 })
  const onTarget = Object.fromEntries(plan.holdings.map((h) => [h.symbol, h.weightPct]))
  const idsOf = (fs: ReturnType<typeof reviewPlan>) => fs.map((f) => f.id)

  it('finds nothing wrong with a fresh plan held exactly on target', () => {
    expect(reviewPlan(saved(plan), { weights: onTarget }, T0)).toHaveLength(0)
  })

  it('skips holdings-dependent checks when no actual position is supplied', () => {
    const ids = idsOf(reviewPlan(saved(plan), undefined, T0))
    expect(ids).not.toContain('risk-drift')
    expect(ids).not.toContain('fee-creep')
    expect(ids).not.toContain('concentration')
  })

  it('flags an aged glide path once the horizon has meaningfully shortened', () => {
    // The glide path moves ~2.8 points a year, so one year of ageing is noise.
    expect(idsOf(reviewPlan(saved(plan), undefined, T0 + 1 * YEAR))).not.toContain('glide-path')
    const aged = reviewPlan(saved(plan), undefined, T0 + 12 * YEAR)
    const finding = aged.find((f) => f.id === 'glide-path')
    expect(finding?.level).toBe('warn')
    expect(finding?.message).toMatch(/growth assets/i)
  })

  it('flags a portfolio that has drifted riskier than the plan', () => {
    const risky = { ...onTarget, VTI: (onTarget.VTI ?? 0) + 12, BND: Math.max(0, (onTarget.BND ?? 0) - 12) }
    const finding = reviewPlan(saved(plan), { weights: risky }, T0).find((f) => f.id === 'risk-drift')
    expect(finding?.level).toBe('warn')
    expect(finding?.title).toMatch(/riskier/i)
  })

  it('treats drifting defensive as information, not a warning', () => {
    const safe = { ...onTarget, VTI: Math.max(0, (onTarget.VTI ?? 0) - 15), BND: (onTarget.BND ?? 0) + 15 }
    const finding = reviewPlan(saved(plan), { weights: safe }, T0).find((f) => f.id === 'risk-drift')
    expect(finding?.level).toBe('info')
  })

  it('catches fee creep from expensive holdings the plan never chose', () => {
    // HYG 0.49% and PIMIX 0.62% against a plan blended near 0.05%.
    const pricey = { VTI: 40, HYG: 30, PIMIX: 30 }
    const finding = reviewPlan(saved(plan), { weights: pricey, valueUsd: 250_000 }, T0).find((f) => f.id === 'fee-creep')
    expect(finding?.level).toBe('warn')
    expect(finding?.message).toMatch(/\$[\d,]+ extra per year/)
  })

  it('does not cry fee creep when the portfolio matches the plan', () => {
    expect(idsOf(reviewPlan(saved(plan), { weights: onTarget }, T0))).not.toContain('fee-creep')
  })

  it('stays quiet on fees when too little of the portfolio can be priced', () => {
    const mostlyUnknown = { ZZZZ: 80, HYG: 20 }
    expect(idsOf(reviewPlan(saved(plan), { weights: mostlyUnknown }, T0))).not.toContain('fee-creep')
  })

  it('flags a single position that decides the whole outcome', () => {
    const finding = reviewPlan(saved(plan), { weights: { NVDA: 60, VTI: 40 } }, T0).find((f) => f.id === 'concentration')
    expect(finding?.level).toBe('warn')
    expect(finding?.message).toMatch(/NVDA is 60%/)
  })

  it('does not call a broad core fund concentrated when the plan asked for it', () => {
    // The 20-year plan targets a majority in VTI on purpose — 3,500 companies.
    const heavyCore = plan.holdings.find((h) => h.weightPct >= 45)
    expect(heavyCore, 'expected this plan to target a large core position').toBeDefined()
    expect(idsOf(reviewPlan(saved(plan), { weights: onTarget }, T0))).not.toContain('concentration')
  })

  it('flags when the plan has stopped describing the portfolio', () => {
    const finding = reviewPlan(saved(plan), { weights: { ...onTarget, GME: 15 } }, T0).find((f) => f.id === 'off-plan')
    expect(finding?.level).toBe('warn')
    expect(finding?.message).toMatch(/GME/)
  })

  it('ignores a trivial off-plan position', () => {
    expect(idsOf(reviewPlan(saved(plan), { weights: { ...onTarget, GME: 2 } }, T0))).not.toContain('off-plan')
  })

  it('reports an overdue review against the plan’s own cadence', () => {
    expect(idsOf(reviewPlan(saved(plan), { weights: onTarget }, T0 + 30 * 86_400_000))).not.toContain('stale-review')
    const late = reviewPlan(saved(plan), { weights: onTarget }, T0 + 200 * 86_400_000)
    expect(late.find((f) => f.id === 'stale-review')?.message).toMatch(/200 days ago/)
  })
})

describe('checkDrift', () => {
  const plan = build({ yearsToFirstUse: 20, amount: 100_000 })
  const onTarget = Object.fromEntries(plan.holdings.map((h) => [h.symbol, h.weightPct]))

  it('calls nothing when actual weights match the plan', () => {
    const r = checkDrift(plan, onTarget)
    expect(r.rebalanceDue).toBe(false)
    expect(r.items.every((i) => i.action === 'hold')).toBe(true)
    expect(r.turnoverUsd).toBe(0)
    expect(r.maxDriftPts).toBe(0)
  })

  it('treats a drift exactly on the band as within tolerance', () => {
    const top = plan.holdings[0]
    const at = { ...onTarget, [top.symbol]: top.weightPct + plan.driftBandPct }
    const beyond = { ...onTarget, [top.symbol]: top.weightPct + plan.driftBandPct + 0.1 }
    expect(checkDrift(plan, at).items.find((i) => i.symbol === top.symbol)!.action).toBe('hold')
    expect(checkDrift(plan, beyond).items.find((i) => i.symbol === top.symbol)!.action).toBe('sell')
  })

  it('sells what has grown and buys what has lagged', () => {
    const top = plan.holdings[0]
    const other = plan.holdings[1]
    const weights = {
      ...onTarget,
      [top.symbol]: top.weightPct + 10,
      [other.symbol]: Math.max(0, other.weightPct - 10),
    }
    const r = checkDrift(plan, weights, 200_000)
    const sell = r.items.find((i) => i.symbol === top.symbol)!
    const buy = r.items.find((i) => i.symbol === other.symbol)!
    expect(sell.action).toBe('sell')
    expect(sell.tradeUsd).toBeLessThan(0)
    // 10 points of a $200k portfolio is $20k.
    expect(sell.tradeUsd).toBe(-20_000)
    expect(buy.action).toBe('buy')
    expect(buy.tradeUsd).toBeGreaterThan(0)
    expect(r.rebalanceDue).toBe(true)
  })

  it('sizes trades off the live value, not the amount the plan was built with', () => {
    const top = plan.holdings[0]
    const weights = { ...onTarget, [top.symbol]: top.weightPct + 10 }
    const atBuildValue = checkDrift(plan, weights).items.find((i) => i.symbol === top.symbol)!
    const atLiveValue = checkDrift(plan, weights, 500_000).items.find((i) => i.symbol === top.symbol)!
    expect(atBuildValue.tradeUsd).toBe(-10_000)
    expect(atLiveValue.tradeUsd).toBe(-50_000)
  })

  it('treats a missing position as a full buy', () => {
    const { [plan.holdings[0].symbol]: _dropped, ...missing } = onTarget
    const item = checkDrift(plan, missing).items.find((i) => i.symbol === plan.holdings[0].symbol)!
    expect(item.currentPct).toBe(0)
    expect(item.action).toBe('buy')
    expect(item.tradeUsd).toBeGreaterThan(0)
  })

  it('surfaces holdings the plan never asked for', () => {
    const r = checkDrift(plan, { ...onTarget, GME: 12, HYG: 3 })
    expect(r.unplanned.map((u) => u.symbol)).toEqual(['GME', 'HYG'])
    expect(r.unplanned[0].currentPct).toBe(12)
  })

  it('ignores zero-weight positions when listing unplanned holdings', () => {
    expect(checkDrift(plan, { ...onTarget, GME: 0 }).unplanned).toHaveLength(0)
  })
})
