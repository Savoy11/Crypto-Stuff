import { NextResponse } from 'next/server'
import { fetchTreasuryYieldCurve, type CurveSnapshot } from '@/lib/server/treasuryCurve'

// Official US Treasury daily par yield curve (home.treasury.gov XML, keyless).
// Returns the latest curve plus two lookback snapshots (~1 month, start of
// year) and the headline spreads. Published once per business day ~3:30pm ET,
// so a multi-hour revalidate is honest.
//
// This is the authoritative curve — 13 maturities vs the 4 yield indices
// Yahoo carries — and the source of record for the 2s10s spread.
//
// Fetch + parse live in lib/server/treasuryCurve.ts, shared with the public
// /api/v1/macro/yield-curve route (one source of truth). Types are re-exported
// here so client consumers keep importing from the route.

export const dynamic = 'force-dynamic'

export type { CurvePoint, CurveSnapshot } from '@/lib/server/treasuryCurve'

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

export async function GET(): Promise<NextResponse<YieldCurveResponse>> {
  try {
    const curve = await fetchTreasuryYieldCurve()
    return NextResponse.json({
      ok: true,
      latest: curve.latest,
      monthAgo: curve.monthAgo.date !== curve.latest.date ? curve.monthAgo : undefined,
      yearStart: curve.yearStart.date !== curve.latest.date ? curve.yearStart : undefined,
      spread2s10s: curve.spread2s10s,
      spread3m10y: curve.spread3m10y,
      shape: curve.shape,
      source: 'treasury-gov',
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'treasury yield curve unavailable',
    })
  }
}
