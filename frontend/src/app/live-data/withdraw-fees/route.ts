// Live exchange withdrawal fees (S3 Tier-1 overlay).
//
// The fetch/parse/build logic lives in lib/server/withdrawFeeOverlay.ts because
// /api/v1/transfer/routes needs the identical overlay — see that file's header
// for the sourcing rules (keyless only, overlay-only, per-source degradation).
// This handler is the UI's transport for it.

import { NextResponse } from 'next/server'
import { fetchLiveFeeOverlay, type LiveFeeOverlay } from '@/lib/server/withdrawFeeOverlay'

export const dynamic = 'force-dynamic'

export type WithdrawFeesResponse = LiveFeeOverlay

export async function GET() {
  const overlay = await fetchLiveFeeOverlay()
  return NextResponse.json(overlay)
}
