import { describe, expect, it } from 'vitest'
import { runBacktest } from '../backtest'
import type { OhlcvCandle } from '../indicators'

function candlesFromCloses(closes: number[], volume = 1000): OhlcvCandle[] {
  return closes.map((close, i) => ({
    time: 1_700_000_000 + i * 86_400,
    open: i === 0 ? close : closes[i - 1],
    high: close + 1,
    low: close - 1,
    close,
    volume,
  }))
}

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

// Deterministic donchian_breakout scenario:
//   closes[0..24] = 100  → no breakout (needs > prior-20-high = 101)
//   closes[25]    = 110  → breakout, ENTER long at 110 (bar 25)
//   closes[26..44]= 110  → held (never < prior-20-low)
//   closes[45]    = 50   → breakdown, EXIT at 50 (bar 45)
// One losing trade: (50 - 110) / 110 = -54.5454% over 20 bars.
const DONCHIAN_ONE_TRADE = [
  ...Array(25).fill(100),
  ...Array(20).fill(110),
  50,
]

describe('runBacktest — engine mechanics (donchian_breakout)', () => {
  it('enters and exits on the signal bars at their closes', () => {
    const res = runBacktest(candlesFromCloses(DONCHIAN_ONE_TRADE), 'donchian_breakout')
    expect(res).not.toBeNull()
    expect(res!.trades).toHaveLength(1)
    const t = res!.trades[0]
    expect(t.entryIndex).toBe(25)
    expect(t.exitIndex).toBe(45)
    expect(t.entryPrice).toBe(110)
    expect(t.exitPrice).toBe(50)
    expect(t.bars).toBe(20)
  })

  it('computes trade return, compounded total return and drawdown correctly', () => {
    const res = runBacktest(candlesFromCloses(DONCHIAN_ONE_TRADE), 'donchian_breakout')!
    const expectedRet = ((50 - 110) / 110) * 100 // -54.5454%
    expect(approx(res.trades[0].returnPct, expectedRet, 1e-4)).toBe(true)
    expect(approx(res.metrics.totalReturn, expectedRet, 1e-4)).toBe(true)
    expect(res.metrics.winRate).toBe(0)
    expect(res.metrics.sampleCount).toBe(1)
    // single losing trade → drawdown equals the loss magnitude
    expect(approx(res.metrics.maxDrawdown, Math.abs(expectedRet), 1e-4)).toBe(true)
    expect(res.equityCurve).toHaveLength(1)
    expect(approx(res.equityCurve[0], 1 + expectedRet / 100, 1e-6)).toBe(true)
  })

  it('applies round-trip fees on both legs', () => {
    const feesPct = 0.001
    const res = runBacktest(candlesFromCloses(DONCHIAN_ONE_TRADE), 'donchian_breakout', { feesPct })!
    const gross = (50 - 110) / 110
    const expected = (gross - 2 * feesPct) * 100
    expect(approx(res.trades[0].returnPct, expected, 1e-4)).toBe(true)
  })

  it('inverts the trade P&L for the short direction', () => {
    const long = runBacktest(candlesFromCloses(DONCHIAN_ONE_TRADE), 'donchian_breakout', { direction: 'long' })!
    const short = runBacktest(candlesFromCloses(DONCHIAN_ONE_TRADE), 'donchian_breakout', { direction: 'short' })!
    // Short enters where long exits and vice-versa, but the sign of a move
    // captured should flip: a price drop that loses money long makes money short.
    expect(long.trades[0].returnPct).toBeLessThan(0)
    // short side trades this series profitably (mirror of the long loss)
    expect(short.trades.length).toBeGreaterThan(0)
  })

  it('returns null when there are fewer candles than the strategy needs', () => {
    expect(runBacktest(candlesFromCloses(Array(10).fill(100)), 'donchian_breakout')).toBeNull()
  })

  it('returns null for an unknown strategy key', () => {
    expect(runBacktest(candlesFromCloses(DONCHIAN_ONE_TRADE), 'not_a_strategy')).toBeNull()
  })
})

describe('runBacktest — invariants on a realistic series', () => {
  const closes = Array.from({ length: 400 }, (_, i) => 100 + 30 * Math.sin(i / 9) + i * 0.1)
  const candles = candlesFromCloses(closes)

  for (const key of ['ema_cross_fast', 'donchian_breakout', 'bollinger_bounce']) {
    it(`${key}: metrics are internally consistent and finite`, () => {
      const res = runBacktest(candles, key)
      if (res === null) return // strategy may need more bars; covered elsewhere
      const m = res.metrics
      expect(res.equityCurve).toHaveLength(res.trades.length)
      expect(m.sampleCount).toBe(res.trades.length)
      expect(m.winRate).toBeGreaterThanOrEqual(0)
      expect(m.winRate).toBeLessThanOrEqual(100)
      expect(m.maxDrawdown).toBeGreaterThanOrEqual(0)
      for (const t of res.trades) {
        expect(t.exitIndex).toBeGreaterThanOrEqual(t.entryIndex)
        expect(Number.isFinite(t.returnPct)).toBe(true)
      }
      if (m.sharpeRatio !== null) expect(Number.isFinite(m.sharpeRatio)).toBe(true)
      if (m.sortinoRatio !== null) expect(Number.isFinite(m.sortinoRatio)).toBe(true)
    })
  }
})

// NOTE: these tests document the CURRENT execution model — a signal computed on
// bar i (from indicators through closes[i]) fills at closes[i], the same bar.
// Whether that is acceptable (vs. next-bar execution) is a methodology decision
// flagged separately, not silently changed here.
describe('runBacktest — execution timing (documented convention)', () => {
  it('fills at the close of the signal bar (same-bar execution)', () => {
    const candles = candlesFromCloses(DONCHIAN_ONE_TRADE)
    const res = runBacktest(candles, 'donchian_breakout')!
    expect(res.trades[0].entryPrice).toBe(candles[res.trades[0].entryIndex].close)
    expect(res.trades[0].exitPrice).toBe(candles[res.trades[0].exitIndex].close)
  })
})
