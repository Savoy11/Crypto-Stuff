import { fetchLiveMarkets } from './live/liveClient'

// The legacy backend fallbacks in this module sat behind `if (LIVE_DATA)`
// early returns, and `LIVE_DATA` is a hardcoded `true` (lib/constants.ts) —
// the M8 sweep removed them along with the axios client they called.
//
// getAssetMarketData / getPegHistory / getMultiAssetPegHistory went too: their
// hooks (useAssetMarketData, usePegHistory, useMultiAssetPegHistory) lost
// their last consumers when the orphaned dashboard widgets were deleted, and
// the two peg readers returned nothing but empties in live mode anyway. The
// coin detail page sources its peg history from the live analytics bundle.
export const marketDataApi = {
  getMarketOverview: async (): Promise<{
    totalAssets: number
    avgRiskScore: number | null
    activeAlerts: number | null
    criticalHighCount: number | null
    totalMarketCap: number | null
    totalVolume24h: number | null
  }> => {
    const { quotes } = await fetchLiveMarkets()
    const values = Object.values(quotes)
    const totalMarketCap = values.reduce((sum, q) => sum + (q.marketCap ?? 0), 0)
    const totalVolume24h = values.reduce((sum, q) => sum + (q.volume24h ?? 0), 0)
    return {
      totalAssets: values.length,
      // Derived metrics have no free live source — strict N/A.
      avgRiskScore: null,
      activeAlerts: null,
      criticalHighCount: null,
      totalMarketCap: totalMarketCap || null,
      totalVolume24h: totalVolume24h || null,
    }
  },
}
