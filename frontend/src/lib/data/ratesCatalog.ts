// Bonds & Rates catalog for the Macro Markets module.
// Treasury yields and bond futures. The FUTURES price live through
// /live-data/security-quotes (verified 2026-07-21). The four YIELD entries no
// longer do: as of 2026-09-03 they read from the official treasury.gov par
// curve via /live-data/treasury-yield-curve — keyless, official, plain percent.
// See lib/data/ratesFromCurve.ts for the probe results that forced that.
//
// Deliberate scope: yields, treasury futures, and bond ETFs. Individual
// corporate/muni bond quotes (CUSIP-level) are licensed data with no free
// source — that limit is stated in the UI, never papered over.

export type RatesCategoryId = 'yield' | 'future'

export const RATES_CATEGORY_INFO: Record<RatesCategoryId, { label: string; color: string }> = {
  'yield':  { label: 'Treasury Yield', color: '#64748b' },
  'future': { label: 'Bond Future',    color: '#8b5cf6' },
}

export interface RatesEntry {
  /** Route param: /macro/rates/[slug]. */
  slug: string
  /** Index or contract symbol, e.g. '^TNX' or 'ZN=F'. */
  symbol: string
  name: string
  category: RatesCategoryId
  /**
   * 'pct' — a Treasury yield, in plain percent. These four entries are NOT
   *   quoted by a provider: they are read from the official treasury.gov par
   *   curve (lib/data/ratesFromCurve.ts), because no free provider carries the
   *   CBOE indices and none could settle what scale they arrive in. That means
   *   a DAILY figure, not an intraday quote — surfaces must say so.
   * 'points' — futures prices in points of par (decimalised 32nds). Genuinely
   *   live, through /live-data/security-quotes.
   */
  quoteBasis: 'pct' | 'points'
  description: string
  /**
   * ETF proxies matched by DURATION to this point on the curve — not a
   * literal bet on the yield/future itself (nobody buys "the 10-year
   * yield"), but the closest fund whose holdings sit in the same maturity
   * band. Every symbol exists in FUND_CATALOG and was confirmed actively
   * trading (5-day history) as of 2026-07-21.
   *
   * General credit/inflation/aggregate funds (LQD, HYG, TIP, BND, AGG) live
   * in BOND_ETF_SHELF below instead — they don't correspond to a specific
   * point on the TREASURY curve, so they aren't assigned to any one entry.
   */
  etfProxies: string[]
  /**
   * The maturity this instrument keys on, in years — the yield index's tenor,
   * or the future's underlying note/bond. THE bond-risk primitive: duration
   * scales almost linearly with it, and the risk profile
   * (lib/risk/profiles/rateInstrument.ts) anchors on it.
   */
  maturityYears: number
}

export const RATES_CATALOG: RatesEntry[] = [
  // ── Yield indices (CBOE, tracking on-the-run Treasury yields) ────────────
  { slug: '13-week-yield', symbol: '^IRX', maturityYears: 0.25, name: '13-Week T-Bill Yield', category: 'yield', quoteBasis: 'pct', etfProxies: ['SGOV', 'BIL'], description: 'The short end — tracks the Fed’s policy rate almost one-for-one; the "cash" yield.' },
  { slug: '5-year-yield',  symbol: '^FVX', maturityYears: 5, name: '5-Year Treasury Yield', category: 'yield', quoteBasis: 'pct', etfProxies: ['IEI'], description: 'The belly of the curve — where rate-cut and rate-hike expectations fight it out.' },
  { slug: '10-year-yield', symbol: '^TNX', maturityYears: 10, name: '10-Year Treasury Yield', category: 'yield', quoteBasis: 'pct', etfProxies: ['IEF'], description: 'The world’s benchmark interest rate — prices mortgages, equities, and everything else.' },
  { slug: '30-year-yield', symbol: '^TYX', maturityYears: 30, name: '30-Year Treasury Yield', category: 'yield', quoteBasis: 'pct', etfProxies: ['TLT'], description: 'The long bond — inflation expectations and term premium over a generation.' },

  // ── Treasury futures (CBOT) ──────────────────────────────────────────────
  { slug: '2-year-note-future',  symbol: 'ZT=F', maturityYears: 2, name: '2-Year T-Note Future',  category: 'future', quoteBasis: 'points', etfProxies: ['SHY'], description: 'CBOT 2-year note futures — the market’s cleanest bet on near-term Fed policy.' },
  { slug: '5-year-note-future',  symbol: 'ZF=F', maturityYears: 5, name: '5-Year T-Note Future',  category: 'future', quoteBasis: 'points', etfProxies: ['IEI'], description: 'CBOT 5-year note futures — belly-of-the-curve duration in one contract.' },
  { slug: '10-year-note-future', symbol: 'ZN=F', maturityYears: 10, name: '10-Year T-Note Future', category: 'future', quoteBasis: 'points', etfProxies: ['IEF'], description: 'CBOT 10-year note futures — the most traded bond future on Earth; hedging workhorse.' },
  { slug: '30-year-bond-future', symbol: 'ZB=F', maturityYears: 30, name: '30-Year T-Bond Future', category: 'future', quoteBasis: 'points', etfProxies: ['TLT'], description: 'CBOT bond futures — long duration; prices move inversely and violently with 30Y yields.' },
]

