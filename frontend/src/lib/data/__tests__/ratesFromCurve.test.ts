import { describe, it, expect } from 'vitest'
import { yieldFromCurve, curveYieldSourceLabel, MATURITY_TOLERANCE_YEARS } from '../ratesFromCurve'
import { RATES_CATALOG } from '../ratesCatalog'

/** A curve shaped like treasury.gov's real output (2026-09-02 reading). */
const CURVE = {
  date: '2026-09-02',
  points: [
    { label: '1M', years: 1 / 12, yieldPct: 3.83 },
    { label: '2M', years: 2 / 12, yieldPct: 3.89 },
    { label: '3M', years: 3 / 12, yieldPct: 3.92 },
    { label: '4M', years: 4 / 12, yieldPct: 4.02 },
    { label: '6M', years: 6 / 12, yieldPct: 4.0 },
    { label: '1Y', years: 1, yieldPct: 4.16 },
    { label: '2Y', years: 2, yieldPct: 4.39 },
    { label: '3Y', years: 3, yieldPct: 4.45 },
    { label: '5Y', years: 5, yieldPct: 4.54 },
    { label: '7Y', years: 7, yieldPct: 4.66 },
    { label: '10Y', years: 10, yieldPct: 4.79 },
    { label: '20Y', years: 20, yieldPct: 5.27 },
    { label: '30Y', years: 30, yieldPct: 5.27 },
  ],
}

const bySymbol = (s: string) => RATES_CATALOG.find((r) => r.symbol === s)!

describe('yieldFromCurve', () => {
  it('reads each yield index off its own maturity', () => {
    expect(yieldFromCurve(bySymbol('^IRX'), CURVE)).toMatchObject({ yieldPct: 3.92, curveLabel: '3M' })
    expect(yieldFromCurve(bySymbol('^FVX'), CURVE)).toMatchObject({ yieldPct: 4.54, curveLabel: '5Y' })
    expect(yieldFromCurve(bySymbol('^TNX'), CURVE)).toMatchObject({ yieldPct: 4.79, curveLabel: '10Y' })
    expect(yieldFromCurve(bySymbol('^TYX'), CURVE)).toMatchObject({ yieldPct: 5.27, curveLabel: '30Y' })
  })

  it('returns the yield in PLAIN PERCENT — the whole point of the change', () => {
    // The x10 reading would be 47.9. If a future refactor reintroduces scaling,
    // this is the test that catches it.
    const tnx = yieldFromCurve(bySymbol('^TNX'), CURVE)!
    expect(tnx.yieldPct).toBe(4.79)
    expect(tnx.yieldPct).toBeLessThan(20)
  })

  it('carries the curve publication date, so the UI can say how old it is', () => {
    expect(yieldFromCurve(bySymbol('^TNX'), CURVE)!.asOf).toBe('2026-09-02')
  })

  it('every yield entry in the catalog resolves against a real curve', () => {
    const yields = RATES_CATALOG.filter((r) => r.quoteBasis === 'pct')
    expect(yields).toHaveLength(4)
    for (const entry of yields) {
      expect(yieldFromCurve(entry, CURVE), `${entry.symbol} should resolve`).not.toBeNull()
    }
  })

  it('refuses futures — they quote points of par, not a curve yield', () => {
    for (const sym of ['ZT=F', 'ZF=F', 'ZN=F', 'ZB=F']) {
      expect(yieldFromCurve(bySymbol(sym), CURVE)).toBeNull()
    }
  })

  it('returns null rather than substituting a neighbouring maturity', () => {
    // A curve with no 30Y must NOT answer ^TYX with the 20Y print: a wrong
    // maturity under a "30-Year" heading is worse than a dash, because the
    // reader cannot tell it happened.
    const no30 = { ...CURVE, points: CURVE.points.filter((p) => p.label !== '30Y') }
    expect(yieldFromCurve(bySymbol('^TYX'), no30)).toBeNull()
    // and the others are unaffected
    expect(yieldFromCurve(bySymbol('^TNX'), no30)).not.toBeNull()
  })

  it('tolerates floating-point maturities within the stated tolerance', () => {
    const wobbly = {
      ...CURVE,
      points: [{ label: '10Y', years: 10 + MATURITY_TOLERANCE_YEARS / 2, yieldPct: 4.79 }],
    }
    expect(yieldFromCurve(bySymbol('^TNX'), wobbly)?.yieldPct).toBe(4.79)
  })

  it('rejects a maturity outside the tolerance', () => {
    const wrong = { ...CURVE, points: [{ label: '9Y', years: 9, yieldPct: 4.7 }] }
    expect(yieldFromCurve(bySymbol('^TNX'), wrong)).toBeNull()
  })

  it('handles a missing, empty, dateless or non-numeric curve without throwing', () => {
    const e = bySymbol('^TNX')
    expect(yieldFromCurve(e, null)).toBeNull()
    expect(yieldFromCurve(e, undefined)).toBeNull()
    expect(yieldFromCurve(e, { date: '2026-09-02', points: [] })).toBeNull()
    expect(yieldFromCurve(e, { date: '', points: CURVE.points })).toBeNull()
    expect(
      yieldFromCurve(e, { date: '2026-09-02', points: [{ label: '10Y', years: 10, yieldPct: NaN }] })
    ).toBeNull()
  })
})

describe('curveYieldSourceLabel', () => {
  it('always says daily and names the maturity and date', () => {
    const label = curveYieldSourceLabel(yieldFromCurve(bySymbol('^TNX'), CURVE)!)
    expect(label).toContain('daily')
    expect(label).toContain('10Y')
    expect(label).toContain('2026-09-02')
  })

  it('says daily even for a same-day reading — absence must not read as live', () => {
    const today = { ...CURVE, date: new Date().toISOString().slice(0, 10) }
    expect(curveYieldSourceLabel(yieldFromCurve(bySymbol('^TNX'), today)!)).toContain('daily')
  })
})
