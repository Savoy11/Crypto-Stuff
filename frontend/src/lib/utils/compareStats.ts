// Pure comparison math for the Compare page: growth-of-100 normalization,
// per-series window statistics, and a return-correlation matrix. Kept free of
// React/fetch so it can be unit-tested (see __tests__/compareStats.test.ts).

export interface ChartPoint {
  t: number // epoch ms
  close: number
}

export interface NamedSeries {
  symbol: string
  points: ChartPoint[]
}

const TRADING_DAYS = 252

/**
 * Snap each point to the UTC midnight of its calendar date and collapse
 * same-day points to the LAST close (the daily close). Session-review fix:
 * this is what makes cross-venue series comparable at all — crypto history
 * arrives stamped at UTC midnight, equity bars at market-open epoch
 * seconds, FMP at midnight, so exact-timestamp joins across those calendars
 * share ZERO keys (every cross-class correlation was null and mixed charts
 * fragmented). It also collapses CoinGecko's hourly auto-granularity on
 * 2–90-day ranges to true daily closes, which annualization assumes.
 */
export function toDailyCloses(points: ChartPoint[]): ChartPoint[] {
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.close))
    .sort((a, b) => a.t - b.t)
  const byDay = new Map<number, number>()
  for (const p of sorted) {
    const d = new Date(p.t)
    byDay.set(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), p.close)
  }
  return Array.from(byDay.entries()).map(([t, close]) => ({ t, close }))
}

/** The shared start (latest first-timestamp) across series with >1 point, or null. */
export function commonStartTime(series: NamedSeries[]): number | null {
  const usable = series.filter((s) => s.points.length > 1)
  if (usable.length === 0) return null
  return Math.max(...usable.map((s) => s.points[0].t))
}

/**
 * Annualization factor inferred from the series' median spacing, so weekly
 * (5Y) and monthly (MAX) bars aren't annualized as if daily — √252 on weekly
 * returns understates volatility ~2.2× (review finding).
 */
export function periodsPerYear(points: ChartPoint[]): number {
  if (points.length < 3) return TRADING_DAYS
  const dts: number[] = []
  for (let i = 1; i < points.length; i++) dts.push(points[i].t - points[i - 1].t)
  dts.sort((a, b) => a - b)
  const medDays = dts[Math.floor(dts.length / 2)] / 86_400_000
  if (medDays <= 0) return TRADING_DAYS
  if (medDays <= 1.5) return TRADING_DAYS // daily (weekend gaps don't move the median)
  if (medDays <= 8) return 52 // weekly bars
  return 12 // monthly bars
}

/** Simple period-over-period returns of a close series. */
export function simpleReturns(points: ChartPoint[]): number[] {
  const r: number[] = []
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].close
    if (prev !== 0) r.push(points[i].close / prev - 1)
  }
  return r
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0
}

/** Sample standard deviation (n-1). */
function sampleStd(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const variance = xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(variance)
}

export interface WindowStats {
  totalReturnPct: number // first→last close
  /**
   * Compound annual growth rate. NULL for windows shorter than a year, on
   * purpose: annualizing a one-month move states a +10% month as +214%/yr,
   * which reads as a fact rather than an extrapolation. Total return already
   * covers the short windows honestly.
   */
  cagrPct: number | null
  volPct: number // annualized stdev of daily returns
  maxDrawdownPct: number // worst peak-to-trough over the window (>= 0)
  sharpe: number | null // annualized, rf=0; null if returns have no variance
  /**
   * Sortino ratio (annualized, MAR=0) — like Sharpe, but penalizing only
   * downside deviation. Sharpe charges an asset for upside volatility too, so a
   * fund that jumps sharply upward scores worse; Sortino separates the two,
   * which is the distinction that matters when comparing a steady fund against
   * a volatile one. Null when the window has no losing period to measure.
   */
  sortino: number | null
}

const MS_PER_YEAR = 365.25 * 86_400_000

/**
 * Shortest window CAGR is reported for. Not exactly 1.0: a calendar year is 365
 * days but MS_PER_YEAR uses 365.25, so the 1Y range button — the view where an
 * annualized figure is most expected — measures 0.9993 years and would be
 * refused by a strict `>= 1`. The tolerance covers the leap-year convention
 * without admitting genuinely short windows.
 */
const MIN_CAGR_YEARS = 0.99

/**
 * Downside deviation about a 0% minimum acceptable return: the root-mean-square
 * of the negative periods, divided by the count of ALL periods (the standard
 * definition — dividing by only the negative count would flatter any series
 * that rarely loses).
 */
