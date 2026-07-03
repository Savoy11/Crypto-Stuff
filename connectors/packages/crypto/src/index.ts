import {
  BaseConnector,
  ConnectorError,
  TtlCache,
  type ConnectorConfig,
  type ConnectorMetadata,
  type HistoryRequest,
  type HistorySeries,
  type Quote,
  type SearchResult,
} from '@caep/connector-core'

export const CRYPTO_CONNECTOR_SKU = 'caep.connector.crypto'

const DEFAULT_BASE_URL = 'https://api.coingecko.com/api/v3'

/** Ticker → CoinGecko id for the coins CAEP already supports, plus majors. */
const SYMBOL_TO_ID: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  usdt: 'tether',
  usdc: 'usd-coin',
  bnb: 'binancecoin',
  sol: 'solana',
  dai: 'dai',
  xrp: 'ripple',
  ltc: 'litecoin',
  trx: 'tron',
  doge: 'dogecoin',
  matic: 'matic-network',
  avax: 'avalanche-2',
  ada: 'cardano',
  dot: 'polkadot',
  atom: 'cosmos',
  link: 'chainlink',
  uni: 'uniswap',
  arb: 'arbitrum',
  op: 'optimism',
}

interface SimplePriceEntry {
  usd?: number
  usd_market_cap?: number
  usd_24h_vol?: number
  usd_24h_change?: number
  last_updated_at?: number
}

interface SearchResponse {
  coins?: Array<{ id: string; symbol: string; name: string }>
}

export class CryptoConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: 'caep-crypto',
    name: 'CAEP Crypto Connector',
    description: 'Live cryptocurrency prices, search, and OHLC history from CoinGecko',
    assetClass: 'crypto',
    version: '0.1.0',
    provider: 'coingecko',
    sku: CRYPTO_CONNECTOR_SKU,
    capabilities: ['quote', 'history', 'search'],
    requiresApiKey: false,
  }

  private readonly baseUrl: string
  private readonly quoteCache = new TtlCache<Quote[]>(30_000)
  private readonly idCache = new TtlCache<string>(24 * 60 * 60 * 1000)

  constructor(config: ConnectorConfig = {}) {
    super(config)
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
  }

  protected async probe(): Promise<void> {
    await this.fetchJson(`${this.baseUrl}/ping`)
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const data = await this.fetchJson<SearchResponse>(
      `${this.baseUrl}/search?query=${encodeURIComponent(query)}`,
    )
    return (data.coins ?? []).slice(0, limit).map((coin, index) => ({
      symbol: coin.symbol.toLowerCase(),
      assetClass: 'crypto' as const,
      name: coin.name,
      currency: 'USD',
      score: 1 - index * 0.1,
    }))
  }

  async getQuote(symbol: string): Promise<Quote> {
    const [quote] = await this.getQuotes([symbol])
    return quote
  }

  override async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) return []
    const key = symbols.map((s) => s.toLowerCase()).sort().join(',')
    return this.quoteCache.getOrLoad(key, () => this.fetchQuotes(symbols))
  }

  private async fetchQuotes(symbols: string[]): Promise<Quote[]> {
    const ids = await Promise.all(symbols.map((symbol) => this.resolveId(symbol)))
    const url =
      `${this.baseUrl}/simple/price?ids=${ids.join(',')}&vs_currencies=usd` +
      '&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true'
    const data = await this.fetchJson<Record<string, SimplePriceEntry>>(url)

    return symbols.map((symbol, i) => {
      const entry = data[ids[i]]
      if (!entry || entry.usd === undefined) {
        throw new ConnectorError('NOT_FOUND', `No price data for crypto symbol "${symbol}"`)
      }
      return {
        symbol: symbol.toLowerCase(),
        assetClass: 'crypto' as const,
        price: entry.usd,
        currency: 'USD',
        changePercent24h: entry.usd_24h_change,
        volume24h: entry.usd_24h_vol,
        marketCap: entry.usd_market_cap,
        asOf: entry.last_updated_at
          ? new Date(entry.last_updated_at * 1000).toISOString()
          : new Date().toISOString(),
        source: 'coingecko',
      }
    })
  }

  async getHistory(req: HistoryRequest): Promise<HistorySeries> {
    const interval = req.interval ?? '1d'
    if (interval === '1wk') {
      throw new ConnectorError('UNSUPPORTED', 'CoinGecko OHLC supports 1h and 1d intervals only')
    }
    const limit = req.limit ?? 30
    // CoinGecko /ohlc accepts fixed day windows; candles are ~4h for <=30d
    // requests and daily above. Pick the smallest window covering `limit`.
    const days = interval === '1h' ? 1 : [30, 90, 180, 365].find((d) => d >= limit) ?? 365
    const id = await this.resolveId(req.symbol)
    const raw = await this.fetchJson<Array<[number, number, number, number, number]>>(
      `${this.baseUrl}/coins/${id}/ohlc?vs_currency=usd&days=${days}`,
    )
    const candles = raw.slice(-limit).map(([time, open, high, low, close]) => ({
      time: new Date(time).toISOString(),
      open,
      high,
      low,
      close,
    }))
    return {
      symbol: req.symbol.toLowerCase(),
      assetClass: 'crypto',
      interval,
      currency: 'USD',
      candles,
      source: 'coingecko',
    }
  }

  private async resolveId(symbol: string): Promise<string> {
    const normalized = symbol.toLowerCase()
    const known = SYMBOL_TO_ID[normalized]
    if (known) return known
    return this.idCache.getOrLoad(normalized, async () => {
      const data = await this.fetchJson<SearchResponse>(
        `${this.baseUrl}/search?query=${encodeURIComponent(normalized)}`,
      )
      const exact = data.coins?.find((coin) => coin.symbol.toLowerCase() === normalized)
      const match = exact ?? data.coins?.[0]
      if (!match) {
        throw new ConnectorError('NOT_FOUND', `Unknown crypto symbol "${symbol}"`)
      }
      return match.id
    })
  }
}
