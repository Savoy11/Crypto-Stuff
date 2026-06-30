import { LIVE_DATA_BASE } from '@/lib/constants'
import type { PriceCandle } from '@/lib/data/priceHistoryMeta'

// Thin browser-side client for the in-app live-data proxy routes. These call
// the Next.js route handlers (which in turn call CoinGecko server-side), so no
// API key or upstream URL is ever exposed to the browser.

export interface LiveQuote {
  price: number | null
  marketCap: number | null
  volume24h: number | null
  priceChange24h: number | null
  circulatingSupply: number | null
}

export interface LiveMarketsResult {
  ok: boolean
  updatedAt: string | null
  quotes: Record<string, LiveQuote>
}

function origin(): string {
  // On the server (RSC / route prefetch) relative fetch needs an absolute URL.
  if (typeof window !== 'undefined') return ''
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000'
}

export async function fetchLiveMarkets(): Promise<LiveMarketsResult> {
  try {
    const res = await fetch(`${origin()}${LIVE_DATA_BASE}/markets`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return { ok: false, updatedAt: null, quotes: {} }
    return (await res.json()) as LiveMarketsResult
  } catch {
    return { ok: false, updatedAt: null, quotes: {} }
  }
}

export async function fetchLiveChart(assetId: string, days: number): Promise<PriceCandle[] | null> {
  try {
    const res = await fetch(
      `${origin()}${LIVE_DATA_BASE}/chart?id=${encodeURIComponent(assetId)}&days=${days}`,
      { headers: { Accept: 'application/json' } }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { ok: boolean; candles: PriceCandle[] }
    if (!data.ok || !data.candles?.length) return null
    return data.candles
  } catch {
    return null
  }
}
