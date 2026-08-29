import { describe, it, expect } from 'vitest'
import { halvingPosition, drawdownComparison, rotationRead, piCycleState, CYCLE_COPY } from '../cycleMetrics'
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

describe('rotationRead (30-day variant)', () => {
  const row = (id: string, over: Partial<import('../cycleMetrics').RotationInput> = {}) => ({
    id, marketCapRank: 10, priceChange30d: 5, isStablecoin: false, ...over,
  })
  const universe = (n: number, change: number) => [
    row('btc', { marketCapRank: 1, priceChange30d: 0 }),
    ...Array.from({ length: n }, (_, i) => row(`alt${i}`, { marketCapRank: i + 2, priceChange30d: change })),
  ]

  it('reads 100% when every eligible coin beats BTC, 0% when none do', () => {
    expect(rotationRead(universe(20, 10))!.pctOutperformingBtc).toBe(100)
    expect(rotationRead(universe(20, -10))!.pctOutperformingBtc).toBe(0)
  })

  it('returns null without BTC — there is nothing to outperform', () => {
    const rows = universe(20, 10).filter((r) => r.id !== 'btc')
    expect(rotationRead(rows)).toBeNull()
  })

  it('returns null under 10 eligible coins rather than a percentage over noise', () => {
    expect(rotationRead(universe(9, 10))).toBeNull()
    expect(rotationRead(universe(10, 10))).not.toBeNull()
  })

  it('excludes stablecoins and out-of-rank coins from the denominator', () => {
    const rows = [
      ...universe(10, 10),
      row('usdt', { isStablecoin: true, priceChange30d: 0.1 }),
      row('tiny', { marketCapRank: 300, priceChange30d: 400 }),
    ]
    const r = rotationRead(rows)!
    expect(r.eligible).toBe(10)
    expect(r.pctOutperformingBtc).toBe(100)
  })

  it('counts missing 30d data as untested, never as underperformance', () => {
    const rows = [...universe(12, 10), row('gap1', { priceChange30d: null }), row('gap2', { priceChange30d: null })]
    const r = rotationRead(rows)!
    expect(r.eligible).toBe(12)
    expect(r.untested).toBe(2)
    // The two gaps did not drag the percentage down.
    expect(r.pctOutperformingBtc).toBe(100)
  })

  it('ties do not count as outperformance', () => {
    const rows = [row('btc', { marketCapRank: 1, priceChange30d: 5 }), ...Array.from({ length: 12 }, (_, i) => row(`alt${i}`, { marketCapRank: i + 2, priceChange30d: 5 }))]
    expect(rotationRead(rows)!.pctOutperformingBtc).toBe(0)
  })
})

describe('piCycleState', () => {
  it('returns null under 350 daily closes — no padded-tail average', () => {
    expect(piCycleState(Array(349).fill(100))).toBeNull()
    expect(piCycleState(Array(350).fill(100))).not.toBeNull()
  })

  it('reads uncrossed on a flat series (111DMA = half of 2×350DMA)', () => {
    const s = piCycleState(Array(400).fill(100))!
    expect(s.ma111).toBeCloseTo(100)
    expect(s.ma350x2).toBeCloseTo(200)
    expect(s.crossed).toBe(false)
    expect(s.gapPct).toBe(-50)
  })

  it('detects the cross when recent price runs far enough above the long base', () => {
    // 350 days at 100, then 111 days at 250: ma111=250, 2*ma350≈2*(147.6)=295 → not crossed.
    // Push recent to 350: ma111=350, 2*ma350≈2*(179.3)=358.6 → still short. At 400: 2*195.2=390.4 < 400 → crossed.
    const series = (recent: number) => [...Array(350).fill(100), ...Array(111).fill(recent)]
    expect(piCycleState(series(250))!.crossed).toBe(false)
    expect(piCycleState(series(400))!.crossed).toBe(true)
  })

  it('ignores non-finite and non-positive closes rather than averaging them', () => {
    const dirty = [...Array(360).fill(100), NaN, 0, -5, Infinity]
    const s = piCycleState(dirty)!
    expect(s.daysOfHistory).toBe(360)
    expect(s.ma111).toBeCloseTo(100)
  })
})
