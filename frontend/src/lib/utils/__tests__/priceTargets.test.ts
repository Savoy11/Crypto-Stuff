// Tests for the price-target cluster: every function here emits a dollar level
// (target, invalidation, support/resistance, fib level) or an R/R ratio that a
// user trades against, so the arithmetic is verified against hand-derivable
// geometry rather than snapshots.

import { describe, it, expect } from 'vitest'
import {
  fibRetracement, detectPatterns, detectSupportResistance, patternProjection,
  buildTechnicalRead, ema,
  type OhlcvCandle, type DetectedPattern, type SignalSummary,
} from '../indicators'
import { detectSetups } from '../scanSetups'
import { computeRiskReward } from '../riskReward'

// Flat candle per value: open = high = low = close = v.
function series(values: number[], volume = 1000): OhlcvCandle[] {
  return values.map((v, i) => ({ time: 86_400 * i, open: v, high: v, low: v, close: v, volume }))
}

function ramp(from: number, to: number, step: number): number[] {
  const out: number[] = []
  if (from < to) for (let v = from; v <= to; v += step) out.push(v)
  else for (let v = from; v >= to; v -= step) out.push(v)
  return out
}

const summaryOf = (score: number, buy: number, neutral: number, sell: number): SignalSummary =>
  ({ overall: 'neutral', score, buy, neutral, sell, signals: [] })

// ─── fibRetracement ───────────────────────────────────────────────────────────

describe('fibRetracement', () => {
  const candles = series(Array(50).fill(150))
  candles[10] = { ...candles[10], high: 200 }
  candles[30] = { ...candles[30], low: 100 }

  it('computes each ratio level against the window high/low', () => {
    const fib = fibRetracement(candles)
    expect(fib.high).toBe(200)
    expect(fib.low).toBe(100)
    const byRatio = Object.fromEntries(fib.levels.map((l) => [l.ratio, l.price]))
    expect(byRatio[0]).toBe(200)
    expect(byRatio[0.236]).toBeCloseTo(176.4, 10)
    expect(byRatio[0.382]).toBeCloseTo(161.8, 10)
    expect(byRatio[0.5]).toBeCloseTo(150, 10)
    expect(byRatio[0.618]).toBeCloseTo(138.2, 10)
    expect(byRatio[0.786]).toBeCloseTo(121.4, 10)
    expect(byRatio[1]).toBe(100)
    expect(fib.levels.map((l) => l.label)).toContain('61.8%')
  })

  it('only looks at the last `lookback` candles', () => {
    const long = series(Array(120).fill(150))
    long[0] = { ...long[0], high: 1000 }
    long[110] = { ...long[110], high: 200 }
    long[115] = { ...long[115], low: 100 }
    const fib = fibRetracement(long, 100)
    expect(fib.high).toBe(200)
    expect(fib.low).toBe(100)
  })

  it('collapses to a single price on a constant series, NaN-free', () => {
    const fib = fibRetracement(series(Array(30).fill(100)))
    for (const l of fib.levels) {
      expect(l.price).toBe(100)
      expect(Number.isFinite(l.price)).toBe(true)
    }
  })

  it('returns non-finite prices on empty input — callers must guard', () => {
    // Pinned behavior, not an endorsement: Math.max()/Math.min() of an empty
    // slice give ±Infinity, so an empty series yields Infinity/NaN levels
    // instead of throwing or returning null. Every UI caller checks
    // candles.length before calling; this test documents the contract.
    const fib = fibRetracement([])
    expect(Number.isFinite(fib.high)).toBe(false)
    expect(Number.isFinite(fib.low)).toBe(false)
  })
})

// ─── patternProjection ────────────────────────────────────────────────────────

describe('patternProjection', () => {
  const range = series(Array(5).fill(105)).map((c) => ({ ...c, high: 110, low: 100 }))
  const pattern = (type: DetectedPattern['type'], startIndex = 0, endIndex = 4): DetectedPattern =>
    ({ name: 'x', type, confidence: 0.5, description: '', startIndex, endIndex })

  it('bullish: breaks the range high, invalidates at the low, projects height up', () => {
    const proj = patternProjection(pattern('bullish'), range)
    expect(proj).toEqual({ breakLevel: 110, invalidationLevel: 100, measuredMoveTarget: 120 })
  })

  it('bearish: breaks the range low, invalidates at the high, projects height down', () => {
    const proj = patternProjection(pattern('bearish'), range)
    expect(proj).toEqual({ breakLevel: 100, invalidationLevel: 110, measuredMoveTarget: 90 })
  })

  it('returns null for neutral patterns (no direction to project)', () => {
    expect(patternProjection(pattern('neutral'), range)).toBeNull()
  })

  it('returns null when the pattern indices fall outside the candles', () => {
    expect(patternProjection(pattern('bullish', 10, 14), range)).toBeNull()
    expect(patternProjection(pattern('bullish'), [])).toBeNull()
  })
})

