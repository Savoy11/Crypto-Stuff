import { NextResponse } from 'next/server'
import { recordProviderFetch } from '@/lib/api/live/providers'

// Daily ECB reference FX rates via frankfurter.dev (keyless, no auth).
// Backs the Macro Markets currency converter. Rates are published once per
// business day (~16:00 CET) — this is deliberately a *reference* table, not
// an intraday feed; intraday pair quotes come from security-quotes.

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
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD', {
      next: { revalidate: 1800 }, // half-hourly is generous for a daily series
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`frankfurter ${res.status}`)
    const data: { date?: string; rates?: Record<string, number> } = await res.json()
    if (!data.rates || !data.date) throw new Error('malformed frankfurter response')

    recordProviderFetch('frankfurter', { count: Object.keys(data.rates).length + 1 })
    return NextResponse.json({
      ok: true,
      date: data.date,
      base: 'USD',
      rates: { USD: 1, ...data.rates },
      source: 'frankfurter-ecb',
    })
  } catch (err) {
    recordProviderFetch('frankfurter', { error: err instanceof Error ? err.message : 'fetch failed' })
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'fx reference rates unavailable',
    })
  }
}
