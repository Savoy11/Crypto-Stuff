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

export const COMMODITIES_CONNECTOR_SKU = 'caep.connector.commodities'

const DEFAULT_BASE_URL = 'https://financialmodelingprep.com/stable'

/**
 * Curated catalog of the commodity futures symbols FMP quotes. Also powers
 * search and friendly-name lookups ("gold" → GCUSD). Demo prices are frozen
 * snapshots used only in demo mode (source: "demo").
 */
export const COMMODITY_CATALOG = [
  { symbol: 'GCUSD', name: 'Gold', group: 'metals', unit: 'troy oz', demoPrice: 3335.4 },
  { symbol: 'SIUSD', name: 'Silver', group: 'metals', unit: 'troy oz', demoPrice: 36.8 },
  { symbol: 'HGUSD', name: 'Copper', group: 'metals', unit: 'lb', demoPrice: 5.12 },
  { symbol: 'PLUSD', name: 'Platinum', group: 'metals', unit: 'troy oz', demoPrice: 1395.0 },
  { symbol: 'CLUSD', name: 'WTI Crude Oil', group: 'energy', unit: 'barrel', demoPrice: 65.45 },
  { symbol: 'BZUSD', name: 'Brent Crude Oil', group: 'energy', unit: 'barrel', demoPrice: 68.3 },
  { symbol: 'NGUSD', name: 'Natural Gas', group: 'energy', unit: 'MMBtu', demoPrice: 3.41 },
  { symbol: 'ZWUSX', name: 'Wheat', group: 'agriculture', unit: 'bushel', demoPrice: 556.5 },
  { symbol: 'ZCUSX', name: 'Corn', group: 'agriculture', unit: 'bushel', demoPrice: 420.75 },
  { symbol: 'KCUSX', name: 'Coffee', group: 'agriculture', unit: 'lb', demoPrice: 289.9 },
] as const

interface FmpQuote {
  symbol: string
  name?: string
  price?: number
  changePercentage?: number
  dayHigh?: number
  dayLow?: number
  volume?: number
  timestamp?: number
}

interface FmpEodBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export class CommoditiesConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: 'caep-commodities',
    name: 'CAEP Commodities Connector',
    description: 'Metals, energy, and agriculture quotes with EOD history from Financial Modeling Prep',
    assetClass: 'commodities',
    version: '0.1.0',
    provider: 'fmp',
    sku: COMMODITIES_CONNECTOR_SKU,
    capabilities: ['quote', 'history', 'search'],
    requiresApiKey: true,
  }

  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly demoMode: boolean
  private readonly quoteCache = new TtlCache<Quote>(60_000)

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
        'Commodities connector needs an FMP API key (config.apiKey or FMP_API_KEY env var), or pass demoMode: true for sample data',
      )
    }
    return this.apiKey
  }

  protected async probe(): Promise<void> {
    if (this.demoMode) return
    await this.fetchJson(`${this.baseUrl}/quote?symbol=GCUSD&apikey=${this.requireKey()}`)
  }

  /** Resolve "gold" / "GCUSD" / "wti" to a catalog entry. */
  private resolve(symbolOrName: string) {
    const q = symbolOrName.trim().toLowerCase()
    const entry = COMMODITY_CATALOG.find(
      (c) => c.symbol.toLowerCase() === q || c.name.toLowerCase().includes(q),
    )
    if (!entry) {
      throw new ConnectorError(
        'NOT_FOUND',
        `Unknown commodity "${symbolOrName}" (supported: ${COMMODITY_CATALOG.map((c) => c.symbol).join(', ')})`,
      )
    }
    return entry
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const q = query.trim().toLowerCase()
    return COMMODITY_CATALOG.filter(
      (c) =>
        c.symbol.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.group.includes(q),
    )
      .slice(0, limit)
      .map((c) => ({
        symbol: c.symbol,
        assetClass: 'commodities' as const,
        name: `${c.name} (${c.unit})`,
        currency: 'USD',
      }))
  }

  async getQuote(symbol: string): Promise<Quote> {
    const entry = this.resolve(symbol)
    if (this.demoMode) {
      return {
        symbol: entry.symbol,
        assetClass: 'commodities',
        name: entry.name,
        price: entry.demoPrice,
        currency: 'USD',
        asOf: new Date().toISOString(),
        source: 'demo',
      }
    }
    return this.quoteCache.getOrLoad(entry.symbol, async () => {
      const rows = await this.fetchJson<FmpQuote[]>(
        `${this.baseUrl}/quote?symbol=${entry.symbol}&apikey=${this.requireKey()}`,
      )
      const row = rows[0]
      if (!row || row.price === undefined) {
        throw new ConnectorError('NOT_FOUND', `No quote available for commodity "${symbol}"`)
      }
      return {
        symbol: entry.symbol,
        assetClass: 'commodities' as const,
        name: entry.name,
        price: row.price,
        currency: 'USD',
        changePercent24h: row.changePercentage,
        high24h: row.dayHigh,
        low24h: row.dayLow,
        volume24h: row.volume,
        asOf: row.timestamp ? new Date(row.timestamp * 1000).toISOString() : new Date().toISOString(),
        source: 'fmp',
      }
    })
  }

  async getHistory(req: HistoryRequest): Promise<HistorySeries> {
    const interval = req.interval ?? '1d'
    if (interval !== '1d') {
      throw new ConnectorError('UNSUPPORTED', 'Commodities connector currently supports 1d bars only')
    }
    const entry = this.resolve(req.symbol)
    const limit = req.limit ?? 30

    if (this.demoMode) {
      // Flat synthetic series anchored at the demo price — enough for
      // integration tests without implying real market movement.
      const candles = Array.from({ length: limit }, (_, i) => {
        const date = new Date()
        date.setUTCHours(0, 0, 0, 0)
        date.setUTCDate(date.getUTCDate() - (limit - 1 - i))
        return {
          time: date.toISOString(),
          open: entry.demoPrice,
          high: entry.demoPrice,
          low: entry.demoPrice,
          close: entry.demoPrice,
        }
      })
      return {
        symbol: entry.symbol,
        assetClass: 'commodities',
        interval,
        currency: 'USD',
        candles,
        source: 'demo',
      }
    }

    let url = `${this.baseUrl}/historical-price-eod/full?symbol=${entry.symbol}&apikey=${this.requireKey()}`
    if (req.start) url += `&from=${req.start.slice(0, 10)}`
    if (req.end) url += `&to=${req.end.slice(0, 10)}`
    const bars = await this.fetchJson<FmpEodBar[]>(url)
    const candles = bars
      .slice()
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
      symbol: entry.symbol,
      assetClass: 'commodities',
      interval,
      currency: 'USD',
      candles,
      source: 'fmp',
    }
  }
}
