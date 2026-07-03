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

export const FOREX_CONNECTOR_SKU = 'caep.connector.forex'

const DEFAULT_BASE_URL = 'https://api.frankfurter.dev/v1'

interface LatestResponse {
  base: string
  date: string
  rates: Record<string, number>
}

interface SeriesResponse {
  base: string
  rates: Record<string, Record<string, number>>
}

/** Accepts "EUR/USD", "EUR-USD", or "EURUSD". */
function parsePair(symbol: string): { base: string; quote: string } {
  const cleaned = symbol.toUpperCase().replace(/[\s/-]/g, '')
  if (!/^[A-Z]{6}$/.test(cleaned)) {
    throw new ConnectorError(
      'BAD_REQUEST',
      `Invalid forex pair "${symbol}" — expected e.g. "EUR/USD"`,
    )
  }
  return { base: cleaned.slice(0, 3), quote: cleaned.slice(3) }
}

export class ForexConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: 'caep-forex',
    name: 'CAEP Forex Connector',
    description: 'Daily ECB reference FX rates and history from Frankfurter',
    assetClass: 'forex',
    version: '0.1.0',
    provider: 'frankfurter',
    sku: FOREX_CONNECTOR_SKU,
    capabilities: ['quote', 'history', 'search'],
    requiresApiKey: false,
  }

  private readonly baseUrl: string
  private readonly currencyCache = new TtlCache<Record<string, string>>(24 * 60 * 60 * 1000)

  constructor(config: ConnectorConfig = {}) {
    super(config)
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
  }

  protected async probe(): Promise<void> {
    await this.currencies()
  }

  private currencies(): Promise<Record<string, string>> {
    return this.currencyCache.getOrLoad('all', () =>
      this.fetchJson<Record<string, string>>(`${this.baseUrl}/currencies`),
    )
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const currencies = await this.currencies()
    const q = query.trim().toLowerCase()
    return Object.entries(currencies)
      .filter(([code, name]) => code.toLowerCase().includes(q) || name.toLowerCase().includes(q))
      .slice(0, limit)
      .map(([code, name]) => ({
        symbol: code === 'USD' ? 'USD/EUR' : `${code}/USD`,
        assetClass: 'forex' as const,
        name: `${name} (${code})`,
        currency: code === 'USD' ? 'EUR' : 'USD',
      }))
  }

  async getQuote(symbol: string): Promise<Quote> {
    const { base, quote } = parsePair(symbol)
    const data = await this.fetchJson<LatestResponse>(
      `${this.baseUrl}/latest?base=${base}&symbols=${quote}`,
    )
    const rate = data.rates[quote]
    if (rate === undefined) {
      throw new ConnectorError('NOT_FOUND', `No rate available for pair "${symbol}"`)
    }
    return {
      symbol: `${base}/${quote}`,
      assetClass: 'forex',
      name: `${base}/${quote} reference rate`,
      price: rate,
      currency: quote,
      asOf: new Date(`${data.date}T16:00:00Z`).toISOString(), // ECB fixing ~16:00 CET
      source: 'frankfurter',
    }
  }

  async getHistory(req: HistoryRequest): Promise<HistorySeries> {
    const interval = req.interval ?? '1d'
    if (interval !== '1d') {
      throw new ConnectorError('UNSUPPORTED', 'Frankfurter provides daily reference rates only')
    }
    const { base, quote } = parsePair(req.symbol)
    const limit = req.limit ?? 30
    const end = req.end ? new Date(req.end) : new Date()
    const start = req.start
      ? new Date(req.start)
      : new Date(end.getTime() - limit * 1.6 * 24 * 60 * 60 * 1000) // pad for weekends/holidays
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const data = await this.fetchJson<SeriesResponse>(
      `${this.baseUrl}/${fmt(start)}..${fmt(end)}?base=${base}&symbols=${quote}`,
    )
    const candles = Object.entries(data.rates)
      .map(([date, rates]) => ({ date, rate: rates[quote] }))
      .filter((entry): entry is { date: string; rate: number } => entry.rate !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-limit)
      // Daily fixings have one observation per day, so OHLC collapse to it.
      .map(({ date, rate }) => ({
        time: new Date(`${date}T16:00:00Z`).toISOString(),
        open: rate,
        high: rate,
        low: rate,
        close: rate,
      }))
    return {
      symbol: `${base}/${quote}`,
      assetClass: 'forex',
      interval,
      currency: quote,
      candles,
      source: 'frankfurter',
    }
  }
}
