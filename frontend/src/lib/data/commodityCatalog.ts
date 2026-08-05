// Commodity futures catalog for the Macro Markets module.
// Curated list of front-month continuous contracts, all verified to price
// live through /live-data/security-quotes (Yahoo symbols) on 2026-07-21.
//
// Prices come live — this file deliberately carries NO reference prices.
// Futures quotes go stale in hours, and a stale number shown as a price is
// worse than an honest dash. Metadata only.

export type CommodityCategoryId =
  | 'precious-metals' | 'energy' | 'industrial-metals' | 'agriculture' | 'livestock'

export const COMMODITY_CATEGORY_INFO: Record<CommodityCategoryId, { label: string; color: string }> = {
  'precious-metals':   { label: 'Precious Metals',   color: '#f59e0b' },
  'energy':            { label: 'Energy',            color: '#f97316' },
  'industrial-metals': { label: 'Industrial Metals', color: '#64748b' },
  'agriculture':       { label: 'Agriculture',       color: '#22c55e' },
  'livestock':         { label: 'Livestock',         color: '#ec4899' },
}

export interface CommodityEntry {
  /** Route param: /macro/commodities/[slug] — Yahoo symbols contain '='. */
  slug: string
  /** Yahoo continuous front-month symbol, e.g. 'GC=F'. */
  symbol: string
  name: string
  category: CommodityCategoryId
  exchange: 'COMEX' | 'NYMEX' | 'CBOT' | 'CME' | 'ICE'
  /**
   * How the contract quotes. 'usd' = dollars; 'cents' = US cents (grains,
   * softs, livestock). Getting this wrong displays corn at "$472" instead
   * of 472¢/bu, so the table formats strictly from this field.
   */
  quoteBasis: 'usd' | 'cents'
  /** Human unit the quote is per, e.g. 'oz t', 'bbl', 'bu'. */
  unit: string
  description: string
  /**
   * ETF proxies that give exposure to THIS specific commodity, not a broad
   * multi-commodity basket. Every symbol here exists in FUND_CATALOG
   * (linkable to /funds/[symbol]) and was confirmed actively trading as of
   * 2026-07-21 (5-day trading history, not just a cached last price).
   *
   * Deliberately empty for heating oil, coffee, cocoa, cotton, live cattle,
   * and lean hogs: single-commodity ETFs/ETNs used to exist for all six
   * (UHN, JO, NIB, BAL, COW), but every one was confirmed DELISTED (last
   * trade 2019–2023) during that same check. There is currently no honest
   * single-commodity vehicle for these — don't backfill with a broad basket
   * fund (e.g. DBC) just to avoid an empty list; that overstates specificity
   * the same way the original DBC-everywhere version of this file did.
   */
  etfProxies: string[]
}

/**
 * Contracts too thin for ranked or scored output. One source of truth — the
 * macro TA scanner and the commodity risk profile both read this set rather
 * than keeping copies. These are the same six markets whose single-commodity
 * ETFs/ETNs were confirmed delisted in the 2026-07-21 audit (UHN, JO, NIB,
 * BAL, COW) — an independent signal of how thin US retail access to them is.
 * They still chart and quote; they are simply not ranked beside liquid
 * contracts, where a gappy series reads as comparable when it isn't.
 */
export const THINLY_TRADED_COMMODITIES: ReadonlySet<string> = new Set([
  'HO=F', // heating oil
  'KC=F', // coffee
  'CC=F', // cocoa
  'CT=F', // cotton
  'LE=F', // live cattle
  'HE=F', // lean hogs
])

