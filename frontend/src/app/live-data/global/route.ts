import { NextResponse } from 'next/server'

// Global crypto market aggregates — CoinGecko /global (keyless; the host
// already carries a terms verdict in lib/server/sourceTerms.ts, this is a new
// path on it, not a new source). Feeds the Cycle Context tab's dominance card.

export const dynamic = 'force-dynamic'

export interface GlobalMarketData {
  ok: boolean
  btcDominancePct: number | null
  ethDominancePct: number | null
  totalMarketCapUsd: number | null
  totalVolume24hUsd: number | null
  /** 24h change of total market cap, percent. */
  marketCapChange24hPct: number | null
  updatedAt: string
  error?: string
}

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global', {
      headers: { Accept: 'application/json' },
      next: { revalidate: 600 },
    })
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
    const j = await res.json() as {
      data?: {
        market_cap_percentage?: Record<string, number>
        total_market_cap?: Record<string, number>
        total_volume?: Record<string, number>
        market_cap_change_percentage_24h_usd?: number
      }
    }
    const d = j.data
    // Nullable field by field: a partially-shaped upstream answer serves what
    // it carries rather than failing the card wholesale.
    return NextResponse.json({
      ok: true,
      btcDominancePct: d?.market_cap_percentage?.btc ?? null,
      ethDominancePct: d?.market_cap_percentage?.eth ?? null,
      totalMarketCapUsd: d?.total_market_cap?.usd ?? null,
      totalVolume24hUsd: d?.total_volume?.usd ?? null,
      marketCapChange24hPct: d?.market_cap_change_percentage_24h_usd ?? null,
      updatedAt: new Date().toISOString(),
    } satisfies GlobalMarketData)
  } catch (e) {
    return NextResponse.json({
      ok: false,
      btcDominancePct: null, ethDominancePct: null, totalMarketCapUsd: null,
      totalVolume24hUsd: null, marketCapChange24hPct: null,
      updatedAt: new Date().toISOString(),
      error: e instanceof Error ? e.message : 'unreachable',
    } satisfies GlobalMarketData, { status: 503 })
  }
}
