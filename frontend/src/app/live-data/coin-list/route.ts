import { NextResponse } from 'next/server'
import type { CoinListEntry, CoinListResponse } from '@/lib/types/coinList'
import { fetchCoinGeckoPages } from '@/lib/server/coingeckoPages'

export type { CoinListEntry, CoinListResponse }

export const dynamic = 'force-dynamic'

// Broad coin list: 3 pages × 250 = 750 coins from CoinGecko.
//
// Fetched SEQUENTIALLY — these three pages used to be issued in parallel, which
// tripped the free tier's burst limit and 429'd all three, so the route
// answered 503 even though any one page would have succeeded on its own
// (verified 2026-07-22). See lib/server/coingeckoPages.
interface CoinGeckoMarketRow {
  id: string; symbol: string; name: string
  current_price: number; market_cap: number; market_cap_rank: number; image: string
}

const marketsUrl = (page: number) =>
  'https://api.coingecko.com/api/v3/coins/markets' +
  `?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}` +
  '&sparkline=false&locale=en'

function toEntry(c: CoinGeckoMarketRow): CoinListEntry {
  return {
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    price: c.current_price ?? 0,
    marketCap: c.market_cap ?? 0,
    rank: c.market_cap_rank ?? 9999,
    image: c.image ?? '',
  }
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
    const { pages, errors } = await fetchCoinGeckoPages<CoinGeckoMarketRow>(3, marketsUrl)

    const coins: CoinListEntry[] = []
    const seen = new Set<string>()
    for (const rows of pages) {
      for (const row of rows) {
        const coin = toEntry(row)
        if (seen.has(coin.id)) continue
        seen.add(coin.id)
        coins.push(coin)
      }
    }

    if (coins.length === 0) {
      return NextResponse.json(
        {
          ok: false, coins: [], updatedAt: new Date().toISOString(), source: 'none',
          error: errors.join('; ') || 'CoinGecko returned no coins',
        },
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
      ...(errors.length > 0 ? { partial: true, error: errors.join('; ') } : {}),
    } satisfies CoinListResponse)
  } catch (err) {
    return NextResponse.json(
      { ok: false, coins: [], updatedAt: new Date().toISOString(), source: 'error', error: String(err) },
      { status: 500 }
    )
  }
}
