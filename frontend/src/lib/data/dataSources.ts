// ─────────────────────────────────────────────────────────────────────────────
// Finance Now Free DATA SOURCE REGISTRY — single source of truth for "where does this data
// come from?". Consumed by three things so nothing drifts:
//   1. scripts/gen-data-sources.ts  → generates docs/DATA-SOURCES.md
//   2. /data-sources page           → in-app, human-readable catalog
//   3. <SourceLine route="…"/>      → per-page provenance badge (getSource())
//
// Provider hosts here were verified against the actual fetch() calls in each
// /live-data route (see scripts/gen-data-sources.ts --verify, which diffs this
// registry against the hosts hardcoded in the route files). Statuses mirror
// DATA-AVAILABILITY.md — update both when a source changes, then run the audit.
// ─────────────────────────────────────────────────────────────────────────────

export type SourceStatus =
  | 'live'         // real external provider at request time
  | 'partial'      // some fields live, others static/estimate
  | 'key-gated'    // needs an API key / paid plan the project may not have
  | 'derived'      // computed from other live data, not a single upstream
  | 'unavailable'  // no free real-time source; UI shows an explicit notice

export type ProviderRole = 'primary' | 'fallback' | 'aggregator' | 'derived'
export type ProviderAuth = 'none' | 'key' | 'paid'

export interface SourceProvider {
  /** Display name, e.g. "CoinGecko". */
  name: string
  /** Hostname the route actually calls, e.g. "api.coingecko.com". */
  host?: string
  /** Link to the provider (site or docs) for the UI. */
  url?: string
  role: ProviderRole
  auth: ProviderAuth
}

export interface DataSourceEntry {
  /** Stable id — usually the /live-data route folder. Used by getSource(). */
  id: string
  /** User-facing surface this powers. */
  surface: string
  module: 'crypto' | 'equities' | 'funds' | 'macro' | 'shared'
  /** The internal route, if there is a single one. */
  route?: string
  /** Sibling route folders folded into this surface (for the drift checker). */
  covers?: string[]
  status: SourceStatus
  providers: SourceProvider[]
  /** Refresh cadence, human-readable. */
  cadence?: string
  /** Static/reference data files that back or fall back this surface. */
  staticData?: string[]
  notes?: string
}

// Convenience provider presets (kept inline where one-off).
const SEC_EDGAR: SourceProvider = { name: 'SEC EDGAR', host: 'data.sec.gov', url: 'https://www.sec.gov/edgar', role: 'primary', auth: 'none' }
const COINGECKO: SourceProvider = { name: 'CoinGecko', host: 'api.coingecko.com', url: 'https://www.coingecko.com/en/api', role: 'primary', auth: 'none' }
const DEFILLAMA = (host: string): SourceProvider => ({ name: 'DefiLlama', host, url: 'https://defillama.com/docs/api', role: 'primary', auth: 'none' })
const YAHOO: SourceProvider = { name: 'Yahoo Finance', host: 'query1.finance.yahoo.com', url: 'https://finance.yahoo.com', role: 'primary', auth: 'none' }