// ─── detectPatterns ───────────────────────────────────────────────────────────

describe('detectPatterns', () => {
  // Monotone highs/lows produce no spurious swing pivots, so the two dips are
  // the only troughs and the double bottom is the geometry we constructed.
  function doubleBottomSeries(): OhlcvCandle[] {
    const n = 60
    return Array.from({ length: n }, (_, i) => {
      const high = 110 - i * 0.01
      let low = 99 + i * 0.01
      if (i === 15) low = 90
      if (i === 40) low = 90.3
      const close = (high + low) / 2
      return { time: 86_400 * i, open: close, high, low, close, volume: 1000 }
    })
  }

  it('finds a clean double bottom with the constructed troughs', () => {
    const patterns = detectPatterns(doubleBottomSeries())
    const db = patterns.find((p) => p.name === 'Double Bottom')
    expect(db).toBeDefined()
    expect(db!.type).toBe('bullish')
    expect(db!.startIndex).toBe(15)
    expect(db!.endIndex).toBe(40)
    // |90 - 90.3| / 90 = 0.33% of the 3% tolerance -> confidence ~0.889
    expect(db!.confidence).toBeCloseTo(1 - (0.3 / 90) / 0.03, 5)
  })

  it('projects the double bottom: break at neckline, invalidation at the low', () => {
    const candles = doubleBottomSeries()
    const db = detectPatterns(candles).find((p) => p.name === 'Double Bottom')!
    const proj = patternProjection(db, candles)!
    // Neckline = highest high inside the pattern = high at index 15.
    expect(proj.breakLevel).toBeCloseTo(110 - 15 * 0.01, 10)
    expect(proj.invalidationLevel).toBe(90)
    expect(proj.measuredMoveTarget).toBeCloseTo(proj.breakLevel + (proj.breakLevel - 90), 10)
  })

  it('finds a double top on the mirrored geometry', () => {
    const n = 60
    const candles = Array.from({ length: n }, (_, i) => {
      let high = 100 + i * 0.01
      const low = 89 - i * 0.01
      if (i === 15) high = 110
      if (i === 40) high = 110.3
      const close = (high + low) / 2
      return { time: 86_400 * i, open: close, high, low, close, volume: 1000 }
    })
    const dt = detectPatterns(candles).find((p) => p.name === 'Double Top')
    expect(dt).toBeDefined()
    expect(dt!.type).toBe('bearish')
    expect(dt!.startIndex).toBe(15)
    expect(dt!.endIndex).toBe(40)
  })

  it('detects a bullish engulfing on the last two candles', () => {
    const candles = series(ramp(100, 119, 1))
    candles[18] = { ...candles[18], open: 101, close: 100, high: 101.5, low: 99.8 }
    candles[19] = { ...candles[19], open: 99.5, close: 101.5, high: 102, low: 99.4 }
    const names = detectPatterns(candles).map((p) => p.name)
    expect(names).toContain('Bullish Engulfing')
  })

  it('detects three white soldiers', () => {
    const candles = series(Array(20).fill(100))
    candles[17] = { ...candles[17], open: 100, close: 102, high: 102.2, low: 99.9 }
    candles[18] = { ...candles[18], open: 101, close: 103, high: 103.2, low: 100.9 }
    candles[19] = { ...candles[19], open: 102, close: 104, high: 104.2, low: 101.9 }
    const names = detectPatterns(candles).map((p) => p.name)
    expect(names).toContain('Three White Soldiers')
  })

  it('returns nothing on fewer than 20 candles or a flat series', () => {
    expect(detectPatterns([])).toEqual([])
    expect(detectPatterns(series(Array(19).fill(100)))).toEqual([])
    expect(detectPatterns(series(Array(60).fill(100)))).toEqual([])
  })

  it('never emits NaN confidence or indices', () => {
    for (const p of detectPatterns(doubleBottomSeries())) {
      expect(Number.isFinite(p.confidence)).toBe(true)
      expect(Number.isFinite(p.startIndex)).toBe(true)
      expect(Number.isFinite(p.endIndex)).toBe(true)
    }
  })
})

