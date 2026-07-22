// Technical analysis indicator calculations.
// All functions accept a plain number[] or OhlcvCandle[] and return aligned arrays
// (same length as input, with null for periods where insufficient history exists).

export interface OhlcvCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ─── Moving Averages ──────────────────────────────────────────────────────────

export function sma(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null
    const slice = values.slice(i - period + 1, i + 1)
    return slice.reduce((s, v) => s + v, 0) / period
  })
}

export function ema(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const result: (number | null)[] = new Array(values.length).fill(null)
  let prev: number | null = null
  const seed: number[] = []
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (prev === null) {
      // Seed from the first `period` FINITE values, skipping any leading
      // null/NaN warm-up (e.g. a MACD/TRIX line that is undefined until an
      // upstream EMA is ready). Seeding blindly from slice(0, period) let a
      // single leading NaN poison the entire series with NaN.
      if (!Number.isFinite(v)) continue
      seed.push(v)
      if (seed.length === period) {
        prev = seed.reduce((s, x) => s + x, 0) / period
        result[i] = prev
      }
    } else if (Number.isFinite(v)) {
      prev = v * k + prev * (1 - k)
      result[i] = prev
    } else {
      // Gap after seeding: emit null but keep the last EMA to resume cleanly.
      result[i] = null
    }
  }
  return result
}

export function wma(values: number[], period: number): (number | null)[] {
  const weights = Array.from({ length: period }, (_, i) => i + 1)
  const weightSum = weights.reduce((s, w) => s + w, 0)
  return values.map((_, i) => {
    if (i < period - 1) return null
    let sum = 0
    for (let j = 0; j < period; j++) sum += values[i - period + 1 + j] * weights[j]
    return sum / weightSum
  })
}

// ─── RSI ──────────────────────────────────────────────────────────────────────

export function rsi(values: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null)
  if (values.length < period + 1) return result

  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1]
    if (diff > 0) avgGain += diff
    else avgLoss += Math.abs(diff)
  }
  avgGain /= period
  avgLoss /= period

  result[period] = rsiFrom(avgGain, avgLoss)

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? Math.abs(diff) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    result[i] = rsiFrom(avgGain, avgLoss)
  }
  return result
}

/**
 * RSI from smoothed average gain/loss, handling both degenerate cases.
 *
 * `avgLoss === 0` alone is NOT enough to mean "100". It is only overbought
 * when there were gains and no losses; when there is NO movement at all
 * (avgGain and avgLoss both zero) the ratio is 0/0 — undefined, not extreme.
 * The old code returned 100 for both, so any run of identical closes (a pegged
 * stablecoin, a halted or low-precision feed) read as maximally overbought and
 * drove the whole signal summary to "Sell" on a motionless price.
 *
 * 50 is the neutral convention already used elsewhere in this file for a
 * degenerate range — williamsr returns −50, stochasticOscillator 50, cmo 0.
 */
function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}

// ─── MACD ─────────────────────────────────────────────────────────────────────

export interface MacdResult {
  macd: (number | null)[]
  signal: (number | null)[]
  histogram: (number | null)[]
}

export function macd(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult {
  const fastEma = ema(values, fastPeriod)
  const slowEma = ema(values, slowPeriod)
  const macdLine = fastEma.map((f, i) =>
    f !== null && slowEma[i] !== null ? f - slowEma[i]! : null,
  )
  const macdValues = macdLine.map((v) => v ?? NaN)
  const signalLine = ema(macdValues, signalPeriod)
  // Align signal: only valid where macd is valid
  const alignedSignal = signalLine.map((s, i) => (macdLine[i] !== null && s !== null && !isNaN(s) ? s : null))
  const histogram = macdLine.map((m, i) =>
    m !== null && alignedSignal[i] !== null ? m - alignedSignal[i]! : null,
  )
  return { macd: macdLine, signal: alignedSignal, histogram }
}

// ─── Bollinger Bands ──────────────────────────────────────────────────────────

export interface BollingerBands {
  upper: (number | null)[]
  middle: (number | null)[]
  lower: (number | null)[]
  bandwidth: (number | null)[]
}

export function bollingerBands(values: number[], period = 20, stdDev = 2): BollingerBands {
  const middle = sma(values, period)
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []
  const bandwidth: (number | null)[] = []

  for (let i = 0; i < values.length; i++) {
    if (middle[i] === null) {
      upper.push(null); lower.push(null); bandwidth.push(null)
      continue
    }
    const slice = values.slice(i - period + 1, i + 1)
    const mean = middle[i]!
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period
    const std = Math.sqrt(variance)
    const u = mean + stdDev * std
    const l = mean - stdDev * std
    upper.push(u)
    lower.push(l)
    bandwidth.push(mean !== 0 ? (u - l) / mean : null)
  }
  return { upper, middle, lower, bandwidth }
}

// ─── Stochastic RSI ───────────────────────────────────────────────────────────

export interface StochRsi {
  k: (number | null)[]
  d: (number | null)[]
}

export function stochasticRsi(values: number[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3): StochRsi {
  const rsiVals = rsi(values, rsiPeriod)
  const stoch: (number | null)[] = rsiVals.map((_, i) => {
    if (i < stochPeriod - 1) return null
    const window = rsiVals.slice(i - stochPeriod + 1, i + 1).filter((v): v is number => v !== null)
    if (window.length < stochPeriod) return null
    const minRsi = Math.min(...window)
    const maxRsi = Math.max(...window)
    const range = maxRsi - minRsi
    return range === 0 ? 0 : ((rsiVals[i]! - minRsi) / range) * 100
  })
  const kLine = sma(stoch.map((v) => v ?? NaN), kSmooth).map((v, i) =>
    stoch[i] !== null && v !== null && !isNaN(v) ? v : null,
  )
  const dLine = sma(kLine.map((v) => v ?? NaN), dSmooth).map((v, i) =>
    kLine[i] !== null && v !== null && !isNaN(v) ? v : null,
  )
  return { k: kLine, d: dLine }
}

// ─── ATR (Average True Range) ─────────────────────────────────────────────────

export function atr(candles: OhlcvCandle[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null)
  if (candles.length < 2) return result
  const trueRanges = candles.map((c, i) => {
    if (i === 0) return c.high - c.low
    const prev = candles[i - 1].close
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev))
  })
  if (trueRanges.length < period) return result
  // Wilder's smoothing (the canonical ATR), not a simple moving average:
  // seed with the SMA of the first `period` true ranges, then
  // ATR_i = (ATR_{i-1} * (period - 1) + TR_i) / period. Matches adx()/rsi().
  let prev = trueRanges.slice(0, period).reduce((s, v) => s + v, 0) / period
  result[period - 1] = prev
  for (let i = period; i < trueRanges.length; i++) {
    prev = (prev * (period - 1) + trueRanges[i]) / period
    result[i] = prev
  }
  return result
}

// ─── OBV (On-Balance Volume) ──────────────────────────────────────────────────

export function obv(candles: OhlcvCandle[]): number[] {
  let running = 0
  return candles.map((c, i) => {
    if (i === 0) return 0
    const prev = candles[i - 1].close
    if (c.close > prev) running += c.volume
    else if (c.close < prev) running -= c.volume
    return running
  })
}

// ─── VWAP (Volume Weighted Average Price) ─────────────────────────────────────
// Session VWAP: resets daily (groups by UTC date). ONLY meaningful on intraday
// candles — see isIntradaySeries below.

/**
 * Are these candles finer than one day?
 *
 * Session VWAP resets on each UTC date, so on daily-or-coarser bars every bar
 * is its own session, the accumulator resets every bar, and VWAP collapses to
 * (H+L+C)/3 — a line labelled "VWAP" carrying no volume information at all,
 * because volume cancels out of a one-bar average. Callers must branch on this
 * rather than draw a meaningless line.
 */
export function isIntradaySeries(candles: OhlcvCandle[]): boolean {
  if (candles.length < 3) return false
  // Median spacing, so one gap (a weekend, a halt) can't flip the verdict.
  const gaps = candles.slice(1).map((c, i) => c.time - candles[i].time).filter((g) => g > 0).sort((a, b) => a - b)
  if (gaps.length === 0) return false
  return gaps[Math.floor(gaps.length / 2)] < 86_400
}

/**
 * Rolling volume-weighted average price over the last `period` bars.
 *
 * The meaningful VWAP variant for daily-and-coarser series, where a session
 * anchor does not exist. Unlike the session version this genuinely weights by
 * volume at every bar.
 */
export function rollingVwap(candles: OhlcvCandle[], period = 20): (number | null)[] {
  return candles.map((_, i) => {
    if (i < period - 1) return null
    let pv = 0; let vol = 0
    for (let j = i - period + 1; j <= i; j++) {
      const c = candles[j]
      const typical = (c.high + c.low + c.close) / 3
      pv += typical * c.volume
      vol += c.volume
    }
    return vol > 0 ? pv / vol : null
  })
}

export function vwap(candles: OhlcvCandle[]): (number | null)[] {
  const result: (number | null)[] = []
  let cumPV = 0
  let cumVol = 0
  let lastDate = ''

  for (const c of candles) {
    const date = new Date(c.time * 1000).toISOString().slice(0, 10)
    if (date !== lastDate) { cumPV = 0; cumVol = 0; lastDate = date }
    const typicalPrice = (c.high + c.low + c.close) / 3
    cumPV += typicalPrice * c.volume
    cumVol += c.volume
    result.push(cumVol > 0 ? cumPV / cumVol : null)
  }
  return result
}

// ─── Ichimoku Cloud ───────────────────────────────────────────────────────────

export interface IchimokuResult {
  tenkan: (number | null)[]    // Conversion Line (9)
  kijun: (number | null)[]     // Base Line (26)
  senkouA: (number | null)[]   // Leading Span A (26 ahead)
  senkouB: (number | null)[]   // Leading Span B (52, 26 ahead)
  chikou: (number | null)[]    // Lagging Span (26 behind)
}

function donchianMid(values: number[], highs: number[], lows: number[], i: number, period: number): number | null {
  if (i < period - 1) return null
  const h = Math.max(...highs.slice(i - period + 1, i + 1))
  const l = Math.min(...lows.slice(i - period + 1, i + 1))
  return (h + l) / 2
}

