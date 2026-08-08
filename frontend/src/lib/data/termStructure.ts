/**
 * Futures term structure (P2-O4) — the shape of a commodity's forward curve.
 *
 * The app charts continuous front-month contracts (CL=F, GC=F). Those hide the
 * question that actually explains ETF behaviour: what do the LATER months cost?
 * When they cost more (contango) a fund holding futures sells a cheaper expiring
 * contract to buy a dearer one every roll, bleeding return even with flat spot —
 * which is why USO lags crude over long holds. The commodity detail pages
 * already warn that "ETFs track futures with roll costs and tracking error";
 * this makes that number visible instead of a caveat.
 *
 * Verified by the P2-O1 audit (owner machine, 2026-08-05): individual contract
 * months resolved through the same v8 chart API the app used for
 * continuous contracts — 9/9 across NYMEX, COMEX and CBOT, with `CLU26.NYM`
 * matching the `CL=F` control exactly (September being the WTI front month).
 * No new provider and no new licensing question.
 *
 * Pure functions, no I/O. `now` is injectable so month arithmetic is testable.
 */

/** Futures month codes, January → December. Industry standard. */
export const MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'] as const

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Exchange suffix for individual contract months (the .NYM/.CMX/.CBT form).
 *
 * ⚠ Only NYMEX, COMEX and CBOT were VERIFIED by the P2-O1 probe. ICE and CME
 * are constructed by the same rule but unproven — the route drops any month
 * that fails to resolve and the UI reports the curve as unavailable rather than
 * drawing one from a partial fetch, so an unverified suffix degrades honestly
 * instead of inventing a curve.
 */
export const EXCHANGE_MONTH_SUFFIX: Record<string, string> = {
  NYMEX: '.NYM', // verified
  COMEX: '.CMX', // verified
  CBOT: '.CBT',  // verified
  ICE: '.NYB',   // unverified — ICE Futures US (ex-NYBOT)
  CME: '.CME',   // unverified
}

export interface ContractMonth {
  /** Contract-month symbol, e.g. 'CLZ26.NYM'. */
  symbol: string
  /** Display label, e.g. 'Dec 26'. */
  label: string
  /** Calendar months ahead of `now` — the x-axis and the roll-cost denominator. */
  monthsOut: number
}

/**
 * Build the next `count` calendar contract months for a root symbol.
 *
 * Starts at +1 month, not the current one: the front contract may be days from
 * expiry or already rolled, and a near-month listing gap would read as a
 * broken curve rather than a calendar artifact.
 *
 * Requests every calendar month rather than a per-contract listing cycle
 * (gold trades Feb/Apr/Jun/Aug/Dec, corn Mar/May/Jul/Sep/Dec, crude all
 * twelve). Unlisted months simply don't resolve and are dropped upstream, so
 * the rendered curve shows what a market actually lists — no second curated
 * table to drift out of date.
 */
export function contractMonths(
  rootSymbol: string,
  exchange: string,
  count: number,
  now: Date,
): ContractMonth[] {
  const suffix = EXCHANGE_MONTH_SUFFIX[exchange]
  if (!suffix) return []

  // 'GC=F' → 'GC'
  const root = rootSymbol.replace('=F', '')
  const out: ContractMonth[] = []

  for (let i = 1; i <= count; i++) {
    const month = now.getUTCMonth() + i
    const monthIndex = ((month % 12) + 12) % 12
    const year = now.getUTCFullYear() + Math.floor(month / 12)
    const yy = String(year % 100).padStart(2, '0')
    out.push({
      symbol: `${root}${MONTH_CODES[monthIndex]}${yy}${suffix}`,
      label: `${MONTH_LABELS[monthIndex]} ${yy}`,
      monthsOut: i,
    })
  }
  return out
}

export interface CurvePoint {
  symbol: string
  label: string
  monthsOut: number
  price: number
}

export type CurveShape = 'contango' | 'backwardation' | 'flat'

export interface CurveAnalysis {
  shape: CurveShape
  /** Furthest vs nearest, as a percentage of the nearest price. */
  spreadPct: number
  /**
   * The spread expressed as a per-year rate — the figure that maps to a
   * futures-backed ETF's structural drag (contango) or tailwind
   * (backwardation), before fees and tracking error.
   */
  annualizedRollPct: number
  /** False when the curve changes direction — a humped or kinked curve. */
  monotonic: boolean
  nearest: CurvePoint
  furthest: CurvePoint
  monthsSpan: number
}

/** Below this, the curve is flat rather than meaningfully sloped. */
const FLAT_BAND_PCT = 0.5

/**
 * Describe a curve's shape. Needs at least two priced months; returns null
 * below that, because a one-point "curve" is a price, and drawing it as a
 * curve would assert a shape nothing measured.
 */
export function analyzeCurve(points: CurvePoint[]): CurveAnalysis | null {
  const priced = points
    .filter((p) => Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.monthsOut - b.monthsOut)
  if (priced.length < 2) return null

  const nearest = priced[0]
  const furthest = priced[priced.length - 1]
  const monthsSpan = furthest.monthsOut - nearest.monthsOut
  if (monthsSpan <= 0) return null

  const spreadPct = ((furthest.price - nearest.price) / nearest.price) * 100
  const annualizedRollPct = spreadPct * (12 / monthsSpan)

  const shape: CurveShape =
    spreadPct > FLAT_BAND_PCT ? 'contango'
    : spreadPct < -FLAT_BAND_PCT ? 'backwardation'
    : 'flat'

  // Direction changes matter: a humped curve is a different market story from
  // a clean slope, and averaging it into one label would hide that.
  let monotonic = true
  const rising = furthest.price >= nearest.price
  for (let i = 1; i < priced.length; i++) {
    const step = priced[i].price - priced[i - 1].price
    if (rising ? step < 0 : step > 0) { monotonic = false; break }
  }

  return {
    shape,
    spreadPct: round2(spreadPct),
    annualizedRollPct: round2(annualizedRollPct),
    monotonic,
    nearest,
    furthest,
    monthsSpan,
  }
}

/** Plain-language reading of the curve, for the UI. */
export function describeCurve(analysis: CurveAnalysis): string {
  const drag = Math.abs(analysis.annualizedRollPct).toFixed(1)
  switch (analysis.shape) {
    case 'contango':
      return `Later months cost more. A futures-backed fund rolling this curve gives up roughly ${drag}% a year before fees — the structural reason such funds lag spot over long holds.`
    case 'backwardation':
      return `Later months cost less. A futures-backed fund rolling this curve picks up roughly ${drag}% a year before fees, so it can outrun spot — typically a sign of near-term tightness.`
    case 'flat':
      return 'The curve is close to flat, so rolling costs or earns little either way right now.'
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
