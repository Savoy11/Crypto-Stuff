// Client-side unified price fetch for cross-asset portfolios/watchlists.
// Splits instrument keys by class: CoinGecko ids → /live-data/portfolio-prices,
// 'sec:SYMBOL' keys → /live-data/security-quotes. Reference/fallback security
// prices are treated as MISSING — portfolio valuations never use non-live data.

import { isSecurityKey, securitySymbol, SEC_PREFIX } from '@/lib/data/instruments'

export interface InstrumentPricesResult {
  /** Keyed by instrument key (cgId or sec:SYMBOL) */
  prices: Record<string, number>
  missing: string[]
  source: 'live' | 'partial' | 'error'
  updatedAt: string
}

export async function fetchInstrumentPrices(keys: string[]): Promise<InstrumentPricesResult> {
  const cgIds = keys.filter((k) => !isSecurityKey(k))
  const symbols = keys.filter(isSecurityKey).map(securitySymbol)

  const prices: Record<string, number> = {}
  const missing: string[] = []
  let anyFailed = false
  let anyFetched = false

  const tasks: Promise<void>[] = []
  if (cgIds.length > 0) {
    tasks.push(
      fetch(`/live-data/portfolio-prices?ids=${cgIds.join(',')}`)
        .then((r) => r.json())
        .then((d: { prices?: Record<string, number>; missing?: string[]; source?: string }) => {
          anyFetched = true
          Object.assign(prices, d.prices ?? {})
          missing.push(...(d.missing ?? []))
          if (d.source !== 'live') anyFailed = true
        })
        .catch(() => { anyFailed = true; missing.push(...cgIds) })
    )
  }
  if (symbols.length > 0) {
    tasks.push(
      // Encode: macro symbols carry '=' and '^' (GC=F, ^TNX)
      fetch(`/live-data/security-quotes?symbols=${encodeURIComponent(symbols.join(','))}`)
        .then((r) => r.json())
        .then((d: { quotes?: Record<string, { price: number; reference?: boolean }>; source?: string }) => {
          anyFetched = true
          for (const sym of symbols) {
            const q = d.quotes?.[sym.toUpperCase()]
            if (q && d.source !== 'reference' && !q.reference) {
              prices[`${SEC_PREFIX}${sym}`] = q.price
            } else {
              missing.push(`${SEC_PREFIX}${sym}`)
              anyFailed = true
            }
          }
        })
        .catch(() => { anyFailed = true; missing.push(...symbols.map((s) => `${SEC_PREFIX}${s}`)) })
    )
  }
  await Promise.all(tasks)

  return {
    prices,
    missing,
    source: !anyFetched ? 'error' : anyFailed || missing.length > 0 ? 'partial' : 'live',
    updatedAt: new Date().toISOString(),
  }
}
