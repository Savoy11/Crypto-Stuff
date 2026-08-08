import { NextRequest, NextResponse } from 'next/server'
import { ALL_FUND_SYMBOLS } from '@/lib/data/fundCatalog'
import { ALL_EQUITY_SYMBOLS } from '@/lib/data/equityCatalog'
import { getProviderKey, recordProviderFetch } from '@/lib/api/live/providers'
import { computeReturns, type CloseSeries, type SecurityReturns } from '@/lib/utils/returns'

export type { SecurityReturns }

// Trailing returns for stocks/ETFs/mutual funds, computed server-side from a
// year of daily closes.
//   GET /live-data/security-returns?universe=funds|equities
//   GET /live-data/security-returns?symbols=SPY,QQQ
//
// Response: { ok, updatedAt, source, returns: Record<SYMBOL, SecurityReturns> }
// Percentages; null when the series is too short (e.g. funds younger than the
// window).
//
// ⚠ THIS USED TO BE FREE AND IS NOT ANY MORE. Until 2026-08-06 it made one
// batched Yahoo spark call per ~20 symbols and covered a whole universe in a
// handful of requests. Yahoo was removed on terms grounds (see
// lib/server/sourceTerms.ts) and nothing keyless replaces it, so returns now
// come from Tiingo — one request per symbol.
//
// That changes the economics, so the route is capped rather than left to fan
// out over 118 funds on every page load:
//   • a `?symbols=` request (the visible page — how the Funds table actually
//     asks) is served up to MAX_SYMBOLS;
//   • a whole-`?universe=` request is REFUSED, not silently truncated. A
//     partial universe would sort and filter as if it were the whole one,
//     which is the failure mode this project treats as worse than an empty
//     state (see the FALLBACK-vs-REAL note in CLAUDE.md).
// With no Tiingo key the route returns {} with source 'none' — the UI already
// renders em-dashes for that, rather than fabricating a number.

export const dynamic = 'force-dynamic'

/** Per-symbol upstream calls one request may make. */
const MAX_SYMBOLS = 60

export interface SecurityReturnsResponse {
  ok: boolean
  updatedAt: string
  source: 'tiingo' | 'none'
  returns: Record<string, SecurityReturns>
  /** Set when the caller asked for more than this route will fetch. */
  error?: string
  /** Symbols requested but not fetched — reported, never silently dropped. */
  skipped?: string[]
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** One year of daily closes for a symbol, or null when Tiingo has no series. */
async function fetchTiingoSeries(symbol: string, key: string): Promise<CloseSeries | null> {
  const start = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10)
  const res = await fetch(
    `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol.toLowerCase())}/prices?startDate=${start}&token=${key}`,
    { headers: { Accept: 'application/json' }, next: { revalidate: 900 } }
  )
  if (!res.ok) throw new Error(`Tiingo ${res.status}`)
  const rows = await res.json() as Array<{ date: string; close: number; adjClose?: number }>
  if (!Array.isArray(rows) || rows.length === 0) return null

  const closes: number[] = []
  const timestamps: number[] = []
  for (const row of [...rows].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
    // Adjusted closes, so a split or a distribution isn't read as a return.
    const close = row.adjClose ?? row.close
    const ms = Date.parse(row.date)
    if (!Number.isFinite(close) || Number.isNaN(ms)) continue
    closes.push(close)
    timestamps.push(Math.floor(ms / 1000))
  }
  return closes.length > 0 ? { closes, timestamps } : null
}

export async function GET(request: NextRequest) {
  const universe = request.nextUrl.searchParams.get('universe')
  const symbolsParam = request.nextUrl.searchParams.get('symbols')

  let symbols: string[]
  if (universe === 'funds' || universe === 'equities') {
    const size = (universe === 'funds' ? ALL_FUND_SYMBOLS : ALL_EQUITY_SYMBOLS).length
    return NextResponse.json({
      ok: false,
      updatedAt: new Date().toISOString(),
      source: 'none',
      returns: {},
      error: `Whole-universe returns are no longer available: the keyless batched source was withdrawn on terms grounds, and the remaining provider is one request per symbol (${size} would be needed). Request the symbols you are showing instead — ?symbols=SPY,QQQ, up to ${MAX_SYMBOLS}.`,
    } satisfies SecurityReturnsResponse, { status: 400 })
  }
  if (symbolsParam) {
    symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  } else {
    return NextResponse.json({ ok: false, error: 'Pass ?symbols=SPY,QQQ' }, { status: 400 })
  }

  const requested = [...new Set(symbols)]
  const wanted = requested.slice(0, MAX_SYMBOLS)
  const skipped = requested.slice(MAX_SYMBOLS)

  const key = getProviderKey('tiingo')
  if (!key) {
    return NextResponse.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      source: 'none',
      returns: {},
      error: 'No trailing-returns provider is configured. Add a Tiingo API key on the Integrations page.',
      ...(skipped.length > 0 ? { skipped } : {}),
    } satisfies SecurityReturnsResponse)
  }

  const nowYear = new Date().getUTCFullYear()
  const returns: Record<string, SecurityReturns> = {}
  let failures = 0

  // Symbols are independent, so allSettled is the right boundary — one delisted
  // ticker must not cost the other 59. Batched 8 at a time to stay polite
  // rather than opening 60 sockets at once.
  for (const group of chunk(wanted, 8)) {
    const settled = await Promise.allSettled(group.map((s) => fetchTiingoSeries(s, key)))
    settled.forEach((res, i) => {
      if (res.status === 'rejected') { failures++; return }
      if (!res.value) return
      returns[group[i]] = computeReturns(res.value, nowYear)
    })
  }

  const served = Object.keys(returns).length
  if (served > 0) recordProviderFetch('tiingo', { count: served })
  else if (failures > 0) recordProviderFetch('tiingo', { error: `all ${failures} symbol requests failed` })

  return NextResponse.json({
    ok: true,
    updatedAt: new Date().toISOString(),
    source: served > 0 ? 'tiingo' : 'none',
    returns,
    ...(skipped.length > 0
      ? { skipped, error: `Capped at ${MAX_SYMBOLS} symbols per request; ${skipped.length} not fetched.` }
      : {}),
  } satisfies SecurityReturnsResponse)
}
