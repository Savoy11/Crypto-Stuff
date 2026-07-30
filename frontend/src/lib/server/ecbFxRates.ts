import 'server-only'

import { recordProviderFetch } from '@/lib/api/live/providers'

// Daily ECB reference FX rates via frankfurter.dev (keyless). Shared by
// /live-data/fx-rates (UI converter) and /api/v1/macro/fx-rates (public agent
// API) so both read one source of truth. Extracted from the live-data route —
// route files may only export handlers and types.

export interface EcbFxRates {
  /** Publication date of the reference rates (YYYY-MM-DD). */
  date: string
  base: 'USD'
  /** ISO code → units per 1 USD. USD itself is included at 1. */
  rates: Record<string, number>
}

/**
 * Fetch the latest ECB reference table. Throws on any failure — callers decide
 * their own error envelope. Records provider utilization.
 */
export async function fetchEcbFxRates(): Promise<EcbFxRates> {
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD', {
      next: { revalidate: 1800 }, // half-hourly is generous for a daily series
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`frankfurter ${res.status}`)
    const data: { date?: string; rates?: Record<string, number> } = await res.json()
    if (!data.rates || !data.date) throw new Error('malformed frankfurter response')

    recordProviderFetch('frankfurter', { count: Object.keys(data.rates).length + 1 })
    return { date: data.date, base: 'USD', rates: { USD: 1, ...data.rates } }
  } catch (err) {
    recordProviderFetch('frankfurter', { error: err instanceof Error ? err.message : 'fetch failed' })
    throw err
  }
}
