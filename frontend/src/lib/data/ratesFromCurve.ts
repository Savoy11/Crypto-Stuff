// Yield levels for the four CBOE indices, read from the official Treasury par
// curve instead of a market data provider.
//
// WHY THIS EXISTS (D3, settled 2026-09-03)
// ----------------------------------------
// ^IRX / ^FVX / ^TNX / ^TYX are CBOE indices that restate a number the US
// Treasury already publishes. Sourcing them through /live-data/security-quotes
// turned out to be both unreliable and ambiguous:
//
//   • No free provider quotes them. Probed with real keys on the owner's
//     machine (`npm run rates-providers`): FMP has them but paywalls them
//     behind a plan upgrade (HTTP 402), Finnhub returns no quote, Twelve Data
//     404s the symbol outright, Alpha Vantage returns an empty GLOBAL_QUOTE for
//     both `^TNX` and `TNX`, and Tiingo has no index space. So the four KPIs
//     rendered dashes on /macro/rates for every user without a paid FMP plan.
//
//   • Nobody could say what scale a quote would arrive in. `formatRatesQuote`
//     printed the raw value as a percent while agents/prompts.ts and
//     agents/tools.ts stated in four places that these indices quote the yield
//     x10 ("^TNX 42.5 = 4.25%"). One of the two was wrong and no reachable
//     source could say which — the question was unanswerable without paying.
//
// Reading the curve dissolves both problems rather than resolving them. The
// curve is keyless, official, published in plain percent, and /macro/rates
// ALREADY fetches it for the curve chart — the authoritative number was sitting
// on the same page as the paywalled one.
//
// THE TRADE-OFF, STATED RATHER THAN HIDDEN
// ----------------------------------------
// The par curve is published once a day. These are no longer intraday quotes,
// and the UI must not present them as if they were: `curveYieldSourceLabel` and
// the absence of a change-percent are how that reaches the reader. A daily
// figure dressed as a live quote is the exact provenance failure this codebase
// keeps catching — see the hand-maintained-table rule in CLAUDE.md.
//
// Bond FUTURES (ZT=F/ZF=F/ZN=F/ZB=F) are untouched. They quote points of par,
// they are genuinely traded instruments rather than a restatement of the curve,
// and their scale was never in question.

import type { RatesEntry } from './ratesCatalog'

export interface CurvePointLike {
  label: string
  years: number
  yieldPct: number
}

/**
 * How close a curve point must be, in years, to stand in for an index.
 *
 * Every index maps to a maturity the Treasury publishes exactly (0.25 / 5 / 10
 * / 30), so in practice this is an equality check with room for floating point.
 * It is a tolerance rather than a nearest-neighbour search so that a curve
 * missing one maturity yields NOTHING for that index instead of silently
 * substituting its neighbour — a 20Y print under a "30-Year Treasury Yield"
 * heading is worse than a dash, because the reader cannot tell it happened.
 */
export const MATURITY_TOLERANCE_YEARS = 0.02

export interface CurveYield {
  yieldPct: number
  /** The curve maturity actually used, for display and for tests. */
  curveLabel: string
  /** Publication date of the curve reading (YYYY-MM-DD). */
  asOf: string
}

/**
 * The yield for one catalog entry, or null when the curve cannot answer.
 *
 * Returns null — never a guess — for a futures entry, an unpublished maturity,
 * or an empty curve.
 */
export function yieldFromCurve(
  entry: Pick<RatesEntry, 'quoteBasis' | 'maturityYears'>,
  curve: { date: string; points: readonly CurvePointLike[] } | null | undefined
): CurveYield | null {
  if (entry.quoteBasis !== 'pct') return null
  if (!curve?.points?.length || !curve.date) return null

  const match = curve.points.find(
    (p) => Math.abs(p.years - entry.maturityYears) <= MATURITY_TOLERANCE_YEARS
  )
  if (!match || !Number.isFinite(match.yieldPct)) return null

  return { yieldPct: match.yieldPct, curveLabel: match.label, asOf: curve.date }
}

/**
 * Provenance line for a curve-derived yield.
 *
 * Deliberately says "daily" every time, not only when the reading is old: a
 * qualifier that appears only past some staleness threshold teaches readers to
 * treat its absence as "live".
 */
export function curveYieldSourceLabel(y: CurveYield): string {
  return `Official Treasury par yield, ${y.curveLabel} · daily, as of ${y.asOf}`
}