export const COMMODITY_CATALOG: CommodityEntry[] = [
  // ── Precious metals ──────────────────────────────────────────────────────
  { slug: 'gold',        symbol: 'GC=F', name: 'Gold',            category: 'precious-metals', exchange: 'COMEX', quoteBasis: 'usd',   unit: 'oz t',   etfProxies: ['GLD', 'IAU', 'GLDM', 'SGOL', 'AAAU', 'BAR', 'OUNZ'], description: 'COMEX gold futures — the world’s reference price for bullion; the classic monetary hedge.' },
  { slug: 'silver',      symbol: 'SI=F', name: 'Silver',          category: 'precious-metals', exchange: 'COMEX', quoteBasis: 'usd',   unit: 'oz t',   etfProxies: ['SLV', 'SIVR', 'PSLV'], description: 'COMEX silver futures — part monetary metal, part industrial input (solar, electronics).' },
  { slug: 'platinum',    symbol: 'PL=F', name: 'Platinum',        category: 'precious-metals', exchange: 'NYMEX', quoteBasis: 'usd',   unit: 'oz t',   etfProxies: ['PPLT'],       description: 'NYMEX platinum futures — autocatalysts and jewellery drive demand; supply concentrated in South Africa.' },
  { slug: 'palladium',   symbol: 'PA=F', name: 'Palladium',       category: 'precious-metals', exchange: 'NYMEX', quoteBasis: 'usd',   unit: 'oz t',   etfProxies: ['PALL'],       description: 'NYMEX palladium futures — gasoline-engine autocatalysts; historically violent supply squeezes.' },

  // ── Energy ───────────────────────────────────────────────────────────────
  { slug: 'wti-crude',   symbol: 'CL=F', name: 'WTI Crude Oil',   category: 'energy', exchange: 'NYMEX', quoteBasis: 'usd', unit: 'bbl',   etfProxies: ['USO', 'OILK', 'USL'], description: 'NYMEX West Texas Intermediate — the US crude benchmark, delivered Cushing, Oklahoma.' },
  { slug: 'brent-crude', symbol: 'BZ=F', name: 'Brent Crude Oil', category: 'energy', exchange: 'ICE',   quoteBasis: 'usd', unit: 'bbl',   etfProxies: ['BNO'], description: 'ICE Brent — the global seaborne crude benchmark; most world trade prices off it.' },
  { slug: 'natural-gas', symbol: 'NG=F', name: 'Natural Gas',     category: 'energy', exchange: 'NYMEX', quoteBasis: 'usd', unit: 'MMBtu', etfProxies: ['UNG', 'UNL'], description: 'NYMEX Henry Hub natural gas — notoriously volatile; weather-driven ("the widow-maker").' },
  { slug: 'gasoline',    symbol: 'RB=F', name: 'RBOB Gasoline',   category: 'energy', exchange: 'NYMEX', quoteBasis: 'usd', unit: 'gal',   etfProxies: ['UGA'], description: 'NYMEX RBOB gasoline futures — the wholesale benchmark behind US pump prices.' },
  { slug: 'heating-oil', symbol: 'HO=F', name: 'Heating Oil',     category: 'energy', exchange: 'NYMEX', quoteBasis: 'usd', unit: 'gal',   etfProxies: [],      description: 'NYMEX heating oil (ULSD) — distillate benchmark tracking diesel and jet-fuel economics. The single-commodity fund that used to track this (UHN) was delisted in 2019; no live replacement exists.' },

  // ── Industrial metals ────────────────────────────────────────────────────
  { slug: 'copper',      symbol: 'HG=F', name: 'Copper',          category: 'industrial-metals', exchange: 'COMEX', quoteBasis: 'usd', unit: 'lb', etfProxies: ['CPER'], description: 'COMEX copper — "Dr. Copper", the metal with a PhD in economics; a global growth barometer.' },

  // ── Agriculture ──────────────────────────────────────────────────────────
  { slug: 'corn',        symbol: 'ZC=F', name: 'Corn',            category: 'agriculture', exchange: 'CBOT', quoteBasis: 'cents', unit: 'bu',   etfProxies: ['CORN'], description: 'CBOT corn futures — feed, ethanol, and export demand against US Midwest weather.' },
  { slug: 'wheat',       symbol: 'ZW=F', name: 'Wheat',           category: 'agriculture', exchange: 'CBOT', quoteBasis: 'cents', unit: 'bu',   etfProxies: ['WEAT'], description: 'CBOT soft red winter wheat — the global food-price bellwether, sensitive to geopolitics.' },
  { slug: 'soybeans',    symbol: 'ZS=F', name: 'Soybeans',        category: 'agriculture', exchange: 'CBOT', quoteBasis: 'cents', unit: 'bu',   etfProxies: ['SOYB'], description: 'CBOT soybeans — crush demand (meal, oil) and the US–China trade relationship in one contract.' },
  { slug: 'coffee',      symbol: 'KC=F', name: 'Coffee',          category: 'agriculture', exchange: 'ICE',  quoteBasis: 'cents', unit: 'lb',   etfProxies: [],      description: 'ICE arabica coffee — Brazilian frost and drought risk make it one of the wildest softs. The single-commodity ETN that used to track this (JO) was delisted in 2023; no live replacement exists.' },
  { slug: 'sugar',       symbol: 'SB=F', name: 'Sugar',           category: 'agriculture', exchange: 'ICE',  quoteBasis: 'cents', unit: 'lb',   etfProxies: ['CANE'], description: 'ICE Sugar No. 11 — world raw sugar; Brazil’s cane harvest and ethanol economics set the tone.' },
  { slug: 'cocoa',       symbol: 'CC=F', name: 'Cocoa',           category: 'agriculture', exchange: 'ICE',  quoteBasis: 'usd',   unit: 't',    etfProxies: [],      description: 'ICE cocoa — West African supply concentration produces spectacular squeezes. The single-commodity ETN that used to track this (NIB) was delisted in 2023; no live replacement exists.' },
  { slug: 'cotton',      symbol: 'CT=F', name: 'Cotton',          category: 'agriculture', exchange: 'ICE',  quoteBasis: 'cents', unit: 'lb',   etfProxies: [],      description: 'ICE cotton No. 2 — apparel demand vs US, Indian, and Brazilian growing conditions. The single-commodity ETN that used to track this (BAL) was delisted in 2023; no live replacement exists.' },

  // ── Livestock ────────────────────────────────────────────────────────────
  { slug: 'live-cattle', symbol: 'LE=F', name: 'Live Cattle',     category: 'livestock', exchange: 'CME', quoteBasis: 'cents', unit: 'lb', etfProxies: [], description: 'CME live cattle — herd cycles run years, so supply shocks persist. The livestock ETN that used to give exposure here (COW) is no longer actively traded; no live replacement exists.' },
  { slug: 'lean-hogs',   symbol: 'HE=F', name: 'Lean Hogs',       category: 'livestock', exchange: 'CME', quoteBasis: 'cents', unit: 'lb', etfProxies: [], description: 'CME lean hogs — disease outbreaks and export swings drive sharp repricings. No single-commodity fund has ever tracked lean hogs specifically.' },
]

export const COMMODITY_BY_SLUG: Record<string, CommodityEntry> = Object.fromEntries(
  COMMODITY_CATALOG.map((c) => [c.slug, c]),
)

export function getCommodity(slug: string): CommodityEntry | undefined {
  return COMMODITY_BY_SLUG[slug]
}

/**
 * Format a live quote in the contract's own terms: dollars for USD contracts,
 * cents (¢) for cents-quoted ones, always with the per-unit suffix.
 */
export function formatCommodityPrice(entry: CommodityEntry, price: number): string {
  if (entry.quoteBasis === 'cents') {
    const decimals = price >= 500 ? 1 : 2
    return `${price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}¢/${entry.unit}`
  }
  const decimals = price >= 1000 ? 0 : price >= 20 ? 2 : 3
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}/${entry.unit}`
}
