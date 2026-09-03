import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Returns the USD price of each requested coin on the given date.
// date format: YYYY-MM-DD (we convert to CoinGecko DD-MM-YYYY format)

export interface PortfolioHistoryResponse {
  date:      string
  prices:    Record<string, number | null>
  source:    'live' | 'partial' | 'error'
  /**
   * Why prices are missing, when any are.
   *
   * 'upstream'  — the provider refused or failed (rate limit, 5xx). Try again.
   * 'no-data'   — the provider answered, and has no price for that coin/date.
   *
   * These are different problems with different fixes, and a bare
   * source:'error' cannot tell them apart. The 2026-09-03 audit surfaced this:
   * portfolio-history reported "no historical prices (source=error)" during a
   * CoinGecko 429, which reads as a data gap and sends the reader looking for a
   * missing date rather than a rate limit. The route already fixed this
   * conflation for BAD REQUESTS (see the 400 branch below) — it just never
   * fixed it for upstream failures.
   */
  reason?:   'upstream' | 'no-data'
  /** Human-readable detail for the reason, e.g. the upstream status. */
  detail?:   string
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

  // Both params are required. This used to answer HTTP 200 with source:'error',
  // which is indistinguishable from "the upstream had no data for that date" —
  // a caller (or an audit) reads it as a data gap rather than a bad request.
  // Reject it properly instead; 200 is reserved for a real answer.
  if (!ids.length || !date) {
    return NextResponse.json(
      { date, prices: {}, source: 'error', error: 'ids and date are both required (date format YYYY-MM-DD)', updatedAt: new Date().toISOString() },
      { status: 400 }
    )
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { date, prices: {}, source: 'error', error: `invalid date "${date}" — expected YYYY-MM-DD`, updatedAt: new Date().toISOString() },
      { status: 400 }
    )
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
      // A refusal is not an absence: 429/5xx means "ask again", while a 200
      // carrying no price means the provider genuinely has none for that date.
      if (!res.ok) return { id, price: null, failed: `HTTP ${res.status}` }
      const data = await res.json() as { market_data?: { current_price?: { usd?: number } } }
      return { id, price: data.market_data?.current_price?.usd ?? null, failed: undefined }
    })
  )

  const upstreamFailures: string[] = []

  for (const r of results) {
    if (r.status === 'fulfilled') {
      prices[r.value.id] = r.value.price
      if (r.value.price != null) fetched++
      else if (r.value.failed) upstreamFailures.push(`${r.value.id}: ${r.value.failed}`)
    } else {
      // find which id failed — mark null. A thrown fetch (DNS, socket, abort)
      // is an upstream problem too, not a missing price.
      const idx = results.indexOf(r)
      const id = idx >= 0 ? ids[idx] : undefined
      if (id) {
        prices[id] = null
        upstreamFailures.push(`${id}: ${r.reason instanceof Error ? r.reason.message : 'request failed'}`)
      }
    }
  }

  const source: 'live' | 'partial' | 'error' =
    fetched === ids.length ? 'live' : fetched > 0 ? 'partial' : 'error'

  // Only describe a reason when something is actually missing.
  const reason = source === 'live' ? undefined : upstreamFailures.length ? 'upstream' as const : 'no-data' as const
  const detail =
    reason === 'upstream'
      ? `provider refused or failed for ${upstreamFailures.length}/${ids.length} — ${upstreamFailures.slice(0, 3).join('; ')}`
      : reason === 'no-data'
        ? `provider has no price for ${ids.length - fetched}/${ids.length} on ${date}`
        : undefined

  return NextResponse.json({
    date,
    prices,
    source,
    ...(reason ? { reason } : {}),
    ...(detail ? { detail } : {}),
    updatedAt: new Date().toISOString(),
  } satisfies PortfolioHistoryResponse)
}