export function ichimoku(candles: OhlcvCandle[]): IchimokuResult {
  const n = candles.length
  const highs = candles.map((c) => c.high)
  const lows = candles.map((c) => c.low)
  const closes = candles.map((c) => c.close)

  const tenkan = candles.map((_, i) => donchianMid(closes, highs, lows, i, 9))
  const kijun = candles.map((_, i) => donchianMid(closes, highs, lows, i, 26))
  // The cloud is DISPLACED 26 bars FORWARD — that displacement is the whole
  // point of Ichimoku, and consumers plot every array at candles[i].time, so
  // the shift has to live in the data. Returning the value at the bar that
  // produced it drew the cloud 26 bars early: on a rising series the chart
  // read 168.75 where the correct plot is 142.75, an 18% error that flips the
  // price-above/below-Kumo verdict at every crossover. backtest.ts's
  // ichimokuCloud already shifted correctly, so chart and backtest disagreed
  // about the same indicator on the same candles.
  const SHIFT = 26
  const senkouA: (number | null)[] = Array(n).fill(null)
  const senkouB: (number | null)[] = Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    const target = i + SHIFT
    if (target >= n) break
    const t = tenkan[i]; const k = kijun[i]
    senkouA[target] = t !== null && k !== null ? (t + k) / 2 : null
    senkouB[target] = donchianMid(closes, highs, lows, i, 52)
  }

  // Chikou is the mirror image: today's close plotted 26 bars BACK, so the
  // value at index i is the close 26 bars ahead of it. The old version copied
  // closes[i] verbatim — zero lag, which is not a lagging span at all.
  const chikou: (number | null)[] = candles.map((_, i) => i + SHIFT < n ? closes[i + SHIFT] : null)

  return { tenkan, kijun, senkouA, senkouB, chikou }
}

// ─── Williams %R ─────────────────────────────────────────────────────────────

export function williamsr(candles: OhlcvCandle[], period = 14): (number | null)[] {
  return candles.map((_, i) => {
    if (i < period - 1) return null
    const slice = candles.slice(i - period + 1, i + 1)
    const highest = Math.max(...slice.map((c) => c.high))
    const lowest = Math.min(...slice.map((c) => c.low))
    const range = highest - lowest
    return range === 0 ? -50 : ((highest - candles[i].close) / range) * -100
  })
}

// ─── Momentum ─────────────────────────────────────────────────────────────────

export function momentum(values: number[], period = 10): (number | null)[] {
  return values.map((v, i) => (i < period ? null : v - values[i - period]))
}

// ─── Rate of Change (ROC) ─────────────────────────────────────────────────────

export function roc(values: number[], period = 12): (number | null)[] {
  return values.map((v, i) => {
    if (i < period) return null
    const prev = values[i - period]
    return prev === 0 ? null : ((v - prev) / prev) * 100
  })
}

// ─── Ultimate Oscillator ──────────────────────────────────────────────────────

export function ultimateOscillator(candles: OhlcvCandle[], p1 = 7, p2 = 14, p3 = 28): (number | null)[] {
  if (candles.length < 2) return candles.map(() => null)
  const bp: number[] = []
  const tr: number[] = []
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { bp.push(0); tr.push(candles[0].high - candles[0].low); continue }
    const low = Math.min(candles[i].low, candles[i - 1].close)
    const high = Math.max(candles[i].high, candles[i - 1].close)
    bp.push(candles[i].close - low)
    tr.push(high - low)
  }
  const sumSlice = (arr: number[], end: number, len: number) => arr.slice(end - len + 1, end + 1).reduce((s, v) => s + v, 0)
  return candles.map((_, i) => {
    if (i < p3 - 1) return null
    const t1 = sumSlice(tr, i, p1); const t2 = sumSlice(tr, i, p2); const t3 = sumSlice(tr, i, p3)
    if (!t1 || !t2 || !t3) return null
    const avg1 = sumSlice(bp, i, p1) / t1
    const avg2 = sumSlice(bp, i, p2) / t2
    const avg3 = sumSlice(bp, i, p3) / t3
    return 100 * (4 * avg1 + 2 * avg2 + avg3) / 7
  })
}

// ─── Chande Momentum Oscillator (CMO) ─────────────────────────────────────────

export function cmo(values: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null)
  for (let i = period; i < values.length; i++) {
    let up = 0, down = 0
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - values[j - 1]
      if (d > 0) up += d; else down += Math.abs(d)
    }
    result[i] = up + down === 0 ? 0 : ((up - down) / (up + down)) * 100
  }
  return result
}

// ─── ADX / Directional Movement Index ─────────────────────────────────────────

export interface AdxResult {
  adx: (number | null)[]
  plusDI: (number | null)[]
  minusDI: (number | null)[]
}

export function adx(candles: OhlcvCandle[], period = 14): AdxResult {
  const n = candles.length
  const empty = candles.map(() => null)
  if (n < period + 1) return { adx: empty, plusDI: empty, minusDI: empty }

  const trArr = [candles[0].high - candles[0].low]
  const pDM = [0]; const mDM = [0]
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high
    const down = candles[i - 1].low - candles[i].low
    pDM.push(up > down && up > 0 ? up : 0)
    mDM.push(down > up && down > 0 ? down : 0)
    trArr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    ))
  }

  const smTR = new Array(n).fill(0)
  const smP = new Array(n).fill(0)
  const smM = new Array(n).fill(0)
  for (let i = 1; i <= period; i++) { smTR[period] += trArr[i]; smP[period] += pDM[i]; smM[period] += mDM[i] }
  for (let i = period + 1; i < n; i++) {
    smTR[i] = smTR[i - 1] - smTR[i - 1] / period + trArr[i]
    smP[i] = smP[i - 1] - smP[i - 1] / period + pDM[i]
    smM[i] = smM[i - 1] - smM[i - 1] / period + mDM[i]
  }

  const plusDI: (number | null)[] = new Array(n).fill(null)
  const minusDI: (number | null)[] = new Array(n).fill(null)
  const dx: (number | null)[] = new Array(n).fill(null)
  for (let i = period; i < n; i++) {
    if (!smTR[i]) continue
    plusDI[i] = (smP[i] / smTR[i]) * 100
    minusDI[i] = (smM[i] / smTR[i]) * 100
    const diSum = plusDI[i]! + minusDI[i]!
    dx[i] = diSum === 0 ? 0 : (Math.abs(plusDI[i]! - minusDI[i]!) / diSum) * 100
  }

  const adxArr: (number | null)[] = new Array(n).fill(null)
  let initSum = 0; let cnt = 0
  for (let i = period; i < 2 * period && i < n; i++) { if (dx[i] !== null) { initSum += dx[i]!; cnt++ } }
  if (cnt === period && 2 * period - 1 < n) {
    adxArr[2 * period - 1] = initSum / period
    for (let i = 2 * period; i < n; i++) {
      if (dx[i] !== null && adxArr[i - 1] !== null) {
        adxArr[i] = (adxArr[i - 1]! * (period - 1) + dx[i]!) / period
      }
    }
  }
  return { adx: adxArr, plusDI, minusDI }
}

// ─── Aroon ────────────────────────────────────────────────────────────────────

export interface AroonResult {
  up: (number | null)[]
  down: (number | null)[]
  oscillator: (number | null)[]
}

export function aroon(candles: OhlcvCandle[], period = 25): AroonResult {
  const up: (number | null)[] = []
  const down: (number | null)[] = []
  const oscillator: (number | null)[] = []
  for (let i = 0; i < candles.length; i++) {
    if (i < period) { up.push(null); down.push(null); oscillator.push(null); continue }
    const slice = candles.slice(i - period, i + 1)
    const hiIdx = slice.reduce((b, c, j) => c.high > slice[b].high ? j : b, 0)
    const loIdx = slice.reduce((b, c, j) => c.low < slice[b].low ? j : b, 0)
    const u = (hiIdx / period) * 100
    const d = (loIdx / period) * 100
    up.push(u); down.push(d); oscillator.push(u - d)
  }
  return { up, down, oscillator }
}

// ─── Hull Moving Average (HMA) ────────────────────────────────────────────────

export function hma(values: number[], period = 20): (number | null)[] {
  const half = Math.floor(period / 2)
  const sqrtP = Math.round(Math.sqrt(period))
  const wmaFull = wma(values, period)
  const wmaHalf = wma(values, half)
  const diff = values.map((_, i) => {
    const f = wmaFull[i]; const h = wmaHalf[i]
    return h !== null && f !== null ? 2 * h - f : NaN
  })
  return wma(diff, sqrtP).map((v, i) => (v !== null && !isNaN(v) && !isNaN(diff[i]) ? v : null))
}

// ─── TRIX ─────────────────────────────────────────────────────────────────────

export function trix(values: number[], period = 15): (number | null)[] {
  const e1 = ema(values, period)
  const e2 = ema(e1.map((v) => v ?? NaN), period)
  const e3 = ema(e2.map((v) => v ?? NaN), period)
  return e3.map((v, i) => {
    if (v === null || i === 0) return null
    const prev = e3[i - 1]
    if (prev === null || isNaN(prev as number) || (prev as number) === 0) return null
    return ((v - (prev as number)) / (prev as number)) * 100
  })
}

// ─── KST (Know Sure Thing) ────────────────────────────────────────────────────

export function kst(values: number[]): (number | null)[] {
  const r1 = sma(roc(values, 10).map((v) => v ?? NaN), 10)
  const r2 = sma(roc(values, 15).map((v) => v ?? NaN), 10)
  const r3 = sma(roc(values, 20).map((v) => v ?? NaN), 10)
  const r4 = sma(roc(values, 30).map((v) => v ?? NaN), 15)
  return values.map((_, i) => {
    const a = r1[i]; const b = r2[i]; const c = r3[i]; const d = r4[i]
    if (a === null || b === null || c === null || d === null) return null
    if ([a, b, c, d].some(isNaN)) return null
    return a * 1 + b * 2 + c * 3 + d * 4
  })
}

// ─── Parabolic SAR ────────────────────────────────────────────────────────────

export function parabolicSar(candles: OhlcvCandle[], step = 0.02, maxStep = 0.2): (number | null)[] {
  if (candles.length < 2) return candles.map(() => null)
  const result: (number | null)[] = [null]
  let bull = true; let af = step
  let ep = candles[0].high; let sar = candles[0].low
  for (let i = 1; i < candles.length; i++) {
    sar = sar + af * (ep - sar)
    if (bull) {
      sar = Math.min(sar, candles[i - 1].low, i >= 2 ? candles[i - 2].low : candles[i - 1].low)
      if (candles[i].high > ep) { ep = candles[i].high; af = Math.min(af + step, maxStep) }
      if (candles[i].low < sar) { bull = false; sar = ep; ep = candles[i].low; af = step }
    } else {
      sar = Math.max(sar, candles[i - 1].high, i >= 2 ? candles[i - 2].high : candles[i - 1].high)
      if (candles[i].low < ep) { ep = candles[i].low; af = Math.min(af + step, maxStep) }
      if (candles[i].high > sar) { bull = true; sar = ep; ep = candles[i].high; af = step }
    }
    result.push(sar)
  }
  return result
}

