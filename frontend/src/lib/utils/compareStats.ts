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
  volPct: number // annualized stdev of daily returns
  maxDrawdownPct: number // worst peak-to-trough over the window (>= 0)
  sharpe: number | null // annualized, rf=0; null if returns have no variance
}

/**
 * Performance statistics over the visible window, derived from the actual close
 * series (not reference fundamentals). Assumes ~daily spacing for annualization.
 */
export function windowStats(points: ChartPoint[]): WindowStats | null {
  if (points.length < 2) return null
  const first = points[0].close
  const last = points[points.length - 1].close
  const totalReturnPct = first !== 0 ? (last / first - 1) * 100 : 0

  const rets = simpleReturns(points)
  const sd = sampleStd(rets)
  const volPct = sd * Math.sqrt(TRADING_DAYS) * 100
  const sharpe = sd > 0 ? (mean(rets) / sd) * Math.sqrt(TRADING_DAYS) : null

  let peak = points[0].close
  let maxDd = 0
  for (const p of points) {
    if (p.close > peak) peak = p.close
    if (peak > 0) maxDd = Math.max(maxDd, (peak - p.close) / peak)
  }

  return { totalReturnPct, volPct, maxDrawdownPct: maxDd * 100, sharpe }
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

  const start = Math.max(...usable.map((s) => s.points[0].t))
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
