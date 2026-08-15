import { NextRequest, NextResponse } from 'next/server'
import { fetchSecurityQuotes, referenceSecurityQuotes, type SecurityQuote, type QuoteSource } from '@/lib/api/live/marketData'

// Server-side proxy for equity / ETF / mutual-fund quotes.
//   GET /live-data/security-quotes?symbols=AAPL,SPY,VTSAX
// (?universe= was removed 2026-08-16 — zero consumers, and a whole-catalog
// quote fan-out is exactly the request shape the keyed ladder shouldn't invite.)
//
// Response: { ok, updatedAt, source, quotes: Record<SYMBOL, SecurityQuote> }
// Falls back to static catalog reference prices (source: 'reference') so the
// UI always renders, clearly labelled as non-live.

export const dynamic = 'force-dynamic'

export interface SecurityQuotesResponse {
  ok: boolean
  updatedAt: string
  source: QuoteSource
  quotes: Record<string, SecurityQuote>
}

export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get('symbols')

  let symbols: string[]
  if (symbolsParam) {
    symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 200)
  } else {
    return NextResponse.json(
      { ok: false, error: 'Pass ?symbols=AAPL,MSFT' },
      { status: 400 }
    )
  }

  try {
    const { quotes, source } = await fetchSecurityQuotes(symbols)
    // Backfill any symbols the live source missed with reference prices
    const missing = symbols.filter((s) => !quotes[s.toUpperCase()])
    const backfill = referenceSecurityQuotes(missing)
    return NextResponse.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      source,
      quotes: { ...backfill, ...quotes },
    } satisfies SecurityQuotesResponse)
  } catch {
    return NextResponse.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      source: 'reference',
      quotes: referenceSecurityQuotes(symbols),
    } satisfies SecurityQuotesResponse)
  }
}