// ─── Linear Regression ────────────────────────────────────────────────────────

export function linearRegression(values: number[], period = 20): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null
    const slice = values.slice(i - period + 1, i + 1)
    const n = slice.length
    const sumX = (n * (n - 1)) / 2
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6
    const sumY = slice.reduce((s, v) => s + v, 0)
    const sumXY = slice.reduce((s, v, j) => s + j * v, 0)
    const denom = n * sumXX - sumX * sumX
    if (!denom) return slice[n - 1]
    const slope = (n * sumXY - sumX * sumY) / denom
    const intercept = (sumY - slope * sumX) / n
    return intercept + slope * (n - 1)
  })
}

// ─── Keltner Channels ─────────────────────────────────────────────────────────

export interface KeltnerChannels {
  upper: (number | null)[]
  middle: (number | null)[]
  lower: (number | null)[]
}

export function keltnerChannels(candles: OhlcvCandle[], emaPeriod = 20, atrPeriod = 10, mult = 1.5): KeltnerChannels {
  const closes = candles.map((c) => c.close)
  const middle = ema(closes, emaPeriod)
  const atrVals = atr(candles, atrPeriod)
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []
  for (let i = 0; i < candles.length; i++) {
    const m = middle[i]; const a = atrVals[i]
    if (m === null || a === null) { upper.push(null); lower.push(null) }
    else { upper.push(m + mult * a); lower.push(m - mult * a) }
  }
  return { upper, middle, lower }
}

// ─── Donchian Channels ────────────────────────────────────────────────────────

export interface DonchianChannels {
  upper: (number | null)[]
  middle: (number | null)[]
  lower: (number | null)[]
}

export function donchianChannels(candles: OhlcvCandle[], period = 20): DonchianChannels {
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []
  const middle: (number | null)[] = []
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) { upper.push(null); lower.push(null); middle.push(null); continue }
    const slice = candles.slice(i - period + 1, i + 1)
    const h = Math.max(...slice.map((c) => c.high))
    const l = Math.min(...slice.map((c) => c.low))
    upper.push(h); lower.push(l); middle.push((h + l) / 2)
  }
  return { upper, middle, lower }
}

// ─── Choppiness Index ─────────────────────────────────────────────────────────

export function choppinessIndex(candles: OhlcvCandle[], period = 14): (number | null)[] {
  if (candles.length < 2) return candles.map(() => null)
  const trArr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low
    const prev = candles[i - 1].close
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev))
  })
  return candles.map((_, i) => {
    if (i < period - 1) return null
    const slice = candles.slice(i - period + 1, i + 1)
    const sumTR = trArr.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0)
    const hh = Math.max(...slice.map((c) => c.high))
    const ll = Math.min(...slice.map((c) => c.low))
    const range = hh - ll
    if (!range) return null
    return (100 * Math.log10(sumTR / range)) / Math.log10(period)
  })
}

// ─── Standard Deviation ───────────────────────────────────────────────────────

export function stdDev(values: number[], period = 20): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null
    const slice = values.slice(i - period + 1, i + 1)
    const mean = slice.reduce((s, v) => s + v, 0) / period
    return Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period)
  })
}

// ─── Bollinger %B ─────────────────────────────────────────────────────────────

export function bollingerPercentB(values: number[], period = 20, numStdDev = 2): (number | null)[] {
  const bb = bollingerBands(values, period, numStdDev)
  return values.map((v, i) => {
    const u = bb.upper[i]; const l = bb.lower[i]
    if (u === null || l === null) return null
    const range = u - l
    return range === 0 ? 0.5 : (v - l) / range
  })
}

// ─── Money Flow Index (MFI) ───────────────────────────────────────────────────

export function mfi(candles: OhlcvCandle[], period = 14): (number | null)[] {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3)
  const mf = candles.map((c, i) => tp[i] * c.volume)
  const result: (number | null)[] = new Array(candles.length).fill(null)
  for (let i = period; i < candles.length; i++) {
    let pos = 0; let neg = 0
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) pos += mf[j]
      else if (tp[j] < tp[j - 1]) neg += mf[j]
    }
    // Same degenerate case as RSI: no negative flow means 100 only if there
    // WAS positive flow. A flat window has neither and is neutral, not
    // maximally overbought.
    result[i] = neg === 0 ? (pos === 0 ? 50 : 100) : 100 - 100 / (1 + pos / neg)
  }
  return result
}

// ─── Chaikin Money Flow (CMF) ─────────────────────────────────────────────────

export function cmf(candles: OhlcvCandle[], period = 20): (number | null)[] {
  const mfv = candles.map((c) => {
    const range = c.high - c.low
    return range === 0 ? 0 : ((c.close - c.low - (c.high - c.close)) / range) * c.volume
  })
  return candles.map((_, i) => {
    if (i < period - 1) return null
    const sumMFV = mfv.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0)
    const sumVol = candles.slice(i - period + 1, i + 1).reduce((s, c) => s + c.volume, 0)
    return sumVol === 0 ? null : sumMFV / sumVol
  })
}

// ─── Accumulation/Distribution Line ──────────────────────────────────────────

export function accDistLine(candles: OhlcvCandle[]): number[] {
  let running = 0
  return candles.map((c) => {
    const range = c.high - c.low
    if (range > 0) running += ((c.close - c.low - (c.high - c.close)) / range) * c.volume
    return running
  })
}

// ─── Volume Oscillator ────────────────────────────────────────────────────────

export function volumeOscillator(candles: OhlcvCandle[], fastPeriod = 5, slowPeriod = 10): (number | null)[] {
  const vols = candles.map((c) => c.volume)
  const fast = ema(vols, fastPeriod)
  const slow = ema(vols, slowPeriod)
  return vols.map((_, i) => {
    const f = fast[i]; const s = slow[i]
    if (f === null || s === null || s === 0) return null
    return ((f - s) / s) * 100
  })
}

// ─── Force Index ──────────────────────────────────────────────────────────────

export function forceIndex(candles: OhlcvCandle[], period = 13): (number | null)[] {
  const raw = candles.map((c, i) => (i === 0 ? 0 : (c.close - candles[i - 1].close) * c.volume))
  return ema(raw, period)
}

// ─── Ease of Movement ─────────────────────────────────────────────────────────

export function easeOfMovement(candles: OhlcvCandle[], period = 14): (number | null)[] {
  const raw = candles.map((c, i) => {
    if (i === 0) return 0
    const midMove = (c.high + c.low) / 2 - (candles[i - 1].high + candles[i - 1].low) / 2
    if (c.volume === 0) return 0 // avoid boxRatio=0 -> Infinity/NaN poisoning the SMA window
    const boxRatio = c.volume / (c.high - c.low || 1)
    return midMove / boxRatio
  })
  return sma(raw, period)
}

// ─── CCI (Commodity Channel Index) ───────────────────────────────────────────

export function cci(candles: OhlcvCandle[], period = 20): (number | null)[] {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3)
  return candles.map((_, i) => {
    if (i < period - 1) return null
    const slice = tp.slice(i - period + 1, i + 1)
    const mean = slice.reduce((s, v) => s + v, 0) / period
    const meanDev = slice.reduce((s, v) => s + Math.abs(v - mean), 0) / period
    return meanDev === 0 ? null : (tp[i] - mean) / (0.015 * meanDev)
  })
}

// ─── Detrended Price Oscillator (DPO) ────────────────────────────────────────

export function dpo(values: number[], period = 20): (number | null)[] {
  const offset = Math.floor(period / 2) + 1
  const smaVals = sma(values, period)
  return values.map((v, i) => {
    const smaIdx = i - offset
    if (smaIdx < 0 || smaVals[smaIdx] === null) return null
    return v - smaVals[smaIdx]!
  })
}

// ─── Mass Index ───────────────────────────────────────────────────────────────

export function massIndex(candles: OhlcvCandle[], fastPeriod = 9, slowPeriod = 25): (number | null)[] {
  const hl = candles.map((c) => c.high - c.low)
  const e1 = ema(hl, fastPeriod)
  const e2 = ema(e1.map((v) => v ?? NaN), fastPeriod)
  const ratio = e1.map((v1, i) => {
    const v2 = e2[i]
    if (v1 === null || v2 === null || v2 === 0) return NaN
    return v1 / v2
  })
  // Canonical Mass Index is a rolling SUM (not mean) of the EMA ratio over
  // slowPeriod — the reversal "bulge" threshold (~27) is defined against the
  // sum. sma()*slowPeriod recovers the sum.
  return sma(ratio, slowPeriod).map((v) => (v !== null && !isNaN(v) ? v * slowPeriod : null))
}

// ─── Elder Ray Index ──────────────────────────────────────────────────────────

export interface ElderRayResult {
  bullPower: (number | null)[]
  bearPower: (number | null)[]
}

export function elderRay(candles: OhlcvCandle[], period = 13): ElderRayResult {
  const emaVals = ema(candles.map((c) => c.close), period)
  return {
    bullPower: candles.map((c, i) => emaVals[i] !== null ? c.high - emaVals[i]! : null),
    bearPower: candles.map((c, i) => emaVals[i] !== null ? c.low - emaVals[i]! : null),
  }
}

// ─── Pivot Points ─────────────────────────────────────────────────────────────

export interface PivotPoints {
  pp: number
  r1: number; r2: number; r3: number
  s1: number; s2: number; s3: number
}

export function pivotPoints(candles: OhlcvCandle[]): PivotPoints | null {
  if (candles.length < 2) return null
  const prev = candles[candles.length - 2]
  const pp = (prev.high + prev.low + prev.close) / 3
  return {
    pp,
    r1: 2 * pp - prev.low,
    r2: pp + (prev.high - prev.low),
    r3: prev.high + 2 * (pp - prev.low),
    s1: 2 * pp - prev.high,
    s2: pp - (prev.high - prev.low),
    s3: prev.low - 2 * (prev.high - pp),
  }
}

// ─── Double / Triple EMA ──────────────────────────────────────────────────────

export function dema(values: number[], period = 20): (number | null)[] {
  const e1 = ema(values, period)
  const nonNull1 = e1.map((v) => v ?? NaN)
  const e2 = ema(nonNull1, period)
  return e1.map((v1, i) => {
    const v2 = e2[i]
    if (v1 === null || v2 === null) return null
    return 2 * v1 - v2
  })
}