export const RATES_BY_SLUG: Record<string, RatesEntry> = Object.fromEntries(
  RATES_CATALOG.map((r) => [r.slug, r]),
)

export function getRatesEntry(slug: string): RatesEntry | undefined {
  return RATES_BY_SLUG[slug]
}

export function formatRatesQuote(entry: RatesEntry, value: number): string {
  if (entry.quoteBasis === 'pct') return `${value.toFixed(2)}%`
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} pts`
}

/**
 * Bond ETFs surfaced on the rates page — must exist in FUND_CATALOG so the
 * links resolve to /funds/[symbol]. Ordered short → long duration, then credit.
 */
/**
 * Bond fund shelf, grouped by TYPE.
 *
 * W3-8 (2026-08-20). This was a flat 11-row list, and the owner's review read
 * it as "none of my requested bond types were added" — every one of them was
 * there (LQD corporate, HYG junk, BNDX/EMB international, MUB municipal), but a
 * flat list with prose labels made the CATEGORIES unfindable. The grouping and
 * the group names now use the words a person looks for.
 */
export interface BondShelfGroup {
  label: string
  funds: Array<{ symbol: string; role: string }>
}

export const BOND_ETF_SHELF_GROUPS: BondShelfGroup[] = [
  {
    label: 'US Treasuries',
    funds: [
      { symbol: 'SHY', role: '1–3Y — near-cash duration' },
      { symbol: 'IEF', role: '7–10Y — the belly' },
      { symbol: 'TLT', role: '20+Y — long duration' },
    ],
  },
  {
    label: 'Inflation-protected',
    funds: [{ symbol: 'TIP', role: 'TIPS — guards purchasing power' }],
  },
  {
    label: 'Broad market',
    funds: [
      { symbol: 'BND', role: 'Total US investment-grade market' },
      { symbol: 'AGG', role: 'US aggregate — BND’s twin' },
    ],
  },
  {
    label: 'Corporate',
    funds: [{ symbol: 'LQD', role: 'Investment-grade corporates' }],
  },
  {
    label: 'High yield (junk)',
    funds: [{ symbol: 'HYG', role: 'Sub-investment-grade — behaves like equity in a crisis' }],
  },
  {
    label: 'Municipal',
    funds: [{ symbol: 'MUB', role: 'National munis — federally tax-exempt income' }],
  },
  {
    label: 'International',
    funds: [
      { symbol: 'BNDX', role: 'Global investment-grade, USD-hedged' },
      { symbol: 'EMB', role: 'EM sovereigns in dollars — credit, not FX' },
    ],
  },
]

/** Flat view, kept for anything that wants the old shape. */
export const BOND_ETF_SHELF: Array<{ symbol: string; role: string }> =
  BOND_ETF_SHELF_GROUPS.flatMap((g) => g.funds)

