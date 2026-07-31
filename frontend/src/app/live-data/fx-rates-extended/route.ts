import { NextResponse } from 'next/server'
import { recordProviderFetch } from '@/lib/api/live/providers'

// Extended-tier daily FX rates via the community-maintained
// fawazahmed0/currency-api (keyless, CDN-distributed, updates daily).
//
// This is deliberately SEPARATE from /live-data/fx-rates (frankfurter.dev /
// ECB): that route's 30 currencies are the ECB's own official published
// set — every one of them was verified to be ECB's full list, not a subset
// Finance Now Free chose. This route exists because ECB simply doesn't publish rates
// for ~125 other real, actively-used national currencies (Russian ruble,
// UAE dirham, Vietnamese dong, Taiwan dollar, and more) — real gaps, not an
// oversight in the ECB integration.
//
// The upstream feed returns ~340 codes mixing genuine fiat currencies with
// crypto tickers (aave, doge, sol...), precious-metal ounce codes (xau,
// xag — that's the commodities module's territory), IMF Special Drawing
// Rights (an institutional reserve unit, not something people convert to),
// and defunct pre-euro/historical currencies kept for legacy data (French
// franc, Italian lira, old Turkish lira...). EXTENDED_CURRENCIES below is a
// hand-verified allowlist of only currently-circulating national fiat
// currencies not already covered by the ECB route — cross-checked against
// the upstream response so a bad code fails loudly instead of silently
// serving a crypto price as if it were a currency.
//
// Provenance matters here more than for most sources: this is a community
// project, not a central bank. The UI must always label this tier
// separately from the ECB numbers — never blend them without attribution.

export const dynamic = 'force-dynamic'

export interface FxRatesExtendedResponse {
  ok: boolean
  /** Publication date of this snapshot (YYYY-MM-DD). */
  date?: string
  base?: 'USD'
  /** ISO code → units per 1 USD, extended-tier currencies only. */
  rates?: Record<string, number>
  /**
   * Allowlisted codes the upstream feed did not return a usable number for.
   * Empty in the normal case. Non-empty means the converter is quietly offering
   * fewer currencies than intended — see the note at the drop site below.
   */
  missing?: string[]
  source?: 'community-currency-api'
  error?: string
}

/**
 * Real, currently-circulating national fiat currencies not in ECB's
 * published set. Verified 2026-07-21 against the upstream currency-api's
 * full ~340-code response (see the route comment above for what's excluded
 * and why). Lowercase to match the upstream API's own key casing.
 */
const EXTENDED_CURRENCIES = [
  'aed', 'afn', 'all', 'amd', 'ang', 'aoa', 'ars', 'awg', 'azn', 'bam', 'bbd',
  // 'bgn' removed 2026-07-22: Bulgaria adopted the euro on 2026-01-01, so the
  // lev no longer circulates. The ECB dropped it from its reference set (29
  // currencies today, BGN absent — verified against the live feed), but the
  // community feed still carries it at the frozen legacy peg, which would have
  // offered users a live-looking conversion for a retired currency. Same
  // exclusion rule this list already applies to the other pre-euro legacies.
  'bdt', 'bhd', 'bif', 'bmd', 'bnd', 'bob', 'bsd', 'btn', 'bwp', 'byn',
  'bzd', 'cdf', 'clp', 'cop', 'crc', 'cup', 'cve', 'djf', 'dop', 'dzd', 'egp',
  'ern', 'etb', 'fjd', 'fkp', 'gel', 'ggp', 'ghs', 'gip', 'gmd', 'gnf', 'gtq',
  'gyd', 'hnl', 'htg', 'imp', 'iqd', 'irr', 'jep', 'jmd', 'jod', 'kes', 'kgs',
  'khr', 'kmf', 'kpw', 'kwd', 'kyd', 'kzt', 'lak', 'lbp', 'lkr', 'lrd', 'lsl',
  'lyd', 'mad', 'mdl', 'mga', 'mkd', 'mmk', 'mnt', 'mop', 'mru', 'mur', 'mvr',
  'mwk', 'mzn', 'nad', 'ngn', 'nio', 'npr', 'omr', 'pab', 'pen', 'pgk', 'pkr',
  'pyg', 'qar', 'rsd', 'rub', 'rwf', 'sar', 'sbd', 'scr', 'sdg', 'shp', 'sle',
  'sos', 'srd', 'ssp', 'stn', 'syp', 'szl', 'tjs', 'tmt', 'tnd', 'top', 'ttd',
  'twd', 'tzs', 'uah', 'ugx', 'uyu', 'uzs', 'ves', 'vnd', 'vuv', 'wst', 'xaf',
  'xcd', 'xof', 'xpf', 'yer', 'zmw', 'zwg',
] as const

export async function GET(): Promise<NextResponse<FxRatesExtendedResponse>> {
  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
      { next: { revalidate: 1800 }, headers: { Accept: 'application/json' } },
    )
    if (!res.ok) throw new Error(`currency-api ${res.status}`)
    const data: { date?: string; usd?: Record<string, number> } = await res.json()
    if (!data.usd || !data.date) throw new Error('malformed currency-api response')

    const rates: Record<string, number> = {}
    const missing: string[] = []
    for (const code of EXTENDED_CURRENCIES) {
      const value = data.usd[code]
      // Surface rather than silently drop: if the upstream feed stops carrying
      // a code this allowlist expects, that's worth reporting, not hiding
      // behind a shorter-than-intended currency list.
      //
      // Reported, not thrown. This comment used to claim the route "fails
      // loudly" while the code did a bare `continue` — but throwing here would
      // be worse than the bug it described, taking down all ~127 extended
      // currencies because one went missing. So: serve what resolved, and name
      // what didn't, in the response and in provider utilization.
      if (typeof value !== 'number' || !isFinite(value)) {
        missing.push(code.toUpperCase())
        continue
      }
      rates[code.toUpperCase()] = value
    }
    if (Object.keys(rates).length === 0) throw new Error('no extended-tier rates resolved')

    recordProviderFetch('currency-api-extended', {
      count: Object.keys(rates).length,
      ...(missing.length ? { error: `${missing.length} allowlisted codes absent upstream: ${missing.join(', ')}` } : {}),
    })
    return NextResponse.json({
      ok: true,
      date: data.date,
      base: 'USD',
      rates,
      missing,
      source: 'community-currency-api',
    })
  } catch (err) {
    recordProviderFetch('currency-api-extended', { error: err instanceof Error ? err.message : 'fetch failed' })
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'extended fx rates unavailable',
    })
  }
}
