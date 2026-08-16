// Multi-asset scanner setup detection. Pure derivation from a candle series —
// no fetching, no UI — so each detector is testable against constructed geometry.

import {
  rsi, ema, obv, bollingerBands,
  type OhlcvCandle,
} from './indicators'

export type SetupKey =
  | 'breakout' | 'oversold_bounce' | 'overbought_fade' | 'ma_cross'
  | 'volume_spike' | 'obv_divergence' | 'volatility_compression'

export interface DetectedSetup { key: SetupKey; detail: string }

/** Detect named technical setups on a daily candle series. Pure derivation. */
export function detectSetups(candles: OhlcvCandle[]): DetectedSetup[] {
  const n = candles.length
  if (n < 55) return []
  const closes = candles.map(c => c.close)
  const highs = candles.map(c => c.high)
  const vols = candles.map(c => c.volume)
  const last = closes[n - 1]
  const prev = closes[n - 2]
  const setups: DetectedSetup[] = []

  // Breakout — close above the prior 20-bar high
  const priorHigh = Math.max(...highs.slice(n - 21, n - 1))
  if (last > priorHigh) setups.push({ key: 'breakout', detail: `Closed above 20-bar high $${priorHigh.toLocaleString(undefined, { maximumFractionDigits: 2 })}` })

  // Oversold bounce — RSI < 38 and turning up
  const rsiVals = rsi(closes, 14)
  const rsiNow = rsiVals[n - 1]; const rsiPrev = rsiVals[n - 2]
  if (rsiNow !== null && rsiNow < 38 && last > prev && (rsiPrev === null || rsiNow > rsiPrev)) {
    setups.push({ key: 'oversold_bounce', detail: `RSI ${rsiNow.toFixed(0)} turning up off oversold` })
  }

  // Overbought fade — RSI > 68 and rolling over (bearish counterpart)
  if (rsiNow !== null && rsiNow > 68 && last < prev && (rsiPrev === null || rsiNow < rsiPrev)) {
    setups.push({ key: 'overbought_fade', detail: `RSI ${rsiNow.toFixed(0)} rolling over from overbought` })
  }

  // MA cross — EMA20/EMA50 crossed within the last ~2 bars
  const e20 = ema(closes, 20); const e50 = ema(closes, 50)
  const a20 = e20[n - 1], a50 = e50[n - 1], b20 = e20[n - 3], b50 = e50[n - 3]
  if (a20 !== null && a50 !== null && b20 !== null && b50 !== null) {
    if (b20 <= b50 && a20 > a50) setups.push({ key: 'ma_cross', detail: 'EMA20 crossed above EMA50 (golden)' })
    else if (b20 >= b50 && a20 < a50) setups.push({ key: 'ma_cross', detail: 'EMA20 crossed below EMA50 (death)' })
  }

  // Volume spike — last bar > 2× the 20-bar average
  const avgVol = vols.slice(n - 21, n - 1).reduce((a, b) => a + b, 0) / 20
  if (avgVol > 0 && vols[n - 1] > avgVol * 2) setups.push({ key: 'volume_spike', detail: `Volume ${(vols[n - 1] / avgVol).toFixed(1)}× its 20-bar average` })

  // OBV divergence — price made a lower low over ~14 bars but OBV held/rose,
  // i.e. accumulation under a falling price (bullish divergence).
  if (n >= 16) {
    const obvArr = obv(candles)
    const back = 14
    const priceChg = (last - closes[n - 1 - back]) / closes[n - 1 - back]
    const obvChg = obvArr[n - 1] - obvArr[n - 1 - back]
    if (priceChg < -0.03 && obvChg > 0) {
      setups.push({ key: 'obv_divergence', detail: `Price ${(priceChg * 100).toFixed(0)}% but OBV rising — accumulation` })
    }
  }

  // Volatility compression — Bollinger width near its 50-bar minimum (squeeze)
  const bb = bollingerBands(closes, 20, 2)
  const widths: number[] = []
  for (let i = Math.max(0, n - 50); i < n; i++) {
    const u = bb.upper[i], l = bb.lower[i], m = bb.middle[i]
    if (u !== null && l !== null && m !== null && m !== 0) widths.push((u - l) / m)
  }
  if (widths.length > 10) {
    const cur = widths[widths.length - 1]
    const min = Math.min(...widths)
    if (cur <= min * 1.1) setups.push({ key: 'volatility_compression', detail: 'Bollinger bands at a 50-bar squeeze' })
  }

  return setups
}
