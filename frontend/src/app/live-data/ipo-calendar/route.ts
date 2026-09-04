import { NextRequest, NextResponse } from 'next/server'
import { getProviderKey } from '@/lib/api/live/providers'
import { parseIpoCalendar, type IpoEvent } from '@/lib/data/ipoCalendar'

// Upcoming IPOs for the equities module — Alpha Vantage IPO_CALENDAR, which
// returns listings expected over roughly the next three months.
//
// WHY THIS PROVIDER. It is the only source reachable on a FREE tier that
// publishes forward-looking listing dates. SEC EDGAR has the S-1 filings and is
// keyless and authoritative, but a registration statement says a company INTENDS
// to list, not when — the date is set at pricing, days ahead. So EDGAR answers a
// different question and is not a substitute here.
//
// PROVIDER LADDER, DELIBERATELY ONE RUNG DEEP FOR NOW. The project runs on free
// sources until release, then pays for whatever is needed so no field renders
// blank (owner, 2026-09-03). The shape below anticipates that: `source` is
// reported on every response, and a richer PAID rung (FMP's IPO calendar is the
// obvious candidate) is meant to be tried FIRST when its key is present, with
// Alpha Vantage remaining the free floor.
//
// That rung is NOT wired yet, on purpose. This environment cannot reach FMP to
// confirm its response shape, and parsing a feed nobody has seen is how a wrong
// number reaches a page — the same reason the SEC fee script ships with
// candidate tags and an --inspect mode rather than assumptions. Wiring it needs
// one live response to read; everything else here is ready for it.
//
// ⚠ RATE LIMIT IS A TERMS CONDITION, NOT JUST A QUOTA. The Alpha Vantage entry
// in lib/server/sourceTerms.ts is `conditional` with "Free tier is 25
// requests/day — do not exceed" written into its conditions. Hence the long
// revalidate below: an IPO calendar changes at most daily, and a short window
// would spend the day's allowance on re-fetching a list that has not moved.
// Do not lower it to make the page feel fresher.

export const dynamic = 'force-dynamic'

/** 6 hours — 4 upstream calls a day at most, well inside the 25/day condition. */
const REVALIDATE_SECONDS = 21_600

export interface IpoCalendarResponse {
  ok: boolean
  /** False when no provider key is set — the UI shows a setup notice. */
  configured: boolean
  /**
   * Which rung answered. Present even on failure so the UI can name the
   * provider it is reporting about, and so adding a paid rung later does not
   * change the response shape.
   */
  source: 'alpha-vantage' | 'none'
  events: IpoEvent[]
  /** Present when ok is false: why, in words the UI can show. */
  reason?: 'rate-limited' | 'provider-message' | 'unparseable' | 'upstream'
  detail?: string
  updatedAt: string
}

export async function GET(req: NextRequest) {
  const base = { updatedAt: new Date().toISOString() }

  const key = getProviderKey('alpha-vantage')
  if (!key) {
    return NextResponse.json({
      ok: false, configured: false, source: 'none', events: [], ...base,
      reason: 'provider-message',
      detail: 'No Alpha Vantage key configured. Add one on the Integrations page — the IPO calendar is on its free tier.',
    } satisfies IpoCalendarResponse)
  }

  let text: string
  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=IPO_CALENDAR&apikey=${encodeURIComponent(key)}`,
      { headers: { Accept: 'text/csv' }, next: { revalidate: REVALIDATE_SECONDS } },
    )
    // A non-2xx is an upstream failure. It is reported as such rather than as an
    // empty calendar: "no IPOs scheduled" is a claim about the market, and this
    // route must never make it on the strength of a failed request.
    if (!res.ok) {
      return NextResponse.json({
        ok: false, configured: true, source: 'alpha-vantage', events: [], ...base,
        reason: 'upstream', detail: `Alpha Vantage HTTP ${res.status}`,
      } satisfies IpoCalendarResponse)
    }
    text = await res.text()
  } catch (err) {
    return NextResponse.json({
      ok: false, configured: true, source: 'alpha-vantage', events: [], ...base,
      reason: 'upstream', detail: err instanceof Error ? err.message : 'request failed',
    } satisfies IpoCalendarResponse)
  }

  const parsed = parseIpoCalendar(text)
  if (!parsed.ok) {
    return NextResponse.json({
      ok: false, configured: true, source: 'alpha-vantage', events: [], ...base,
      reason: parsed.reason, detail: parsed.detail,
    } satisfies IpoCalendarResponse)
  }

  // Optional window filter. Past dates are dropped by default because an
  // "upcoming IPOs" list containing last week reads as stale rather than
  // historical; ?includePast=1 keeps them for anyone who wants the full feed.
  const includePast = req.nextUrl.searchParams.get('includePast') === '1'
  const today = new Date().toISOString().slice(0, 10)
  const events = includePast ? parsed.events : parsed.events.filter((e) => e.ipoDate >= today)

  return NextResponse.json({ ok: true, configured: true, source: 'alpha-vantage', events, ...base } satisfies IpoCalendarResponse)
}
