import { describe, expect, it } from 'vitest'
import {
  sma,
  ema,
  wma,
  rsi,
  macd,
  bollingerBands,
  atr,
  obv,
  stdDev,
  roc,
  momentum,
  adx,
  trix,
  dema,
  tema,
  type OhlcvCandle,
} from '../indicators'

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Build minimal candles from close prices; high/low straddle close by ±1. */
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

/** Reference EMA computed the textbook way: seed = SMA of first `period`
 *  finite values, then recursive. Used as an oracle, independent of the impl. */
function refEma(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const out: (number | null)[] = new Array(values.length).fill(null)
  let prev: number | null = null
  let seed: number[] = []
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (prev === null) {
      if (!Number.isFinite(v)) continue
      seed.push(v)
      if (seed.length === period) {
        prev = seed.reduce((s, x) => s + x, 0) / period
        out[i] = prev
      }
    } else {
      prev = v * k + prev * (1 - k)
      out[i] = prev
    }
  }
  return out
}

const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

// ── Simple / weighted moving averages ────────────────────────────────────────

describe('sma', () => {
  it('nulls until the window fills, then averages the trailing window', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4])
  })
  it('returns all null when input is shorter than the period', () => {
    expect(sma([1, 2], 3)).toEqual([null, null])
  })
})

describe('ema', () => {
  it('seeds with the SMA of the first `period` values, then goes recursive', () => {
    // period 3, k=0.5: seed=(1+2+3)/3=2, then 4*.5+2*.5=3, 5*.5+3*.5=4
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4])
  })

  it('does not let leading NaN/undefined poison the whole series (root-cause of MACD/TRIX)', () => {
    // A derived series (like the MACD line) is null/NaN during warm-up.
    const withWarmup = [NaN, NaN, NaN, 10, 11, 12, 13, 14]
    const out = ema(withWarmup, 3)
    const firstReal = out.findIndex((v) => v !== null)
    expect(firstReal).toBeGreaterThanOrEqual(0) // some value must be produced
    // every produced value must be finite — not NaN
    for (const v of out) if (v !== null) expect(Number.isFinite(v)).toBe(true)
  })
})

describe('wma', () => {
  it('weights the most recent value highest', () => {
    // period 3, weights 1,2,3 (sum 6): (1*1+2*2+3*3)/6 = 14/6
    const out = wma([1, 2, 3, 4, 5], 3)
    expect(out[0]).toBeNull()
    expect(out[1]).toBeNull()
    expect(approx(out[2]!, 14 / 6)).toBe(true)
    expect(approx(out[3]!, 20 / 6)).toBe(true)
    expect(approx(out[4]!, 26 / 6)).toBe(true)
  })
})

// ── RSI (Wilder) ──────────────────────────────────────────────────────────────

describe('rsi', () => {
  it('is 100 for a monotonically rising series (no losses)', () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1)
    const out = rsi(values, 14)
    expect(out[13]).toBeNull() // first RSI at index = period
    expect(approx(out[14]!, 100)).toBe(true)
    expect(approx(out[19]!, 100)).toBe(true)
  })
  it('is 0 for a monotonically falling series (no gains)', () => {
    const values = Array.from({ length: 20 }, (_, i) => 20 - i)
    const out = rsi(values, 14)
    expect(approx(out[14]!, 0)).toBe(true)
  })
})

// ── Bollinger Bands (population stddev — the canonical definition) ────────────

describe('bollingerBands', () => {
  it('uses population stddev; middle band equals the SMA', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9] // mean 5, population variance 4, std 2
    const bb = bollingerBands(values, 8, 2)
    expect(approx(bb.middle[7]!, 5)).toBe(true)
    expect(approx(bb.upper[7]!, 9)).toBe(true) // 5 + 2*2
    expect(approx(bb.lower[7]!, 1)).toBe(true) // 5 - 2*2
  })
})

describe('stdDev', () => {
  it('computes the population standard deviation over the window', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9]
    const out = stdDev(values, 8)
    expect(approx(out[7]!, 2)).toBe(true)
  })
})

// ── ROC / momentum ────────────────────────────────────────────────────────────

describe('roc', () => {
  it('is the percentage change over `period` bars', () => {
    const out = roc([10, 11, 12, 13], 1)
    expect(out[0]).toBeNull()
    expect(approx(out[1]!, 10)).toBe(true) // (11-10)/10 * 100
  })
})

describe('momentum', () => {
  it('is the absolute change over `period` bars', () => {
    const out = momentum([10, 11, 14], 1)
    expect(out[1]).toBe(1)
    expect(out[2]).toBe(3)
  })
})

