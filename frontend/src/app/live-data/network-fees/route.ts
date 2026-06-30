import { NextResponse } from 'next/server'
import type { NetworkFeeMap, CoinPriceMap } from '@/lib/data/transferFees'
import { computeNetworkFees } from '@/lib/data/networkFees'

export const dynamic = 'force-dynamic'

export interface NetworkFeesResponse {
  ok: boolean
  networkFees: NetworkFeeMap
  coinPrices: CoinPriceMap
  btcFeeSource: 'live' | 'estimate'
  updatedAt: string
}

// Network gas fees + the coin prices the transfer calculator needs. Computed
// from the shared single source of truth (lib/data/networkFees) so this route
// and the public /api/v1/network-fees API can never disagree.
export async function GET() {
  const { fees, prices, btcSatPerVbyte, updatedAt } = await computeNetworkFees()

  const coinPrices: CoinPriceMap = { ...prices }
  if (btcSatPerVbyte != null) coinPrices.btcSatPerVbyte = btcSatPerVbyte

  return NextResponse.json({
    ok: true,
    networkFees: fees as NetworkFeeMap,
    coinPrices,
    btcFeeSource: fees.bitcoin?.source ?? 'estimate',
    updatedAt,
  } satisfies NetworkFeesResponse)
}
