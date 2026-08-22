import { LIVE_DATA_BASE } from '@/lib/constants'
import type { PriceCandle } from '@/lib/data/priceHistoryMeta'
import { useTierStore } from '@/store/useTierStore'
import { resolveSource } from '@/lib/tier'

// Thin browser-side client for the in-app live-data proxy routes. These call
// the Next.js route handlers (which in turn call CoinGecko server-side), so no
// API key or upstream URL is ever exposed to the browser.

export interface LiveQuote {
  price: number | null
  marketCap: number | null
  volume24h: number | null
  priceChange24h: number | null
  circulatingSupply: number | null
  /**
   * Valuation/technical extras. CoinGecko-only — the Binance and CMC fallback
   * legs do not carry them, so they stay null there rather than being derived.
   * A screener filtering on a fabricated figure is worse than one that reports
   * the coin as untested.
   */
  fdv?: number | null
  priceChange7d?: number | null
  priceChange30d?: number | null
  /** Negative: percent below the all-time high. */
  athChangePct?: number | null
  totalSupply?: number | null
  maxSupply?: number | null
  marketCapRank?: number | null
}

export interface LiveMarketsResult {
  ok: boolean
  updatedAt: string | null
  quotes: Record<string, LiveQuote>
  /** Provider that actually served this response (e.g. "coinmarketcap", "coingecko-fallback") */
  source?: string
}

function origin(): string {
  // On the server (RSC / route prefetch) relative fetch needs an absolute URL.
  if (typeof window !== 'undefined') return ''
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000'
}

// In-flight + short-lived result sharing. The Coins page issues two queries on
// every visit — the filtered table and the unfiltered market-breadth KPIs — and
// each used to trigger its own full /markets round-trip (CR-note-1). React
// Query dedupes per queryKey, not per upstream call, so the sharing has to live
// here. 10s is well under every consumer's staleTime.
let marketsInFlight: Promise<LiveMarketsResult> | null = null
let marketsCache: { at: number; result: LiveMarketsResult } | null = null
const MARKETS_SHARE_MS = 10_000

export async function fetchLiveMarkets(): Promise<LiveMarketsResult> {
  if (marketsCache && Date.now() - marketsCache.at < MARKETS_SHARE_MS && marketsCache.result.ok) {
    return marketsCache.result
  }
  if (marketsInFlight) return marketsInFlight
  marketsInFlight = (async (): Promise<LiveMarketsResult> => {
    try {
      // Route prices through the source selected by the data tier (free / paid /
      // custom). This is what makes the TierSwitch actually change providers.
      const { mode, customSources } = useTierStore.getState()
      const src = resolveSource('prices', mode, customSources)
      const res = await fetch(`${origin()}${LIVE_DATA_BASE}/markets?source=${encodeURIComponent(src)}`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) return { ok: false, updatedAt: null, quotes: {} }
      return (await res.json()) as LiveMarketsResult
    } catch {
      return { ok: false, updatedAt: null, quotes: {} }
    } finally {
      marketsInFlight = null
    }
  })()
  const result = await marketsInFlight
  // Failures are not cached — the next call should retry, not replay the outage.
  marketsCache = result.ok ? { at: Date.now(), result } : null
  return result
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
