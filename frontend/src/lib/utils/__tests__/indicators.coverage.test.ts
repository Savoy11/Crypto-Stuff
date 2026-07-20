import { describe, expect, it } from 'vitest'
import {
  williamsr, cmo, ultimateOscillator, cci, connorsRsi, stochasticOscillator, fisherTransform,
  mfi, cmf, accDistLine, forceIndex, volumeOscillator, balanceOfPower, chaikinOscillator, vwap,
  easeOfMovement, klingerOscillator,
  kama, mcginleyDynamic, linearRegression, vortex, relativeVigorIndex, choppinessIndex, dpo,
  coppockCurve, massIndex, disparityIndex,
  keltnerChannels, donchianChannels, bollingerPercentB, pivotPoints, parabolicSar, elderRay,
  type OhlcvCandle,
} from '../indicators'

// Flexible candle builder. Each entry: {h,l,c, o?, v?}. time increments by 1 day.
type Bar = { h: number; l: number; c: number; o?: number; v?: number }
function C(bars: Bar[]): OhlcvCandle[] {
  return bars.map((b, i) => ({
    time: 1_700_000_000 + i * 86_400,
    open: b.o ?? b.c,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v ?? 1000,
  }))
}
const flat = (n: number, h: number, l: number, c: number, v = 1000): OhlcvCandle[] =>
  C(Array.from({ length: n }, () => ({ h, l, c, v })))
const approx = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) < eps
const nonNull = (xs: (number | null)[]) => xs.filter((v): v is number => v !== null)
const noNaN = (xs: (number | null)[]) => nonNull(xs).every((v) => Number.isFinite(v))

// ── Oscillators ───────────────────────────────────────────────────────────────

describe('williamsr', () => {
  it('is bounded [-100, 0] and matches a hand computation', () => {
    const out = williamsr(C([{ h: 10, l: 8, c: 9 }, { h: 11, l: 9, c: 10 }, { h: 12, l: 10, c: 11 }, { h: 13, l: 11, c: 12 }]), 3)
    expect(out[2]).toBe(-25)
    expect(out[3]).toBe(-25)
    for (const v of nonNull(out)) { expect(v).toBeGreaterThanOrEqual(-100); expect(v).toBeLessThanOrEqual(0) }
  })
})

describe('cmo', () => {
  it('matches hand-computed Chande momentum', () => {
    const out = cmo([1, 2, 3, 4, 3, 2], 3)
    expect(out[3]).toBe(100)
    expect(approx(out[4]!, 100 / 3)).toBe(true)
    expect(approx(out[5]!, -100 / 3)).toBe(true)
  })
})

describe('ultimateOscillator', () => {
  it('is bounded [0, 100]', () => {
    const candles = C(Array.from({ length: 40 }, (_, i) => ({ h: 100 + i + 1, l: 100 + i - 1, c: 100 + i })))
    for (const v of nonNull(ultimateOscillator(candles))) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100) }
  })
})

describe('cci', () => {
  it('matches a hand computation on a rising typical price', () => {
    const out = cci(C([{ h: 1, l: 1, c: 1 }, { h: 2, l: 2, c: 2 }, { h: 3, l: 3, c: 3 }, { h: 4, l: 4, c: 4 }]), 3)
    expect(approx(out[2]!, 100)).toBe(true)
    expect(approx(out[3]!, 100)).toBe(true)
  })
})

describe('connorsRsi', () => {
  it('is bounded [0, 100] with no NaN', () => {
    const values = Array.from({ length: 130 }, (_, i) => 100 + 10 * Math.sin(i / 5))
    const out = connorsRsi(values)
    expect(noNaN(out)).toBe(true)
    for (const v of nonNull(out)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100) }
  })
})

