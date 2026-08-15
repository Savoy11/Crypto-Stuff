import { describe, expect, it } from 'vitest'
import {
  computeRatios,
  computeValuationMultiples,
  deriveFreeCashFlow,
  deriveGrossProfit,
  growth,
  ratio,
  type CompanyFundamentals,
} from '../companyRatios'

// The XBRL-derived ratio block was the largest cluster of untested
// user-actionable numbers in the app (W1 E-note-3 / D-24). These figures render
// straight into the equity detail page's ratio table, so every edge case here is
// something a user would otherwise read as fact.

const EMPTY: CompanyFundamentals = {
  revenue: null, revenuePrior: null, grossProfit: null, operatingIncome: null,
  netIncome: null, netIncomePrior: null, eps: null, epsBasis: null,
  operatingCashFlow: null, capex: null, freeCashFlow: null,
  assets: null, liabilities: null, equity: null, assetsCurrent: null,
  liabilitiesCurrent: null, cash: null, longTermDebt: null,
  sharesOutstanding: null, balanceSheetAsOf: null,
}

describe('ratio', () => {
  it('divides when both sides are present', () => {
    expect(ratio(46, 100)).toBeCloseTo(0.46)
  })

  it('returns null rather than Infinity on a zero denominator', () => {
    // An Infinity would render as a confident "∞×" beside real figures.
    expect(ratio(100, 0)).toBeNull()
  })

  it('returns null when either side is missing', () => {
    expect(ratio(null, 100)).toBeNull()
    expect(ratio(100, null)).toBeNull()
    expect(ratio(undefined, undefined)).toBeNull()
  })

  it('rejects non-finite inputs — XBRL is third-party data', () => {
    expect(ratio(NaN, 100)).toBeNull()
    expect(ratio(100, NaN)).toBeNull()
    expect(ratio(Infinity, 100)).toBeNull()
  })

  it('preserves sign for genuinely negative figures', () => {
    expect(ratio(-25, 100)).toBeCloseTo(-0.25) // a real loss margin
  })
})

describe('growth', () => {
  it('reports period-over-period change as a signed fraction', () => {
    expect(growth(106, 100)).toBeCloseTo(0.06)
    expect(growth(90, 100)).toBeCloseTo(-0.1)
  })

  it('returns null on a zero base', () => {
    expect(growth(100, 0)).toBeNull()
  })

  it('returns null on a NEGATIVE base instead of an inverted number', () => {
    // −1M → +3M is a company whose earnings improved. The naive formula gives
    // −4.0, which renders "-400% YoY" on a genuine recovery.
    expect(growth(3_000_000, -1_000_000)).toBeNull()
    // And the mirror case: a collapse from profit to loss must not read positive.
    expect(growth(-5_000_000, -1_000_000)).toBeNull()
  })

  it('returns null when either period is missing', () => {
    expect(growth(100, null)).toBeNull()
    expect(growth(null, 100)).toBeNull()
  })
})

describe('deriveGrossProfit', () => {
  it('prefers the filed GrossProfit figure', () => {
    expect(deriveGrossProfit(400, 1000, 550)).toBe(400)
  })

  it('falls back to revenue − cost of revenue when GrossProfit is untagged', () => {
    expect(deriveGrossProfit(null, 1000, 550)).toBe(450)
  })

  it('returns null when the fallback inputs are incomplete', () => {
    expect(deriveGrossProfit(null, 1000, null)).toBeNull()
    expect(deriveGrossProfit(null, null, 550)).toBeNull()
  })

  it('accepts a filed zero rather than treating it as missing', () => {
    expect(deriveGrossProfit(0, 1000, 550)).toBe(0)
  })
})

describe('deriveFreeCashFlow', () => {
  it('subtracts capex from operating cash flow', () => {
    expect(deriveFreeCashFlow(1000, 300)).toBe(700)
  })

  it('treats missing capex as zero — asset-light filers often omit the tag', () => {
    expect(deriveFreeCashFlow(1000, null)).toBe(1000)
  })

  it('returns null on missing OCF rather than reporting bare negative capex', () => {
    expect(deriveFreeCashFlow(null, 300)).toBeNull()
  })

  it('carries a genuinely negative FCF through', () => {
    expect(deriveFreeCashFlow(100, 400)).toBe(-300)
  })
})

