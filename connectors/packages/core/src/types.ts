/**
 * Normalized data model shared by every asset-class connector.
 *
 * Consumers (the CAEP frontend, the MCP server, external apps) code against
 * these shapes once and can then swap or add connectors without changes.
 */

export type AssetClass =
  | 'crypto'
  | 'equities'
  | 'forex'
  | 'commodities'
  | 'fixed-income'
  | 'indexes'

/** A reference to a tradeable asset, normalized across providers. */
export interface AssetRef {
  /** Connector-native symbol, e.g. "btc", "AAPL", "EUR/USD", "GCUSD". */
  symbol: string
  assetClass: AssetClass
  name?: string
  exchange?: string
  /** Quote currency, ISO 4217 where applicable. Defaults to USD. */
  currency?: string
}

export interface SearchResult extends AssetRef {
  /** Optional provider relevance score, higher = better match. */
  score?: number
}

export interface Quote {
  symbol: string
  assetClass: AssetClass
  name?: string
  price: number
  currency: string
  changePercent24h?: number
  high24h?: number
  low24h?: number
  volume24h?: number
  marketCap?: number
  /** ISO 8601 timestamp of the price observation. */
  asOf: string
  /** Human-readable upstream source, e.g. "coingecko", "fmp", "demo". */
  source: string
}

export interface Candle {
  /** ISO 8601 timestamp of the period open. */
  time: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type HistoryInterval = '1h' | '1d' | '1wk'

export interface HistoryRequest {
  symbol: string
  /** Defaults to '1d'. Connectors may support a subset of intervals. */
  interval?: HistoryInterval
  /** ISO 8601 date (inclusive). */
  start?: string
  /** ISO 8601 date (inclusive). Defaults to today. */
  end?: string
  /** Max number of candles, counted back from `end`. Defaults to 30. */
  limit?: number
}

export interface HistorySeries {
  symbol: string
  assetClass: AssetClass
  interval: HistoryInterval
  currency: string
  candles: Candle[]
  source: string
}

export interface ConnectorHealth {
  ok: boolean
  checkedAt: string
  latencyMs?: number
  message?: string
}
