import { NextRequest, NextResponse } from 'next/server'
import { CORS, options } from '../../_cors'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

// Proxy to the internal news route but reshape the response for agent consumption
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const coin      = searchParams.get('coin')?.toLowerCase()
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)
  const sentiment = searchParams.get('sentiment') // positive | negative | neutral

  // Build internal URL — news route handles asset filtering
  const internalUrl = new URL('/live-data/news', req.nextUrl.origin)
  if (coin) internalUrl.searchParams.set('asset', coin)

  let articles: object[] = []
  try {
    const res = await fetch(internalUrl.toString(), { next: { revalidate: 300 } })
    if (res.ok) {
      const data = await res.json() as {
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
  } catch { /* return empty */ }

  return NextResponse.json({
    articles,
    total: articles.length,
    filters: { coin: coin ?? 'all', sentiment: sentiment ?? 'all', limit },
    note: 'sentiment: positive/negative/neutral. category: regulation/security/adoption/macro/protocol/global/general. relatedAssets: coin ids affected by the article.',
    updatedAt: new Date().toISOString(),
  }, { headers: CORS })
}
