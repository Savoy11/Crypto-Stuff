import { ConnectorError } from './errors.js'
import type {
  AssetClass,
  ConnectorHealth,
  HistoryRequest,
  HistorySeries,
  Quote,
  SearchResult,
} from './types.js'

export type Capability = 'quote' | 'history' | 'search'

/**
 * Static, serializable description of a connector. This doubles as the
 * product catalog entry: `sku` is the unit of sale, so each connector can be
 * licensed individually or unlocked together via the bundle SKU.
 */
export interface ConnectorMetadata {
  /** Stable machine id, e.g. "caep-crypto". */
  id: string
  name: string
  description: string
  assetClass: AssetClass
  version: string
  /** Upstream data provider, e.g. "coingecko", "fmp", "frankfurter". */
  provider: string
  /** License SKU used by the entitlement layer, e.g. "caep.connector.crypto". */
  sku: string
  capabilities: Capability[]
  requiresApiKey: boolean
}

export interface ConnectorConfig {
  /** Provider API key, for connectors with `requiresApiKey`. */
  apiKey?: string
  /** Override the provider base URL (testing, proxies, self-hosted mirrors). */
  baseUrl?: string
  /** Per-request timeout. Defaults to 10s. */
  timeoutMs?: number
  /**
   * Serve deterministic sample data instead of calling the provider.
   * Lets key-gated connectors be demoed and integration-tested offline.
   */
  demoMode?: boolean
}

/**
 * The contract every asset-class connector implements. Consumers depend on
 * this interface (from @caep/connector-core) — never on a concrete package —
 * so connectors stay independently installable and sellable.
 */
export interface AssetClassConnector {
  readonly metadata: ConnectorMetadata
  healthCheck(): Promise<ConnectorHealth>
  search(query: string, limit?: number): Promise<SearchResult[]>
  getQuote(symbol: string): Promise<Quote>
  getQuotes(symbols: string[]): Promise<Quote[]>
  getHistory(req: HistoryRequest): Promise<HistorySeries>
}

/** Shared plumbing: timeouts, upstream error mapping, health checks. */
export abstract class BaseConnector implements AssetClassConnector {
  abstract readonly metadata: ConnectorMetadata
  protected readonly timeoutMs: number

  constructor(protected readonly config: ConnectorConfig = {}) {
    this.timeoutMs = config.timeoutMs ?? 10_000
  }

  abstract search(query: string, limit?: number): Promise<SearchResult[]>
  abstract getQuote(symbol: string): Promise<Quote>
  abstract getHistory(req: HistoryRequest): Promise<HistorySeries>

  /**
   * Cheap request the connector can make to prove the provider is reachable.
   * Used by `healthCheck()`.
   */
  protected abstract probe(): Promise<void>

  /** Default: sequential single quotes. Override where a batch endpoint exists. */
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const quotes: Quote[] = []
    for (const symbol of symbols) {
      quotes.push(await this.getQuote(symbol))
    }
    return quotes
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const startedAt = Date.now()
    try {
      await this.probe()
      return {
        ok: true,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      }
    } catch (err) {
      return {
        ok: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }

  protected async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (err) {
      throw new ConnectorError(
        'UPSTREAM_ERROR',
        `${this.metadata.provider} request failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    if (res.status === 429) {
      throw new ConnectorError(
        'RATE_LIMITED',
        `${this.metadata.provider} rate limit hit — retry later or upgrade the provider plan`,
      )
    }
    if (!res.ok) {
      throw new ConnectorError(
        'UPSTREAM_ERROR',
        `${this.metadata.provider} responded ${res.status} ${res.statusText}`,
        { status: res.status },
      )
    }
    return (await res.json()) as T
  }
}
