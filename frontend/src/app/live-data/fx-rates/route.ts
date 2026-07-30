import { NextResponse } from 'next/server'
import { fetchEcbFxRates } from '@/lib/server/ecbFxRates'

// Daily ECB reference FX rates via frankfurter.dev (keyless, no auth).
// Backs the Macro Markets currency converter. Rates are published once per
// business day (~16:00 CET) — this is deliberately a *reference* table, not
// an intraday feed; intraday pair quotes come from security-quotes.
//
// Fetch lives in lib/server/ecbFxRates.ts, shared with the public
// /api/v1/macro/fx-rates route (one source of truth).

export const dynamic = 'force-dynamic'

export interface FxRatesResponse {
  ok: boolean
  /** Publication date of the reference rates (YYYY-MM-DD). */
  date?: string
  base?: 'USD'
  /** ISO code → units per 1 USD. USD itself is included at 1. */
  rates?: Record<string, number>
  source?: 'frankfurter-ecb'
  error?: string
}

export async function GET(): Promise<NextResponse<FxRatesResponse>> {
  try {
    const { date, base, rates } = await fetchEcbFxRates()
    return NextResponse.json({ ok: true, date, base, rates, source: 'frankfurter-ecb' })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'fx reference rates unavailable',
    })
  }
}