// ── OBV ───────────────────────────────────────────────────────────────────────

describe('obv', () => {
  it('adds volume on up-closes and subtracts on down-closes', () => {
    const candles = candlesFromCloses([10, 11, 10, 12])
    // 0, +1000, -1000, +1000 → [0, 1000, 0, 1000]
    expect(obv(candles)).toEqual([0, 1000, 0, 1000])
  })
})

// ── ATR: must use Wilder's smoothing, not a plain SMA ────────────────────────

describe('atr', () => {
  it("matches Wilder's smoothing (first value = SMA of first `period` TRs, then recursive)", () => {
    const closes = [10, 12, 11, 13, 15, 14, 16, 18, 17, 19, 21, 20, 22, 24, 23, 25]
    const candles = candlesFromCloses(closes)
    const period = 5

    // Oracle: true ranges, then Wilder.
    const tr = candles.map((c, i) =>
      i === 0
        ? c.high - c.low
        : Math.max(
            c.high - c.low,
            Math.abs(c.high - candles[i - 1].close),
            Math.abs(c.low - candles[i - 1].close),
          ),
    )
    const expected: (number | null)[] = new Array(candles.length).fill(null)
    let prev = tr.slice(0, period).reduce((s, v) => s + v, 0) / period
    expected[period - 1] = prev
    for (let i = period; i < tr.length; i++) {
      prev = (prev * (period - 1) + tr[i]) / period
      expected[i] = prev
    }

    const out = atr(candles, period)
    for (let i = 0; i < out.length; i++) {
      if (expected[i] === null) continue
      expect(out[i]).not.toBeNull()
      expect(approx(out[i]!, expected[i]!, 1e-6)).toBe(true)
    }
  })
})

// ── ADX: shape + bounded output ──────────────────────────────────────────────

describe('adx', () => {
  it('produces DI/ADX values within [0,100] once warmed up', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + 10 * Math.sin(i / 5))
    const candles = candlesFromCloses(closes)
    const { adx: a, plusDI, minusDI } = adx(candles, 14)
    const vals = [...a, ...plusDI, ...minusDI].filter((v): v is number => v !== null)
    expect(vals.length).toBeGreaterThan(0)
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })
})

// ── MACD: signal line and histogram must actually be produced ────────────────

describe('macd', () => {
  const values = Array.from({ length: 80 }, (_, i) => 100 + i + 5 * Math.sin(i / 3))

  it('produces a non-null MACD line after the slow EMA warms up', () => {
    const { macd: line } = macd(values)
    expect(line.some((v) => v !== null)).toBe(true)
  })

  it('produces a non-null signal line and histogram (regression: EMA-of-NaN poisoning)', () => {
    const { signal, histogram } = macd(values)
    expect(signal.some((v) => v !== null)).toBe(true)
    expect(histogram.some((v) => v !== null)).toBe(true)
  })

  it('signal equals the EMA of the MACD line over its valid region', () => {
    const { macd: line, signal } = macd(values, 12, 26, 9)
    const oracle = refEma(line.map((v) => (v ?? NaN)), 9)
    for (let i = 0; i < signal.length; i++) {
      if (signal[i] === null) continue
      expect(oracle[i]).not.toBeNull()
      expect(approx(signal[i]!, oracle[i]!, 1e-6)).toBe(true)
    }
  })
})

// ── TRIX: triple-smoothed EMA rate-of-change must be produced ────────────────

describe('trix', () => {
  it('produces non-null values for a sufficiently long series (regression)', () => {
    const values = Array.from({ length: 120 }, (_, i) => 100 + i + 3 * Math.sin(i / 4))
    const out = trix(values, 15)
    expect(out.some((v) => v !== null)).toBe(true)
    for (const v of out) if (v !== null) expect(Number.isFinite(v)).toBe(true)
  })
})

// ── DEMA / TEMA: finite, and no zero-dilution artifacts in warm-up ───────────

describe('dema / tema', () => {
  const values = Array.from({ length: 80 }, (_, i) => 100 + i)

  it('dema tracks a linear trend and stays finite', () => {
    const out = dema(values, 20)
    const real = out.filter((v): v is number => v !== null)
    expect(real.length).toBeGreaterThan(0)
    for (const v of real) expect(Number.isFinite(v)).toBe(true)
    // On a pure uptrend, a double-EMA should exceed a single EMA near the end.
    const e = ema(values, 20)
    expect(out[out.length - 1]!).toBeGreaterThan(e[e.length - 1]!)
  })

  it('tema stays finite across its valid region', () => {
    const out = tema(values, 20)
    for (const v of out) if (v !== null) expect(Number.isFinite(v)).toBe(true)
  })
})
