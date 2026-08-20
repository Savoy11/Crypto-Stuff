import { NextResponse } from 'next/server'
import { FN_TRACKED_IDS, UTILITY_MAP, CATEGORY_INFO } from '@/lib/data/coinCatalog'
import { fetchCoinGeckoPages } from '@/lib/server/coingeckoPages'

export const dynamic = 'force-dynamic'

// W3-1 (2026-08-20): the composite score is GONE, not renamed. Item 5b had
// renamed the verdicts ('Strong Add' …) to score bands; the owner's review
// then cut the score itself — "remove any reference to a score because it may
// imply a recommendation. Replace with price, growth, or liquidity." What
// remains is exactly what the feed reports: price, growth, volume, liquidity
// ratio, market cap, plus the factual category/utility annotation. Sorting is
// the reader's choice over facts; default order is market cap, the feed's own.
export interface CandidateCoin {
  cgId: string
  symbol: string
  name: string
  image: string
  price: number
  marketCap: number
  marketCapRank: number
  volume24h: number
  priceChange24h: number
  priceChange7d: number | null
  athChangePercent: number    // negative = below ATH
  category: string
  categoryLabel: string
  categoryColor: string
  utilityNote: string
  /**
   * 24h volume ÷ market cap — the liquidity measure the owner asked to search
   * by (W3-1). A FACT from the feed, not a judgment: 0.15 means 15% of the cap
   * turned over in a day.
   */
  liquidityRatio: number
}

export interface CoinDiscoveryResponse {
  ok: boolean
  candidates: CandidateCoin[]
  alreadyTracked: number
  updatedAt: string
  source: { name: string; limit: number; url: string }
  error?: string
}

/** Category/utility annotation — factual metadata, no scoring (W3-1). */
function classifyUtility(cgId: string): { category: string; note: string } {
  const mapped = UTILITY_MAP[cgId]
  if (mapped) return { category: mapped.category, note: mapped.note }
  const id = cgId.toLowerCase()
  if (id.includes('usd') || id.includes('stable') || id.includes('dai'))
    return { category: 'stablecoin', note: 'Stablecoin (heuristic)' }
  if (id.includes('swap') || id.includes('dex') || id.includes('defi'))
    return { category: 'defi', note: 'DeFi protocol (heuristic)' }
  return { category: 'unknown', note: '' }
}

// ─── Route handler ────────────────────────────────────────────────────────────

type RawCoin = {
  id: string; symbol: string; name: string; image: string
  current_price: number; market_cap: number; market_cap_rank: number
  total_volume: number; price_change_percentage_24h: number
  price_change_percentage_7d_in_currency: number | null
  ath_change_percentage: number
}

export async function GET(req: Request) {
  const url   = new URL(req.url)
  const limit = Math.min(750, Math.max(50, parseInt(url.searchParams.get('limit') ?? '250', 10)))
  const pages = Math.ceil(limit / 250)

  // Sequential, throttle-aware paging. Issuing these pages in parallel 429'd
  // every one of them on CoinGecko's free tier, turning a partial result into a
  // total 503 (verified 2026-07-22). See lib/server/coingeckoPages.
  const { pages: pageRows, errors: upstreamErrors } = await fetchCoinGeckoPages<RawCoin>(
    pages,
    (page) =>
      'https://api.coingecko.com/api/v3/coins/markets' +
      `?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}` +
      '&sparkline=false&price_change_percentage=7d',
    { revalidate: 900 },
  )
  const rawCoins: RawCoin[] = pageRows.flat().slice(0, limit)

  // Upstream failed entirely — say so instead of returning an empty-but-ok payload
  if (rawCoins.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        candidates: [],
        alreadyTracked: 0,
        updatedAt: new Date().toISOString(),
        source: { name: 'CoinGecko', limit, url: 'https://api.coingecko.com/api/v3/coins/markets' },
        error: `CoinGecko markets unavailable (${upstreamErrors.join('; ') || 'empty response'})`,
      } satisfies CoinDiscoveryResponse,
      { status: 503 }
    )
  }

  const alreadyTracked = rawCoins.filter(c => FN_TRACKED_IDS.has(c.id)).length

  const candidates: CandidateCoin[] = rawCoins
    .filter(c => !FN_TRACKED_IDS.has(c.id) && c.market_cap > 0)
    .map(c => {
      const util = classifyUtility(c.id)
      const catInfo = CATEGORY_INFO[util.category] ?? CATEGORY_INFO.unknown
      return {
        cgId:           c.id,
        symbol:         c.symbol.toUpperCase(),
        name:           c.name,
        image:          c.image,
        price:          c.current_price,
        marketCap:      c.market_cap,
        marketCapRank:  c.market_cap_rank,
        volume24h:      c.total_volume,
        priceChange24h: parseFloat((c.price_change_percentage_24h ?? 0).toFixed(2)),
        priceChange7d:  c.price_change_percentage_7d_in_currency != null
                          ? parseFloat(c.price_change_percentage_7d_in_currency.toFixed(2))
                          : null,
        athChangePercent: parseFloat((c.ath_change_percentage ?? -50).toFixed(1)),
        category:        util.category,
        categoryLabel:   catInfo.label,
        categoryColor:   catInfo.color,
        utilityNote:     util.note,
        liquidityRatio:  parseFloat((c.total_volume / Math.max(c.market_cap, 1)).toFixed(4)),
      }
    })
    // Market-cap order — the feed's own, and a fact rather than our opinion.
    .sort((a, b) => b.marketCap - a.marketCap)

  return NextResponse.json({
    ok: true,
    candidates,
    alreadyTracked,
    updatedAt: new Date().toISOString(),
    source: {
      name: 'CoinGecko',
      limit,
      url: 'https://api.coingecko.com/api/v3/coins/markets',
    },
  } satisfies CoinDiscoveryResponse)
}
