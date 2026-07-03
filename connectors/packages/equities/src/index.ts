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
import { DEMO_EQUITIES, demoCandles } from './demo-data.js'

export const EQUITIES_CONNECTOR_SKU = 'caep.connector.equities'

const DEFAULT_BASE_URL = 'https://financialmodelingprep.com/stable'

interface FmpQuote {
  symbol: string
  name?: string
  price?: number
  changePercentage?: number
  dayHigh?: number
  dayLow?: number
  volume?: number
  marketCap?: number
  exchange?: string
  timestamp?: number
}

interface FmpSearchHit {
  symbol: string
  name?: string
  currency?: string
  exchange?: string
}

interface FmpEodBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export class EquitiesConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: 'caep-equities',
    name: 'CAEP Equities Connector',
    description: 'Stock and ETF quotes, symbol search, and EOD history from Financial Modeling Prep',
    assetClass: 'equities',
    version: '0.1.0',
    provider: 'fmp',
    sku: EQUITIES_CONNECTOR_SKU,
    capabilities: ['quote', 'history', 'search'],
    requiresApiKey: true,
  }

  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly demoMode: boolean
  private readonly quoteCache = new TtlCache<Quote>(30_000)

  constructor(config: ConnectorConfig = {}) {
    super(config)
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    this.apiKey = config.apiKey ?? process.env.FMP_API_KEY
    this.demoMode = config.demoMode ?? false
  }

  private requireKey(): string {
    if (!this.apiKey) {
      throw new ConnectorError(
        'MISSING_API_KEY',
        'Equities connector needs an FMP API key (config.apiKey or FMP_API_KEY env var), or pass demoMode: true for sample data',
      )
    }
    return this.apiKey
  }

  protected async probe(): Promise<void> {
    if (this.demoMode) return
    await this.fetchJson(`${this.baseUrl}/quote?symbol=AAPL&apikey=${this.requireKey()}`)
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    if (this.demoMode) {
      const q = query.trim().toLowerCase()
      return DEMO_EQUITIES.filter(
        (e) => e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
      )
        .slice(0, limit)
        .map((e) => ({
          symbol: e.symbol,
          assetClass: 'equities' as const,
          name: e.name,
          exchange: e.exchange,
          currency: 'USD',
        }))
    }
    const hits = await this.fetchJson<FmpSearchHit[]>(
      `${this.baseUrl}/search-symbol?query=${encodeURIComponent(query)}&limit=${limit}&apikey=${this.requireKey()}`,
    )
    return hits.map((hit) => ({
      symbol: hit.symbol,
      assetClass: 'equities' as const,
      name: hit.name,
      exchange: hit.exchange,
      currency: hit.currency ?? 'USD',
    }))
  }

  async getQuote(symbol: string): Promise<Quote> {
    const upper = symbol.toUpperCase()
    if (this.demoMode) return this.demoQuote(upper)
    return this.quoteCache.getOrLoad(upper, async () => {
      const rows = await this.fetchJson<FmpQuote[]>(
        `${this.baseUrl}/quote?symbol=${encodeURIComponent(upper)}&apikey=${this.requireKey()}`,
      )
      const row = rows[0]
      if (!row || row.price === undefined) {
        throw new ConnectorError('NOT_FOUND', `No quote available for equity "${symbol}"`)
      }
      return {
        symbol: upper,
        assetClass: 'equities' as const,
        name: row.name,
        price: row.price,
        currency: 'USD',
        changePercent24h: row.changePercentage,
        high24h: row.dayHigh,
        low24h: row.dayLow,
        volume24h: row.volume,
        marketCap: row.marketCap,
        asOf: row.timestamp ? new Date(row.timestamp * 1000).toISOString() : new Date().toISOString(),
        source: 'fmp',
      }
    })
  }

  async getHistory(req: HistoryRequest): Promise<HistorySeries> {
    const interval = req.interval ?? '1d'
    if (interval !== '1d') {
      throw new ConnectorError('UNSUPPORTED', 'Equities connector currently supports 1d bars only')
    }
    const upper = req.symbol.toUpperCase()
    const limit = req.limit ?? 30

    if (this.demoMode) {
      const demo = this.findDemo(upper)
      return {
        symbol: upper,
        assetClass: 'equities',
        interval,
        currency: 'USD',
        candles: demoCandles(demo.price, limit),
        source: 'demo',
      }
    }

    let url = `${this.baseUrl}/historical-price-eod/full?symbol=${encodeURIComponent(upper)}&apikey=${this.requireKey()}`
    if (req.start) url += `&from=${req.start.slice(0, 10)}`
    if (req.end) url += `&to=${req.end.slice(0, 10)}`
    const bars = await this.fetchJson<FmpEodBar[]>(url)
    const candles = bars
      .slice() // FMP returns newest-first
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-limit)
      .map((bar) => ({
        time: new Date(`${bar.date}T00:00:00Z`).toISOString(),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }))
    return {
      symbol: upper,
      assetClass: 'equities',
      interval,
      currency: 'USD',
      candles,
      source: 'fmp',
    }
  }

  private findDemo(symbol: string) {
    const demo = DEMO_EQUITIES.find((e) => e.symbol === symbol)
    if (!demo) {
      throw new ConnectorError(
        'NOT_FOUND',
        `"${symbol}" is not in the demo dataset (available: ${DEMO_EQUITIES.map((e) => e.symbol).join(', ')})`,
      )
    }
    return demo
  }

  private demoQuote(symbol: string): Quote {
    const demo = this.findDemo(symbol)
    return {
      symbol: demo.symbol,
      assetClass: 'equities',
      name: demo.name,
      price: demo.price,
      currency: 'USD',
      changePercent24h: demo.changePercent24h,
      marketCap: demo.marketCap || undefined,
      asOf: new Date().toISOString(),
      source: 'demo',
    }
  }
}
