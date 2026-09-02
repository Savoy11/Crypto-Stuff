/**
 * Which interpretation of a CBOE yield-index quote matches reality.
 *
 * The open question (P3 review D3): `^IRX` / `^FVX` / `^TNX` / `^TYX` are
 * rendered by `formatRatesQuote` as the raw quote with a `%` appended, while
 * `agents/prompts.ts` states the same indices quote the yield ×10 ("^TNX 42.5
 * = 4.25%"). No ÷10 exists anywhere in the quote path. One of the two is wrong,
 * and the difference is a factor of ten on every rates KPI.
 *
 * It is not answerable by reading, only by putting a live quote next to a
 * known-good yield — which the app already has, keylessly, in treasury.gov's
 * daily par curve. This module is the comparison itself, kept pure so the
 * decision that changes every rates figure is tested rather than eyeballed in
 * a script. `scripts/probe-rates-scale.mjs` is its only caller today; if the
 * verdict comes back `divide-by-ten`, `applyRateScale` is the normalizer to
 * wire into the quote path.
 */

export type RateScale = 'as-is' | 'divide-by-ten'

export interface ScaleVerdict {
  scale: RateScale
  /** Absolute error in percentage points if the raw quote is used as-is. */
  errorAsIs: number
  /** Absolute error in percentage points if the raw quote is divided by ten. */
  errorDivideByTen: number
  /**
   * True when neither reading lands near the reference. A quote that matches
   * nothing is a different problem — wrong symbol, stale print, or a provider
   * returning something that is not a yield — and must not be reported as a
   * scaling verdict.
   */
  inconclusive: boolean
}

/** Past this gap (percentage points) a reading is not "close enough" to be a match. */
export const MATCH_TOLERANCE_PCT = 0.75

/**
 * Compare a raw yield-index quote against an authoritative yield for the same
 * maturity and say which interpretation fits.
 *
 * `referencePct` is a real yield in percent (e.g. 4.25 for 4.25%), from the
 * Treasury par curve. `raw` is whatever the quote provider returned.
 */
export function decideRateScale(raw: number, referencePct: number): ScaleVerdict {
  const errorAsIs = Math.abs(raw - referencePct)
  const errorDivideByTen = Math.abs(raw / 10 - referencePct)
  const scale: RateScale = errorDivideByTen < errorAsIs ? 'divide-by-ten' : 'as-is'
  const best = Math.min(errorAsIs, errorDivideByTen)
  return { scale, errorAsIs, errorDivideByTen, inconclusive: best > MATCH_TOLERANCE_PCT }
}

/** Apply a decided scale to a raw quote. */
export function applyRateScale(raw: number, scale: RateScale): number {
  return scale === 'divide-by-ten' ? raw / 10 : raw
}
