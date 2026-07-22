import { NextResponse } from 'next/server'
import { recordProviderFetch } from '@/lib/api/live/providers'

// Official US Treasury daily par yield curve (home.treasury.gov XML, keyless).
// Returns the latest curve plus two lookback snapshots (~1 month, start of
// year) and the headline spreads. Published once per business day ~3:30pm ET,
// so a multi-hour revalidate is honest.
//
// This is the authoritative curve — 13 maturities vs the 4 yield indices
// Yahoo carries — and the source of record for the 2s10s spread.

export const dynamic = 'force-dynamic'

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

export interface YieldCurveResponse {
  ok: boolean
  latest?: CurveSnapshot
  monthAgo?: CurveSnapshot
  yearStart?: CurveSnapshot
  /** 10Y minus 2Y, percentage points — the classic recession signal. */
  spread2s10s?: number
  /** 10Y minus 3M, the Fed's preferred version. */
  spread3m10y?: number
  shape?: 'normal' | 'flat' | 'inverted'
  source?: 'treasury-gov'
  error?: string
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

export async function GET(): Promise<NextResponse<YieldCurveResponse>> {
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
    return NextResponse.json({
      ok: true,
      latest,
      monthAgo: monthAgo.date !== latest.date ? monthAgo : undefined,
      yearStart: yearStart.date !== latest.date ? yearStart : undefined,
      spread2s10s,
      spread3m10y,
      shape,
      source: 'treasury-gov',
    })
  } catch (err) {
    recordProviderFetch('treasury-gov', { error: err instanceof Error ? err.message : 'fetch failed' })
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'treasury yield curve unavailable',
    })
  }
}
