// Data tier configuration.
// Controls which API source is used for each data category.
//
// "free"   — keyless public APIs only (Binance, DefiLlama, Alternative.me, mempool.space)
// "paid"   — premium APIs using stored keys (CoinGecko Pro, CoinMarketCap, Messari, etc.)
// "custom" — per-category overrides stored separately

export type TierMode = 'free' | 'paid' | 'custom'

export interface TierCategory {
  label: string
  description: string
  freeSource: string
  freeSourceLabel: string
  paidSource: string
  paidSourceLabel: string
  queryParam: string  // value passed as ?source= to the route
  /** Multi-select category (custom mode lets the user pick several sources). */
  multi?: boolean
  multiOptions?: { id: string; label: string }[]
}

export const TIER_CATEGORIES: Record<string, TierCategory> = {
  prices: {
    label: 'Spot Prices',
    description: 'Real-time asset prices and 24h market data',
    freeSource: 'coingecko',
    freeSourceLabel: 'CoinGecko (keyless)',
    paidSource: 'coinmarketcap',
    paidSourceLabel: 'CoinMarketCap Pro',
    queryParam: 'source',
  },
  ohlcv: {
    label: 'OHLCV / Charts',
    description: 'Candlestick data for technical analysis',
    freeSource: 'binance',
    freeSourceLabel: 'Binance Klines',
    paidSource: 'coingecko',
    paidSourceLabel: 'CoinGecko OHLC',
    queryParam: 'source',
  },
  news: {
    label: 'News Feed',
    description: 'Crypto news articles and headlines',
    freeSource: 'rss',
    freeSourceLabel: 'All enabled sources (merged)',
    paidSource: 'cryptopanic',
    paidSourceLabel: 'All enabled sources (merged)',
    queryParam: 'providers',
    // News merges providers, so custom mode is a multi-select — pick any set.
    // The option list itself is NOT static: it's built at render time from the
    // live /live-data/config provider list (see TierSwitch), filtered to
    // category 'news' AND config.enabled, so every individually-enabled source
    // (including each custom RSS feed) shows up, and disabled ones don't.
    multi: true,
  },
  social: {
    label: 'Social Signals',
    description: 'Community sentiment and social data',
    freeSource: 'reddit',
    freeSourceLabel: 'Reddit RSS',
    paidSource: 'lunarcrush',
    paidSourceLabel: 'LunarCrush + Santiment',
    queryParam: 'source',
  },
  defi: {
    label: 'DeFi / TVL',
    description: 'Protocol TVL, chain data, DEX volumes',
    freeSource: 'defillama',
    freeSourceLabel: 'DefiLlama',
    paidSource: 'defillama',
    paidSourceLabel: 'DefiLlama (same)',
    queryParam: 'source',
  },
  fundingRates: {
    label: 'Funding Rates',
    description: 'Perpetual futures funding rates and open interest',
    freeSource: 'okx',
    freeSourceLabel: 'OKX Futures',
    paidSource: 'okx',
    paidSourceLabel: 'OKX Futures (same)',
    queryParam: 'source',
  },
  fees: {
    label: 'Network Fees',
    description: 'Gas prices and transaction fees',
    freeSource: 'mempool',
    freeSourceLabel: 'Mempool.space',
    paidSource: 'mempool',
    paidSourceLabel: 'Mempool.space (same)',
    queryParam: 'source',
  },
  staking: {
    label: 'Staking Rates',
    description: 'Live APY from staking protocols',
    freeSource: 'native',
    freeSourceLabel: 'Lido / Marinade / Jito',
    paidSource: 'native',
    paidSourceLabel: 'Lido / Marinade / Jito (same)',
    queryParam: 'source',
  },
}

// Returns the source string for a given category + tier mode + optional custom overrides
export function resolveSource(
  categoryKey: string,
  mode: TierMode,
  custom?: Record<string, string>,
): string {
  const cat = TIER_CATEGORIES[categoryKey]
  if (!cat) return 'default'
  if (mode === 'custom' && custom?.[categoryKey]) return custom[categoryKey]
  return mode === 'paid' ? cat.paidSource : cat.freeSource
}

// Build the query string to append to a route URL
export function tierQueryParam(categoryKey: string, mode: TierMode, custom?: Record<string, string>): string {
  const source = resolveSource(categoryKey, mode, custom)
  return `source=${source}`
}

/**
 * News provider filter for the current tier. Returns a comma-separated provider
 * list to pass as ?providers= (custom mode with a selection), or null meaning
 * "no filter — merge all enabled providers" (free/paid, or nothing selected).
 */
export function resolveNewsProviders(mode: TierMode, custom?: Record<string, string>): string | null {
  if (mode !== 'custom') return null
  const sel = (custom?.news ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (sel.length === 0) return null
  return sel.join(',')
}

export const TIER_LABELS: Record<TierMode, string> = {
  free: 'Free Tier',
  paid: 'Paid Tier',
  custom: 'Custom',
}

export const TIER_COLORS: Record<TierMode, string> = {
  free: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  paid: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  custom: 'text-violet-400 border-violet-500/30 bg-violet-500/10',
}
