import { NextRequest, NextResponse } from 'next/server'
import { CORS, options } from '../../_cors'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

// Proxy to the internal news route but reshape the response for agent consumption
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const coin      = searchParams.get('coin')?.toLowerCase()
  // Clamped at BOTH ends: a negative limit made slice(0, -n) silently drop the
  // last n articles, and a non-numeric one made it NaN and returned nothing —
  // both at HTTP 200, indistinguishable from "no news".
  const rawLimit  = parseInt(searchParams.get('limit') ?? '20', 10)
  const limit     = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 50)
  const sentiment = searchParams.get('sentiment') // positive | negative | neutral
  // Watchlist bias, forwarded from the caller. OR-matched: an article is kept
  // if it mentions ANY of these. Without this an agent answering "what's in the
  // news" would return a different, unbiased feed from the one the UI shows the
  // user, which is worse than no biasing at all.
  const watchlist = searchParams.get('watchlist')

  // Build internal URL — news route handles asset filtering
  const internalUrl = new URL('/live-data/news', req.nextUrl.origin)
  if (coin) internalUrl.searchParams.set('asset', coin)
  if (watchlist) internalUrl.searchParams.set('any', watchlist)

  let articles: object[] = []
  let upstreamError: string | null = null
  try {
    const res = await fetch(internalUrl.toString(), { next: { revalidate: 300 } })
    if (!res.ok) upstreamError = `news feed upstream returned HTTP ${res.status}`
    if (res.ok) {
      const data = await res.json() as {
        ok?: boolean
        articles?: Array<{
          id: string
          headline: string
          url: string
          source: string
          publishedAt: string
          sentiment: string
          category: string
          relatedAssets: string[]
          summary?: string
        }>
      }
      // The internal route signals a total provider failure as HTTP 200 with
      // ok:false — checking only res.ok would let that through as "no news",
      // which is the exact confusion this route is trying to remove. Caught by
      // probing during a real outage, not by reading.
      if (data.ok === false) upstreamError = 'all news providers failed upstream'
      articles = (data.articles ?? [])
        .filter(a => !sentiment || a.sentiment === sentiment)
        .slice(0, limit)
        .map(a => ({
          id:            a.id,
          title:         a.headline,        // normalised to 'title' for agents
          url:           a.url,
          source:        a.source,
          publishedAt:   a.publishedAt,
          sentiment:     a.sentiment,       // 'positive' | 'negative' | 'neutral'
          category:      a.category,        // 'regulation' | 'security' | 'adoption' | 'macro' | 'protocol' | 'global' | 'general'
          relatedAssets: a.relatedAssets,   // e.g. ['btc', 'eth']
          summary:       a.summary ?? null,
        }))
    }
  } catch (e) {
    upstreamError = e instanceof Error ? e.message : 'news feed unreachable'
  }

  // A feed outage must not look like "no news for this coin" — that is a
  // confident wrong answer once an agent relays it. 502 makes the two
  // distinguishable; an empty-but-healthy feed still returns 200.
  if (upstreamError) {
    return NextResponse.json(
      { articles: [], total: 0, error: upstreamError, updatedAt: new Date().toISOString() },
      { status: 502, headers: CORS },
    )
  }

  return NextResponse.json({
    articles,
    total: articles.length,
    filters: { coin: coin ?? 'all', sentiment: sentiment ?? 'all', limit },
    note: 'sentiment: positive/negative/neutral. category: regulation/security/adoption/macro/protocol/global/general. relatedAssets: coin ids affected by the article.',
    updatedAt: new Date().toISOString(),
  }, { headers: CORS })
}