export function tema(values: number[], period = 20): (number | null)[] {
  const e1 = ema(values, period)
  const nonNull1 = e1.map((v) => v ?? NaN)
  const e2 = ema(nonNull1, period)
  const nonNull2 = e2.map((v) => v ?? NaN)
  const e3 = ema(nonNull2, period)
  return e1.map((v1, i) => {
    const v2 = e2[i]; const v3 = e3[i]
    if (v1 === null || v2 === null || v3 === null) return null
    return 3 * v1 - 3 * v2 + v3
  })
}

// ─── KAMA (Kaufman Adaptive Moving Average) ───────────────────────────────────

export function kama(values: number[], period = 10, fastEnd = 2, slowEnd = 30): (number | null)[] {
  const fastSC = 2 / (fastEnd + 1)
  const slowSC = 2 / (slowEnd + 1)
  const result: (number | null)[] = new Array(values.length).fill(null)
  if (values.length <= period) return result
  result[period] = values[period]
  for (let i = period + 1; i < values.length; i++) {
    const direction = Math.abs(values[i] - values[i - period])
    let volatility = 0
    for (let j = i - period + 1; j <= i; j++) volatility += Math.abs(values[j] - values[j - 1])
    const er = volatility === 0 ? 0 : direction / volatility
    const sc = (er * (fastSC - slowSC) + slowSC) ** 2
    result[i] = result[i - 1]! + sc * (values[i] - result[i - 1]!)
  }
  return result
}

// ─── McGinley Dynamic ────────────────────────────────────────────────────────

export function mcginleyDynamic(values: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null)
  if (values.length === 0) return result
  result[0] = values[0]
  for (let i = 1; i < values.length; i++) {
    const prev = result[i - 1]!
    const ratio = values[i] / prev
    result[i] = prev + (values[i] - prev) / (period * ratio ** 4)
  }
  return result
}

// ─── Classic Stochastic Oscillator ────────────────────────────────────────────

export interface StochasticResult {
  k: (number | null)[]
  d: (number | null)[]
}

export function stochasticOscillator(candles: OhlcvCandle[], kPeriod = 14, kSmooth = 3, dSmooth = 3): StochasticResult {
  const rawK: (number | null)[] = candles.map((_, i) => {
    if (i < kPeriod - 1) return null
    const slice = candles.slice(i - kPeriod + 1, i + 1)
    const high = Math.max(...slice.map((c) => c.high))
    const low = Math.min(...slice.map((c) => c.low))
    return high === low ? 50 : ((candles[i].close - low) / (high - low)) * 100
  })
  // Use NaN (not 0) for warm-up nulls so the fabricated values don't leak into
  // the smoothing window and emit deflated %K/%D too early. Mirrors stochasticRsi.
  const smoothK = sma(rawK.map((v) => v ?? NaN), kSmooth)
  const k = smoothK.map((v, i) => (rawK[i] === null || v === null || isNaN(v)) ? null : v)
  const d = sma(k.map((v) => v ?? NaN), dSmooth).map((v, i) => (k[i] === null || v === null || isNaN(v)) ? null : v)
  return { k, d }
}

// ─── PPO (Percentage Price Oscillator) ────────────────────────────────────────

export function ppo(values: number[], fast = 12, slow = 26, signal = 9): { ppo: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const fastEma = ema(values, fast)
  const slowEma = ema(values, slow)
  const ppoLine = values.map((_, i) => {
    const f = fastEma[i]; const s = slowEma[i]
    if (f === null || s === null || s === 0) return null
    return ((f - s) / s) * 100
  })
  const signalLine = ema(ppoLine.map((v) => v ?? NaN), signal).map((v, i) => ppoLine[i] === null ? null : v)
  const histogram = ppoLine.map((v, i) => {
    const s = signalLine[i]
    return v !== null && s !== null ? v - s : null
  })
  return { ppo: ppoLine, signal: signalLine, histogram }
}

// ─── Vortex Indicator ─────────────────────────────────────────────────────────

export interface VortexResult {
  viPlus: (number | null)[]
  viMinus: (number | null)[]
}

export function vortex(candles: OhlcvCandle[], period = 14): VortexResult {
  const n = candles.length
  const viPlus: (number | null)[] = new Array(n).fill(null)
  const viMinus: (number | null)[] = new Array(n).fill(null)
  for (let i = period; i < n; i++) {
    let vmPlus = 0; let vmMinus = 0; let tr = 0
    for (let j = i - period + 1; j <= i; j++) {
      const curr = candles[j]; const prev = candles[j - 1]
      vmPlus += Math.abs(curr.high - prev.low)
      vmMinus += Math.abs(curr.low - prev.high)
      tr += Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close))
    }
    viPlus[i] = tr === 0 ? null : vmPlus / tr
    viMinus[i] = tr === 0 ? null : vmMinus / tr
  }
  return { viPlus, viMinus }
}

// ─── TSI (True Strength Index) ────────────────────────────────────────────────

export function tsi(values: number[], longPeriod = 25, shortPeriod = 13): (number | null)[] {
  const pc = values.map((v, i) => i === 0 ? 0 : v - values[i - 1])
  const smoothPC = ema(ema(pc, longPeriod).map((v) => v ?? NaN), shortPeriod)
  const smoothAPC = ema(ema(pc.map(Math.abs), longPeriod).map((v) => v ?? NaN), shortPeriod)
  return smoothPC.map((v, i) => {
    const apc = smoothAPC[i]
    if (v === null || apc === null || apc === 0) return null
    return (v / apc) * 100
  })
}

// ─── Fisher Transform ────────────────────────────────────────────────────────

export function fisherTransform(candles: OhlcvCandle[], period = 9): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null)
  const value: number[] = new Array(candles.length).fill(0) // Ehlers' intermediate Value1 series
  let prevFisher = 0
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1)
    const high = Math.max(...slice.map((c) => c.high))
    const low = Math.min(...slice.map((c) => c.low))
    const range = high - low
    const norm = range === 0 ? 0 : (candles[i].close - low) / range - 0.5
    // Ehlers Fisher Transform, two recursive series:
    //   Value1 = 0.66*norm + 0.67*Value1_prev   (clamped to |v| < 1)
    //   Fisher = 0.5*ln((1+Value1)/(1-Value1)) + 0.5*Fisher_prev
    // The previous version fed back the Fisher OUTPUT instead of Value1 and
    // dropped the 0.5*Fisher_prev smoothing — neither Ehlers nor coherent.
    let v = 0.66 * norm + 0.67 * value[i - 1]
    v = Math.max(-0.999, Math.min(0.999, v))
    value[i] = v
    const fisher = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * prevFisher
    result[i] = fisher
    prevFisher = fisher
  }
  return result
}

// ─── Coppock Curve ────────────────────────────────────────────────────────────

export function coppockCurve(values: number[], wmaLen = 10, roc1 = 14, roc2 = 11): (number | null)[] {
  const r1 = roc(values, roc1)
  const r2 = roc(values, roc2)
  const combined = r1.map((v, i) => {
    const v2 = r2[i]
    return v !== null && v2 !== null ? v + v2 : null
  })
  // Mask the whole WMA window, not just combined[i]: zero-filled warm-up entries
  // must not leak into the weighted sum. First valid value is at roc1 + wmaLen - 1.
  return wma(combined.map((v) => v ?? 0), wmaLen).map((v, i) =>
    combined[i] == null || combined[i - wmaLen + 1] == null ? null : v,
  )
}

// ─── Klinger Volume Oscillator ────────────────────────────────────────────────

export function klingerOscillator(candles: OhlcvCandle[], fastPeriod = 34, slowPeriod = 55): (number | null)[] {
  const trend = candles.map((c, i) => {
    if (i === 0) return 1
    const prevTP = (candles[i - 1].high + candles[i - 1].low + candles[i - 1].close) / 3
    const currTP = (c.high + c.low + c.close) / 3
    return currTP > prevTP ? 1 : -1
  })
  const sv = candles.map((c, i) => trend[i] * c.volume)
  const fastEma = ema(sv, fastPeriod)
  const slowEma = ema(sv, slowPeriod)
  return fastEma.map((v, i) => {
    const s = slowEma[i]
    return v !== null && s !== null ? v - s : null
  })
}

// ─── Balance of Power ────────────────────────────────────────────────────────

export function balanceOfPower(candles: OhlcvCandle[], smoothPeriod = 14): (number | null)[] {
  const raw = candles.map((c) => {
    const range = c.high - c.low
    return range === 0 ? 0 : (c.close - c.open) / range
  })
  return sma(raw, smoothPeriod)
}

// ─── Relative Vigor Index (RVI) ───────────────────────────────────────────────

export function relativeVigorIndex(candles: OhlcvCandle[], period = 10): StochasticResult {
  const n = candles.length
  const k: (number | null)[] = new Array(n).fill(null)
  const d: (number | null)[] = new Array(n).fill(null)
  for (let i = 3; i < n; i++) {
    const nums: number[] = []; const dens: number[] = []
    for (let j = Math.max(0, i - period + 1); j <= i; j++) {
      if (j < 3) continue
      const c = candles[j]
      // Symmetric 4-bar weighted average
      nums.push((c.close - c.open + 2 * (candles[j-1].close - candles[j-1].open) + 2 * (candles[j-2].close - candles[j-2].open) + (candles[j-3].close - candles[j-3].open)) / 6)
      dens.push((c.high - c.low + 2 * (candles[j-1].high - candles[j-1].low) + 2 * (candles[j-2].high - candles[j-2].low) + (candles[j-3].high - candles[j-3].low)) / 6)
    }
    const sumNum = nums.reduce((s, v) => s + v, 0)
    const sumDen = dens.reduce((s, v) => s + v, 0)
    k[i] = sumDen === 0 ? null : sumNum / sumDen
  }
  for (let i = 3; i < n; i++) {
    const k0 = k[i]; const k1 = k[i-1]; const k2 = k[i-2]; const k3 = k[i-3]
    if (k0 === null || k1 === null || k2 === null || k3 === null) continue
    d[i] = (k0 + 2 * k1 + 2 * k2 + k3) / 6
  }
  return { k, d }
}

// ─── Chaikin Oscillator ───────────────────────────────────────────────────────

