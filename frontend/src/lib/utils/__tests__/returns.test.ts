import { describe, expect, it } from 'vitest'
import { computeReturns, type CloseSeries } from '../returns'

// The 1M/3M/YTD/1Y percentages users compare funds on, from /live-data/security-returns.
// Flagged in the W1 review as a clear house-rule violation (F-note-1, part of D-24):
// zero tests over the YTD prior-year-close boundary and the short-series null logic.

const DAY = 86_400_000

/**
 * A daily series of `n` closes ending on `endDate`, priced by `priceAt(i)`.
 * Timestamps are epoch SECONDS, matching what the route builds.
 */
function series(n: number, priceAt: (i: number) => number, endDate = '2026-08-15'): CloseSeries {
  const end = Date.parse(`${endDate}T00:00:00Z`)
  const closes: number[] = []
  const timestamps: number[] = []
  for (let i = 0; i < n; i++) {
    closes.push(priceAt(i))
    timestamps.push(Math.floor((end - (n - 1 - i) * DAY) / 1000))
  }
  return { closes, timestamps }
}

describe('computeReturns — trailing windows', () => {
  it('measures 1M at 21 trading days back and 3M at 63', () => {
    // Flat at 100 except the two lookback points, so each window is isolated.
    const s = series(300, (i) => (i === 300 - 1 - 21 ? 80 : i === 300 - 1 - 63 ? 50 : 100))
    const r = computeReturns(s, 2026)
    expect(r.m1).toBeCloseTo(25) // 80 → 100
    expect(r.m3).toBeCloseTo(100) // 50 → 100
  })

  it('measures 1Y at 251 trading days back', () => {
    const s = series(300, (i) => (i === 300 - 1 - 251 ? 200 : 100))
    expect(computeReturns(s, 2026).y1).toBeCloseTo(-50)
  })

  it('reports a loss with the correct sign', () => {
    const s = series(300, (i) => (i === 300 - 1 - 21 ? 125 : 100))
    expect(computeReturns(s, 2026).m1).toBeCloseTo(-20)
  })

  it('rounds to two decimals', () => {
    const s = series(300, (i) => (i === 300 - 1 - 21 ? 3 : 10))
    expect(computeReturns(s, 2026).m1).toBe(233.33)
  })
})

describe('computeReturns — YTD boundary', () => {
  it('baselines YTD on the LAST close of the prior year, not the first of this one', () => {
    // 60 days ending 2026-02-09 starts 2025-12-12, so the series straddles the
    // new year and there is a genuine prior-year close to baseline against.
    const s = series(60, (i) => 100 + i, '2026-02-09')
    const priorYearIdx = s.timestamps.findIndex(
      (t) => new Date(t * 1000).getUTCFullYear() === 2026,
    ) - 1
    const base = s.closes[priorYearIdx]
    const last = s.closes[s.closes.length - 1]
    expect(new Date(s.timestamps[priorYearIdx] * 1000).getUTCFullYear()).toBe(2025)
    expect(computeReturns(s, 2026).ytd).toBeCloseTo(Number((((last - base) / base) * 100).toFixed(2)))
  })

  it('falls back to the first close when the series starts inside the current year', () => {
    const s = series(30, (i) => 100 + i, '2026-02-09')
    // Every timestamp is in 2026 → idx === 0 → baseline is closes[0].
    expect(s.timestamps.every((t) => new Date(t * 1000).getUTCFullYear() === 2026)).toBe(true)
    expect(computeReturns(s, 2026).ytd).toBeCloseTo(29) // 100 → 129
  })

  it('returns null when the series has no closes in the current year at all', () => {
    // A delisted fund whose last print predates January.
    const s = series(300, () => 100, '2025-11-20')
    expect(computeReturns(s, 2026).ytd).toBeNull()
  })

  it('returns null when timestamps and closes disagree in length', () => {
    // The route drops malformed rows from both arrays together, so a mismatch
    // means something upstream is wrong — YTD is refused rather than guessed.
    const s = series(300, () => 100)
    expect(computeReturns({ closes: s.closes, timestamps: s.timestamps.slice(1) }, 2026).ytd).toBeNull()
  })
})

describe('computeReturns — short series', () => {
  it('nulls every window that the series is too short to cover', () => {
    const r = computeReturns(series(10, () => 100), 2026)
    expect(r.m1).toBeNull()
    expect(r.m3).toBeNull()
    expect(r.y1).toBeNull()
  })

  it('nulls 3M and 1Y but still reports 1M when only a month is on record', () => {
    const s = series(30, (i) => (i === 30 - 1 - 21 ? 90 : 100))
    const r = computeReturns(s, 2026)
    expect(r.m1).toBeCloseTo(11.11)
    expect(r.m3).toBeNull()
    expect(r.y1).toBeNull()
  })

  it('nulls 1Y below 200 closes rather than measuring a shorter window', () => {
    expect(computeReturns(series(199, (i) => 100 + i), 2026).y1).toBeNull()
  })

  it('⚠ between 200 and 251 closes, 1Y falls back to the series start', () => {
    // Documented caveat, pinned so a change is deliberate: a fund with ~10
    // months of history reports that partial period in the "1Y" column. The
    // alternative (null) hides a young fund's only meaningful return, so the
    // fallback is intentional — but it is NOT a full year.
    const s = series(220, (i) => (i === 0 ? 100 : 150))
    expect(computeReturns(s, 2026).y1).toBeCloseTo(50)
  })

  it('handles an empty series without throwing', () => {
    const r = computeReturns({ closes: [], timestamps: [] }, 2026)
    expect(r).toEqual({ m1: null, m3: null, ytd: null, y1: null })
  })
})

describe('computeReturns — degenerate prices', () => {
  it('returns null rather than Infinity when the baseline close is zero', () => {
    const s = series(300, (i) => (i === 300 - 1 - 21 ? 0 : 100))
    expect(computeReturns(s, 2026).m1).toBeNull()
  })

  it('reports 0 for a flat series, not null', () => {
    const r = computeReturns(series(300, () => 100), 2026)
    expect(r.m1).toBe(0)
    expect(r.m3).toBe(0)
    expect(r.y1).toBe(0)
  })
})
