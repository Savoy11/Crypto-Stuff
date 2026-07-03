/**
 * Normalizers — turn raw metrics (volatility, open interest, market cap …)
 * into 0–100 safety scores. Pure functions, no I/O.
 */

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

/**
 * Linear map from [worst, best] to [0, 100]. Works in either direction:
 * linear(vol, 1.0, 0.1) scores lower volatility as safer.
 */
export function linear(value: number, worst: number, best: number): number {
  if (worst === best) return 50
  return clamp(((value - worst) / (best - worst)) * 100, 0, 100)
}

/**
 * Piecewise-linear map through calibration points, interpolating between
 * them and clamping at the ends. Points must be sorted by input ascending.
 *
 *   piecewise(marketCap, [[5e7, 10], [3e8, 45], [2e9, 70], [1e10, 85], [2e11, 95]])
 */
export function piecewise(value: number, points: ReadonlyArray<readonly [number, number]>): number {
  if (points.length === 0) throw new RangeError('piecewise needs at least one point')
  if (value <= points[0][0]) return points[0][1]
  const last = points[points.length - 1]
  if (value >= last[0]) return last[1]
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1]
    const [x2, y2] = points[i]
    if (value <= x2) {
      return y1 + ((value - x1) / (x2 - x1)) * (y2 - y1)
    }
  }
  return last[1]
}

/**
 * Convert a 1–10 higher-is-riskier rating (the staking providers scale)
 * to a 0–100 higher-is-safer score. 1 → 100, 10 → 0.
 */
export function tenPointRiskToSafety(risk: number): number {
  return clamp(((10 - risk) / 9) * 100, 0, 100)
}

/** Annualized volatility from a series of closing prices (daily bars). */
export function annualizedVolatility(dailyCloses: number[]): number | null {
  if (dailyCloses.length < 10) return null
  const returns: number[] = []
  for (let i = 1; i < dailyCloses.length; i++) {
    if (dailyCloses[i - 1] > 0) returns.push(Math.log(dailyCloses[i] / dailyCloses[i - 1]))
  }
  if (returns.length < 9) return null
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(252)
}

/** Maximum peak-to-trough drawdown of a price series, as a fraction (0.35 = -35%). */
export function maxDrawdown(closes: number[]): number | null {
  if (closes.length < 2) return null
  let peak = closes[0]
  let worst = 0
  for (const price of closes) {
    if (price > peak) peak = price
    else if (peak > 0) worst = Math.max(worst, (peak - price) / peak)
  }
  return worst
}
