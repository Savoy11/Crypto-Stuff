// Currency (fiat FX) catalog for the Macro Markets module.
// Curated pairs, all verified to price live through /live-data/security-quotes
// (Yahoo symbols) on 2026-07-21. Daily ECB reference rates for the converter
// come from /live-data/fx-rates (frankfurter.dev, keyless).
//
// Like the commodity catalog, this file carries NO reference rates — quotes
// come live or show an honest dash.

export type CurrencyCategoryId = 'major' | 'cross' | 'emerging' | 'index'

export const CURRENCY_CATEGORY_INFO: Record<CurrencyCategoryId, { label: string; color: string }> = {
  'major':    { label: 'USD Majors',       color: '#22c55e' },
  'cross':    { label: 'Crosses',          color: '#3b82f6' },
  'emerging': { label: 'Emerging Markets', color: '#f97316' },
  'index':    { label: 'Index',            color: '#8b5cf6' },
}

export interface CurrencyEntry {
  /** Route param: /macro/currencies/[slug]. */
  slug: string
  /** Yahoo symbol, e.g. 'EURUSD=X' or 'JPY=X' (= USD/JPY). */
  symbol: string
  /** Display name in market convention, e.g. 'EUR/USD'. */
  name: string
  /** ISO codes; the quote is "1 base = X quote". Index rows use 'USD'/'—'. */
  base: string
  quote: string
  category: CurrencyCategoryId
  /** Decimal places the market conventionally quotes at. */
  precision: number
  description: string
  /**
   * ETF proxies giving direct exposure to this currency (holds currency
   * deposits, or futures on the same index this catalog quotes) — every
   * symbol here exists in FUND_CATALOG and was confirmed actively trading
   * (5-day history, not just a cached price) as of 2026-07-21.
   *
   * Deliberately empty for every EM/exotic pair and every cross: the
   * single-currency funds that used to cover Mexican peso, Brazilian real,
   * Chinese yuan, Indian rupee, and South African rand were all confirmed
   * DELISTED in that same check; no US-listed fund has ever covered the
   * Korean won or New Zealand dollar; and cross pairs (EUR/GBP, EUR/JPY…)
   * have never had a dedicated single-fund vehicle — only vs-USD trusts
   * exist. Don't backfill with a broad multi-currency basket (e.g. CEW) to
   * avoid an empty list; that overstates specificity the same way DBC did
   * for commodities before this same pass.
   */
  etfProxies: string[]
}