describe('stochasticOscillator (regression: ?? 0 zero-fill emitted %K too early)', () => {
  it('does not emit smoothed %K before the smoothing window is full of real values', () => {
    const { k } = stochasticOscillator(C([{ h: 10, l: 0, c: 5 }, { h: 10, l: 0, c: 10 }, { h: 10, l: 0, c: 0 }, { h: 10, l: 0, c: 5 }]), 2, 2, 2)
    // rawK = [null, 100, 0, 50]; correct smoothed %K first appears at index 2.
    expect(k[1]).toBeNull()
    expect(k[2]).not.toBeNull()
    expect(noNaN(k)).toBe(true)
  })
})

describe('fisherTransform (regression: malformed recursion)', () => {
  it('stays 0 when every close sits at the bar midpoint', () => {
    const out = fisherTransform(C(Array.from({ length: 20 }, () => ({ h: 2, l: 0, c: 1 }))), 9)
    for (const v of nonNull(out)) expect(approx(v, 0)).toBe(true)
  })
  it('is finite and positive for a rising series topping each bar', () => {
    const out = fisherTransform(C(Array.from({ length: 20 }, (_, i) => ({ h: i + 1, l: i - 1, c: i + 1 }))), 9)
    expect(noNaN(out)).toBe(true)
    expect(nonNull(out).at(-1)!).toBeGreaterThan(0)
  })
})

// ── Volume ──────────────────────────────────────────────────────────────────

describe('mfi', () => {
  it('is 100 for a strictly rising typical price', () => {
    const candles = C(Array.from({ length: 20 }, (_, i) => ({ h: 10 + i, l: 8 + i, c: 9 + i })))
    for (const v of nonNull(mfi(candles, 14))) expect(approx(v, 100)).toBe(true)
  })
})

describe('cmf', () => {
  it('tends to +1 when every close is the high', () => {
    const candles = C(Array.from({ length: 25 }, () => ({ h: 20, l: 10, c: 20 })))
    for (const v of nonNull(cmf(candles, 20))) expect(approx(v, 1)).toBe(true)
  })
})

describe('accDistLine', () => {
  it('increases monotonically when every close is the high with positive volume', () => {
    const adl = accDistLine(C(Array.from({ length: 10 }, () => ({ h: 10, l: 5, c: 10, v: 100 }))))
    for (let i = 1; i < adl.length; i++) expect(adl[i]).toBeGreaterThan(adl[i - 1])
  })
})

describe('forceIndex', () => {
  it('with period 1 (identity EMA) equals (close-prevClose)*volume', () => {
    const out = forceIndex(C([{ h: 11, l: 9, c: 10, v: 50 }, { h: 13, l: 11, c: 12, v: 50 }]), 1)
    expect(out[0]).toBe(0)
    expect(out[1]).toBe((12 - 10) * 50)
  })
})

describe('volumeOscillator', () => {
  it('is 0 when volume is constant', () => {
    const candles = flat(30, 11, 9, 10, 500)
    for (const v of nonNull(volumeOscillator(candles, 5, 10))) expect(approx(v, 0)).toBe(true)
  })
})

describe('balanceOfPower', () => {
  it('with smoothing 1 equals (close-open)/(high-low)', () => {
    const out = balanceOfPower(C([{ h: 12, l: 6, c: 10, o: 8 }]), 1)
    expect(approx(out[0]!, (10 - 8) / (12 - 6))).toBe(true)
  })
})

describe('chaikinOscillator', () => {
  it('is positive on a steadily accumulating series', () => {
    const candles = C(Array.from({ length: 30 }, () => ({ h: 10, l: 5, c: 10, v: 100 })))
    expect(nonNull(chaikinOscillator(candles, 3, 10)).at(-1)!).toBeGreaterThan(0)
  })
})

describe('vwap', () => {
  it('accumulates within a UTC day and resets across days', () => {
    const candles: OhlcvCandle[] = [
      { time: 0, open: 9, high: 10, low: 8, close: 9, volume: 100 },
      { time: 3600, open: 11, high: 12, low: 10, close: 11, volume: 100 },
      { time: 90000, open: 19, high: 20, low: 18, close: 19, volume: 50 },
    ]
    const out = vwap(candles)
    expect(approx(out[0]!, 9)).toBe(true)
    expect(approx(out[1]!, 10)).toBe(true)
    expect(approx(out[2]!, 19)).toBe(true)
  })
})

