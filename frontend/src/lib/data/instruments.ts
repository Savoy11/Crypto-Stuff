// Cross-asset instrument core (docs/ROADMAP.md "instruments" design).
// One unified list spanning crypto, stocks, ETFs, and mutual funds so
// portfolios, watchlists, and net worth are asset-class agnostic.
//
// Keys are storage-stable:
//   crypto     → the CoinGecko id (back-compatible with saved portfolios)
//   securities → 'sec:SYMBOL' (routed to /live-data/security-quotes)
// When DB persistence lands these keys become the instruments table's
// natural ids — a data migration, not a redesign.

import { PORTFOLIO_COINS, type CoinCategory } from './portfolioCoins'
import { EQUITY_CATALOG } from './equityCatalog'
import { FUND_CATALOG } from './fundCatalog'
import { COMMODITY_CATALOG, COMMODITY_CATEGORY_INFO } from './commodityCatalog'
import { CURRENCY_CATALOG, CURRENCY_CATEGORY_INFO } from './currencyCatalog'
import { RATES_CATALOG, RATES_CATEGORY_INFO } from './ratesCatalog'

export type InstrumentClass = 'crypto' | 'equity' | 'etf' | 'mutual' | 'commodity' | 'currency' | 'rate'

export interface Instrument {
  /** Storage key — also exposed as `cgId` for portfolio back-compat */
  key: string
  cgId: string
  symbol: string
  name: string
  class: InstrumentClass
  category: CoinCategory
  riskTier: number
  color: string
  /**
   * Where this instrument's detail page lives, when it isn't derivable from
   * class + symbol (macro instruments route by catalog slug — '/macro/…').
   * Absent for crypto/equity/fund instruments, whose consumers already know
   * their routes.
   */
  detailPath?: string
}

export const SEC_PREFIX = 'sec:'
export const isSecurityKey = (key: string) => key.startsWith(SEC_PREFIX)
export const securitySymbol = (key: string) => key.slice(SEC_PREFIX.length)

// Rough volatility proxy from beta — same 1–10 scale as crypto risk tiers,
// where broad-market equities land well below most crypto.
function equityRiskTier(beta: number): number {
  if (beta < 0.7) return 3
  if (beta < 1.2) return 4
  if (beta < 1.7) return 5
  return 6
}

function fundRiskTier(category: string): number {
  if (category === 'bond') return 2
  if (category === 'commodity') return 4
  if (category === 'crypto') return 7
  if (category === 'balanced') return 3
  return 4 // broad/sector equity funds
}

function fundCategory(category: string): CoinCategory {
  if (category === 'bond') return 'bond'
  return 'fund'
}

export const INSTRUMENTS: Instrument[] = [
  ...PORTFOLIO_COINS.map((c) => ({
    key: c.cgId, cgId: c.cgId, symbol: c.symbol, name: c.name,
    class: 'crypto' as const, category: c.category, riskTier: c.riskTier, color: c.color,
  })),
  ...EQUITY_CATALOG.map((e) => ({
    key: `${SEC_PREFIX}${e.symbol}`, cgId: `${SEC_PREFIX}${e.symbol}`,
    symbol: e.symbol, name: e.name,
    class: 'equity' as const, category: 'equity' as CoinCategory,
    riskTier: equityRiskTier(e.beta), color: '#3b82f6',
  })),
  ...FUND_CATALOG.map((f) => ({
    key: `${SEC_PREFIX}${f.symbol}`, cgId: `${SEC_PREFIX}${f.symbol}`,
    symbol: f.symbol, name: f.name,
    class: (f.type === 'etf' ? 'etf' : 'mutual') as InstrumentClass,
    category: fundCategory(f.category),
    riskTier: fundRiskTier(f.category), color: f.category === 'bond' ? '#64748b' : '#14b8a6',
  })),
  // Macro instruments (ROADMAP "instruments" open item). All quote through
  // the same security routes as stocks/funds, so the sec: key works as-is;
  // detailPath carries the slug-based macro route the symbol can't encode.
  // Risk tiers are coarse class-level placements on the same 1–10 scale:
  // futures around single-stock territory, FX below equities, yields lowest.
  ...COMMODITY_CATALOG.map((c) => ({
    key: `${SEC_PREFIX}${c.symbol}`, cgId: `${SEC_PREFIX}${c.symbol}`,
    symbol: c.symbol, name: `${c.name} Futures`,
    class: 'commodity' as const, category: 'unknown' as CoinCategory,
    riskTier: c.category === 'energy' ? 6 : 5,
    color: COMMODITY_CATEGORY_INFO[c.category].color,
    detailPath: `/macro/commodities/${c.slug}`,
  })),
  ...CURRENCY_CATALOG.map((c) => ({
    key: `${SEC_PREFIX}${c.symbol}`, cgId: `${SEC_PREFIX}${c.symbol}`,
    symbol: c.symbol, name: c.name,
    class: 'currency' as const, category: 'unknown' as CoinCategory,
    riskTier: c.category === 'emerging' ? 4 : 3,
    color: CURRENCY_CATEGORY_INFO[c.category].color,
    detailPath: `/macro/currencies/${c.slug}`,
  })),
  ...RATES_CATALOG.map((r) => ({
    key: `${SEC_PREFIX}${r.symbol}`, cgId: `${SEC_PREFIX}${r.symbol}`,
    symbol: r.symbol, name: r.name,
    class: 'rate' as const, category: 'unknown' as CoinCategory,
    riskTier: 2,
    color: RATES_CATEGORY_INFO[r.category].color,
    detailPath: `/macro/rates/${r.slug}`,
  })),
]

export const INSTRUMENT_BY_KEY: Record<string, Instrument> = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.key, i])
)

export const CLASS_LABELS: Record<InstrumentClass, string> = {
  crypto: 'Crypto',
  equity: 'Stock',
  etf: 'ETF',
  mutual: 'Mutual fund',
  commodity: 'Commodity',
  currency: 'Currency',
  rate: 'Rate',
}
