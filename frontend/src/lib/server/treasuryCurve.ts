import 'server-only'

import { recordProviderFetch } from '@/lib/api/live/providers'

// Official daily Treasury par yield curve (treasury.gov XML, keyless).
// Shared by /live-data/treasury-yield-curve (UI) and /api/v1/macro/yield-curve
// (public agent API) so both surfaces read one source of truth. Extracted from
// the live-data route — route files may only export handlers and types.

export interface CurvePoint {
  label: string
  /** Maturity in years, for spacing/sorting. */
  years: number
  yieldPct: number
}

export interface CurveSnapshot {
  date: string // YYYY-MM-DD
  points: CurvePoint[]
}

export interface YieldCurveData {
  latest: CurveSnapshot
  monthAgo: CurveSnapshot
  yearStart: CurveSnapshot
  /** 10Y minus 2Y, percentage points — the classic recession signal. */
  spread2s10s?: number
  /** 10Y minus 3M, the Fed's preferred version. */
  spread3m10y?: number
  shape?: 'normal' | 'flat' | 'inverted'
}

// Maturity fields in the XML, in curve order. BC_1_5MONTH and the 30-year
// display duplicate are deliberately skipped.
const FIELDS: Array<{ tag: string; label: string; years: number }> = [
  { tag: 'BC_1MONTH',  label: '1M',  years: 1 / 12 },
  { tag: 'BC_2MONTH',  label: '2M',  years: 2 / 12 },
  { tag: 'BC_3MONTH',  label: '3M',  years: 3 / 12 },
  { tag: 'BC_4MONTH',  label: '4M',  years: 4 / 12 },
  { tag: 'BC_6MONTH',  label: '6M',  years: 6 / 12 },
  { tag: 'BC_1YEAR',   label: '1Y',  years: 1 },
  { tag: 'BC_2YEAR',   label: '2Y',  years: 2 },
  { tag: 'BC_3YEAR',   label: '3Y',  years: 3 },
  { tag: 'BC_5YEAR',   label: '5Y',  years: 5 },
  { tag: 'BC_7YEAR',   label: '7Y',  years: 7 },
  { tag: 'BC_10YEAR',  label: '10Y', years: 10 },
  { tag: 'BC_20YEAR',  label: '20Y', years: 20 },
  { tag: 'BC_30YEAR',  label: '30Y', years: 30 },
]

function parseEntry(xml: string): CurveSnapshot | null {
  const dateMatch = xml.match(/<d:NEW_DATE[^>]*>(\d{4}-\d{2}-\d{2})/)
  if (!dateMatch) return null
  const points: CurvePoint[] = []
  for (const f of FIELDS) {
    const m = xml.match(new RegExp(`<d:${f.tag}[^>]*>([\\d.]+)</d:${f.tag}>`))
    if (m) points.push({ label: f.label, years: f.years, yieldPct: parseFloat(m[1]) })
  }
  // A curve missing its long end is a partial row — refuse it rather than
  // draw a misleading chart.
  if (points.length < 8) return null
  return { date: dateMatch[1], points }
}

function yieldAt(curve: CurveSnapshot, label: string): number | undefined {
  return curve.points.find((p) => p.label === label)?.yieldPct
}

/**
 * Fetch and parse the current year's daily par curve. Throws on any failure —
 * callers decide their own error envelope. Records provider utilization.
 */
export async function fetchTreasuryYieldCurve(): Promise<YieldCurveData> {
  try {
    const year = new Date().getUTCFullYear()
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`
    const res = await fetch(url, {
      next: { revalidate: 14_400 }, // 4h — the series updates once a day
      headers: { Accept: 'application/xml' },
    })
    if (!res.ok) throw new Error(`treasury.gov ${res.status}`)
    const xml = await res.text()

    const snapshots = xml
      .split('<entry>')
      .slice(1)
      .map(parseEntry)
      .filter((s): s is CurveSnapshot => s !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
    if (snapshots.length === 0) throw new Error('no parsable curve entries')

    const latest = snapshots[snapshots.length - 1]
    const latestTime = new Date(latest.date).getTime()
    // Closest business day to 30 days back — not an exact calendar hit.
    const monthAgo = snapshots.reduce((best, s) =>
      Math.abs(new Date(s.date).getTime() - (latestTime - 30 * 86_400_000)) <
      Math.abs(new Date(best.date).getTime() - (latestTime - 30 * 86_400_000)) ? s : best)
    const yearStart = snapshots[0]

    const y2 = yieldAt(latest, '2Y')
    const y10 = yieldAt(latest, '10Y')
    const m3 = yieldAt(latest, '3M')
    const spread2s10s = y2 != null && y10 != null ? Math.round((y10 - y2) * 100) / 100 : undefined
    const spread3m10y = m3 != null && y10 != null ? Math.round((y10 - m3) * 100) / 100 : undefined
    const shape = spread2s10s == null ? undefined
      : spread2s10s > 0.25 ? 'normal' : spread2s10s < -0.1 ? 'inverted' : 'flat'

    recordProviderFetch('treasury-gov', { count: snapshots.length })
    return { latest, monthAgo, yearStart, spread2s10s, spread3m10y, shape }
  } catch (err) {
    recordProviderFetch('treasury-gov', { error: err instanceof Error ? err.message : 'fetch failed' })
    throw err
  }
}
