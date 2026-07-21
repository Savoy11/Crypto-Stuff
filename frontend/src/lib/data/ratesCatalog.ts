// Rates & Bonds catalog for the Macro Markets module.
// Treasury yield indices and bond futures, all verified to price live through
// /live-data/security-quotes (Yahoo symbols) on 2026-07-21. The official
// yield curve comes from /live-data/treasury-yield-curve (treasury.gov,
// keyless).
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
  /** Yahoo symbol, e.g. '^TNX' or 'ZN=F'. */
  symbol: string
  name: string
  category: RatesCategoryId
  /**
   * 'pct' — CBOE yield indices, quoted as the yield itself in percent.
   * 'points' — futures prices in points of par (decimalised 32nds).
   */
  quoteBasis: 'pct' | 'points'
  description: string
}

export const RATES_CATALOG: RatesEntry[] = [
  // ── Yield indices (CBOE, tracking on-the-run Treasury yields) ────────────
  { slug: '13-week-yield', symbol: '^IRX', name: '13-Week T-Bill Yield', category: 'yield', quoteBasis: 'pct', description: 'The short end — tracks the Fed’s policy rate almost one-for-one; the "cash" yield.' },
  { slug: '5-year-yield',  symbol: '^FVX', name: '5-Year Treasury Yield', category: 'yield', quoteBasis: 'pct', description: 'The belly of the curve — where rate-cut and rate-hike expectations fight it out.' },
  { slug: '10-year-yield', symbol: '^TNX', name: '10-Year Treasury Yield', category: 'yield', quoteBasis: 'pct', description: 'The world’s benchmark interest rate — prices mortgages, equities, and everything else.' },
  { slug: '30-year-yield', symbol: '^TYX', name: '30-Year Treasury Yield', category: 'yield', quoteBasis: 'pct', description: 'The long bond — inflation expectations and term premium over a generation.' },

  // ── Treasury futures (CBOT) ──────────────────────────────────────────────
  { slug: '2-year-note-future',  symbol: 'ZT=F', name: '2-Year T-Note Future',  category: 'future', quoteBasis: 'points', description: 'CBOT 2-year note futures — the market’s cleanest bet on near-term Fed policy.' },
  { slug: '5-year-note-future',  symbol: 'ZF=F', name: '5-Year T-Note Future',  category: 'future', quoteBasis: 'points', description: 'CBOT 5-year note futures — belly-of-the-curve duration in one contract.' },
  { slug: '10-year-note-future', symbol: 'ZN=F', name: '10-Year T-Note Future', category: 'future', quoteBasis: 'points', description: 'CBOT 10-year note futures — the most traded bond future on Earth; hedging workhorse.' },
  { slug: '30-year-bond-future', symbol: 'ZB=F', name: '30-Year T-Bond Future', category: 'future', quoteBasis: 'points', description: 'CBOT bond futures — long duration; prices move inversely and violently with 30Y yields.' },
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
export const BOND_ETF_SHELF: Array<{ symbol: string; role: string }> = [
  { symbol: 'SHY', role: '1–3Y Treasuries — near-cash duration' },
  { symbol: 'IEF', role: '7–10Y Treasuries — the belly' },
  { symbol: 'TLT', role: '20+Y Treasuries — long duration' },
  { symbol: 'TIP', role: 'Inflation-protected Treasuries' },
  { symbol: 'BND', role: 'Total US investment-grade market' },
  { symbol: 'AGG', role: 'US aggregate — BND’s twin' },
  { symbol: 'LQD', role: 'Investment-grade corporates' },
  { symbol: 'HYG', role: 'High-yield corporates — credit risk' },
]
