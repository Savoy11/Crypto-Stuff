import { NextRequest, NextResponse } from 'next/server'
import { EQUITY_BY_SYMBOL } from '@/lib/data/equityCatalog'
import { getProviderKey } from '@/lib/api/live/providers'

// Earnings + economic calendar for the equities module. Requires FMP_API_KEY
// (free tier covers both endpoints); returns ok:false without a key so the UI
// shows an honest setup notice instead of fabricated dates.

export const dynamic = 'force-dynamic'

export interface EarningsEvent {
  symbol: string
  name: string
  date: string
  epsEstimate: number | null
  time: string | null
  inCatalog: boolean
}

export interface EconomicEvent {
  event: string
  date: string
  country: string
  impact: string | null
}

export interface MarketCalendarResponse {
  ok: boolean
  configured: boolean
  from: string
  to: string
  earnings: EarningsEvent[]
  economic: EconomicEvent[]
  updatedAt: string
}

export async function GET(req: NextRequest) {
  // W3-6: ?month=YYYY-MM fetches that calendar month, for the month-grid UI.
  // Bounded to ±12 months from now — FMP serves history and far-future dates
  // thinly, and an unbounded month param would let one URL sweep years of the
  // provider's calendar for nothing.
  const monthParam = req.nextUrl.searchParams.get('month')
  let from: string
  let to: string
  if (monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number)
    const now = new Date()
    const offset = (y - now.getUTCFullYear()) * 12 + (m - 1 - now.getUTCMonth())
    const clamped = Math.max(-12, Math.min(12, offset))
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + clamped, 1))
    from = target.toISOString().slice(0, 10)
    to = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  } else {
    const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') ?? '14', 10) || 14, 30)
    from = new Date().toISOString().slice(0, 10)
    to = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
  }
  const base = { from, to, updatedAt: new Date().toISOString() }

  // UI-saved key (Integrations page) or FMP_API_KEY env var
  const FMP_KEY = getProviderKey('fmp')
  if (!FMP_KEY) {
    return NextResponse.json({ ok: false, configured: false, earnings: [], economic: [], ...base } satisfies MarketCalendarResponse)
  }

  // FMP /stable API. Earnings works on the free tier; the economic calendar is
  // a paid endpoint (402 on free) — Promise.allSettled lets it fail silently.
  const stable = 'https://financialmodelingprep.com/stable'
  const [earningsRes, econRes] = await Promise.allSettled([
    fetch(`${stable}/earnings-calendar?from=${from}&to=${to}&apikey=${FMP_KEY}`, { next: { revalidate: 3600 } }),
    fetch(`${stable}/economic-calendar?from=${from}&to=${to}&apikey=${FMP_KEY}`, { next: { revalidate: 3600 } }),
  ])

  const earnings: EarningsEvent[] = []
  if (earningsRes.status === 'fulfilled' && earningsRes.value.ok) {
    const rows = await earningsRes.value.json() as Array<{ symbol: string; date: string; epsEstimated: number | null }>
    for (const row of rows) {
      const entry = EQUITY_BY_SYMBOL[row.symbol?.toUpperCase() ?? '']
      // Catalog names first; cap the long tail of non-catalog names
      if (!entry && earnings.filter((e) => !e.inCatalog).length >= 120) continue
      earnings.push({
        symbol: row.symbol,
        name: entry?.name ?? row.symbol,
        date: row.date,
        epsEstimate: row.epsEstimated ?? null,
        time: null, // /stable earnings-calendar has no BMO/AMC session field
        inCatalog: !!entry,
      })
    }
    earnings.sort((a, b) => Number(b.inCatalog) - Number(a.inCatalog) || a.date.localeCompare(b.date))
  }

  const economic: EconomicEvent[] = []
  if (econRes.status === 'fulfilled' && econRes.value.ok) {
    const rows = await econRes.value.json() as Array<{ event: string; date: string; country: string; impact?: string }>
    for (const row of rows) {
      if (row.country !== 'US') continue
      if ((row.impact ?? '').toLowerCase() === 'low') continue
      economic.push({ event: row.event, date: row.date, country: row.country, impact: row.impact ?? null })
      if (economic.length >= 40) break
    }
  }

  return NextResponse.json({
    ok: earnings.length > 0 || economic.length > 0,
    configured: true,
    earnings: earnings.slice(0, 120),
    economic,
    ...base,
  } satisfies MarketCalendarResponse)
}