export const DATA_SOURCES: DataSourceEntry[] = [
  // ── CRYPTO — market data ───────────────────────────────────────────────────
  {
    id: 'markets', surface: 'Crypto prices, market cap, volume, 24h change', module: 'crypto',
    route: '/live-data/markets', status: 'live',
    providers: [COINGECKO, { name: 'Binance', host: 'api.binance.com', url: 'https://binance.com', role: 'fallback', auth: 'none' }, { name: 'CoinMarketCap', host: 'pro-api.coinmarketcap.com', url: 'https://coinmarketcap.com/api', role: 'fallback', auth: 'paid' }],
    cadence: '30s client poll · sequential fallback ladder', staticData: ['lib/data/assetCatalog.ts (metadata)'],
    notes: 'Prices live; coin metadata (name, chain, contract) is static reference data, not fabricated.',
  },
  {
    id: 'ohlcv', surface: 'Crypto OHLCV / candlestick charts', module: 'crypto',
    route: '/live-data/ohlcv', status: 'partial',
    providers: [{ name: 'Binance', host: 'api.binance.com', url: 'https://binance.com', role: 'primary', auth: 'none' }, { name: 'Binance.US', host: 'api.binance.us', url: 'https://binance.us', role: 'fallback', auth: 'none' }, COINGECKO],
    cadence: 'on demand · 60s–15m stale by range',
    notes: 'Binance.com is 451 (geo-blocked) from many hosts, so candles come from the US mirror — a different venue. Serving venue recorded in the `venue` field.',
  },
  {
    id: 'coin-list', surface: 'Coin list / search / discovery', module: 'crypto',
    route: '/live-data/coin-list', covers: ['coin-search'], status: 'live',
    providers: [COINGECKO, { name: 'Binance.US', host: 'api.binance.us', role: 'fallback', auth: 'none' }],
    cadence: 'on demand',
  },
  {
    id: 'coin-discovery', surface: 'Coin discovery candidates', module: 'crypto',
    route: '/live-data/coin-discovery', status: 'live', providers: [COINGECKO], cadence: 'on demand',
  },
  {
    id: 'fear-greed', surface: 'Fear & Greed Index', module: 'crypto',
    route: '/live-data/fear-greed', status: 'live',
    providers: [{ name: 'alternative.me', host: 'api.alternative.me', url: 'https://alternative.me/crypto/fear-and-greed-index/', role: 'primary', auth: 'none' }],
  },
  {
    id: 'funding-rates', surface: 'Perp funding rates + open interest', module: 'crypto',
    route: '/live-data/funding-rates', status: 'live',
    providers: [{ name: 'OKX', host: 'www.okx.com', url: 'https://www.okx.com/docs-v5/', role: 'primary', auth: 'none' }],
    notes: 'Binance futures (fapi) is 451 from many hosts; OKX is the working source.',
  },
  {
    id: 'defi-tvl', surface: 'DeFi TVL', module: 'crypto',
    route: '/live-data/defi-tvl', status: 'live', providers: [DEFILLAMA('api.llama.fi')],
  },
  {
    id: 'btc-stats', surface: 'Bitcoin network stats (height, hashrate, mempool)', module: 'crypto',
    route: '/live-data/btc-stats', status: 'live',
    providers: [{ name: 'mempool.space', host: 'mempool.space', url: 'https://mempool.space/docs/api', role: 'primary', auth: 'none' }, { name: 'blockchain.info', host: 'blockchain.info', role: 'fallback', auth: 'none' }],
  },
  {
    id: 'reserves', surface: 'Stablecoin reserves / collateralization', module: 'crypto',
    route: '/live-data/reserves', status: 'live', providers: [DEFILLAMA('stablecoins.llama.fi')],
    notes: 'Supply is live; composition breakdown is approximate / derived from chain distribution, not issuer attestation.',
  },
  {
    id: 'risk-scores', surface: 'Risk scores', module: 'crypto',
    route: '/live-data/risk-scores', status: 'derived',
    providers: [DEFILLAMA('stablecoins.llama.fi'), COINGECKO, { name: 'Curated disclosures + news', role: 'derived', auth: 'none' }],
    cadence: 'on demand', notes: 'Live-computed composites via src/lib/risk. Pillars without data show N/A and drop coverage/confidence.',
  },
  {
    id: 'alerts', surface: 'Alerts (depegs, large moves)', module: 'crypto',
    route: '/live-data/alerts', status: 'derived', providers: [COINGECKO],
    notes: 'Generated from live price/peg movement thresholds, not a stored backend.',
  },
  {
    id: 'network-fees', surface: 'Network / gas fees (16 chains)', module: 'crypto',
    route: '/live-data/network-fees', status: 'partial',
    providers: [{ name: 'mempool.space', host: 'mempool.space', role: 'primary', auth: 'none' }, COINGECKO],
    staticData: ['lib/data/networkFees.ts (gas amounts)'],
    notes: 'Only Bitcoin’s sat/vByte fee is live. Every other chain is a static gas amount × live token price, labeled `estimate` per network.',
  },
  {
    id: 'staking-rates', surface: 'Staking APR/APY', module: 'crypto',
    route: '/live-data/staking-rates', status: 'partial',
    providers: [
      { name: 'DefiLlama Yields', host: 'yields.llama.fi', url: 'https://defillama.com/yields', role: 'aggregator', auth: 'none' },
      { name: 'Lido', host: 'eth-api.lido.fi', role: 'primary', auth: 'none' },
      { name: 'Rocket Pool', host: 'api.rocketpool.net', role: 'primary', auth: 'none' },
      { name: 'Marinade', host: 'api.marinade.finance', role: 'primary', auth: 'none' },
      { name: 'Jito', host: 'kobe.mainnet.jito.network', role: 'primary', auth: 'none' },
      { name: 'Stride', host: 'edge.stride.zone', role: 'primary', auth: 'none' },
      { name: 'Cosmostation / Subscan / chain LCDs', role: 'primary', auth: 'none' },
    ],
    cadence: '20m client poll · 18 parallel upstreams', staticData: ['lib/data/stakingProviders.ts (risk profiles, fallback APRs)'],
    notes: 'Liquid-staking/restaking protocols + native network rates are live (DefiLlama + protocol APIs + chain inflation). CeFi exchange rates are static estimates. Each rate carries sources[key] = "live" | "estimate".',
  },
  {
    id: 'staking-discovery', surface: 'Staking / yield discovery', module: 'crypto',
    route: '/live-data/staking-discovery', status: 'live',
    providers: [DEFILLAMA('yields.llama.fi'), { name: 'Yearn', host: 'api.yearn.finance', role: 'primary', auth: 'none' }, { name: 'Pendle', host: 'api-v2.pendle.finance', role: 'primary', auth: 'none' }, { name: 'Beefy', host: 'api.beefy.finance', role: 'primary', auth: 'none' }],
    cadence: 'on demand · ~18s (4 upstreams)',
  },

  {
    id: 'chart', surface: 'Crypto price chart (legacy, internal)', module: 'crypto',
    route: '/live-data/chart', status: 'derived', providers: [COINGECKO],
    notes: 'Synthesises zero-range OHLC from a price-only series (marked synthetic:true). No app consumers — /live-data/ohlcv provides real candles.',
  },

  // ── CRYPTO — news / social / video ─────────────────────────────────────────
  {
    id: 'news', surface: 'Crypto news + sentiment', module: 'crypto',
    route: '/live-data/news', status: 'live',
    providers: [{ name: 'CryptoPanic', host: 'cryptopanic.com', role: 'primary', auth: 'key' }, { name: 'Messari', host: 'data.messari.io', role: 'primary', auth: 'key' }, { name: 'GNews / NewsAPI', role: 'fallback', auth: 'key' }, { name: 'RSS feeds', role: 'primary', auth: 'none' }],
    cadence: '1m', notes: 'Multi-provider RSS/JSON merge. Sentiment/category are heuristic classifiers (labeled derived).',
  },
  {
    id: 'social', surface: 'Crypto social sentiment', module: 'crypto',
    route: '/live-data/social', status: 'partial',
    providers: [{ name: 'Reddit (Atom/RSS)', host: 'www.reddit.com', role: 'primary', auth: 'none' }, { name: 'Santiment', host: 'api.santiment.net', role: 'primary', auth: 'key' }, { name: 'LunarCrush', host: 'lunarcrush.com', role: 'fallback', auth: 'key' }],
    notes: 'Reddit’s JSON API 403s server-side; the .rss feeds work but 429 aggressively, so coverage is partial by nature.',
  },
  {
    id: 'videos', surface: 'Videos / video search', module: 'crypto',
    route: '/live-data/videos', covers: ['video-search', 'video-analyze'], status: 'key-gated',
    providers: [{ name: 'YouTube Data API', host: 'www.googleapis.com', url: 'https://developers.google.com/youtube/v3', role: 'primary', auth: 'key' }, { name: 'YouTube RSS', host: 'www.youtube.com', role: 'fallback', auth: 'none' }],
    notes: 'RSS video list works keyless; search/analyze report configured:false without a key rather than fabricating.',
  },

  // ── CRYPTO — portfolio / wallets ───────────────────────────────────────────
  {
    id: 'portfolio-prices', surface: 'Portfolio prices', module: 'crypto',
    route: '/live-data/portfolio-prices', status: 'live',
    providers: [COINGECKO, DEFILLAMA('coins.llama.fi')], cadence: 'on demand',
  },
  {
    id: 'portfolio-history', surface: 'Portfolio history', module: 'crypto',
    route: '/live-data/portfolio-history', status: 'live', providers: [COINGECKO],
    notes: 'Requires ids + date; returns HTTP 400 on missing/invalid params.',
  },
  {
    id: 'wallet', surface: 'On-chain wallet balances (BTC/ETH/SOL/TRON/XRP + EVM)', module: 'crypto',
    route: '/live-data/wallet/*', status: 'live',
    providers: [{ name: 'Public explorers + JSON-RPC ladders', role: 'primary', auth: 'none' }],
    notes: 'Each chain walks a fallback ladder of public RPC/explorer endpoints and reports the serving endpoint in `rpc`.',
  },

  // ── EQUITIES ───────────────────────────────────────────────────────────────
  {
    id: 'security-quotes', surface: 'Stock / ETF / fund quotes', module: 'equities',
    route: '/live-data/security-quotes', status: 'partial',
    providers: [
      { name: 'FMP', host: 'financialmodelingprep.com', url: 'https://site.financialmodelingprep.com/developer/docs', role: 'primary', auth: 'key' },
      { name: 'Finnhub / Twelve Data / Tiingo / Alpha Vantage', role: 'fallback', auth: 'key' },
      YAHOO,
      { name: 'Catalog reference prices', role: 'fallback', auth: 'none' },
    ],
    staticData: ['lib/data/equityCatalog.ts', 'lib/data/fundCatalog.ts'],
    notes: 'Registry-driven provider ladder (Integrations page). Yahoo serves in practice; catalog reference is the last resort, labeled with an amber `ref` tag.',
  },
  {
    id: 'security-ohlcv', surface: 'Stock OHLCV / TA / backtests', module: 'equities',
    route: '/live-data/security-ohlcv', status: 'live',
    providers: [YAHOO, { name: 'Tiingo', host: 'api.tiingo.com', role: 'fallback', auth: 'key' }, { name: 'FMP', host: 'financialmodelingprep.com', role: 'fallback', auth: 'key' }],
  },
  {
    id: 'security-returns', surface: 'Trailing returns (1M/3M/YTD/1Y)', module: 'equities',
    route: '/live-data/security-returns', status: 'live', providers: [YAHOO],
  },
  {
    id: 'market-news', surface: 'Stock market news', module: 'equities',
    route: '/live-data/market-news', status: 'live',
    providers: [{ name: 'Yahoo Finance / MarketWatch / CNBC RSS', role: 'primary', auth: 'none' }],
  },
  {
    id: 'stock-social', surface: 'Stock social sentiment', module: 'equities',
    route: '/live-data/stock-social', status: 'partial',
    providers: [{ name: 'StockTwits', host: 'api.stocktwits.com', role: 'primary', auth: 'none' }, { name: 'Reddit (Atom/RSS)', host: 'www.reddit.com', role: 'primary', auth: 'none' }],
    notes: 'Reddit 403s from datacenter IPs without OAuth — expect StockTwits-heavy results server-side. Budget allocated round-robin so one active source still fills the limit.',
  },
  {
    id: 'sec-filings', surface: 'SEC filings (10-K/10-Q/8-K)', module: 'equities',
    route: '/live-data/sec-filings', status: 'live', providers: [SEC_EDGAR, { name: 'SEC archives', host: 'www.sec.gov', role: 'primary', auth: 'none' }],
  },
  {
    id: 'company-facts', surface: 'Company fundamentals / ratios', module: 'equities',
    route: '/live-data/company-facts', status: 'live', providers: [{ ...SEC_EDGAR, name: 'SEC EDGAR XBRL' }],
    notes: 'AAPL rev/net-margin sanity-checked against reported figures.',
  },
  {
    id: 'company-profile', surface: 'Company profile', module: 'equities',
    route: '/live-data/company-profile', status: 'live',
    providers: [SEC_EDGAR, { name: 'Wikipedia', host: 'en.wikipedia.org', role: 'fallback', auth: 'none' }],
  },
  {
    id: 'stock-universe', surface: 'Stock Registry universe', module: 'equities',
    route: '/live-data/stock-universe', status: 'partial',
    providers: [{ name: 'FMP company-screener', host: 'financialmodelingprep.com', role: 'primary', auth: 'paid' }, { name: 'Curated catalog', role: 'fallback', auth: 'none' }, { ...SEC_EDGAR, name: 'SEC XBRL frames (P/E backfill)', role: 'aggregator' }],
    staticData: ['lib/data/equityCatalog.ts (~79 names)'],
    notes: 'FMP screener is PAID-only; without a key the registry falls back to ~79 curated names. P/E backfilled from SEC XBRL frames on the FMP path only.',
  },
  {
    id: 'stock-outliers', surface: 'Equity screener / outliers', module: 'equities',
    route: '/live-data/stock-outliers', status: 'partial',
    providers: [{ name: 'Derived from stock-universe', role: 'derived', auth: 'none' }],
    notes: 'Sector z-scores over whatever universe stock-universe returns — inherits its narrowness on the catalog fallback.',
  },
  {
    id: 'market-calendar', surface: 'Market calendar (earnings / econ)', module: 'equities',
    route: '/live-data/market-calendar', status: 'key-gated',
    providers: [{ name: 'FMP', host: 'financialmodelingprep.com', role: 'primary', auth: 'key' }],
    notes: 'Earnings needs a free FMP key; economic calendar needs a paid one. Reports configured:false without one.',
  },

  // ── FUNDS ──────────────────────────────────────────────────────────────────
  {
    id: 'fund-universe', surface: 'Fund universe', module: 'funds',
    route: '/live-data/fund-universe', status: 'live',
    providers: [{ ...SEC_EDGAR, name: 'SEC', host: 'www.sec.gov' }, { name: 'NASDAQ Trader', host: 'www.nasdaqtrader.com', role: 'primary', auth: 'none' }],
    cadence: 'daily-cached · ~11s / 14MB', notes: '28,977 entries in one payload — pagination is a tracked follow-up.',
  },
  {
    id: 'fund-holdings', surface: 'ETF / fund holdings', module: 'funds',
    route: '/live-data/fund-holdings', status: 'live',
    providers: [{ ...SEC_EDGAR, name: 'SEC N-PORT' }, { name: 'FMP', host: 'financialmodelingprep.com', role: 'fallback', auth: 'key' }, { name: 'Yahoo top-10', role: 'fallback', auth: 'none' }, { name: 'Catalog', role: 'fallback', auth: 'none' }],
    notes: 'N-PORT is keyless and authoritative. UITs (e.g. SPY) file no N-PORT and correctly fall back to indicative top holdings.',
  },
  {
    id: 'fund-holdings-history', surface: 'Holdings quarter-over-quarter diff', module: 'funds',
    route: '/live-data/fund-holdings-history', status: 'partial',
    providers: [{ ...SEC_EDGAR, name: 'SEC N-PORT' }, { name: 'FMP', host: 'financialmodelingprep.com', role: 'fallback', auth: 'key' }],
    notes: 'Works where an N-PORT series exists.',
  },

  // ── MACRO ──────────────────────────────────────────────────────────────────
  {
    id: 'fx-rates', surface: 'FX rates (official tier)', module: 'macro',
    route: '/live-data/fx-rates', status: 'live',
    providers: [{ name: 'ECB via Frankfurter', host: 'api.frankfurter.dev', url: 'https://frankfurter.dev', role: 'primary', auth: 'none' }],
    notes: 'ECB’s complete published set of ~30 reference currencies.',
  },
  {
    id: 'fx-rates-extended', surface: 'FX rates (extended tier, +127)', module: 'macro',
    route: '/live-data/fx-rates-extended', status: 'live',
    providers: [{ name: 'currency-api (community)', host: 'cdn.jsdelivr.net', url: 'https://github.com/fawazahmed0/currency-api', role: 'primary', auth: 'none' }],
    notes: 'Community-sourced, not ECB — the UI shows a distinct disclosure and never blends the two tiers without attribution.',
  },
  {
    id: 'treasury-yield-curve', surface: 'Treasury par yield curve', module: 'macro',
    route: '/live-data/treasury-yield-curve', status: 'live',
    providers: [{ name: 'U.S. Treasury', host: 'home.treasury.gov', url: 'https://home.treasury.gov', role: 'primary', auth: 'none' }],
    cadence: '4h revalidate', notes: 'Official 13-maturity daily par curve (XML).',
  },
  {
    id: 'macro-news', surface: 'Macro news (commodities/bonds/FX)', module: 'macro',
    route: '/live-data/macro-news', status: 'live',
    providers: [{ name: 'Investing.com / OilPrice / FXStreet / CNBC / Dow Jones RSS', role: 'primary', auth: 'none' }],
    notes: '8 keyless RSS feeds with a content-first pillar classifier.',
  },
  {
    id: 'macro-quotes', surface: 'Commodity / FX / rate quotes + charts', module: 'macro',
    route: '/live-data/security-quotes · security-chart · security-ohlcv', status: 'live',
    providers: [YAHOO],
    staticData: ['lib/data/commodityCatalog.ts', 'lib/data/currencyCatalog.ts', 'lib/data/ratesCatalog.ts'],
    notes: 'Futures, FX pairs, and yield indices price through the existing equity quote/chart routes (no new plumbing). Catalogs carry no reference prices — unpriced renders an honest dash.',
  },

  // ── SHARED / OTHER ─────────────────────────────────────────────────────────
  {
    id: 'headlines', surface: 'Headlines (cross-module landing feed)', module: 'shared',
    route: '/live-data/news + /live-data/market-news', status: 'live',
    providers: [{ name: 'Crypto + equity news feeds (merged client-side)', role: 'aggregator', auth: 'none' }],
  },
  {
    id: 'watchlist', surface: 'Watchlist (cross-module live prices)', module: 'shared',
    route: '/live-data/portfolio-prices + /live-data/security-quotes', status: 'live',
    providers: [
      COINGECKO,
      { name: 'Equity quote ladder (FMP → … → Yahoo)', role: 'primary', auth: 'none' },
    ],
    notes: 'Prices split by instrument class: CoinGecko ids price through portfolio-prices, sec:-keyed stocks/funds/macro through the security-quotes ladder. Lists themselves are user data (Postgres), not a provider feed.',
  },
  {
    id: 'compare', surface: 'Compare (growth-of-100, window stats, correlation)', module: 'shared',
    route: '/live-data/security-chart + /live-data/chart', status: 'derived',
    providers: [
      YAHOO,
      COINGECKO,
      { name: 'Finance Now Free computation (alignment, stats, correlation)', role: 'derived', auth: 'none' },
    ],
    notes: 'Price series are provider data (Yahoo for stocks/funds/macro, CoinGecko closes for crypto); the growth-of-100 normalization, window statistics, and correlation matrix are computed by Finance Now Free, not published figures.',
  },
  {
    id: 'brief', surface: 'AI Daily Brief', module: 'shared',
    route: '/api/agents/research', status: 'derived',
    providers: [
      { name: 'Finance Now Free AI agent (LLM, BYOK)', role: 'derived', auth: 'key' },
      { name: 'Live-data routes (same feeds the UI reads)', role: 'aggregator', auth: 'none' },
    ],
    notes: 'AI-generated text grounded in the user’s holdings and the same /live-data routes the UI reads. This is Finance Now Free’s own computation — not a publisher’s analysis — and inherits the freshness of whatever feeds the agent’s tools returned.',
  },
  {
    id: 'portfolio-builder', surface: 'Portfolio Builder (allocations, drift, suitability)', module: 'shared',
    route: '/live-data/portfolio-prices + /live-data/security-quotes (drift monitoring)', status: 'derived',
    providers: [
      { name: 'Finance Now Free engine (lib/data/portfolioBuilder.ts)', role: 'derived', auth: 'none' },
      COINGECKO,
      { name: 'Equity quote ladder (FMP → … → Yahoo)', role: 'fallback', auth: 'none' },
    ],
    staticData: ['lib/data/portfolioBuilder.ts', 'lib/data/fundCatalog.ts'],
    notes: 'Allocations, bond ladders, diversification and suitability scores are Finance Now Free’s own computation (pure engine, vitest-tested) — not provider figures. Live prices enter only for drift-vs-actual monitoring; unpriced positions are excluded, never valued at cost.',
  },
  {
    id: 'cbdc-data', surface: 'Global adoption / CBDC tracker', module: 'shared',
    route: '/live-data/cbdc-data', status: 'unavailable',
    providers: [{ name: 'Static table + central-bank sites', role: 'primary', auth: 'none' }],
    notes: 'De-routed (T5): mislabeled tracker on stale static data. /global-adoption redirects to /headlines. Kept for reference only.',
  },
  {
    id: 'config', surface: 'Integrations connectivity test', module: 'shared',
    route: '/live-data/config', status: 'derived',
    providers: [{ name: 'Every configured provider (crypto + equity + LLM)', role: 'aggregator', auth: 'key' }],
    notes: 'Not a data surface — it pings each provider from the Integrations page to report reachability/utilization.',
  },
]

