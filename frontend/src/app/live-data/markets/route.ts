import { NextRequest, NextResponse } from 'next/server'
import { ALL_COINGECKO_IDS, ASSET_ID_BY_COINGECKO } from '@/lib/api/live/coingeckoIds'

// Server-side proxy for market data.
// Supports multiple sources via ?source= query param:
//   "coingecko" (default) — CoinGecko free/paid tier
//   "binance"             — Binance public API (no key, higher rate limits)
//
// Response shape:
//   { ok, updatedAt, quotes: Record<assetId, LiveQuote>, source }
// where LiveQuote = { price, marketCap, volume24h, priceChange24h, circulatingSupply }

export const dynamic = 'force-dynamic'

const CG_BASE = process.env.COINGECKO_BASE_URL?.replace(/\/$/, '') || 'https://api.coingecko.com/api/v3'
const CG_KEY = process.env.COINGECKO_API_KEY && process.env.COINGECKO_API_KEY !== 'your-coingecko-api-key'
  ? process.env.COINGECKO_API_KEY : undefined

// Binance symbol → internal asset id
const BINANCE_SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: 'btc', ETHUSDT: 'eth', SOLUSDT: 'sol', BNBUSDT: 'bnb',
  XRPUSDT: 'xrp', ADAUSDT: 'ada', DOGEUSDT: 'doge', AVAXUSDT: 'avax',
  DOTUSDT: 'dot', POLUSDT: 'pol', LTCUSDT: 'ltc', LINKUSDT: 'link',
  UNIUSDT: 'uni', AAVEUSDT: 'aave', ATOMUSDT: 'atom', NEARUSDT: 'near',
}

async function fetchCoinGecko(): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    vs_currency: 'usd', ids: ALL_COINGECKO_IDS.join(','),
    order: 'market_cap_desc', per_page: '250', page: '1',
    sparkline: 'false', price_change_percentage: '24h',
  })
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (CG_KEY) headers['x-cg-demo-api-key'] = CG_KEY

  const res = await fetch(`${CG_BASE}/coins/markets?${params}`, { headers, next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)

  const rows = await res.json() as Array<{
    id: string; current_price: number | null; market_cap: number | null
    total_volume: number | null; price_change_percentage_24h: number | null; circulating_supply: number | null
  }>
  const quotes: Record<string, unknown> = {}
  for (const row of rows) {
    const assetId = ASSET_ID_BY_COINGECKO[row.id]
    if (!assetId) continue
    quotes[assetId] = {
      price: row.current_price ?? null, marketCap: row.market_cap ?? null,
      volume24h: row.total_volume ?? null, priceChange24h: row.price_change_percentage_24h ?? null,
      circulatingSupply: row.circulating_supply ?? null,
    }
  }
  return quotes
}

async function fetchBinance(): Promise<Record<string, unknown>> {
  const symbols = Object.keys(BINANCE_SYMBOL_MAP)
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`,
    { next: { revalidate: 30 } }
  )
  if (!res.ok) throw new Error(`Binance ${res.status}`)

  const rows = await res.json() as Array<{
    symbol: string; lastPrice: string; quoteVolume: string
    priceChangePercent: string; weightedAvgPrice: string
  }>
  const quotes: Record<string, unknown> = {}
  for (const row of rows) {
    const assetId = BINANCE_SYMBOL_MAP[row.symbol]
    if (!assetId) continue
    quotes[assetId] = {
      price: parseFloat(row.lastPrice),
      marketCap: null, // Binance doesn't provide market cap
      volume24h: parseFloat(row.quoteVolume),
      priceChange24h: parseFloat(row.priceChangePercent),
      circulatingSupply: null,
    }
  }
  return quotes
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source') ?? 'coingecko'

  try {
    let quotes: Record<string, unknown>
    let resolvedSource = source

    if (source === 'binance') {
      try {
        quotes = await fetchBinance()
      } catch {
        // Fall back to CoinGecko if Binance fails
        quotes = await fetchCoinGecko()
        resolvedSource = 'coingecko-fallback'
      }
    } else {
      try {
        quotes = await fetchCoinGecko()
      } catch {
        // Fall back to Binance if CoinGecko fails
        quotes = await fetchBinance()
        resolvedSource = 'binance-fallback'
      }
    }

    return NextResponse.json({ ok: true, updatedAt: new Date().toISOString(), quotes, source: resolvedSource })
  } catch {
    return NextResponse.json({ ok: false, updatedAt: null, quotes: {}, source, error: 'fetch_failed' })
  }
}
