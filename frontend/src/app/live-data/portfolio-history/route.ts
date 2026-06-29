import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Returns the USD price of each requested coin on the given date.
// date format: YYYY-MM-DD (we convert to CoinGecko DD-MM-YYYY format)

export interface PortfolioHistoryResponse {
  date:      string
  prices:    Record<string, number | null>
  source:    'live' | 'partial' | 'error'
  updatedAt: string
}

function toCGDate(isoDate: string): string {
  // YYYY-MM-DD → DD-MM-YYYY
  const [y, m, d] = isoDate.split('-')
  return `${d}-${m}-${y}`
}

export async function GET(req: NextRequest) {
  const ids  = req.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean) ?? []
  const date = req.nextUrl.searchParams.get('date') ?? ''

  if (!ids.length || !date) {
    return NextResponse.json({ date, prices: {}, source: 'error', updatedAt: new Date().toISOString() })
  }

  const cgDate = toCGDate(date)
  const prices: Record<string, number | null> = {}
  let fetched = 0

  // CoinGecko free tier: fetch each coin's history individually
  // Use Promise.allSettled so one failure doesn't kill the batch
  const results = await Promise.allSettled(
    ids.map(async id => {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${id}/history?date=${cgDate}&localization=false`,
        { headers: { Accept: 'application/json' }, next: { revalidate: 86400 } } // history is immutable
      )
      if (!res.ok) return { id, price: null }
      const data = await res.json() as { market_data?: { current_price?: { usd?: number } } }
      return { id, price: data.market_data?.current_price?.usd ?? null }
    })
  )

  for (const r of results) {
    if (r.status === 'fulfilled') {
      prices[r.value.id] = r.value.price
      if (r.value.price != null) fetched++
    } else {
      // find which id failed — mark null
      const idx = results.indexOf(r)
      if (idx >= 0 && ids[idx]) prices[ids[idx]] = null
    }
  }

  const source: 'live' | 'partial' | 'error' =
    fetched === ids.length ? 'live' : fetched > 0 ? 'partial' : 'error'

  return NextResponse.json({
    date,
    prices,
    source,
    updatedAt: new Date().toISOString(),
  } satisfies PortfolioHistoryResponse)
}
