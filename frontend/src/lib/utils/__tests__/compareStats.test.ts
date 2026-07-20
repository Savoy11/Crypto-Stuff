import { describe, expect, it } from 'vitest'
import {
  simpleReturns,
  windowStats,
  normalizeToCommonStart,
  pearson,
  correlationMatrix,
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
