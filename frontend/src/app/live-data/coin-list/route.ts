import { NextResponse } from 'next/server'
import type { CoinListEntry, CoinListResponse } from '@/lib/types/coinList'

export type { CoinListEntry, CoinListResponse }

export const dynamic = 'force-dynamic'

// Fetch multiple pages from CoinGecko to get a broad coin list.
// Free tier allows ~30 req/min; we batch 3 pages × 250 = 750 coins.
async function fetchCoinGeckoPage(page: number): Promise<CoinListEntry[]> {
  const url =
    'https://api.coingecko.com/api/v3/coins/markets' +
    `?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}` +
    '&sparkline=false&locale=en'
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`CoinGecko page ${page} failed: ${res.status}`)
  const data = await res.json() as Array<{
    id: string; symbol: string; name: string
    current_price: number; market_cap: number; market_cap_rank: number; image: string
  }>
  return data.map(c => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    price: c.current_price ?? 0,
    marketCap: c.market_cap ?? 0,
    rank: c.market_cap_rank ?? 9999,
    image: c.image ?? '',
  }))
}

// Binance.US public exchange info as a fallback/supplement symbol list
async function fetchBinanceSymbols(): Promise<string[]> {
  try {
    const res = await fetch('https://api.binance.us/api/v3/exchangeInfo', {
      headers: { Accept: 'application/json' },
      next: { revalidate: 600 },
    })
    if (!res.ok) return []
    const data = await res.json() as { symbols: Array<{ baseAsset: string }> }
    return [...new Set(data.symbols.map(s => s.baseAsset.toUpperCase()))]
  } catch {
    return []
  }
}

export async function GET() {
  try {
    // Fetch top 750 coins from CoinGecko (3 pages × 250)
    const [page1, page2, page3] = await Promise.allSettled([
      fetchCoinGeckoPage(1),
      fetchCoinGeckoPage(2),
      fetchCoinGeckoPage(3),
    ])

    const coins: CoinListEntry[] = []
    const seen = new Set<string>()

    for (const result of [page1, page2, page3]) {
      if (result.status === 'fulfilled') {
        for (const coin of result.value) {
          if (!seen.has(coin.id)) {
            seen.add(coin.id)
            coins.push(coin)
          }
        }
      }
    }

    if (coins.length === 0) {
      return NextResponse.json(
        { ok: false, coins: [], updatedAt: new Date().toISOString(), source: 'none' },
        { status: 503 }
      )
    }

    // Try to supplement with Binance symbols — mark coins listed on Binance
    const binanceSymbols = await fetchBinanceSymbols()
    const binanceSet = new Set(binanceSymbols)

    // Sort: Binance-listed first (within same rank band), then by market cap rank
    const sorted = [...coins].sort((a, b) => {
      const aOnBinance = binanceSet.has(a.symbol) ? 0 : 1
      const bOnBinance = binanceSet.has(b.symbol) ? 0 : 1
      if (aOnBinance !== bOnBinance) return aOnBinance - bOnBinance
      return a.rank - b.rank
    })

    return NextResponse.json({
      ok: true,
      coins: sorted,
      updatedAt: new Date().toISOString(),
      source: 'coingecko',
    } satisfies CoinListResponse)
  } catch (err) {
    return NextResponse.json(
      { ok: false, coins: [], updatedAt: new Date().toISOString(), source: 'error', error: String(err) },
      { status: 500 }
    )
  }
}
