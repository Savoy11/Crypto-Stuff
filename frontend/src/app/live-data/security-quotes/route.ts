import { NextRequest, NextResponse } from 'next/server'
import { fetchSecurityQuotes, referenceSecurityQuotes, type SecurityQuote, type QuoteSource } from '@/lib/api/live/marketData'
import { EQUITY_CATALOG } from '@/lib/data/equityCatalog'
import { FUND_CATALOG } from '@/lib/data/fundCatalog'

// Server-side proxy for equity / ETF / mutual-fund quotes.
//   GET /live-data/security-quotes?symbols=AAPL,SPY,VTSAX
//   GET /live-data/security-quotes?universe=equities|funds   (all catalog symbols)
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
  const universe = request.nextUrl.searchParams.get('universe')
  const symbolsParam = request.nextUrl.searchParams.get('symbols')

  let symbols: string[]
  if (universe === 'equities') {
    symbols = EQUITY_CATALOG.map((e) => e.symbol)
  } else if (universe === 'funds') {
    symbols = FUND_CATALOG.map((f) => f.symbol)
  } else if (symbolsParam) {
    symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 200)
  } else {
    return NextResponse.json(
      { ok: false, error: 'Pass ?symbols=AAPL,MSFT or ?universe=equities|funds' },
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
