import { NextResponse } from 'next/server'
import { CORS, options } from '../../_cors'
import { computeNetworkFees } from '@/lib/data/networkFees'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

// Gas fees for every supported network. Computed from the shared single source
// of truth (lib/data/networkFees), so this public API and the internal
// /live-data/network-fees route always agree. BTC is live (mempool.space); other
// networks are static gas amounts priced at the live token price (source:
// 'estimate'). See DATA-AVAILABILITY.md.
export async function GET() {
  const { fees, priceSource, btcSatPerVbyte, updatedAt } = await computeNetworkFees()

  return NextResponse.json(
    {
      fees,
      btcSatPerVbyte,
      priceSource,
      updatedAt,
      note:
        "feeNative = typical token transfer cost in the network's gas token. " +
        'feeUsd = USD equivalent at the current live price. source=\'live\' means the ' +
        "fee amount itself is real-time; source='estimate' means a static gas amount priced live.",
    },
    { headers: CORS }
  )
}