describe('easeOfMovement (regression: zero-volume bar produced Infinity/NaN)', () => {
  it('stays finite when a bar has zero volume', () => {
    const bars = Array.from({ length: 20 }, (_, i) => ({ h: 10 + i, l: 8 + i, c: 9 + i, v: i === 5 ? 0 : 1000 }))
    expect(noNaN(easeOfMovement(C(bars), 14))).toBe(true)
  })
})

describe('klingerOscillator (simplified KVO — documented)', () => {
  it('is 0 for constant volume and monotonic typical price', () => {
    const candles = C(Array.from({ length: 90 }, (_, i) => ({ h: 10 + i, l: 8 + i, c: 9 + i, v: 500 })))
    for (const v of nonNull(klingerOscillator(candles))) expect(approx(v, 0, 1e-6)).toBe(true)
  })
})

// ── Trend / MA ────────────────────────────────────────────────────────────────

describe('kama / mcginleyDynamic', () => {
  it('both hold flat on a constant series', () => {
    const values = Array(30).fill(10)
    for (const v of nonNull(kama(values, 10))) expect(approx(v, 10)).toBe(true)
    for (const v of nonNull(mcginleyDynamic(values, 14))) expect(approx(v, 10)).toBe(true)
  })
})

describe('linearRegression', () => {
  it('returns the exact line value on a perfectly linear series', () => {
    const values = [0, 2, 4, 6, 8, 10, 12, 14]
    const out = linearRegression(values, 5)
    expect(approx(out[4]!, 8)).toBe(true)
    expect(approx(out[7]!, 14)).toBe(true)
  })
})

describe('vortex', () => {
  it('viPlus/viMinus are non-negative and +VI leads in an uptrend', () => {
    const candles = C(Array.from({ length: 30 }, (_, i) => ({ h: 10 + i, l: 8 + i, c: 9 + i })))
    const { viPlus, viMinus } = vortex(candles, 14)
    for (const v of [...nonNull(viPlus), ...nonNull(viMinus)]) expect(v).toBeGreaterThanOrEqual(0)
    const lastP = nonNull(viPlus).at(-1)!, lastM = nonNull(viMinus).at(-1)!
    expect(lastP).toBeGreaterThan(lastM)
  })
})

describe('relativeVigorIndex', () => {
  it('is 0 when open equals close on every bar', () => {
    const candles = C(Array.from({ length: 20 }, () => ({ h: 11, l: 9, c: 10, o: 10 })))
    const { k } = relativeVigorIndex(candles, 10)
    for (const v of nonNull(k)) expect(approx(v, 0)).toBe(true)
  })
})

describe('choppinessIndex', () => {
  it('is bounded [0, 100]', () => {
    const candles = C(Array.from({ length: 40 }, (_, i) => ({ h: 100 + 5 * Math.sin(i) + 1, l: 100 + 5 * Math.sin(i) - 1, c: 100 + 5 * Math.sin(i) })))
    for (const v of nonNull(choppinessIndex(candles, 14))) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100) }
  })
})

describe('dpo', () => {
  it('is 0 on a constant series', () => {
    for (const v of nonNull(dpo(Array(40).fill(50), 20))) expect(approx(v, 0)).toBe(true)
  })
})

describe('coppockCurve (regression: zero-fill WMA warm-up)', () => {
  it('does not emit values before its window is full of real ROC data', () => {
    const values = Array.from({ length: 40 }, (_, i) => 100 + i)
    const out = coppockCurve(values, 10, 14, 11)
    expect(out[14]).toBeNull()
    expect(out[22]).toBeNull()
    expect(out[23]).not.toBeNull() // roc1 + wmaLen - 1
  })
})

