import { NextResponse } from 'next/server'
import { CORS, options } from '../../../_cors'
import { fetchTreasuryYieldCurve, type CurveSnapshot } from '@/lib/server/treasuryCurve'

// Public agent API — the official US Treasury daily par yield curve
// (13 maturities, treasury.gov, keyless) with headline spreads and shape.
// Same fetch the Macro module's curve chart reads (lib/server/treasuryCurve).

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

export interface V1YieldCurveResponse {
  latest: CurveSnapshot
  monthAgo?: CurveSnapshot
  yearStart?: CurveSnapshot
  /** 10Y minus 2Y, percentage points — the classic recession signal. */
  spread2s10s?: number
  /** 10Y minus 3M, the Fed's preferred version. */
  spread3m10y?: number
  shape?: 'normal' | 'flat' | 'inverted'
  source: 'treasury-gov'
  updatedAt: string
}

export async function GET() {
  try {
    const curve = await fetchTreasuryYieldCurve()
    return NextResponse.json({
      latest: curve.latest,
      monthAgo: curve.monthAgo.date !== curve.latest.date ? curve.monthAgo : undefined,
      yearStart: curve.yearStart.date !== curve.latest.date ? curve.yearStart : undefined,
      spread2s10s: curve.spread2s10s,
      spread3m10y: curve.spread3m10y,
      shape: curve.shape,
      source: 'treasury-gov',
      updatedAt: new Date().toISOString(),
    } satisfies V1YieldCurveResponse, { headers: CORS })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'treasury yield curve unavailable' },
      { status: 502, headers: CORS },
    )
  }
}
