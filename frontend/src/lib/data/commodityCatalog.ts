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
  /** ETF proxies that exist in FUND_CATALOG (linkable to /funds/[symbol]). */
  etfProxies: string[]
}

export const COMMODITY_CATALOG: CommodityEntry[] = [
  // ── Precious metals ──────────────────────────────────────────────────────
  { slug: 'gold',        symbol: 'GC=F', name: 'Gold',            category: 'precious-metals', exchange: 'COMEX', quoteBasis: 'usd',   unit: 'oz t',   etfProxies: ['GLD', 'IAU'], description: 'COMEX gold futures — the world’s reference price for bullion; the classic monetary hedge.' },
  { slug: 'silver',      symbol: 'SI=F', name: 'Silver',          category: 'precious-metals', exchange: 'COMEX', quoteBasis: 'usd',   unit: 'oz t',   etfProxies: ['SLV'],        description: 'COMEX silver futures — part monetary metal, part industrial input (solar, electronics).' },
  { slug: 'platinum',    symbol: 'PL=F', name: 'Platinum',        category: 'precious-metals', exchange: 'NYMEX', quoteBasis: 'usd',   unit: 'oz t',   etfProxies: [],             description: 'NYMEX platinum futures — autocatalysts and jewellery drive demand; supply concentrated in South Africa.' },
  { slug: 'palladium',   symbol: 'PA=F', name: 'Palladium',       category: 'precious-metals', exchange: 'NYMEX', quoteBasis: 'usd',   unit: 'oz t',   etfProxies: [],             description: 'NYMEX palladium futures — gasoline-engine autocatalysts; historically violent supply squeezes.' },

  // ── Energy ───────────────────────────────────────────────────────────────
  { slug: 'wti-crude',   symbol: 'CL=F', name: 'WTI Crude Oil',   category: 'energy', exchange: 'NYMEX', quoteBasis: 'usd', unit: 'bbl',   etfProxies: ['DBC'], description: 'NYMEX West Texas Intermediate — the US crude benchmark, delivered Cushing, Oklahoma.' },
  { slug: 'brent-crude', symbol: 'BZ=F', name: 'Brent Crude Oil', category: 'energy', exchange: 'ICE',   quoteBasis: 'usd', unit: 'bbl',   etfProxies: ['DBC'], description: 'ICE Brent — the global seaborne crude benchmark; most world trade prices off it.' },
  { slug: 'natural-gas', symbol: 'NG=F', name: 'Natural Gas',     category: 'energy', exchange: 'NYMEX', quoteBasis: 'usd', unit: 'MMBtu', etfProxies: ['DBC'], description: 'NYMEX Henry Hub natural gas — notoriously volatile; weather-driven ("the widow-maker").' },
  { slug: 'gasoline',    symbol: 'RB=F', name: 'RBOB Gasoline',   category: 'energy', exchange: 'NYMEX', quoteBasis: 'usd', unit: 'gal',   etfProxies: ['DBC'], description: 'NYMEX RBOB gasoline futures — the wholesale benchmark behind US pump prices.' },
  { slug: 'heating-oil', symbol: 'HO=F', name: 'Heating Oil',     category: 'energy', exchange: 'NYMEX', quoteBasis: 'usd', unit: 'gal',   etfProxies: ['DBC'], description: 'NYMEX heating oil (ULSD) — distillate benchmark tracking diesel and jet-fuel economics.' },

  // ── Industrial metals ────────────────────────────────────────────────────
  { slug: 'copper',      symbol: 'HG=F', name: 'Copper',          category: 'industrial-metals', exchange: 'COMEX', quoteBasis: 'usd', unit: 'lb', etfProxies: ['DBC'], description: 'COMEX copper — "Dr. Copper", the metal with a PhD in economics; a global growth barometer.' },

  // ── Agriculture ──────────────────────────────────────────────────────────
  { slug: 'corn',        symbol: 'ZC=F', name: 'Corn',            category: 'agriculture', exchange: 'CBOT', quoteBasis: 'cents', unit: 'bu',   etfProxies: ['DBC'], description: 'CBOT corn futures — feed, ethanol, and export demand against US Midwest weather.' },
  { slug: 'wheat',       symbol: 'ZW=F', name: 'Wheat',           category: 'agriculture', exchange: 'CBOT', quoteBasis: 'cents', unit: 'bu',   etfProxies: ['DBC'], description: 'CBOT soft red winter wheat — the global food-price bellwether, sensitive to geopolitics.' },
  { slug: 'soybeans',    symbol: 'ZS=F', name: 'Soybeans',        category: 'agriculture', exchange: 'CBOT', quoteBasis: 'cents', unit: 'bu',   etfProxies: ['DBC'], description: 'CBOT soybeans — crush demand (meal, oil) and the US–China trade relationship in one contract.' },
  { slug: 'coffee',      symbol: 'KC=F', name: 'Coffee',          category: 'agriculture', exchange: 'ICE',  quoteBasis: 'cents', unit: 'lb',   etfProxies: [],      description: 'ICE arabica coffee — Brazilian frost and drought risk make it one of the wildest softs.' },
  { slug: 'sugar',       symbol: 'SB=F', name: 'Sugar',           category: 'agriculture', exchange: 'ICE',  quoteBasis: 'cents', unit: 'lb',   etfProxies: [],      description: 'ICE Sugar No. 11 — world raw sugar; Brazil’s cane harvest and ethanol economics set the tone.' },
  { slug: 'cocoa',       symbol: 'CC=F', name: 'Cocoa',           category: 'agriculture', exchange: 'ICE',  quoteBasis: 'usd',   unit: 't',    etfProxies: [],      description: 'ICE cocoa — West African supply concentration produces spectacular squeezes.' },
  { slug: 'cotton',      symbol: 'CT=F', name: 'Cotton',          category: 'agriculture', exchange: 'ICE',  quoteBasis: 'cents', unit: 'lb',   etfProxies: [],      description: 'ICE cotton No. 2 — apparel demand vs US, Indian, and Brazilian growing conditions.' },

  // ── Livestock ────────────────────────────────────────────────────────────
  { slug: 'live-cattle', symbol: 'LE=F', name: 'Live Cattle',     category: 'livestock', exchange: 'CME', quoteBasis: 'cents', unit: 'lb', etfProxies: [], description: 'CME live cattle — herd cycles run years, so supply shocks persist.' },
  { slug: 'lean-hogs',   symbol: 'HE=F', name: 'Lean Hogs',       category: 'livestock', exchange: 'CME', quoteBasis: 'cents', unit: 'lb', etfProxies: [], description: 'CME lean hogs — disease outbreaks and export swings drive sharp repricings.' },
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