export const CURRENCY_CATALOG: CurrencyEntry[] = [
  // ── USD majors ───────────────────────────────────────────────────────────
  { slug: 'eur-usd', symbol: 'EURUSD=X', name: 'EUR/USD', base: 'EUR', quote: 'USD', category: 'major', precision: 4, etfProxies: ['FXE'], description: 'The world’s most traded pair — eurozone vs US rates and growth in one number.' },
  { slug: 'gbp-usd', symbol: 'GBPUSD=X', name: 'GBP/USD', base: 'GBP', quote: 'USD', category: 'major', precision: 4, etfProxies: ['FXB'], description: '"Cable" — sterling against the dollar; sensitive to BoE policy and UK fiscal news.' },
  { slug: 'usd-jpy', symbol: 'JPY=X',    name: 'USD/JPY', base: 'USD', quote: 'JPY', category: 'major', precision: 2, etfProxies: ['FXY'], description: 'The rates-differential pair — driven by the Fed–BoJ policy gap and carry-trade flows.' },
  { slug: 'usd-chf', symbol: 'CHF=X',    name: 'USD/CHF', base: 'USD', quote: 'CHF', category: 'major', precision: 4, etfProxies: ['FXF'], description: 'Dollar vs the franc — the classic safe-haven cross; SNB intervention history.' },
  { slug: 'usd-cad', symbol: 'CAD=X',    name: 'USD/CAD', base: 'USD', quote: 'CAD', category: 'major', precision: 4, etfProxies: ['FXC'], description: 'The "loonie" pair — tracks oil (Canada’s top export) as much as rate differentials.' },
  { slug: 'aud-usd', symbol: 'AUDUSD=X', name: 'AUD/USD', base: 'AUD', quote: 'USD', category: 'major', precision: 4, etfProxies: ['FXA'], description: 'The "aussie" — a commodity currency proxy for Chinese demand and iron ore.' },
  { slug: 'nzd-usd', symbol: 'NZDUSD=X', name: 'NZD/USD', base: 'NZD', quote: 'USD', category: 'major', precision: 4, etfProxies: [], description: 'The "kiwi" — dairy exports and RBNZ policy; the smallest of the majors. No US-listed fund has ever offered direct kiwi exposure.' },

  // ── Crosses (no USD leg) ─────────────────────────────────────────────────
  { slug: 'eur-gbp', symbol: 'EURGBP=X', name: 'EUR/GBP', base: 'EUR', quote: 'GBP', category: 'cross', precision: 4, etfProxies: [], description: 'Europe’s internal exchange rate — eurozone vs UK without the dollar in the way. No fund tracks a cross pair directly; only vs-USD trusts (FXE, FXB) exist, and combining them only approximates this rate.' },
  { slug: 'eur-jpy', symbol: 'EURJPY=X', name: 'EUR/JPY', base: 'EUR', quote: 'JPY', category: 'cross', precision: 2, etfProxies: [], description: 'A risk-appetite barometer — rallies with global risk-on, sinks in flight-to-safety. No fund tracks this cross directly.' },
  { slug: 'gbp-jpy', symbol: 'GBPJPY=X', name: 'GBP/JPY', base: 'GBP', quote: 'JPY', category: 'cross', precision: 2, etfProxies: [], description: '"The Beast" — historically the most volatile major cross; a trader’s pair. No fund tracks this cross directly.' },
  { slug: 'eur-chf', symbol: 'EURCHF=X', name: 'EUR/CHF', base: 'EUR', quote: 'CHF', category: 'cross', precision: 4, etfProxies: [], description: 'Eurozone vs Switzerland — the pair the SNB famously floored, then un-floored, in 2015. No fund tracks this cross directly.' },

  // ── Emerging markets (USD base) ──────────────────────────────────────────
  { slug: 'usd-mxn', symbol: 'MXN=X', name: 'USD/MXN', base: 'USD', quote: 'MXN', category: 'emerging', precision: 4, etfProxies: [], description: 'The peso — nearshoring beneficiary and the most liquid EM currency in the Americas. The single-currency fund that used to cover this (FXM) was delisted; no live replacement exists.' },
  { slug: 'usd-brl', symbol: 'BRL=X', name: 'USD/BRL', base: 'USD', quote: 'BRL', category: 'emerging', precision: 4, etfProxies: [], description: 'The real — commodity exports and Brazil’s high-rate carry appeal vs fiscal risk. The single-currency fund that used to cover this (BZF) was delisted; no live replacement exists.' },
  { slug: 'usd-cny', symbol: 'CNY=X', name: 'USD/CNY', base: 'USD', quote: 'CNY', category: 'emerging', precision: 4, etfProxies: [], description: 'Onshore yuan — managed within a PBoC band; the world’s most policy-driven big currency. The single-currency fund that used to cover this (CYB) was delisted; no live replacement exists.' },
  { slug: 'usd-inr', symbol: 'INR=X', name: 'USD/INR', base: 'USD', quote: 'INR', category: 'emerging', precision: 2, etfProxies: [], description: 'The rupee — RBI-smoothed; structurally weakens with India’s inflation differential. The single-currency fund that used to cover this (ICN) was delisted; no live replacement exists.' },
  { slug: 'usd-krw', symbol: 'KRW=X', name: 'USD/KRW', base: 'USD', quote: 'KRW', category: 'emerging', precision: 1, etfProxies: [], description: 'The won — a high-beta proxy for global tech and semiconductor demand. No US-listed fund has ever offered direct won exposure.' },
  { slug: 'usd-zar', symbol: 'ZAR=X', name: 'USD/ZAR', base: 'USD', quote: 'ZAR', category: 'emerging', precision: 4, etfProxies: [], description: 'The rand — metals exports and load-shedding risk; a classic EM sentiment gauge. The single-currency fund that used to cover this (SZR) was delisted; no live replacement exists.' },

  // ── Index ────────────────────────────────────────────────────────────────
  { slug: 'dollar-index', symbol: 'DX-Y.NYB', name: 'US Dollar Index', base: 'USD', quote: '—', category: 'index', precision: 2, etfProxies: ['UUP', 'UDN', 'USDU'], description: 'DXY — the dollar against a fixed basket (EUR-heavy at 57.6%); the market’s shorthand for "the dollar".' },
]

export const CURRENCY_BY_SLUG: Record<string, CurrencyEntry> = Object.fromEntries(
  CURRENCY_CATALOG.map((c) => [c.slug, c]),
)

export function getCurrency(slug: string): CurrencyEntry | undefined {
  return CURRENCY_BY_SLUG[slug]
}

export function formatFxRate(entry: CurrencyEntry, rate: number): string {
  return rate.toLocaleString(undefined, {
    minimumFractionDigits: entry.precision,
    maximumFractionDigits: entry.precision,
  })
}

/** ISO codes the converter offers — frankfurter.dev's set plus USD. */
export const CONVERTER_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'INR',
  'KRW', 'MXN', 'BRL', 'ZAR', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF',
  'TRY', 'ILS', 'SGD', 'HKD', 'THB', 'MYR', 'IDR', 'PHP', 'RON', 'ISK',
] as const