// ─── detectSupportResistance ──────────────────────────────────────────────────

describe('detectSupportResistance', () => {
  // Zigzag touching 100 twice (swing lows) and 120 twice (swing highs),
  // ending at 110 so both levels are ~9.09% away.
  const zigzag = series([
    ...ramp(110, 100, 2),        // 0..5
    ...ramp(102, 120, 2),        // 6..15
    ...ramp(118, 100, 2),        // 16..25
    ...ramp(102, 120, 2),        // 26..35
    ...ramp(118, 110, 2),        // 36..40
  ])

  it('clusters swing pivots into support and resistance with touch counts', () => {
    const levels = detectSupportResistance(zigzag)
    expect(levels).toHaveLength(2)
    // Display order is high -> low.
    expect(levels[0].price).toBe(120)
    expect(levels[0].type).toBe('resistance')
    expect(levels[0].strength).toBe(2)
    expect(levels[0].distancePct).toBeCloseTo((10 / 110) * 100, 10)
    expect(levels[1].price).toBe(100)
    expect(levels[1].type).toBe('support')
    expect(levels[1].strength).toBe(2)
    expect(levels[1].distancePct).toBeCloseTo((-10 / 110) * 100, 10)
  })

  it('returns [] for series too short to hold a swing window', () => {
    expect(detectSupportResistance([])).toEqual([])
    expect(detectSupportResistance(series([100, 101]))).toEqual([])
    expect(detectSupportResistance(series(Array(8).fill(100)))).toEqual([])
  })

  it('is NaN-free on a constant series (one level at price, 0% away)', () => {
    const levels = detectSupportResistance(series(Array(30).fill(100)))
    expect(levels).toHaveLength(1)
    expect(levels[0].price).toBe(100)
    expect(levels[0].distancePct).toBe(0)
  })

  it('respects maxLevels', () => {
    expect(detectSupportResistance(zigzag, { maxLevels: 1 })).toHaveLength(1)
  })
})

// ─── buildTechnicalRead ───────────────────────────────────────────────────────

describe('buildTechnicalRead', () => {
  it('reads an aligned uptrend as bullish and monotonic gains as overbought', () => {
    const candles = Array.from({ length: 260 }, (_, i) => {
      const close = 100 + i * 0.5
      return { time: 86_400 * i, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1000 }
    })
    const read = buildTechnicalRead(candles, summaryOf(1, 10, 0, 0))
    expect(read.trendBias.state).toBe('bullish')
    // A gains-only series pins RSI at 100.
    expect(read.momentum.state).toBe('overbought')
    // Constant true range: ATR ratio is 1 -> normal.
    expect(read.volatility.state).toBe('normal')
    // score 1 of 2, all votes decisive: (1/2)*100*(0.4 + 0.6*1) = 50
    expect(read.confidence).toBe(50)
  })

  it('reads a flat series as neutral with zero confidence on a zero score', () => {
    const read = buildTechnicalRead(series(Array(60).fill(100)), summaryOf(0, 0, 10, 0))
    expect(read.trendBias.state).toBe('neutral')
    expect(read.momentum.state).toBe('neutral')
    expect(read.volatility.state).toBe('normal')
    expect(read.confidence).toBe(0)
  })

  it('degrades to defaults on a 2-candle series without throwing', () => {
    const read = buildTechnicalRead(series([100, 101]), summaryOf(0, 0, 0, 0))
    expect(read.trendBias.state).toBe('neutral')
    expect(read.momentum.detail).toBe('Momentum is flat.')
    expect(read.srProximity.detail).toBe('No nearby support/resistance level detected.')
    expect(Number.isFinite(read.confidence)).toBe(true)
  })

  it('caps confidence at 100 and keeps it finite', () => {
    const read = buildTechnicalRead(series(Array(60).fill(100)), summaryOf(2, 20, 0, 0))
    expect(read.confidence).toBeLessThanOrEqual(100)
    expect(read.confidence).toBeGreaterThanOrEqual(0)
  })
})

// ─── detectSetups (scanner) ───────────────────────────────────────────────────

