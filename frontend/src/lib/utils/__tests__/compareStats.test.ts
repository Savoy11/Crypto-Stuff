import { describe, expect, it } from 'vitest'
import {
  simpleReturns,
  windowStats,
  normalizeToCommonStart,
  pearson,
  correlationMatrix,
  toDailyCloses,
  commonStartTime,
  periodsPerYear,
  type ChartPoint,
} from '../compareStats'

const pts = (closes: number[], step = 86_400_000): ChartPoint[] =>
  closes.map((close, i) => ({ t: 1_700_000_000_000 + i * step, close }))

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

describe('simpleReturns', () => {
  it('is period-over-period fractional change and skips zero denominators', () => {
    const r = simpleReturns(pts([10, 11, 22]))
    expect(r).toHaveLength(2)
    expect(approx(r[0], 0.1)).toBe(true)
    expect(approx(r[1], 1)).toBe(true)
    expect(simpleReturns(pts([0, 5]))).toEqual([]) // prev 0 skipped
  })
})

describe('windowStats', () => {
  it('computes total return and max drawdown from the close series', () => {
    const s = windowStats(pts([100, 110, 99, 108]))!
    expect(approx(s.totalReturnPct, 8)).toBe(true) // 108/100 - 1
    expect(approx(s.maxDrawdownPct, (11 / 110) * 100)).toBe(true) // peak 110 → trough 99
    expect(Number.isFinite(s.volPct)).toBe(true)
    expect(s.sharpe).not.toBeNull()
    expect(s.sharpe!).toBeGreaterThan(0) // net positive drift
  })

  it('returns null below two points, and null Sharpe with no variance', () => {
    expect(windowStats(pts([100]))).toBeNull()
    const flat = windowStats(pts([100, 100, 100]))!
    expect(flat.totalReturnPct).toBe(0)
    expect(flat.maxDrawdownPct).toBe(0)
    expect(flat.sharpe).toBeNull()
  })
})

describe('normalizeToCommonStart', () => {
  it('rebases every series to 100 at the latest common start', () => {
    const out = normalizeToCommonStart([
      { symbol: 'A', points: [{ t: 1, close: 10 }, { t: 2, close: 20 }, { t: 3, close: 30 }] },
      { symbol: 'B', points: [{ t: 2, close: 100 }, { t: 3, close: 50 }] },
    ])
    expect(out.present).toEqual(['A', 'B'])
    expect(out.rows).toHaveLength(2) // common window starts at t=2
    const t2 = out.rows.find((r) => r.t === 2)!
    const t3 = out.rows.find((r) => r.t === 3)!
    expect(t2.A).toBe(100)
    expect(t2.B).toBe(100)
    expect(t3.A).toBe(150) // 30/20
    expect(t3.B).toBe(50) // 50/100
  })

  it('drops series with fewer than two points', () => {
    const out = normalizeToCommonStart([{ symbol: 'X', points: [{ t: 1, close: 5 }] }])
    expect(out.rows).toEqual([])
    expect(out.present).toEqual([])
  })
})

describe('pearson', () => {
  it('is +1 for perfectly correlated and -1 for anti-correlated', () => {
    expect(approx(pearson([1, 2, 3], [2, 4, 6])!, 1)).toBe(true)
    expect(approx(pearson([1, 2, 3], [3, 2, 1])!, -1)).toBe(true)
  })
  it('is null for a constant (zero-variance) input', () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
  })
})

describe('correlationMatrix', () => {
  it('has a unit diagonal and correlates aligned return series', () => {
    const { symbols, matrix } = correlationMatrix([
      { symbol: 'A', points: pts([1, 2, 3, 4]) },
      { symbol: 'B', points: pts([10, 20, 30, 40]) }, // identical proportional moves
    ])
    expect(symbols).toEqual(['A', 'B'])
    expect(matrix[0][0]).toBe(1)
    expect(matrix[1][1]).toBe(1)
    expect(approx(matrix[0][1]!, 1)).toBe(true)
  })

  it('returns null when two series share fewer than three timestamps', () => {
    const { matrix } = correlationMatrix([
      { symbol: 'A', points: [{ t: 1, close: 1 }, { t: 2, close: 2 }] },
      { symbol: 'B', points: [{ t: 9, close: 1 }, { t: 10, close: 2 }] },
    ])
    expect(matrix[0][1]).toBeNull()
  })
})

