// Fee-impact screening for the Fund Registry — S6 build-out item 3, activated
// by the owner 2026-09-05.
//
// The registry shows every fund's expense ratio, and so does every fund site
// on the internet. What almost none shows is what that ratio COSTS: 0.75%
// reads as small next to 0.03% until both are compounded over a horizon in
// dollars. This module turns the ER column into that figure, per fund, using
// the same computeFeeDrag engine the detail-page analyzer already trusts —
// one engine, one answer, on both surfaces.
//
// Pure on purpose (house rule: anything producing a dollar figure a user acts
// on is pure and tested). No fetching — the inputs are the catalog's
// provenance-dated expense ratios and the user's own assumptions.

import { computeFeeDrag, fundSalesCharge, type FundEntry } from './fundCatalog'

/** The user-settable assumptions, one set for the whole table. */
export interface FeeImpactParams {
  /** Invested at year 0. */
  principal: number
  /** Horizon in whole years. */
  years: number
  /** Assumed gross annual return, percent. */
  annualReturnPct: number
}

export const DEFAULT_FEE_IMPACT_PARAMS: FeeImpactParams = {
  principal: 10_000,
  years: 20,
  annualReturnPct: 7,
}

/** Same benchmark the detail-page analyzer compares against. */
export const FEE_IMPACT_BENCHMARK_ER_PCT = 0.03

export interface FeeImpact {
  /** Dollars lost to fees vs the 0.03% benchmark at the horizon. Negative = cheaper than the benchmark. */
  costUsd: number
  /** Ending value with this fund's fees applied. */
  endValueUsd: number
  /**
   * True when a VERIFIED front load is included in the figures.
   * False when the fund is no-load, or when its load exists but is unverified.
   */
  includesLoad: boolean
  /**
   * True when the fund carries a sales charge whose rate is NOT verified — the
   * figures then understate the true cost, and the UI must say so beside the
   * number rather than ranking the fund as if it were no-load. This is the
   * same rule the detail-page analyzer follows (SalesCharge.maxPct): guessing
   * a rate is worse than omitting it, and omitting it silently is worse than
   * both.
   */
  unverifiedLoad: boolean
}

/**
 * The fee impact for one fund at the given assumptions, or null when the fund
 * has no expense ratio on record (uncurated universe rows) — null, not zero,
 * because "we don't know this fund's fees" must never sort as "free".
 */
export function feeImpact(
  fund: Pick<FundEntry, 'expenseRatioPct' | 'type' | 'issuer' | 'salesCharge'> | null | undefined,
  params: FeeImpactParams,
): FeeImpact | null {
  if (fund?.expenseRatioPct == null) return null
  const { principal, years, annualReturnPct } = params
  if (!(principal > 0) || !Number.isInteger(years) || years < 1 || !(annualReturnPct >= 0)) return null

  const charge = fundSalesCharge(fund)
  const verifiedFrontLoad = charge?.kind === 'front' && charge.maxPct != null ? charge.maxPct : 0

  const series = computeFeeDrag(
    principal, fund.expenseRatioPct, years, annualReturnPct,
    FEE_IMPACT_BENCHMARK_ER_PCT, verifiedFrontLoad,
  )
  const last = series[series.length - 1]
  return {
    costUsd: last.feesPaid,
    endValueUsd: last.withFee,
    includesLoad: verifiedFrontLoad > 0,
    unverifiedLoad: charge != null && charge.maxPct == null,
  }
}