describe('massIndex (regression: mean instead of rolling sum)', () => {
  it('reads ~slowPeriod (not ~1) on a constant-range series', () => {
    const candles = C(Array.from({ length: 50 }, () => ({ h: 1, l: 0, c: 0.5 })))
    const out = massIndex(candles, 9, 25)
    expect(approx(nonNull(out).at(-1)!, 25, 1e-6)).toBe(true)
  })
})

describe('disparityIndex (EMA variant — documented)', () => {
  it('is 0 on a constant series', () => {
    for (const v of nonNull(disparityIndex(Array(20).fill(100), 14))) expect(approx(v, 0)).toBe(true)
  })
})

// ── Bands / channels / levels ──────────────────────────────────────────────

describe('keltnerChannels', () => {
  it('upper > middle > lower where defined', () => {
    const candles = C(Array.from({ length: 40 }, (_, i) => ({ h: 100 + i + 2, l: 100 + i - 2, c: 100 + i })))
    const { upper, middle, lower } = keltnerChannels(candles, 20, 10, 1.5)
    for (let i = 0; i < candles.length; i++) {
      if (middle[i] === null) continue
      expect(upper[i]!).toBeGreaterThan(middle[i]!)
      expect(middle[i]!).toBeGreaterThan(lower[i]!)
    }
  })
})

describe('donchianChannels', () => {
  it('includes the current bar; upper >= lower', () => {
    const { upper, lower, middle } = donchianChannels(C([{ h: 10, l: 5, c: 7 }, { h: 12, l: 6, c: 9 }, { h: 8, l: 4, c: 6 }]), 2)
    expect(upper[1]).toBe(12); expect(lower[1]).toBe(5); expect(middle[1]).toBe(8.5)
    expect(upper[2]).toBe(12); expect(lower[2]).toBe(4)
    for (let i = 0; i < 3; i++) if (upper[i] !== null) expect(upper[i]!).toBeGreaterThanOrEqual(lower[i]!)
  })
})

describe('bollingerPercentB', () => {
  it('collapses to 0.5 on a flat series (zero-width band)', () => {
    const out = bollingerPercentB([5, 5, 5, 5], 2, 2)
    for (const v of nonNull(out)) expect(approx(v, 0.5)).toBe(true)
  })
})

describe('pivotPoints', () => {
  it('orders R3 > R2 > R1 > P > S1 > S2 > S3 and matches the classic formula', () => {
    // previous (second-to-last) bar drives the pivots: H=110,L=90,C=100
    const pp = pivotPoints(C([{ h: 110, l: 90, c: 100 }, { h: 105, l: 95, c: 100 }]))!
    expect(pp.pp).toBe(100)
    expect(pp.r1).toBe(110); expect(pp.s1).toBe(90)
    expect(pp.r2).toBe(120); expect(pp.s2).toBe(80)
    expect(pp.r3 > pp.r2 && pp.r2 > pp.r1 && pp.r1 > pp.pp).toBe(true)
    expect(pp.pp > pp.s1 && pp.s1 > pp.s2 && pp.s2 > pp.s3).toBe(true)
  })
})

describe('parabolicSar', () => {
  it('never penetrates price in a clean uptrend (SAR <= low)', () => {
    const candles = C(Array.from({ length: 15 }, (_, i) => ({ h: 10 + i, l: 9 + i, c: 9.5 + i })))
    const sar = parabolicSar(candles)
    for (let i = 1; i < candles.length; i++) if (sar[i] !== null) expect(sar[i]!).toBeLessThanOrEqual(candles[i].low)
  })
})

describe('elderRay', () => {
  it('bullPower - bearPower equals the bar range', () => {
    const candles = C(Array.from({ length: 20 }, (_, i) => ({ h: 12 + i, l: 8 + i, c: 10 + i })))
    const { bullPower, bearPower } = elderRay(candles, 13)
    for (let i = 0; i < candles.length; i++) {
      if (bullPower[i] === null) continue
      expect(approx(bullPower[i]! - bearPower[i]!, candles[i].high - candles[i].low)).toBe(true)
    }
  })
})
