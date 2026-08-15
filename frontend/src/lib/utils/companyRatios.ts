// Pure financial-ratio math over SEC EDGAR XBRL fundamentals.
//
// Extracted from live-data/company-facts/route.ts and FinancialRatios.tsx so the
// numbers a user acts on are testable (house rule). The route computes the
// filing-derived ratios server-side; the valuation multiples need a live price
// and are computed client-side from the same fundamentals — both call in here,
// so the two halves cannot drift apart.
//
// Every function is total: a missing input yields null, never a thrown error, a
// NaN, or an Infinity. That matters because these render straight into a table —
// an Infinity would print as a confident "∞×" beside real figures.

/** Which XBRL concept actually supplied the EPS figure. */
export type EpsBasis = 'diluted' | 'basic'

export interface CompanyFundamentals {
  // Income statement — latest fiscal year
  revenue: number | null
  revenuePrior: number | null
  grossProfit: number | null
  operatingIncome: number | null
  netIncome: number | null
  netIncomePrior: number | null
  eps: number | null
  /**
   * Whether `eps` came from EarningsPerShareDiluted or EarningsPerShareBasic.
   * The route falls back to basic when a registrant reports no diluted figure,
   * and the UI must not label a basic figure "diluted" — the two differ by the
   * whole option/convertible overhang, and P/E inherits the difference.
   */
  epsBasis: EpsBasis | null
  // Cash flow — latest fiscal year
  operatingCashFlow: number | null
  capex: number | null
  freeCashFlow: number | null
  // Balance sheet — most recent report
  assets: number | null
  liabilities: number | null
  equity: number | null
  assetsCurrent: number | null
  liabilitiesCurrent: number | null
  cash: number | null
  longTermDebt: number | null
  sharesOutstanding: number | null
  balanceSheetAsOf: string | null
}

export interface CompanyRatios {
  grossMargin: number | null        // fractions (0.46 = 46%)
  operatingMargin: number | null
  netMargin: number | null
  roe: number | null
  roa: number | null
  currentRatio: number | null
  liabilitiesToEquity: number | null
  debtToEquity: number | null       // long-term debt / equity
  revenueGrowthYoY: number | null
  netIncomeGrowthYoY: number | null
  fcfMargin: number | null
}

export interface ValuationMultiples {
  marketCap: number | null
  /** Trailing full-year P/E. Null for a loss-maker — see below. */
  pe: number | null
  ps: number | null
  pb: number | null
}

/**
 * num / den, or null when either side is missing or the denominator is zero.
 * Non-finite inputs are rejected too: XBRL is third-party data, and a NaN
 * arriving from a malformed fact would otherwise propagate into the table.
 */
export function ratio(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null) return null
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
  return num / den
}

/**
 * Period-over-period growth as a signed fraction (0.06 = +6%).
 *
 * A negative prior-year base is deliberately rejected: a swing from −$1M to
 * +$3M computes to −4.0, which renders as "-400% YoY" on a company whose
 * earnings actually improved. Sign-flipping bases have no meaningful growth
 * rate, so the honest answer is no number at all.
 */
export function growth(latest: number | null | undefined, prior: number | null | undefined): number | null {
  if (latest == null || prior == null) return null
  if (!Number.isFinite(latest) || !Number.isFinite(prior) || prior <= 0) return null
  return latest / prior - 1
}

/** Gross profit as filed, else revenue − cost of revenue when both are present. */
export function deriveGrossProfit(
  grossProfitFiled: number | null | undefined,
  revenue: number | null | undefined,
  costOfRevenue: number | null | undefined,
): number | null {
  if (grossProfitFiled != null && Number.isFinite(grossProfitFiled)) return grossProfitFiled
  if (revenue == null || costOfRevenue == null) return null
  if (!Number.isFinite(revenue) || !Number.isFinite(costOfRevenue)) return null
  return revenue - costOfRevenue
}

/**
 * Free cash flow = operating cash flow − capital expenditure.
 *
 * A missing capex is treated as zero (many asset-light filers omit the tag),
 * but a missing OCF yields null rather than a bare −capex figure.
 */
export function deriveFreeCashFlow(
  operatingCashFlow: number | null | undefined,
  capex: number | null | undefined,
): number | null {
  if (operatingCashFlow == null || !Number.isFinite(operatingCashFlow)) return null
  const spend = capex != null && Number.isFinite(capex) ? capex : 0
  return operatingCashFlow - spend
}

/** The filing-derived ratio set. No live price involved — see computeValuationMultiples. */
export function computeRatios(f: CompanyFundamentals): CompanyRatios {
  return {
    grossMargin: ratio(f.grossProfit, f.revenue),
    operatingMargin: ratio(f.operatingIncome, f.revenue),
    netMargin: ratio(f.netIncome, f.revenue),
    roe: ratio(f.netIncome, f.equity),
    roa: ratio(f.netIncome, f.assets),
    currentRatio: ratio(f.assetsCurrent, f.liabilitiesCurrent),
    liabilitiesToEquity: ratio(f.liabilities, f.equity),
    debtToEquity: ratio(f.longTermDebt, f.equity),
    revenueGrowthYoY: growth(f.revenue, f.revenuePrior),
    netIncomeGrowthYoY: growth(f.netIncome, f.netIncomePrior),
    fcfMargin: ratio(f.freeCashFlow, f.revenue),
  }
}

/**
 * Multiples that combine filed fundamentals with a live share price.
 *
 * P/E is null for a loss-making company rather than negative — the same rule the
 * registry's XBRL P/E backfill follows (CLAUDE.md: "a negative P/E would corrupt
 * the range filter"). A negative multiple is not a cheap stock; it is a category
 * error, and rendering "-12.4×" invites reading it as one.
 */
export function computeValuationMultiples(
  f: Pick<CompanyFundamentals, 'sharesOutstanding' | 'eps' | 'revenue' | 'equity'> | null | undefined,
  price: number | null | undefined,
): ValuationMultiples {
  const empty: ValuationMultiples = { marketCap: null, pe: null, ps: null, pb: null }
  if (!f || price == null || !Number.isFinite(price) || price <= 0) return empty

  const marketCap = f.sharesOutstanding != null && Number.isFinite(f.sharesOutstanding)
    ? price * f.sharesOutstanding
    : null

  const pe = f.eps != null && Number.isFinite(f.eps) && f.eps > 0 ? price / f.eps : null

  return {
    marketCap,
    pe,
    ps: ratio(marketCap, f.revenue),
    pb: ratio(marketCap, f.equity),
  }
}
