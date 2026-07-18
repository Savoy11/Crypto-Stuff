// Trailing-return math shared by /live-data/security-returns.
// Kept out of the route file because Next.js route modules may only export
// handlers/config.

export interface CloseSeries {
  closes: number[]
  timestamps: number[]
}

export interface SecurityReturns {
  m1: number | null
  m3: number | null
  ytd: number | null
  y1: number | null
}

function pctChange(from: number | undefined, to: number | undefined): number | null {
  if (from == null || to == null || from === 0) return null
  return Number((((to - from) / from) * 100).toFixed(2))
}

/** Trailing-window returns from ~1y of daily closes. */
export function computeReturns(series: CloseSeries, nowYear: number): SecurityReturns {
  const { closes, timestamps } = series
  const last = closes[closes.length - 1]
  const at = (tradingDaysBack: number) =>
    tradingDaysBack < closes.length ? closes[closes.length - 1 - tradingDaysBack] : undefined

  // First close of the current calendar year; YTD baseline is the close before it.
  let ytdBase: number | undefined
  if (timestamps.length === closes.length) {
    const idx = timestamps.findIndex((t) => new Date(t * 1000).getUTCFullYear() === nowYear)
    if (idx > 0) ytdBase = closes[idx - 1]
    else if (idx === 0) ytdBase = closes[0]
  }

  return {
    m1: pctChange(at(21), last),
    m3: pctChange(at(63), last),
    ytd: pctChange(ytdBase, last),
    // ~252 trading days; fall back to the series start if slightly short.
    y1: pctChange(at(251) ?? (closes.length >= 200 ? closes[0] : undefined), last),
  }
}