function downsideDeviation(rets: number[]): number {
  if (rets.length === 0) return 0
  let sumSq = 0
  for (const r of rets) if (r < 0) sumSq += r * r
  return Math.sqrt(sumSq / rets.length)
}

/**
 * Performance statistics over the visible window, derived from the actual close
 * series (not reference fundamentals). Annualization uses the series' inferred
 * bar spacing (daily/weekly/monthly), not a blanket daily assumption.
 */
export function windowStats(points: ChartPoint[]): WindowStats | null {
  if (points.length < 2) return null
  const first = points[0].close
  const last = points[points.length - 1].close
  const totalReturnPct = first !== 0 ? (last / first - 1) * 100 : 0

  const rets = simpleReturns(points)
  const sd = sampleStd(rets)
  const ppy = periodsPerYear(points)
  const volPct = sd * Math.sqrt(ppy) * 100
  const sharpe = sd > 0 ? (mean(rets) / sd) * Math.sqrt(ppy) : null

  const dd = downsideDeviation(rets)
  const sortino = dd > 0 ? (mean(rets) / dd) * Math.sqrt(ppy) : null

  const years = (points[points.length - 1].t - points[0].t) / MS_PER_YEAR
  const cagrPct = years >= MIN_CAGR_YEARS && first > 0 && last > 0
    ? (Math.pow(last / first, 1 / years) - 1) * 100
    : null

  let peak = points[0].close
  let maxDd = 0
  for (const p of points) {
    if (p.close > peak) peak = p.close
    if (peak > 0) maxDd = Math.max(maxDd, (peak - p.close) / peak)
  }

  return { totalReturnPct, cagrPct, volPct, maxDrawdownPct: maxDd * 100, sharpe, sortino }
}

export interface NormalizedChart {
  rows: Array<Record<string, number>> // { t, [symbol]: growth-of-100 value }
  present: string[] // symbols that contributed data, in input order
}

/**
 * Rebase every series to 100 at the shared start date (the latest of the
 * series' first timestamps), so different price levels compare directly.
 */
export function normalizeToCommonStart(series: NamedSeries[]): NormalizedChart {
  const usable = series.filter((s) => s.points.length > 1)
  if (usable.length === 0) return { rows: [], present: [] }

  const start = commonStartTime(series)!
  const rows = new Map<number, Record<string, number>>()
  const present: string[] = []

  for (const s of usable) {
    const visible = s.points.filter((p) => p.t >= start)
    const base = visible[0]?.close
    if (!base) continue
    present.push(s.symbol)
    for (const p of visible) {
      const row = rows.get(p.t) ?? {}
      row[s.symbol] = Math.round((p.close / base) * 1000) / 10
      rows.set(p.t, row)
    }
  }

  return {
    rows: Array.from(rows.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, vals]) => ({ t, ...vals })),
    present,
  }
}

/** Pearson correlation of two equal-length arrays; null if undefined. */
export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length)
  if (n < 2) return null
  const ma = mean(a.slice(0, n))
  const mb = mean(b.slice(0, n))
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma
    const xb = b[i] - mb
    num += xa * xb
    da += xa * xa
    db += xb * xb
  }
  if (da === 0 || db === 0) return null
  return num / Math.sqrt(da * db)
}

export interface CorrelationMatrix {
  symbols: string[]
  matrix: (number | null)[][] // matrix[i][j] = corr(returns_i, returns_j)
}

/**
 * Correlation of daily returns across series, computed pairwise on each pair's
 * common timestamps (so mismatched histories still yield a meaningful figure).
 */
export function correlationMatrix(series: NamedSeries[]): CorrelationMatrix {
  const symbols = series.map((s) => s.symbol)
  // Per-symbol timestamp→close lookup for alignment.
  const byT = series.map((s) => {
    const m = new Map<number, number>()
    for (const p of s.points) m.set(p.t, p.close)
    return m
  })

  const matrix: (number | null)[][] = symbols.map((_, i) =>
    symbols.map((__, j) => {
      if (i === j) return 1
      // Common, sorted timestamps present in both series.
      const common: number[] = []
      for (const t of byT[i].keys()) if (byT[j].has(t)) common.push(t)
      common.sort((a, b) => a - b)
      if (common.length < 3) return null
      const ra: number[] = []
      const rb: number[] = []
      for (let k = 1; k < common.length; k++) {
        const pa0 = byT[i].get(common[k - 1])!
        const pb0 = byT[j].get(common[k - 1])!
        if (pa0 !== 0 && pb0 !== 0) {
          ra.push(byT[i].get(common[k])! / pa0 - 1)
          rb.push(byT[j].get(common[k])! / pb0 - 1)
        }
      }
      return pearson(ra, rb)
    }),
  )

  return { symbols, matrix }
}