// ─── Session-review fixes: cross-calendar alignment + spacing-aware annualization ──

const DAY = 86_400_000

describe('toDailyCloses', () => {
  it('snaps midnight-stamped and market-open-stamped points to the same date key', () => {
    // The production failure: crypto at UTC midnight vs an equity bar at 13:30 UTC
    // the same day shared zero exact timestamps.
    const day0 = Date.UTC(2026, 0, 5)
    const crypto = toDailyCloses([{ t: day0, close: 100 }])
    const stock = toDailyCloses([{ t: day0 + 13.5 * 3_600_000, close: 200 }])
    expect(crypto[0].t).toBe(stock[0].t)
  })

  it('collapses hourly points to one daily close (last value wins)', () => {
    const day0 = Date.UTC(2026, 0, 5)
    const hourly = Array.from({ length: 24 }, (_, h) => ({ t: day0 + h * 3_600_000, close: 100 + h }))
    const out = toDailyCloses(hourly)
    expect(out).toHaveLength(1)
    expect(out[0].close).toBe(123) // 23:00 close
  })

  it('sorts unsorted input and drops non-finite points', () => {
    const day0 = Date.UTC(2026, 0, 5)
    const out = toDailyCloses([
      { t: day0 + 2 * DAY, close: 3 },
      { t: day0, close: 1 },
      { t: NaN, close: 9 },
      { t: day0 + DAY, close: NaN },
    ])
    expect(out.map((p) => p.close)).toEqual([1, 3])
  })

  it('makes cross-calendar correlation computable (the null-matrix repro)', () => {
    const day0 = Date.UTC(2026, 0, 5)
    // Perfectly correlated closes, incompatible raw timestamps.
    const cryptoRaw = [0, 1, 2, 3, 4].map((i) => ({ t: day0 + i * DAY, close: 100 + i * 2 }))
    const stockRaw = [0, 1, 2, 3, 4].map((i) => ({ t: day0 + i * DAY + 13.5 * 3_600_000, close: 50 + i }))
    const before = correlationMatrix([
      { symbol: 'BTC', points: cryptoRaw },
      { symbol: 'VOO', points: stockRaw },
    ])
    expect(before.matrix[0][1]).toBeNull() // exact-timestamp join: zero common keys
    const after = correlationMatrix([
      { symbol: 'BTC', points: toDailyCloses(cryptoRaw) },
      { symbol: 'VOO', points: toDailyCloses(stockRaw) },
    ])
    expect(after.matrix[0][1]).not.toBeNull()
    expect(after.matrix[0][1]!).toBeGreaterThan(0.99)
  })
})

describe('commonStartTime', () => {
  it('returns the latest first-timestamp across usable series', () => {
    const a = pts([1, 2, 3])
    const b = pts([1, 2]).map((p) => ({ ...p, t: p.t + 5 * DAY }))
    expect(commonStartTime([{ symbol: 'A', points: a }, { symbol: 'B', points: b }])).toBe(b[0].t)
    expect(commonStartTime([{ symbol: 'A', points: [] }])).toBeNull()
  })
})

describe('periodsPerYear (spacing-aware annualization)', () => {
  it('detects daily, weekly, and monthly spacing', () => {
    expect(periodsPerYear(pts([1, 2, 3, 4], DAY))).toBe(252)
    expect(periodsPerYear(pts([1, 2, 3, 4], 7 * DAY))).toBe(52)
    expect(periodsPerYear(pts([1, 2, 3, 4], 30 * DAY))).toBe(12)
  })

  it('windowStats annualizes weekly bars with sqrt(52), not sqrt(252)', () => {
    const weekly = pts([100, 102, 99, 104, 101, 105], 7 * DAY)
    const daily = pts([100, 102, 99, 104, 101, 105], DAY)
    const w = windowStats(weekly)!
    const d = windowStats(daily)!
    // Identical returns, different spacing: weekly vol must be sqrt(252/52) smaller.
    expect(d.volPct / w.volPct).toBeCloseTo(Math.sqrt(252 / 52), 6)
  })
})
