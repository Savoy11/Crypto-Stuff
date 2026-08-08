import { NextRequest, NextResponse } from 'next/server'
import { CORS, options } from '../../../_cors'
import { fetchSecurityQuotes, referenceSecurityQuotes, type SecurityQuote } from '@/lib/api/live/marketData'

// Public agent API — quotes for anything the security ladder prices: stocks,
// ETFs, mutual funds, and macro instruments (futures like GC=F, FX pairs like
// EURUSD=X, yield indices like ^TNX). Same provider ladder AND the same
// fallback semantics the UI reads (FMP → Finnhub → Twelve Data → Tiingo →
// Alpha Vantage → catalog reference,
// reference rows marked `reference: true`) — one source of truth.

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

const MAX_SYMBOLS = 25

export interface V1SecurityQuotesResponse {
  quotes: Record<string, SecurityQuote>
  /** Provider that served the batch, or 'reference' for catalog prices. */
  source: string
  /** Symbols requested but not returned by any provider. */
  missing: string[]
  updatedAt: string
}

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get('symbols')?.trim()
  if (!param) {
    return NextResponse.json(
      { error: 'Pass ?symbols=AAPL,VOO — comma-separated tickers in market ticker notation (BRK-B, GC=F, EURUSD=X, ^TNX).' },
      { status: 400, headers: CORS },
    )
  }
  const symbols = Array.from(new Set(param.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)))
  if (symbols.length === 0) {
    return NextResponse.json({ error: 'No valid symbols in ?symbols=.' }, { status: 400, headers: CORS })
  }
  if (symbols.length > MAX_SYMBOLS) {
    return NextResponse.json(
      { error: `Too many symbols (${symbols.length}) — maximum ${MAX_SYMBOLS} per request.` },
      { status: 400, headers: CORS },
    )
  }

  // Mirror /live-data/security-quotes: live ladder first, catalog reference
  // backfill for symbols the ladder missed, full reference on total failure.
  // Reference rows carry `reference: true` — consumers must not treat them as
  // live. 502 only when literally nothing (live or reference) can be served.
  let quotes: Record<string, SecurityQuote>
  let source: string
  try {
    const live = await fetchSecurityQuotes(symbols)
    const backfill = referenceSecurityQuotes(symbols.filter((s) => !live.quotes[s]))
    quotes = { ...backfill, ...live.quotes }
    source = live.source
  } catch (err) {
    quotes = referenceSecurityQuotes(symbols)
    source = 'reference'
    if (Object.keys(quotes).length === 0) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'quotes unavailable' },
        { status: 502, headers: CORS },
      )
    }
  }

  return NextResponse.json({
    quotes,
    source,
    missing: symbols.filter((s) => !quotes[s]),
    updatedAt: new Date().toISOString(),
  } satisfies V1SecurityQuotesResponse, { headers: CORS })
}