export function chaikinOscillator(candles: OhlcvCandle[], fastPeriod = 3, slowPeriod = 10): (number | null)[] {
  const ad = accDistLine(candles)
  const fastEma = ema(ad, fastPeriod)
  const slowEma = ema(ad, slowPeriod)
  return fastEma.map((v, i) => {
    const s = slowEma[i]
    return v !== null && s !== null ? v - s : null
  })
}

// ─── Disparity Index ──────────────────────────────────────────────────────────

export function disparityIndex(values: number[], period = 14): (number | null)[] {
  const maVals = ema(values, period)
  return values.map((v, i) => {
    const m = maVals[i]
    return m !== null && m !== 0 ? ((v - m) / m) * 100 : null
  })
}

// ─── Connors RSI ──────────────────────────────────────────────────────────────

export function connorsRsi(values: number[], rsiPeriod = 3, streakPeriod = 2, pctRankPeriod = 100): (number | null)[] {
  const rsiVals = rsi(values, rsiPeriod)
  // Streak: consecutive up/down days
  const streak: number[] = new Array(values.length).fill(0)
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) streak[i] = Math.max(1, (streak[i - 1] ?? 0) + 1)
    else if (values[i] < values[i - 1]) streak[i] = Math.min(-1, (streak[i - 1] ?? 0) - 1)
    else streak[i] = 0
  }
  const streakRsi = rsi(streak, streakPeriod)
  // Percent rank of today's ROC over last N periods
  const rocVals = roc(values, 1)
  const pctRank = rocVals.map((v, i) => {
    if (v === null || i < pctRankPeriod) return null
    const window = rocVals.slice(i - pctRankPeriod, i).filter((x): x is number => x !== null)
    const below = window.filter((x) => x < v).length
    return (below / window.length) * 100
  })
  return rsiVals.map((r, i) => {
    const s = streakRsi[i]; const p = pctRank[i]
    if (r === null || s === null || p === null) return null
    return (r + s + p) / 3
  })
}

// ─── Fibonacci Retracement Levels ─────────────────────────────────────────────

export interface FibLevels {
  high: number
  low: number
  levels: { ratio: number; label: string; price: number }[]
}

export function fibRetracement(candles: OhlcvCandle[], lookback = 100): FibLevels {
  const slice = candles.slice(-lookback)
  const high = Math.max(...slice.map((c) => c.high))
  const low = Math.min(...slice.map((c) => c.low))
  const diff = high - low
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
  return {
    high,
    low,
    levels: ratios.map((r) => ({
      ratio: r,
      label: `${(r * 100).toFixed(1)}%`,
      price: high - diff * r,
    })),
  }
}

// ─── Signal Summary ───────────────────────────────────────────────────────────

export type Signal = 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell'

export interface IndicatorSignal {
  name: string
  value: number | null
  signal: Signal
  description: string
}

export interface SignalSummary {
  overall: Signal
  score: number  // -2 to +2
  buy: number
  neutral: number
  sell: number
  signals: IndicatorSignal[]
}