// ─── Lookup helpers ──────────────────────────────────────────────────────────

const BY_ID = new Map(DATA_SOURCES.map(e => [e.id, e]))

/** Get the registry entry for a route/surface id (used by <SourceLine/>). */
export function getSource(id: string): DataSourceEntry | undefined {
  return BY_ID.get(id)
}

/** All entries for a module, in registry order. */
export function sourcesForModule(module: DataSourceEntry['module']): DataSourceEntry[] {
  return DATA_SOURCES.filter(e => e.module === module)
}

export const SOURCE_STATUS_META: Record<SourceStatus, { label: string; cls: string }> = {
  live:        { label: 'Live',          cls: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  partial:     { label: 'Partial',       cls: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  'key-gated': { label: 'Key-gated',     cls: 'text-sky-300 border-sky-500/30 bg-sky-500/10' },
  derived:     { label: 'Derived',       cls: 'text-violet-300 border-violet-500/30 bg-violet-500/10' },
  unavailable: { label: 'Not available', cls: 'text-slate-400 border-slate-500/30 bg-slate-500/10' },
}

export const PROVIDER_AUTH_META: Record<ProviderAuth, { label: string; cls: string }> = {
  none: { label: 'Keyless', cls: 'text-emerald-400/80' },
  key:  { label: 'API key', cls: 'text-amber-400/80' },
  paid: { label: 'Paid',    cls: 'text-orange-400/80' },
}