describe('computeRatios', () => {
  const profitable: CompanyFundamentals = {
    ...EMPTY,
    revenue: 1000, revenuePrior: 800,
    grossProfit: 450, operatingIncome: 250,
    netIncome: 200, netIncomePrior: 150,
    freeCashFlow: 180,
    assets: 2000, liabilities: 1200, equity: 800,
    assetsCurrent: 600, liabilitiesCurrent: 400,
    longTermDebt: 500,
  }

  it('computes the full ratio set from a complete filing', () => {
    const r = computeRatios(profitable)
    expect(r.grossMargin).toBeCloseTo(0.45)
    expect(r.operatingMargin).toBeCloseTo(0.25)
    expect(r.netMargin).toBeCloseTo(0.2)
    expect(r.roe).toBeCloseTo(0.25)
    expect(r.roa).toBeCloseTo(0.1)
    expect(r.currentRatio).toBeCloseTo(1.5)
    expect(r.liabilitiesToEquity).toBeCloseTo(1.5)
    expect(r.debtToEquity).toBeCloseTo(0.625)
    expect(r.revenueGrowthYoY).toBeCloseTo(0.25)
    expect(r.netIncomeGrowthYoY).toBeCloseTo(0.3333, 3)
    expect(r.fcfMargin).toBeCloseTo(0.18)
  })

  it('returns an all-null set for an empty filing without throwing', () => {
    const r = computeRatios(EMPTY)
    expect(Object.values(r).every((v) => v === null)).toBe(true)
  })

  it('reports negative margins for a loss-maker rather than hiding them', () => {
    const r = computeRatios({ ...profitable, netIncome: -200 })
    expect(r.netMargin).toBeCloseTo(-0.2)
    expect(r.roe).toBeCloseTo(-0.25)
  })

  it('nulls only the affected ratios when one input is missing', () => {
    const r = computeRatios({ ...profitable, equity: null })
    expect(r.roe).toBeNull()
    expect(r.liabilitiesToEquity).toBeNull()
    expect(r.debtToEquity).toBeNull()
    expect(r.netMargin).toBeCloseTo(0.2) // unaffected
  })

  it('survives negative equity (accumulated deficit) without an Infinity', () => {
    const r = computeRatios({ ...profitable, equity: -100 })
    expect(Number.isFinite(r.roe!)).toBe(true)
    expect(r.roe).toBeCloseTo(-2)
  })
})

describe('computeValuationMultiples', () => {
  const f = { sharesOutstanding: 1_000_000, eps: 5, revenue: 20_000_000, equity: 10_000_000 }

  it('computes market cap and the three multiples from a live price', () => {
    const v = computeValuationMultiples(f, 100)
    expect(v.marketCap).toBe(100_000_000)
    expect(v.pe).toBeCloseTo(20)
    expect(v.ps).toBeCloseTo(5)
    expect(v.pb).toBeCloseTo(10)
  })

  it('returns null P/E for a loss-maker, never a negative multiple', () => {
    // Matches the registry XBRL backfill rule: a negative P/E is a category
    // error, and rendering "-12.4×" invites reading it as a cheap stock.
    expect(computeValuationMultiples({ ...f, eps: -4 }, 100).pe).toBeNull()
    expect(computeValuationMultiples({ ...f, eps: 0 }, 100).pe).toBeNull()
  })

  it('returns an empty set when there is no usable price', () => {
    for (const price of [null, undefined, 0, -10, NaN]) {
      const v = computeValuationMultiples(f, price)
      expect(v).toEqual({ marketCap: null, pe: null, ps: null, pb: null })
    }
  })

  it('still reports P/E when share count is missing (market cap is not needed)', () => {
    const v = computeValuationMultiples({ ...f, sharesOutstanding: null }, 100)
    expect(v.marketCap).toBeNull()
    expect(v.ps).toBeNull()
    expect(v.pb).toBeNull()
    expect(v.pe).toBeCloseTo(20)
  })

  it('handles a null fundamentals block', () => {
    expect(computeValuationMultiples(null, 100)).toEqual({ marketCap: null, pe: null, ps: null, pb: null })
  })
})
