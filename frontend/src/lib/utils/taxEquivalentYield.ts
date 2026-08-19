/**
 * Tax-equivalent yield — what a taxable bond would have to pay to leave you
 * with the same money as a tax-exempt one.
 *
 * Items 11/13 (2026-08-19). Municipal funds arrived in the catalog with this
 * pass, and without TEY they would be actively misleading: MUB's 3.3% sits
 * beside LQD's 5.2% and looks worse, when for a high-bracket investor in a
 * high-tax state it is the better after-tax deal. Comparing headline yields
 * across a taxable and a tax-exempt bond is not a rough comparison — it is the
 * wrong comparison.
 *
 * Pure and tested, per the house rule: this produces a percentage a user acts
 * on.
 *
 * WHAT THIS IS NOT: tax advice, and not a substitute for a return. It models
 * the standard formula on rates the user supplies. Real answers depend on AMT,
 * the de minimis rule, state-specific exemptions for in-state issuers, NIIT
 * thresholds, and whether a fund's income is fully exempt at all — none of
 * which are modelled here, and all of which are named in the UI.
 */

export interface TaxProfile {
  /** Marginal FEDERAL income-tax rate, as a percent (0–50). */
  federalPct: number
  /**
   * Marginal STATE income-tax rate, as a percent (0–15). Zero for the nine
   * states with no income tax.
   */
  statePct: number
  /**
   * Does the state exempt this bond's income too?
   *
   * True for an in-state issuer in most states, false for a national fund's
   * out-of-state holdings. Defaulting this to true would overstate the benefit
   * for exactly the funds most people hold — national ones like MUB and VTEB.
   */
  stateExempt: boolean
  /**
   * Is state tax deductible against federal? Only for filers who itemize, and
   * capped by SALT. Off by default because most filers take the standard
   * deduction.
   */
  deductStateFromFederal?: boolean
}

export interface TeyResult {
  /** The yield a fully taxable bond must pay to match, as a percent. */
  taxEquivalentPct: number
  /** Combined marginal rate actually applied (0–1). */
  effectiveRate: number
  /** taxEquivalentPct − the exempt yield: the headline understatement. */
  upliftPct: number
}

/**
 * Combined marginal rate on ordinary interest income.
 *
 * Adding federal and state naively double-counts when state tax is deductible
 * federally; the standard correction is fed + state × (1 − fed). Applied only
 * when the caller says they itemize, because for a standard-deduction filer the
 * simple sum is the correct one.
 */
export function combinedMarginalRate(profile: TaxProfile): number {
  const fed = clampRate(profile.federalPct)
  const state = clampRate(profile.statePct)
  if (profile.deductStateFromFederal) return fed + state * (1 - fed)
  return Math.min(0.95, fed + state)
}

/**
 * TEY for a tax-exempt yield.
 *
 * The exemption that applies depends on the issuer: federal-only for a national
 * muni fund (state tax is still owed on out-of-state income), or federal AND
 * state for an in-state issuer. Treasuries are the mirror image — federally
 * taxable, state-exempt — which is why `stateExempt` is a caller decision
 * rather than something inferred from the word "municipal".
 */
export function taxEquivalentYield(exemptYieldPct: number, profile: TaxProfile): TeyResult {
  if (!Number.isFinite(exemptYieldPct) || exemptYieldPct <= 0) {
    return { taxEquivalentPct: 0, effectiveRate: 0, upliftPct: 0 }
  }

  const fed = clampRate(profile.federalPct)
  const state = clampRate(profile.statePct)

  // Only the taxes this bond actually escapes belong in the denominator.
  // A national muni escapes federal tax and, for out-of-state income, does NOT
  // escape state tax — so including state here would inflate the answer.
  let exemptFrom = fed
  if (profile.stateExempt) {
    exemptFrom = profile.deductStateFromFederal ? fed + state * (1 - fed) : Math.min(0.95, fed + state)
  }
  exemptFrom = Math.min(0.95, exemptFrom)

  const taxEquivalentPct = exemptYieldPct / (1 - exemptFrom)
  return {
    taxEquivalentPct: round2(taxEquivalentPct),
    effectiveRate: round4(exemptFrom),
    upliftPct: round2(taxEquivalentPct - exemptYieldPct),
  }
}

/**
 * After-tax yield of a FULLY taxable bond — the other side of the comparison.
 * Without it a reader has to do the mental arithmetic that TEY exists to avoid.
 */
export function afterTaxYield(taxableYieldPct: number, profile: TaxProfile): number {
  if (!Number.isFinite(taxableYieldPct) || taxableYieldPct <= 0) return 0
  return round2(taxableYieldPct * (1 - combinedMarginalRate(profile)))
}

/** Percent → rate, bounded. A 100% marginal rate would divide by zero. */
function clampRate(pct: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 0
  return Math.min(0.95, pct / 100)
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10_000) / 10_000
