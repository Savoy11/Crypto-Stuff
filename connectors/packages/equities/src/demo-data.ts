/**
 * Deterministic sample data for demo mode — lets the connector be evaluated,
 * demoed, and integration-tested without an FMP API key. Values are frozen
 * snapshots, not live prices; every demo response is tagged source: "demo".
 */

export interface DemoEquity {
  symbol: string
  name: string
  exchange: string
  price: number
  changePercent24h: number
  marketCap: number
}

export const DEMO_EQUITIES: DemoEquity[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', price: 227.52, changePercent24h: 0.84, marketCap: 3_450_000_000_000 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', price: 465.1, changePercent24h: 0.42, marketCap: 3_460_000_000_000 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', price: 157.75, changePercent24h: 1.63, marketCap: 3_850_000_000_000 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', price: 178.64, changePercent24h: -0.21, marketCap: 2_180_000_000_000 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', price: 223.3, changePercent24h: 0.57, marketCap: 2_370_000_000_000 },
  { symbol: 'COIN', name: 'Coinbase Global Inc.', exchange: 'NASDAQ', price: 355.2, changePercent24h: 2.94, marketCap: 90_500_000_000 },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', exchange: 'NYSE ARCA', price: 617.85, changePercent24h: 0.47, marketCap: 0 },
]

/** Deterministic pseudo-random walk so demo history charts look plausible. */
export function demoCandles(seedPrice: number, days: number): Array<{
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}> {
  const candles = []
  let price = seedPrice * 0.92
  for (let i = days - 1; i >= 0; i--) {
    // Simple LCG keyed on the day index keeps output stable across runs.
    const noise = ((i * 9301 + 49297) % 233280) / 233280 - 0.5
    const open = price
    const close = price * (1 + noise * 0.04)
    const date = new Date()
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCDate(date.getUTCDate() - i)
    candles.push({
      time: date.toISOString(),
      open: round2(open),
      high: round2(Math.max(open, close) * 1.01),
      low: round2(Math.min(open, close) * 0.99),
      close: round2(close),
      volume: Math.round(20_000_000 * (1 + noise)),
    })
    price = close
  }
  return candles
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