export function computeSignalSummary(candles: OhlcvCandle[]): SignalSummary {
  const closes = candles.map((c) => c.close)
  const n = candles.length
  const last = closes[n - 1]
  const signals: IndicatorSignal[] = []

  // RSI
  const rsiVals = rsi(closes, 14)
  const rsiNow = rsiVals[n - 1]
  if (rsiNow !== null) {
    const sig: Signal = rsiNow < 30 ? 'strong_buy' : rsiNow < 45 ? 'buy' : rsiNow > 70 ? 'strong_sell' : rsiNow > 55 ? 'sell' : 'neutral'
    signals.push({ name: 'RSI (14)', value: rsiNow, signal: sig, description: `${rsiNow.toFixed(1)} — ${rsiNow < 30 ? 'Oversold' : rsiNow > 70 ? 'Overbought' : 'Neutral'}` })
  }

  // MACD
  const { macd: macdLine, signal: signalLine, histogram } = macd(closes)
  const macdNow = macdLine[n - 1]
  const histNow = histogram[n - 1]
  const histPrev = histogram[n - 2]
  if (macdNow !== null && histNow !== null) {
    const rising = histPrev !== null && histNow > histPrev
    const sig: Signal = macdNow > 0 && rising ? 'strong_buy' : macdNow > 0 ? 'buy' : macdNow < 0 && !rising ? 'strong_sell' : macdNow < 0 ? 'sell' : 'neutral'
    signals.push({ name: 'MACD (12,26,9)', value: macdNow, signal: sig, description: `${macdNow > 0 ? 'Bullish' : 'Bearish'}, histogram ${rising ? 'rising' : 'falling'}` })
  }

  // Bollinger Bands
  const bb = bollingerBands(closes, 20, 2)
  const bbUpper = bb.upper[n - 1]; const bbLower = bb.lower[n - 1]; const bbMid = bb.middle[n - 1]
  if (bbUpper !== null && bbLower !== null && bbMid !== null) {
    // A zero-width band (a flat series) makes this 0/0. bollingerPercentB()
    // already guards the same division; this one did not, and `description` is
    // rendered verbatim on both TA pages — so users saw the literal text
    // "NaN% of band".
    const bandWidth = bbUpper - bbLower
    const pct = bandWidth === 0 ? 0.5 : (last - bbLower) / bandWidth
    const sig: Signal = pct < 0.1 ? 'strong_buy' : pct < 0.3 ? 'buy' : pct > 0.9 ? 'strong_sell' : pct > 0.7 ? 'sell' : 'neutral'
    signals.push({ name: 'Bollinger Bands (20,2)', value: pct * 100, signal: sig, description: `${(pct * 100).toFixed(0)}% of band — ${pct < 0.2 ? 'Near lower band' : pct > 0.8 ? 'Near upper band' : 'Mid-band'}` })
  }

  // EMA 20 vs price
  const ema20 = ema(closes, 20)[n - 1]
  if (ema20 !== null) {
    const pct = (last - ema20) / ema20 * 100
    const sig: Signal = pct > 3 ? 'buy' : pct < -3 ? 'sell' : 'neutral'
    signals.push({ name: 'EMA 20', value: ema20, signal: sig, description: `Price ${pct > 0 ? '+' : ''}${pct.toFixed(2)}% vs EMA20` })
  }

  // EMA 50 vs price
  const ema50 = ema(closes, 50)[n - 1]
  if (ema50 !== null) {
    const pct = (last - ema50) / ema50 * 100
    const sig: Signal = pct > 5 ? 'strong_buy' : pct > 1 ? 'buy' : pct < -5 ? 'strong_sell' : pct < -1 ? 'sell' : 'neutral'
    signals.push({ name: 'EMA 50', value: ema50, signal: sig, description: `Price ${pct > 0 ? '+' : ''}${pct.toFixed(2)}% vs EMA50` })
  }

  // EMA 200 vs price
  const ema200 = ema(closes, 200)[n - 1]
  if (ema200 !== null) {
    const pct = (last - ema200) / ema200 * 100
    const sig: Signal = pct > 0 ? 'buy' : 'sell'
    signals.push({ name: 'EMA 200', value: ema200, signal: sig, description: `Price ${pct > 0 ? 'above' : 'below'} 200 EMA (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)` })
  }

  // Stochastic RSI
  const stoch = stochasticRsi(closes)
  const stochK = stoch.k[n - 1]
  if (stochK !== null) {
    const sig: Signal = stochK < 20 ? 'strong_buy' : stochK < 40 ? 'buy' : stochK > 80 ? 'strong_sell' : stochK > 60 ? 'sell' : 'neutral'
    signals.push({ name: 'Stoch RSI K', value: stochK, signal: sig, description: `${stochK.toFixed(1)} — ${stochK < 20 ? 'Oversold' : stochK > 80 ? 'Overbought' : 'Neutral'}` })
  }

  // ATR (volatility — informational only, neutral signal)
  const atrVals = atr(candles, 14)
  const atrNow = atrVals[n - 1]
  if (atrNow !== null) {
    const atrPct = (atrNow / last) * 100
    signals.push({ name: 'ATR (14)', value: atrNow, signal: 'neutral', description: `${atrPct.toFixed(2)}% of price (daily volatility range)` })
  }

  // Williams %R
  const wrVals = williamsr(candles, 14)
  const wrNow = wrVals[n - 1]
  if (wrNow !== null) {
    const sig: Signal = wrNow < -80 ? 'strong_buy' : wrNow < -60 ? 'buy' : wrNow > -20 ? 'strong_sell' : wrNow > -40 ? 'sell' : 'neutral'
    signals.push({ name: 'Williams %R (14)', value: wrNow, signal: sig, description: `${wrNow.toFixed(1)} — ${wrNow < -80 ? 'Oversold' : wrNow > -20 ? 'Overbought' : 'Neutral'}` })
  }

  // CCI
  const cciVals = cci(candles, 20)
  const cciNow = cciVals[n - 1]
  if (cciNow !== null) {
    const sig: Signal = cciNow < -150 ? 'strong_buy' : cciNow < -100 ? 'buy' : cciNow > 150 ? 'strong_sell' : cciNow > 100 ? 'sell' : 'neutral'
    signals.push({ name: 'CCI (20)', value: cciNow, signal: sig, description: `${cciNow.toFixed(0)} — ${cciNow < -100 ? 'Oversold' : cciNow > 100 ? 'Overbought' : 'Neutral'}` })
  }

  // ADX + DI
  const adxResult = adx(candles, 14)
  const adxNow = adxResult.adx[n - 1]
  const pDINow = adxResult.plusDI[n - 1]
  const mDINow = adxResult.minusDI[n - 1]
  if (adxNow !== null && pDINow !== null && mDINow !== null) {
    const trending = adxNow > 25
    const sig: Signal = trending && pDINow > mDINow ? (adxNow > 40 ? 'strong_buy' : 'buy') : trending && pDINow < mDINow ? (adxNow > 40 ? 'strong_sell' : 'sell') : 'neutral'
    signals.push({ name: 'ADX (14)', value: adxNow, signal: sig, description: `ADX ${adxNow.toFixed(1)} — ${trending ? '+DI ' + pDINow.toFixed(1) + ' vs -DI ' + mDINow.toFixed(1) : 'Weak trend / ranging'}` })
  }

  // MFI
  const mfiVals = mfi(candles, 14)
  const mfiNow = mfiVals[n - 1]
  if (mfiNow !== null) {
    const sig: Signal = mfiNow < 20 ? 'strong_buy' : mfiNow < 40 ? 'buy' : mfiNow > 80 ? 'strong_sell' : mfiNow > 60 ? 'sell' : 'neutral'
    signals.push({ name: 'MFI (14)', value: mfiNow, signal: sig, description: `${mfiNow.toFixed(1)} — ${mfiNow < 20 ? 'Oversold (volume)' : mfiNow > 80 ? 'Overbought (volume)' : 'Neutral'}` })
  }

  // CMF
  const cmfVals = cmf(candles, 20)
  const cmfNow = cmfVals[n - 1]
  if (cmfNow !== null) {
    const sig: Signal = cmfNow > 0.15 ? 'buy' : cmfNow < -0.15 ? 'sell' : 'neutral'
    signals.push({ name: 'CMF (20)', value: cmfNow, signal: sig, description: `${cmfNow.toFixed(3)} — ${cmfNow > 0.1 ? 'Buying pressure' : cmfNow < -0.1 ? 'Selling pressure' : 'Neutral money flow'}` })
  }

  // ROC
  const rocVals = roc(closes, 12)
  const rocNow = rocVals[n - 1]
  if (rocNow !== null) {
    const sig: Signal = rocNow > 5 ? 'buy' : rocNow < -5 ? 'sell' : 'neutral'
    signals.push({ name: 'ROC (12)', value: rocNow, signal: sig, description: `${rocNow > 0 ? '+' : ''}${rocNow.toFixed(2)}% — ${rocNow > 0 ? 'Positive momentum' : 'Negative momentum'}` })
  }

  // Parabolic SAR
  const sarVals = parabolicSar(candles)
  const sarNow = sarVals[n - 1]
  if (sarNow !== null) {
    const sig: Signal = sarNow < last ? 'buy' : 'sell'
    signals.push({ name: 'Parabolic SAR', value: sarNow, signal: sig, description: `SAR at $${sarNow.toLocaleString()} — price is ${sarNow < last ? 'above SAR (bullish)' : 'below SAR (bearish)'}` })
  }

  // Aroon Oscillator
  const aroonResult = aroon(candles, 25)
  const aroonOsc = aroonResult.oscillator[n - 1]
  if (aroonOsc !== null) {
    const sig: Signal = aroonOsc > 50 ? 'buy' : aroonOsc < -50 ? 'sell' : 'neutral'
    signals.push({ name: 'Aroon (25)', value: aroonOsc, signal: sig, description: `Oscillator ${aroonOsc.toFixed(0)} — ${aroonOsc > 50 ? 'Strong uptrend' : aroonOsc < -50 ? 'Strong downtrend' : 'No clear trend'}` })
  }

  // Elder Ray
  const elderResult = elderRay(candles, 13)
  const bullP = elderResult.bullPower[n - 1]
  const bearP = elderResult.bearPower[n - 1]
  if (bullP !== null && bearP !== null) {
    // Compare against an epsilon, not 0: on a flat series EMA rounding leaves
    // both powers at about −8.9e-16, which is mathematically zero but tripped
    // the "both negative" branch and reported strong_sell on a motionless
    // price.
    const EPS = 1e-9
    const sig: Signal = bullP > EPS && bearP > EPS ? 'strong_buy'
      : bullP > EPS ? 'buy'
      : bearP < -EPS && bullP < -EPS ? 'strong_sell'
      : Math.abs(bullP) <= EPS && Math.abs(bearP) <= EPS ? 'neutral'
      : 'sell'
    signals.push({ name: 'Elder Ray (13)', value: bullP, signal: sig, description: `Bull Power ${bullP > 0 ? '+' : ''}${bullP.toFixed(2)}, Bear Power ${bearP.toFixed(2)}` })
  }

  // Classic Stochastic
  const stoch2 = stochasticOscillator(candles, 14, 3, 3)
  const stochK2 = stoch2.k[n - 1]; const stochD2 = stoch2.d[n - 1]
  if (stochK2 !== null && stochD2 !== null) {
    const sig: Signal = stochK2 < 20 && stochK2 > stochD2 ? 'strong_buy' : stochK2 < 30 ? 'buy' : stochK2 > 80 && stochK2 < stochD2 ? 'strong_sell' : stochK2 > 70 ? 'sell' : 'neutral'
    signals.push({ name: 'Stochastic (14,3,3)', value: stochK2, signal: sig, description: `%K ${stochK2.toFixed(1)}, %D ${stochD2.toFixed(1)} — ${stochK2 < 20 ? 'Oversold' : stochK2 > 80 ? 'Overbought' : 'Neutral'}` })
  }

  // TSI
  const tsiVals = tsi(closes, 25, 13)
  const tsiNow = tsiVals[n - 1]
  if (tsiNow !== null) {
    const sig: Signal = tsiNow > 25 ? 'buy' : tsiNow < -25 ? 'sell' : tsiNow > 0 ? 'buy' : tsiNow < 0 ? 'sell' : 'neutral'
    signals.push({ name: 'TSI (25,13)', value: tsiNow, signal: sig, description: `${tsiNow.toFixed(1)} — ${tsiNow > 0 ? 'Positive momentum' : 'Negative momentum'}` })
  }

  // PPO
  const ppoResult = ppo(closes, 12, 26, 9)
  const ppoNow = ppoResult.ppo[n - 1]; const ppoHistNow = ppoResult.histogram[n - 1]; const ppoHistPrev = ppoResult.histogram[n - 2]
  if (ppoNow !== null && ppoHistNow !== null) {
    const rising = ppoHistPrev !== null && ppoHistNow > ppoHistPrev
    const sig: Signal = ppoNow > 0 && rising ? 'buy' : ppoNow < 0 && !rising ? 'sell' : 'neutral'
    signals.push({ name: 'PPO (12,26,9)', value: ppoNow, signal: sig, description: `${ppoNow > 0 ? '+' : ''}${ppoNow.toFixed(3)}% — ${ppoNow > 0 ? 'Bullish' : 'Bearish'}, histogram ${rising ? 'rising' : 'falling'}` })
  }

  // Vortex
  const vortexResult = vortex(candles, 14)
  const viP = vortexResult.viPlus[n - 1]; const viM = vortexResult.viMinus[n - 1]
  if (viP !== null && viM !== null) {
    const sig: Signal = viP > viM && viP > 1.1 ? 'buy' : viM > viP && viM > 1.1 ? 'sell' : 'neutral'
    signals.push({ name: 'Vortex (14)', value: viP - viM, signal: sig, description: `VI+ ${viP.toFixed(3)}, VI− ${viM.toFixed(3)} — ${viP > viM ? 'Bullish' : 'Bearish'}` })
  }

  // Fisher Transform
  const fisherVals = fisherTransform(candles, 9)
  const fisherNow = fisherVals[n - 1]; const fisherPrev = fisherVals[n - 2]
  if (fisherNow !== null && fisherPrev !== null) {
    // The /100 and the ±200 thresholds were left over from a pre-rewrite
    // implementation (see the corrective note on fisherTransform). The current
    // Ehlers version clamps Value1 to ±0.999, which bounds Fisher at about
    // ±7.6 — so the value was reported at 1/100 of its true size (7.60 shown
    // as "0.08") and BOTH reversal branches were unreachable, collapsing the
    // signal to a bare sign test. ±2.5 is the conventional extreme for this
    // scale.
    const rising = fisherNow > fisherPrev
    const sig: Signal = fisherNow > 2.5 && !rising ? 'sell' : fisherNow < -2.5 && rising ? 'buy' : fisherNow > 0 ? 'buy' : 'sell'
    signals.push({ name: 'Fisher Transform (9)', value: fisherNow, signal: sig, description: `${fisherNow.toFixed(2)} — ${rising ? 'Rising (bullish)' : 'Falling (bearish)'}` })
  }

  // Balance of Power
  const bopVals = balanceOfPower(candles, 14)
  const bopNow = bopVals[n - 1]
  if (bopNow !== null) {
    const sig: Signal = bopNow > 0.3 ? 'buy' : bopNow < -0.3 ? 'sell' : 'neutral'
    signals.push({ name: 'Balance of Power', value: bopNow, signal: sig, description: `${bopNow.toFixed(3)} — ${bopNow > 0 ? 'Buyers in control' : 'Sellers in control'}` })
  }

  // Chaikin Oscillator
  const coVals = chaikinOscillator(candles, 3, 10)
  const coNow = coVals[n - 1]; const coPrev = coVals[n - 2]
  if (coNow !== null) {
    const crossed = coPrev !== null && Math.sign(coNow) !== Math.sign(coPrev)
    const sig: Signal = coNow > 0 && crossed ? 'strong_buy' : coNow > 0 ? 'buy' : coNow < 0 && crossed ? 'strong_sell' : coNow < 0 ? 'sell' : 'neutral'
    signals.push({ name: 'Chaikin Osc (3,10)', value: coNow, signal: sig, description: `${coNow > 0 ? 'Buying' : 'Selling'} pressure ${crossed ? '— just crossed zero!' : ''}` })
  }

  // Connors RSI
  const crsiVals = connorsRsi(closes, 3, 2, 100)
  const crsiNow = crsiVals[n - 1]
  if (crsiNow !== null) {
    const sig: Signal = crsiNow < 10 ? 'strong_buy' : crsiNow < 25 ? 'buy' : crsiNow > 90 ? 'strong_sell' : crsiNow > 75 ? 'sell' : 'neutral'
    signals.push({ name: 'Connors RSI', value: crsiNow, signal: sig, description: `${crsiNow.toFixed(1)} — ${crsiNow < 25 ? 'Oversold (composite)' : crsiNow > 75 ? 'Overbought (composite)' : 'Neutral'}` })
  }

  const score = signals.reduce((s, sig) => {
    if (sig.signal === 'strong_buy') return s + 2
    if (sig.signal === 'buy') return s + 1
    if (sig.signal === 'sell') return s - 1
    if (sig.signal === 'strong_sell') return s - 2
    return s
  }, 0) / Math.max(signals.filter((s) => s.signal !== 'neutral').length, 1)

  const buy = signals.filter((s) => s.signal === 'buy' || s.signal === 'strong_buy').length
  const sell = signals.filter((s) => s.signal === 'sell' || s.signal === 'strong_sell').length
  const neutral = signals.filter((s) => s.signal === 'neutral').length

  const overall: Signal =
    score >= 1.5 ? 'strong_buy' :
    score >= 0.5 ? 'buy' :
    score <= -1.5 ? 'strong_sell' :
    score <= -0.5 ? 'sell' : 'neutral'

  return { overall, score, buy, neutral, sell, signals }
}

// ─── Pattern Detection ────────────────────────────────────────────────────────

