import { describe, it, expect } from 'vitest'
import {
  rsi, mfi, ichimoku, vwap, rollingVwap, isIntradaySeries, computeSignalSummary,
  type OhlcvCandle,
} from '../indicators'

// Coverage for the three places the 2026-07-22 review found defects, all of
// which had no tests at all: degenerate (flat) input, Ichimoku displacement,
// and VWAP on non-intraday candles.

const DAY = 86_400

/** Flat series — every close identical. A pegged stablecoin or a halted feed. */
function flat(n: number, price = 5, startTime = 1_700_000_000): OhlcvCandle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: startTime + i * DAY,
    open: price, high: price, low: price, close: price, volume: 1000,
  }))
}

/** Steadily rising series, close = base + i. */
function rising(n: number, base = 100, startTime = 1_700_000_000, step = DAY): OhlcvCandle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: startTime + i * step,
    open: base + i, high: base + i + 1, low: base + i - 1, close: base + i, volume: 1000,
  }))
}

describe('degenerate (flat) input', () => {
  it('RSI reads neutral, not maximally overbought, when nothing moves', () => {
    // avgGain and avgLoss are BOTH zero — undefined, not "all gains". The old
    // code returned 100, which is >70 and drove a Sell recommendation.
    const closes = flat(60).map((c) => c.close)
    expect(rsi(closes, 14).at(-1)).toBe(50)
  })

  it('MFI reads neutral on a flat series', () => {
    expect(mfi(flat(60), 14).at(-1)).toBe(50)
  })

  it('RSI still reads 100 when there really are only gains', () => {
    const closes = rising(60).map((c) => c.close)
    expect(rsi(closes, 14).at(-1)).toBe(100)
  })

  it('a motionless price does not produce a Sell recommendation', () => {
    const summary = computeSignalSummary(flat(120))
    expect(summary.overall).not.toBe('sell')
    expect(summary.overall).not.toBe('strong_sell')
  })

  it('never renders NaN in a signal description', () => {
    // A zero-width Bollinger band made this the literal text "NaN% of band".
    for (const sig of computeSignalSummary(flat(120)).signals) {
      expect(Number.isNaN(sig.value), `${sig.name} value is NaN`).toBe(false)
      expect(sig.description, `${sig.name} description`).not.toMatch(/NaN/)
    }
  })
})

describe('ichimoku displacement', () => {
  const candles = rising(80)
  const ich = ichimoku(candles)

  it('displaces the cloud 26 bars FORWARD', () => {
    // Senkou A at bar 77 must be the value computed at bar 51 (tenkan 147,
    // kijun 138.5 -> 142.75), not the one computed at bar 77 (168.75).
    expect(ich.senkouA[77]).toBeCloseTo(142.75, 6)
  })

  it('leaves the first 26 bars of the cloud empty', () => {
    expect(ich.senkouA.slice(0, 26).every((v) => v === null)).toBe(true)
    expect(ich.senkouB.slice(0, 26).every((v) => v === null)).toBe(true)
  })

  it('lags chikou by 26 bars rather than copying the close series', () => {
    // chikou[i] is the close 26 bars LATER; a verbatim copy of closes[i] has
    // no lag and is not a lagging span.
    expect(ich.chikou[0]).toBe(candles[26].close)
    expect(ich.chikou[0]).not.toBe(candles[0].close)
  })

  it('agrees with the tenkan/kijun it is derived from', () => {
    const t = ich.tenkan[51]!, k = ich.kijun[51]!
    expect(ich.senkouA[51 + 26]).toBeCloseTo((t + k) / 2, 6)
  })
})

describe('VWAP variant selection', () => {
  it('recognises daily candles as non-intraday', () => {
    expect(isIntradaySeries(rising(10))).toBe(false)
  })

  it('recognises hourly candles as intraday', () => {
    expect(isIntradaySeries(rising(10, 100, 1_700_000_000, 3600))).toBe(true)
  })

  it('session VWAP degenerates to typical price on daily bars — why the switch exists', () => {
    const candles = rising(3)
    const session = vwap(candles)
    const typical = candles.map((c) => (c.high + c.low + c.close) / 3)
    expect(session).toEqual(typical) // documents the degeneracy
  })

  it('rolling VWAP genuinely weights by volume', () => {
    const candles = rising(5)
    // Make one bar dominate the volume; the average must be pulled toward it.
    candles[4].volume = 1_000_000
    const rv = rollingVwap(candles, 5).at(-1)!
    const typicalLast = (candles[4].high + candles[4].low + candles[4].close) / 3
    const unweighted = candles.reduce((s, c) => s + (c.high + c.low + c.close) / 3, 0) / 5
    expect(Math.abs(rv - typicalLast)).toBeLessThan(Math.abs(unweighted - typicalLast))
  })

  it('rolling VWAP has no value before a full window', () => {
    expect(rollingVwap(rising(10), 5).slice(0, 4).every((v) => v === null)).toBe(true)
  })
})