describe('detectSetups', () => {
  const keys = (candles: OhlcvCandle[]) => detectSetups(candles).map((s) => s.key)

  it('returns [] under 55 candles', () => {
    expect(detectSetups(series(Array(54).fill(100)))).toEqual([])
    expect(detectSetups([])).toEqual([])
  })

  it('breakout: close above the prior 20-bar high', () => {
    const candles = series([...Array(59).fill(100), 105])
    expect(keys(candles)).toContain('breakout')
    expect(keys(series(Array(60).fill(100)))).not.toContain('breakout')
  })

  it('oversold bounce: depressed RSI turning up on an up close', () => {
    const trigger = series([...ramp(200, 147, 1), 147.5])
    expect(keys(trigger)).toContain('oversold_bounce')
    const noBounce = series([...ramp(200, 147, 1), 146])
    expect(keys(noBounce)).not.toContain('oversold_bounce')
  })

  it('overbought fade: stretched RSI rolling over on a down close', () => {
    const trigger = series([...ramp(100, 153, 1), 152.5])
    expect(keys(trigger)).toContain('overbought_fade')
    const noFade = series([...ramp(100, 153, 1), 154])
    expect(keys(noFade)).not.toContain('overbought_fade')
  })

  it('ma cross: fires only when EMA20/EMA50 cross within the last ~2 bars', () => {
    const closes = [...ramp(200, 131, 1), ...ramp(135, 331, 4)]
    const e20 = ema(closes, 20)
    const e50 = ema(closes, 50)
    let crossIdx = -1
    for (let i = 1; i < closes.length; i++) {
      if (e20[i] !== null && e50[i] !== null && e20[i]! > e50[i]! && e20[i - 1]! <= e50[i - 1]!) { crossIdx = i; break }
    }
    expect(crossIdx).toBeGreaterThan(55)
    const atCross = detectSetups(series(closes.slice(0, crossIdx + 1)))
    const cross = atCross.find((s) => s.key === 'ma_cross')
    expect(cross).toBeDefined()
    expect(cross!.detail).toContain('golden')
    // Long after the cross: no longer a fresh signal.
    expect(keys(series(closes))).not.toContain('ma_cross')
  })

  it('volume spike: last bar above 2x its 20-bar average', () => {
    const vols = [...Array(59).fill(1000), 5000]
    const candles = series(Array(60).fill(100)).map((c, i) => ({ ...c, volume: vols[i] }))
    expect(keys(candles)).toContain('volume_spike')
    expect(keys(series(Array(60).fill(100)))).not.toContain('volume_spike')
  })

  it('obv divergence: price down >3% over 14 bars while OBV accumulates', () => {
    const closes: number[] = Array(45).fill(130)
    const vols: number[] = Array(45).fill(1000)
    let v = 130
    for (let p = 0; p < 7; p++) {
      v -= 3; closes.push(v); vols.push(100)      // heavy fall, light volume
      v += 1; closes.push(v); vols.push(10_000)   // small rise, heavy volume
    }
    const candles = series(closes).map((c, i) => ({ ...c, volume: vols[i] }))
    expect(keys(candles)).toContain('obv_divergence')

    // Same price path with the volume weights swapped: distribution, not accumulation.
    const swapped = series(closes).map((c, i) => ({ ...c, volume: vols[i] === 100 ? 10_000 : 100 }))
    expect(keys(swapped)).not.toContain('obv_divergence')
  })

  it('volatility compression: zero-width bands are a squeeze, expanding ones are not', () => {
    expect(keys(series(Array(60).fill(100)))).toContain('volatility_compression')
    const expanding = series(Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? -1 : 1) * i * 0.2))
    expect(keys(expanding)).not.toContain('volatility_compression')
  })
})

// ─── computeRiskReward ────────────────────────────────────────────────────────

describe('computeRiskReward', () => {
  it('computes reward/risk for a long', () => {
    expect(computeRiskReward('100', '120', '90')).toBe(2)
  })

  it('computes reward/risk for a short (target below entry, stop above)', () => {
    expect(computeRiskReward('100', '80', '110')).toBe(2)
  })

  it('parses currency formatting', () => {
    expect(computeRiskReward('$1,000', '$1,300.50', '$900')).toBeCloseTo(300.5 / 100, 10)
  })

  it('returns null on zero risk (entry === stop) instead of Infinity', () => {
    expect(computeRiskReward('100', '120', '100')).toBeNull()
  })

  it('returns null when any field does not parse as a number', () => {
    expect(computeRiskReward('', '120', '90')).toBeNull()
    expect(computeRiskReward('100', 'soon', '90')).toBeNull()
    expect(computeRiskReward('100', '120', 'n/a')).toBeNull()
  })

  it('target equal to entry is a valid 0 R/R, not null', () => {
    expect(computeRiskReward('100', '100', '90')).toBe(0)
  })
})
