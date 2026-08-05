import { describe, it, expect } from 'vitest'
import {
  contractMonths, analyzeCurve, describeCurve, EXCHANGE_MONTH_SUFFIX,
  type CurvePoint,
} from '../termStructure'

// Early August 2026 — the same window the P2-O1 probe measured, so the
// expected symbols below are the ones that were actually verified to resolve.
const AUG_2026 = new Date('2026-08-05T00:00:00Z')

const pt = (monthsOut: number, price: number): CurvePoint =>
  ({ symbol: `X${monthsOut}`, label: `M${monthsOut}`, monthsOut, price })

describe('contractMonths', () => {
  it('builds the verified symbol shape', () => {
    // CLU26.NYM and CLZ26.NYM both resolved in the P2-O1 probe.
    const months = contractMonths('CL=F', 'NYMEX', 6, AUG_2026)
    expect(months[0]).toMatchObject({ symbol: 'CLU26.NYM', label: 'Sep 26', monthsOut: 1 })
    expect(months[3]).toMatchObject({ symbol: 'CLZ26.NYM', label: 'Dec 26', monthsOut: 4 })
  })

  it('uses the right suffix per exchange', () => {
    expect(contractMonths('GC=F', 'COMEX', 1, AUG_2026)[0].symbol).toBe('GCU26.CMX')
    expect(contractMonths('ZC=F', 'CBOT', 1, AUG_2026)[0].symbol).toBe('ZCU26.CBT')
  })

  it('starts at +1 month, never the current one', () => {
    // August is month 7 (0-indexed); the first entry must be September.
    const months = contractMonths('CL=F', 'NYMEX', 3, AUG_2026)
    expect(months.map((m) => m.label)).toEqual(['Sep 26', 'Oct 26', 'Nov 26'])
    expect(months.every((m) => m.monthsOut >= 1)).toBe(true)
  })

  it('rolls the year over correctly', () => {
    const months = contractMonths('CL=F', 'NYMEX', 6, new Date('2026-11-20T00:00:00Z'))
    expect(months.map((m) => m.label)).toEqual(['Dec 26', 'Jan 27', 'Feb 27', 'Mar 27', 'Apr 27', 'May 27'])
    expect(months[1].symbol).toBe('CLF27.NYM') // F = January
  })

  it('handles a December start without producing month 12', () => {
    const months = contractMonths('GC=F', 'COMEX', 2, new Date('2026-12-15T00:00:00Z'))
    expect(months.map((m) => m.label)).toEqual(['Jan 27', 'Feb 27'])
  })

  it('returns nothing for an exchange with no known suffix', () => {
    expect(contractMonths('XX=F', 'LME', 6, AUG_2026)).toEqual([])
  })

  it('only claims suffixes for exchanges in the catalog', () => {
    for (const ex of ['NYMEX', 'COMEX', 'CBOT', 'ICE', 'CME']) {
      expect(EXCHANGE_MONTH_SUFFIX[ex]).toMatch(/^\.[A-Z]{3}$/)
    }
  })

  it('requests every calendar month, not a listing cycle', () => {
    // Gold trades Feb/Apr/Jun/Aug/Dec, but we ask for all of them and let
    // unlisted months fail to resolve upstream — no second table to drift.
    expect(contractMonths('GC=F', 'COMEX', 8, AUG_2026)).toHaveLength(8)
  })
})

describe('analyzeCurve', () => {
  it('reads contango when later months cost more', () => {
    // Gold in the probe: 4177.7 (U26) -> 4223.6 (Z26), 3 months apart.
    const a = analyzeCurve([pt(1, 4177.7), pt(4, 4223.6)])!
    expect(a.shape).toBe('contango')
    expect(a.spreadPct).toBeCloseTo(1.1, 1)
    expect(a.annualizedRollPct).toBeCloseTo(4.4, 1)
  })

  it('reads backwardation when later months cost less', () => {
    // WTI in the probe: 76.11 (U26) -> 72.42 (Z26).
    const a = analyzeCurve([pt(1, 76.11), pt(4, 72.42)])!
    expect(a.shape).toBe('backwardation')
    expect(a.spreadPct).toBeLessThan(0)
    expect(a.annualizedRollPct).toBeLessThan(0)
  })

  it('annualizes over the curve span, not the raw spread', () => {
    // Same 2% spread over 6 months annualizes to half of over 3 months.
    const short = analyzeCurve([pt(1, 100), pt(4, 102)])!
    const long = analyzeCurve([pt(1, 100), pt(7, 102)])!
    expect(short.annualizedRollPct).toBeCloseTo(long.annualizedRollPct * 2, 5)
  })

  it('calls a small spread flat rather than a trend', () => {
    expect(analyzeCurve([pt(1, 100), pt(4, 100.3)])!.shape).toBe('flat')
    expect(analyzeCurve([pt(1, 100), pt(4, 99.7)])!.shape).toBe('flat')
  })

  it('flags a non-monotonic (humped) curve', () => {
    expect(analyzeCurve([pt(1, 100), pt(2, 108), pt(3, 104)])!.monotonic).toBe(false)
    expect(analyzeCurve([pt(1, 100), pt(2, 102), pt(3, 104)])!.monotonic).toBe(true)
  })

  it('refuses to draw a curve from one point', () => {
    expect(analyzeCurve([pt(1, 100)])).toBeNull()
    expect(analyzeCurve([])).toBeNull()
  })

  it('ignores unpriced and nonsensical months', () => {
    const a = analyzeCurve([pt(1, 100), pt(2, 0), pt(3, NaN), pt(4, 106)])!
    expect(a.nearest.monthsOut).toBe(1)
    expect(a.furthest.monthsOut).toBe(4)
    expect(a.shape).toBe('contango')
  })

  it('returns null when only one month survives filtering', () => {
    expect(analyzeCurve([pt(1, 100), pt(2, 0), pt(3, NaN)])).toBeNull()
  })

  it('sorts out-of-order input before reading the shape', () => {
    const a = analyzeCurve([pt(4, 106), pt(1, 100), pt(2, 103)])!
    expect(a.nearest.price).toBe(100)
    expect(a.furthest.price).toBe(106)
    expect(a.shape).toBe('contango')
  })
})

describe('describeCurve', () => {
  it('explains contango as a cost to a rolling fund', () => {
    const text = describeCurve(analyzeCurve([pt(1, 100), pt(4, 103)])!)
    expect(text).toMatch(/cost more/)
    expect(text).toMatch(/gives up/)
    expect(text).toMatch(/lag spot/)
  })

  it('explains backwardation as a tailwind', () => {
    const text = describeCurve(analyzeCurve([pt(1, 100), pt(4, 97)])!)
    expect(text).toMatch(/cost less/)
    expect(text).toMatch(/picks up/)
  })

  it('never shows a negative percentage — the direction is in the words', () => {
    for (const curve of [[pt(1, 100), pt(4, 97)], [pt(1, 100), pt(4, 103)]]) {
      expect(describeCurve(analyzeCurve(curve)!)).not.toMatch(/-\d/)
    }
  })

  it('says nothing dramatic about a flat curve', () => {
    expect(describeCurve(analyzeCurve([pt(1, 100), pt(4, 100.2)])!)).toMatch(/close to flat/)
  })
})
