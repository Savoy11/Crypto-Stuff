import { describe, expect, it } from 'vitest'
import { adjustCandles } from '../ohlcvAdjust'
import type { OhlcvCandle } from '../indicators'

const c = (time: number, o: number, h: number, l: number, close: number, volume = 100): OhlcvCandle =>
  ({ time, open: o, high: h, low: l, close, volume })

describe('adjustCandles (equity split/dividend adjustment)', () => {
  it('removes a split cliff: a 4:1 split is rescaled to a continuous series', () => {
    // Pre-split raw prices ~400, post-split ~100. adjClose restates the pre-split
    // bars to the post-split basis (÷4), so the series is continuous.
    const raw = [c(1, 396, 404, 392, 400), c(2, 398, 406, 394, 402), c(3, 99, 101, 98, 100)]
    const adj = [100, 100.5, 100] // pre-split bars divided by 4
    const out = adjustCandles(raw, adj)
    expect(out[0].close).toBe(100)
    expect(out[0].open).toBeCloseTo(99, 6)   // 396 * (100/400)
    expect(out[0].high).toBeCloseTo(101, 6)  // 404 * 0.25
    expect(out[1].close).toBe(100.5)
    expect(out[2].close).toBe(100)           // post-split bar: factor ~1
    // No cliff: consecutive closes are within a few percent, not 4×.
    expect(Math.abs(out[1].close - out[2].close) / out[2].close).toBeLessThan(0.05)
  })

  it('preserves each candle high/low ordering after rescaling', () => {
    const raw = [c(1, 396, 404, 392, 400)]
    const out = adjustCandles(raw, [100])
    expect(out[0].high).toBeGreaterThanOrEqual(out[0].close)
    expect(out[0].low).toBeLessThanOrEqual(out[0].close)
    expect(out[0].high).toBeGreaterThanOrEqual(out[0].open)
  })

  it('passes a bar through unchanged when adjClose is missing/null/undefined', () => {
    const raw = [c(1, 10, 11, 9, 10), c(2, 20, 22, 18, 20)]
    const out = adjustCandles(raw, [null, undefined])
    expect(out).toEqual(raw)
  })

  it('never produces NaN on a non-finite adjClose or non-positive close', () => {
    const raw = [c(1, 10, 11, 9, 10), c(2, 5, 6, 4, 0)]
    const out = adjustCandles(raw, [NaN, 3])
    expect(out[0]).toEqual(raw[0])          // NaN adj → passthrough
    expect(out[1]).toEqual(raw[1])          // close 0 → passthrough (no divide-by-zero)
    for (const o of out) for (const v of [o.open, o.high, o.low, o.close]) expect(Number.isNaN(v)).toBe(false)
  })

  it('passes through a bar whose raw close is NaN even when adjClose is finite (review-hardened)', () => {
    // Reachable only via a malformed provider row (adjClose present, close absent):
    // previously f = adj/NaN produced NaN open/high/low.
    const raw = [c(1, 10, 11, 9, NaN)]
    const out = adjustCandles(raw, [5])
    expect(out[0]).toEqual(raw[0])
    expect(Number.isNaN(out[0].open)).toBe(false)
  })

  it('passes through on a zero or negative adjClose instead of zeroing the candle (review-hardened)', () => {
    const raw = [c(1, 10, 11, 9, 10), c(2, 10, 11, 9, 10)]
    const out = adjustCandles(raw, [0, -4])
    expect(out).toEqual(raw)   // factor-0 / negative would poison every indicator downstream
  })

  it('is a no-op when adjClose equals close (factor 1)', () => {
    const raw = [c(1, 10, 11, 9, 10.5), c(2, 20, 22, 18, 21)]
    const out = adjustCandles(raw, [10.5, 21])
    expect(out).toEqual(raw)
  })
})