export interface DetectedPattern {
  name: string
  type: 'bullish' | 'bearish' | 'neutral'
  confidence: number  // 0–1
  description: string
  startIndex: number
  endIndex: number
}

export function detectPatterns(candles: OhlcvCandle[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = []
  const n = candles.length
  if (n < 20) return patterns

  const closes = candles.map((c) => c.close)
  const highs = candles.map((c) => c.high)
  const lows = candles.map((c) => c.low)

  // Find local peaks and troughs (swing points)
  const swingWindow = 5
  const peaks: number[] = []
  const troughs: number[] = []
  for (let i = swingWindow; i < n - swingWindow; i++) {
    const windowH = highs.slice(i - swingWindow, i + swingWindow + 1)
    const windowL = lows.slice(i - swingWindow, i + swingWindow + 1)
    if (highs[i] === Math.max(...windowH)) peaks.push(i)
    if (lows[i] === Math.min(...windowL)) troughs.push(i)
  }

  // Double Top
  if (peaks.length >= 2) {
    const p1i = peaks[peaks.length - 2]
    const p2i = peaks[peaks.length - 1]
    const p1 = highs[p1i]; const p2 = highs[p2i]
    const gap = p2i - p1i
    if (gap >= 10 && gap <= 60 && Math.abs(p1 - p2) / p1 < 0.03) {
      const neckline = Math.min(...lows.slice(p1i, p2i + 1))
      const conf = 1 - Math.abs(p1 - p2) / p1 / 0.03
      patterns.push({
        name: 'Double Top',
        type: 'bearish',
        confidence: Math.min(conf, 0.95),
        description: `Two peaks near $${((p1 + p2) / 2).toLocaleString()} with neckline at $${neckline.toLocaleString()}`,
        startIndex: p1i,
        endIndex: p2i,
      })
    }
  }

  // Double Bottom
  if (troughs.length >= 2) {
    const t1i = troughs[troughs.length - 2]
    const t2i = troughs[troughs.length - 1]
    const t1 = lows[t1i]; const t2 = lows[t2i]
    const gap = t2i - t1i
    if (gap >= 10 && gap <= 60 && Math.abs(t1 - t2) / t1 < 0.03) {
      const neckline = Math.max(...highs.slice(t1i, t2i + 1))
      const conf = 1 - Math.abs(t1 - t2) / t1 / 0.03
      patterns.push({
        name: 'Double Bottom',
        type: 'bullish',
        confidence: Math.min(conf, 0.95),
        description: `Two troughs near $${((t1 + t2) / 2).toLocaleString()} with neckline at $${neckline.toLocaleString()}`,
        startIndex: t1i,
        endIndex: t2i,
      })
    }
  }

  // Head and Shoulders (bearish)
  if (peaks.length >= 3) {
    const [l, h, r] = peaks.slice(-3)
    const lH = highs[l]; const hH = highs[h]; const rH = highs[r]
    if (hH > lH && hH > rH && Math.abs(lH - rH) / hH < 0.05) {
      const shoulder = (lH + rH) / 2
      const conf = Math.min((hH - shoulder) / shoulder / 0.1, 0.9)
      patterns.push({
        name: 'Head & Shoulders',
        type: 'bearish',
        confidence: conf,
        description: `Head at $${hH.toLocaleString()}, shoulders ~$${shoulder.toLocaleString()} — bearish reversal signal`,
        startIndex: l,
        endIndex: r,
      })
    }
  }

  // Inverse Head and Shoulders (bullish)
  if (troughs.length >= 3) {
    const [l, h, r] = troughs.slice(-3)
    const lL = lows[l]; const hL = lows[h]; const rL = lows[r]
    if (hL < lL && hL < rL && Math.abs(lL - rL) / lL < 0.05) {
      const shoulder = (lL + rL) / 2
      const conf = Math.min((shoulder - hL) / shoulder / 0.1, 0.9)
      patterns.push({
        name: 'Inv. Head & Shoulders',
        type: 'bullish',
        confidence: conf,
        description: `Head at $${hL.toLocaleString()}, shoulders ~$${shoulder.toLocaleString()} — bullish reversal signal`,
        startIndex: l,
        endIndex: r,
      })
    }
  }

  // Ascending Triangle
  if (peaks.length >= 2 && troughs.length >= 2) {
    const recentPeaks = peaks.slice(-3)
    const recentTroughs = troughs.slice(-3)
    const peakVariance = Math.max(...recentPeaks.map((i) => highs[i])) - Math.min(...recentPeaks.map((i) => highs[i]))
    const peakMean = recentPeaks.reduce((s, i) => s + highs[i], 0) / recentPeaks.length
    const troughSlope = (lows[recentTroughs[recentTroughs.length - 1]] - lows[recentTroughs[0]]) /
      (recentTroughs[recentTroughs.length - 1] - recentTroughs[0])

    if (peakVariance / peakMean < 0.02 && troughSlope > 0) {
      patterns.push({
        name: 'Ascending Triangle',
        type: 'bullish',
        confidence: 0.65,
        description: `Flat resistance near $${peakMean.toLocaleString()} with rising support — bullish breakout expected`,
        startIndex: Math.min(...recentPeaks, ...recentTroughs),
        endIndex: n - 1,
      })
    }
  }

  // Golden Cross / Death Cross (EMA 50 vs EMA 200)
  const ema50 = ema(closes, 50)
  const ema200 = ema(closes, 200)
  if (ema50[n - 1] !== null && ema200[n - 1] !== null && ema50[n - 2] !== null && ema200[n - 2] !== null) {
    const crossedAbove = ema50[n - 2]! < ema200[n - 2]! && ema50[n - 1]! > ema200[n - 1]!
    const crossedBelow = ema50[n - 2]! > ema200[n - 2]! && ema50[n - 1]! < ema200[n - 1]!
    if (crossedAbove) {
      patterns.push({ name: 'Golden Cross', type: 'bullish', confidence: 0.8, description: 'EMA50 crossed above EMA200 — strong bullish signal', startIndex: n - 5, endIndex: n - 1 })
    }
    if (crossedBelow) {
      patterns.push({ name: 'Death Cross', type: 'bearish', confidence: 0.8, description: 'EMA50 crossed below EMA200 — strong bearish signal', startIndex: n - 5, endIndex: n - 1 })
    }
  }

  // Bullish/Bearish Engulfing (last 2 candles)
  if (n >= 2) {
    const prev = candles[n - 2]; const curr = candles[n - 1]
    const prevBearish = prev.close < prev.open
    const currBullish = curr.close > curr.open
    if (prevBearish && currBullish && curr.open < prev.close && curr.close > prev.open) {
      patterns.push({ name: 'Bullish Engulfing', type: 'bullish', confidence: 0.7, description: 'Current candle fully engulfs previous bearish candle', startIndex: n - 2, endIndex: n - 1 })
    }
    const prevBullish = prev.close > prev.open
    const currBearish = curr.close < curr.open
    if (prevBullish && currBearish && curr.open > prev.close && curr.close < prev.open) {
      patterns.push({ name: 'Bearish Engulfing', type: 'bearish', confidence: 0.7, description: 'Current candle fully engulfs previous bullish candle', startIndex: n - 2, endIndex: n - 1 })
    }
  }

  // Hammer / Inverted Hammer / Shooting Star / Doji (single candle)
  if (n >= 1) {
    const c = candles[n - 1]
    const body = Math.abs(c.close - c.open)
    const totalRange = c.high - c.low
    const upperWick = c.high - Math.max(c.open, c.close)
    const lowerWick = Math.min(c.open, c.close) - c.low

    if (totalRange > 0) {
      // Doji: tiny body relative to range
      if (body / totalRange < 0.1) {
        patterns.push({ name: 'Doji', type: 'neutral', confidence: 0.55, description: 'Open ≈ close — indecision, potential reversal', startIndex: n - 1, endIndex: n - 1 })
      }

      // Hammer: small body at top, long lower wick (bullish reversal after downtrend)
      if (lowerWick >= 2 * body && upperWick <= body && body / totalRange < 0.35) {
        patterns.push({ name: 'Hammer', type: 'bullish', confidence: 0.65, description: 'Long lower wick with small body — potential bullish reversal', startIndex: n - 1, endIndex: n - 1 })
      }

      // Inverted Hammer: small body at bottom, long upper wick
      if (upperWick >= 2 * body && lowerWick <= body && body / totalRange < 0.35) {
        patterns.push({ name: 'Inverted Hammer', type: 'bullish', confidence: 0.55, description: 'Long upper wick with small body — potential bullish reversal', startIndex: n - 1, endIndex: n - 1 })
      }

      // Shooting Star: small body at bottom, long upper wick (bearish reversal after uptrend)
      if (upperWick >= 2 * body && lowerWick <= 0.1 * totalRange) {
        patterns.push({ name: 'Shooting Star', type: 'bearish', confidence: 0.65, description: 'Long upper wick after advance — potential bearish reversal', startIndex: n - 1, endIndex: n - 1 })
      }
    }
  }

  // Morning Star (bullish 3-candle reversal)
  if (n >= 3) {
    const c1 = candles[n - 3]; const c2 = candles[n - 2]; const c3 = candles[n - 1]
    const c1Bear = c1.close < c1.open
    const c3Bull = c3.close > c3.open
    const c2SmallBody = Math.abs(c2.close - c2.open) < Math.abs(c1.close - c1.open) * 0.3
    const c3MidPoint = (c1.open + c1.close) / 2
    if (c1Bear && c2SmallBody && c3Bull && c3.close > c3MidPoint) {
      patterns.push({ name: 'Morning Star', type: 'bullish', confidence: 0.75, description: 'Three-candle bullish reversal: large bear, small body, large bull', startIndex: n - 3, endIndex: n - 1 })
    }
  }

  // Evening Star (bearish 3-candle reversal)
  if (n >= 3) {
    const c1 = candles[n - 3]; const c2 = candles[n - 2]; const c3 = candles[n - 1]
    const c1Bull = c1.close > c1.open
    const c3Bear = c3.close < c3.open
    const c2SmallBody = Math.abs(c2.close - c2.open) < Math.abs(c1.close - c1.open) * 0.3
    const c3MidPoint = (c1.open + c1.close) / 2
    if (c1Bull && c2SmallBody && c3Bear && c3.close < c3MidPoint) {
      patterns.push({ name: 'Evening Star', type: 'bearish', confidence: 0.75, description: 'Three-candle bearish reversal: large bull, small body, large bear', startIndex: n - 3, endIndex: n - 1 })
    }
  }

  // Three White Soldiers (bullish)
  if (n >= 3) {
    const [c1, c2, c3] = [candles[n - 3], candles[n - 2], candles[n - 1]]
    if (c1.close > c1.open && c2.close > c2.open && c3.close > c3.open &&
        c2.open > c1.open && c2.close > c1.close &&
        c3.open > c2.open && c3.close > c2.close) {
      patterns.push({ name: 'Three White Soldiers', type: 'bullish', confidence: 0.78, description: 'Three consecutive bullish candles — strong buying momentum', startIndex: n - 3, endIndex: n - 1 })
    }
  }

  // Three Black Crows (bearish)
  if (n >= 3) {
    const [c1, c2, c3] = [candles[n - 3], candles[n - 2], candles[n - 1]]
    if (c1.close < c1.open && c2.close < c2.open && c3.close < c3.open &&
        c2.open < c1.open && c2.close < c1.close &&
        c3.open < c2.open && c3.close < c2.close) {
      patterns.push({ name: 'Three Black Crows', type: 'bearish', confidence: 0.78, description: 'Three consecutive bearish candles — strong selling momentum', startIndex: n - 3, endIndex: n - 1 })
    }
  }

  return patterns.sort((a, b) => b.confidence - a.confidence)
}

// ─── Plain-English technical read (Signal Summary, feature #1) ────────────────

export interface TechnicalRead {
  trendBias:    { state: 'bullish' | 'bearish' | 'neutral'; detail: string }
  momentum:     { state: 'strengthening' | 'weakening' | 'overbought' | 'oversold' | 'neutral'; detail: string }
  volatility:   { state: 'expanding' | 'contracting' | 'normal'; detail: string }
  srProximity:  { detail: string }
  confidence:   number // 0–100 — agreement-weighted conviction
  sourceExplanation: string
}

/**
 * Translate the raw indicator stack into a compact, plain-English read. Pure
 * derivation from the candle series — no external data. `summary` is reused so we
 * don't recompute the indicator votes.
 */
export function buildTechnicalRead(candles: OhlcvCandle[], summary: SignalSummary): TechnicalRead {
  const closes = candles.map((c) => c.close)
  const n = candles.length
  const last = closes[n - 1]

  // Trend — EMA stack + price position
  const ema20 = ema(closes, 20)[n - 1]
  const ema50 = ema(closes, 50)[n - 1]
  const ema200 = ema(closes, 200)[n - 1]
  let trendState: TechnicalRead['trendBias']['state'] = 'neutral'
  let trendDetail = 'No clear trend — price near its moving averages.'
  if (ema20 !== null && ema50 !== null) {
    const above200 = ema200 !== null ? last > ema200 : null
    if (last > ema20 && ema20 > ema50 && (above200 ?? true)) {
      trendState = 'bullish'
      trendDetail = `Price above EMA20 > EMA50${ema200 !== null && above200 ? ' and above EMA200' : ''} — aligned uptrend.`
    } else if (last < ema20 && ema20 < ema50 && (above200 === false || above200 === null)) {
      trendState = 'bearish'
      trendDetail = `Price below EMA20 < EMA50${ema200 !== null && above200 === false ? ' and below EMA200' : ''} — aligned downtrend.`
    } else {
      trendDetail = 'Moving averages are mixed — trend is transitioning or ranging.'
    }
  }

  // Momentum — RSI level + MACD histogram direction
  const rsiNow = rsi(closes, 14)[n - 1]
  const { histogram } = macd(closes)
  const hNow = histogram[n - 1]
  const hPrev = histogram[n - 2]
  let momState: TechnicalRead['momentum']['state'] = 'neutral'
  let momDetail = 'Momentum is flat.'
  if (rsiNow !== null) {
    const histRising = hNow !== null && hPrev !== null && hNow > hPrev
    if (rsiNow > 70) { momState = 'overbought'; momDetail = `RSI ${rsiNow.toFixed(0)} — overbought; pullback risk rising.` }
    else if (rsiNow < 30) { momState = 'oversold'; momDetail = `RSI ${rsiNow.toFixed(0)} — oversold; bounce potential.` }
    else if (histRising && rsiNow >= 50) { momState = 'strengthening'; momDetail = `RSI ${rsiNow.toFixed(0)} with MACD histogram rising — momentum building.` }
    else if (!histRising && rsiNow < 50) { momState = 'weakening'; momDetail = `RSI ${rsiNow.toFixed(0)} with MACD histogram falling — momentum fading.` }
    else { momDetail = `RSI ${rsiNow.toFixed(0)} — neutral momentum.` }
  }

  // Volatility — current ATR vs its own recent average (proxy for expansion/contraction)
  const atrVals = atr(candles, 14)
  const atrNow = atrVals[n - 1]
  const atrWindow = atrVals.slice(Math.max(0, n - 50)).filter((v): v is number => v !== null)
  const atrAvg = atrWindow.length ? atrWindow.reduce((a, b) => a + b, 0) / atrWindow.length : null
  let volState: TechnicalRead['volatility']['state'] = 'normal'
  let volDetail = 'Volatility near its recent average.'
  if (atrNow !== null && atrAvg !== null && atrAvg > 0) {
    const ratio = atrNow / atrAvg
    const atrPctOfPrice = (atrNow / last) * 100
    if (ratio > 1.25) { volState = 'expanding'; volDetail = `ATR ${atrPctOfPrice.toFixed(1)}% of price — ${Math.round((ratio - 1) * 100)}% above its 50-bar average; expanding.` }
    else if (ratio < 0.8) { volState = 'contracting'; volDetail = `ATR ${atrPctOfPrice.toFixed(1)}% of price — compressed vs average; breakouts often follow.` }
    else { volDetail = `ATR ${atrPctOfPrice.toFixed(1)}% of price — typical volatility.` }
  }

  // Support/Resistance proximity — nearest detected level
  const levels = detectSupportResistance(candles)
  let srDetail = 'No nearby support/resistance level detected.'
  if (levels.length > 0) {
    const nearest = levels.reduce((a, b) => Math.abs(a.distancePct) < Math.abs(b.distancePct) ? a : b)
    const dir = nearest.distancePct >= 0 ? 'above' : 'below'
    srDetail = `Nearest ${nearest.type} ~$${nearest.price.toLocaleString(undefined, { maximumFractionDigits: nearest.price > 100 ? 0 : 4 })} (${Math.abs(nearest.distancePct).toFixed(1)}% ${dir}).`
  }

  // Confidence — agreement-weighted: |score| (0–2) scaled by share of non-neutral votes
  const totalVotes = summary.buy + summary.neutral + summary.sell
  const decisiveShare = totalVotes > 0 ? (summary.buy + summary.sell) / totalVotes : 0
  const confidence = Math.round(Math.min(100, (Math.abs(summary.score) / 2) * 100 * (0.4 + 0.6 * decisiveShare)))

  return {
    trendBias:   { state: trendState, detail: trendDetail },
    momentum:    { state: momState, detail: momDetail },
    volatility:  { state: volState, detail: volDetail },
    srProximity: { detail: srDetail },
    confidence,
    sourceExplanation: `Derived from ${n} candles via client-side EMA/RSI/MACD/Bollinger/ATR. Not financial advice.`,
  }
}

// ─── Auto support / resistance (feature #2) ───────────────────────────────────

export interface SRLevel {
  price: number
  type: 'support' | 'resistance'
  strength: number    // number of swing touches clustered into this level
  distancePct: number // signed % from current price (+ = above price)
}

/**
 * Detect horizontal support/resistance by finding swing highs/lows and clustering
 * nearby ones into levels. Strength = how many swings fall in the cluster. Pure
 * derivation from candles.
 */
export function detectSupportResistance(
  candles: OhlcvCandle[],
  { swingWindow = 4, clusterPct = 0.012, maxLevels = 6 } = {},
): SRLevel[] {
  const n = candles.length
  if (n < swingWindow * 2 + 1) return []
  const highs = candles.map((c) => c.high)
  const lows = candles.map((c) => c.low)
  const last = candles[n - 1].close

  // Collect swing pivots
  const pivots: number[] = []
  for (let i = swingWindow; i < n - swingWindow; i++) {
    const wH = highs.slice(i - swingWindow, i + swingWindow + 1)
    const wL = lows.slice(i - swingWindow, i + swingWindow + 1)
    if (highs[i] === Math.max(...wH)) pivots.push(highs[i])
    if (lows[i] === Math.min(...wL)) pivots.push(lows[i])
  }
  if (pivots.length === 0) return []

  // Cluster pivots within clusterPct of each other
  pivots.sort((a, b) => a - b)
  const clusters: number[][] = []
  for (const p of pivots) {
    const lastCluster = clusters[clusters.length - 1]
    if (lastCluster && Math.abs(p - lastCluster[0]) / lastCluster[0] <= clusterPct) {
      lastCluster.push(p)
    } else {
      clusters.push([p])
    }
  }

  const levels: SRLevel[] = clusters.map((c) => {
    const price = c.reduce((a, b) => a + b, 0) / c.length
    return {
      price,
      type: price >= last ? 'resistance' : 'support',
      strength: c.length,
      distancePct: ((price - last) / last) * 100,
    }
  })

  // Rank by strength then proximity; keep the most relevant, display high→low
  return levels
    .sort((a, b) => b.strength - a.strength || Math.abs(a.distancePct) - Math.abs(b.distancePct))
    .slice(0, maxLevels)
    .sort((a, b) => b.price - a.price)
}

// ─── Pattern projection: invalidation + measured move (feature #6) ────────────

export interface PatternProjection {
  invalidationLevel: number
  measuredMoveTarget: number
  breakLevel: number
}

/**
 * Derive an invalidation level and a measured-move target for a detected pattern
 * from its price range. Generic heuristic (height projected from the break level);
 * returns null for neutral patterns where direction is undefined.
 */
export function patternProjection(p: DetectedPattern, candles: OhlcvCandle[]): PatternProjection | null {
  if (p.type === 'neutral') return null
  const slice = candles.slice(p.startIndex, p.endIndex + 1)
  if (slice.length === 0) return null
  const hi = Math.max(...slice.map((c) => c.high))
  const lo = Math.min(...slice.map((c) => c.low))
  const height = hi - lo
  if (p.type === 'bullish') {
    // Breaks up through resistance (top of range); invalidated below the range low.
    return { breakLevel: hi, invalidationLevel: lo, measuredMoveTarget: hi + height }
  }
  // Bearish: breaks down through support (bottom of range); invalidated above range high.
  return { breakLevel: lo, invalidationLevel: hi, measuredMoveTarget: lo - height }
}
