import { describe, it, expect } from 'vitest'
import { halvingPosition, drawdownComparison, CYCLE_COPY } from '../cycleMetrics'
import {
  CYCLE_HISTORY, cycleHistoryAgeDays, cycleHistoryIsStale, getCycleHistoryProvenance,
} from '@/lib/data/cycleHistory'

describe('halvingPosition', () => {
  it('measures months since the 2024 halving with an injected clock', () => {
    const p = halvingPosition('2024-04-20', new Date('2025-10-20T00:00:00Z'))
    expect(p.monthsSince).toBeGreaterThan(17.5)
    expect(p.monthsSince).toBeLessThan(18.5)
  })

  it('clamps the nominal-cycle position to 100 after 48 months', () => {
    const p = halvingPosition('2024-04-20', new Date('2030-01-01T00:00:00Z'))
    expect(p.pctThroughNominalCycle).toBe(100)
  })

  it('derives the historical peak window from COMPLETED cycles only', () => {
    // The open 2024 cycle must not feed its own statistics back to the reader
    // as history — and genesis (null months) must not produce a NaN bound.
    const p = halvingPosition('2024-04-20', new Date('2026-08-29T00:00:00Z'))
    expect(p.historicalPeakWindowMonths).toEqual([12, 18])
    expect(p.historicalPeakWindowMonths.every(Number.isFinite)).toBe(true)
  })
})

describe('drawdownComparison', () => {
  it('appends a live row only when a real value exists', () => {
    expect(drawdownComparison(null).some(r => r.label === 'BTC now')).toBe(false)
    const rows = drawdownComparison(-52.3)
    const live = rows.find(r => r.label === 'BTC now')!
    expect(live.drawdownPct).toBe(-52.3)
    expect(live.open).toBe(true)
  })

  it('never renders a positive live drawdown', () => {
    // At a fresh all-time high athChangePct can read slightly positive from
    // rounding; the distance below the high is then zero, not a gain.
    const live = drawdownComparison(0.4).find(r => r.label === 'BTC now')!
    expect(live.drawdownPct).toBe(0)
  })

  it('marks exactly the open cycle rows as open', () => {
    const rows = drawdownComparison(null)
    expect(rows.filter(r => r.open)).toHaveLength(1)
    expect(rows.find(r => r.open)!.label).toContain('2024')
  })
})

describe('vocabulary guard', () => {
  it('panel copy never uses advice or verdict wording', () => {
    // Same enforcement as assetClassProfiles: this panel explains, it never
    // recommends. "buy zone", "accumulation zone", "top is in" are the shapes
    // the RP-3 / item-4 line exists to keep out.
    const forbidden = /\b(should|recommend|buy|sell|accumulate|accumulation zone|top is in|bottom is in|bullish|bearish|undervalued|overvalued|opportunity)\b/i
    for (const [key, text] of Object.entries(CYCLE_COPY)) {
      expect(text, `advice wording in CYCLE_COPY.${key}`).not.toMatch(forbidden)
    }
    for (const c of CYCLE_HISTORY) {
      expect(c.note, `advice wording in cycle note ${c.halving}`).not.toMatch(forbidden)
    }
  })
})

describe('cycle history provenance', () => {
  it('reports age and staleness from an injected now', () => {
    expect(cycleHistoryAgeDays(new Date('2026-08-30T12:00:00Z'))).toBe(1)
    expect(cycleHistoryIsStale(new Date('2026-09-30T00:00:00Z'))).toBe(false)
    expect(cycleHistoryIsStale(new Date('2027-06-01T00:00:00Z'))).toBe(true)
  })

  it('provenance names its source and carries the whole-table date', () => {
    const p = getCycleHistoryProvenance(new Date('2026-08-30T00:00:00Z'))
    expect(p.verifiedAt).toBe('2026-08-29')
    expect(p.source.toLowerCase()).toContain('hand-compiled')
    expect(p.stale).toBe(false)
  })
})
