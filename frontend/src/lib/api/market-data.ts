import apiClient from './client'
import type { MarketData, PegDataPoint } from '@/types/asset'
import type { TimeRange } from '@/types/api'
import { USE_MOCK, LIVE_DATA } from '@/lib/constants'
import { getMockMarketData, getMockPegHistory } from './mock/mockAssets'
import { fetchLiveMarkets } from './live/liveClient'
import { buildLiveMarketData } from './live/overlay'

export const marketDataApi = {
  getMarketOverview: async (): Promise<{
    totalAssets: number
    avgRiskScore: number | null
    activeAlerts: number | null
    criticalHighCount: number | null
    totalMarketCap: number | null
    totalVolume24h: number | null
  }> => {
    if (LIVE_DATA) {
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
    }
    if (USE_MOCK) {
      return {
        totalAssets: 10,
        avgRiskScore: 68.4,
        activeAlerts: 7,
        criticalHighCount: 2,
        totalMarketCap: 163_500_000_000,
        totalVolume24h: 48_200_000_000,
      }
    }
    const { data } = await apiClient.get('/market-data/overview')
    return data
  },

  getAssetMarketData: async (assetId: string): Promise<MarketData> => {
    if (LIVE_DATA) {
      const { quotes } = await fetchLiveMarkets()
      return buildLiveMarketData(assetId, quotes[assetId])
    }
    if (USE_MOCK) return getMockMarketData(assetId)
    const { data } = await apiClient.get<MarketData>(`/market-data/${assetId}`)
    return data
  },

  getPegHistory: async (assetId: string, timeRange: TimeRange = '7d'): Promise<PegDataPoint[]> => {
    // Peg deviation history is derived — no free live source. Strict N/A.
    if (LIVE_DATA) return []
    if (USE_MOCK) return getMockPegHistory(assetId, timeRange)
    const { data } = await apiClient.get<PegDataPoint[]>(`/market-data/${assetId}/peg-history`, {
      params: { timeRange },
    })
    return data
  },

  getMultiAssetPegHistory: async (assetIds: string[], timeRange: TimeRange = '7d'): Promise<Record<string, PegDataPoint[]>> => {
    if (LIVE_DATA) {
      const result: Record<string, PegDataPoint[]> = {}
      for (const id of assetIds) result[id] = []
      return result
    }
    if (USE_MOCK) {
      const result: Record<string, PegDataPoint[]> = {}
      for (const id of assetIds) {
        result[id] = await getMockPegHistory(id, timeRange)
      }
      return result
    }
    const { data } = await apiClient.get<Record<string, PegDataPoint[]>>('/market-data/peg-history/multi', {
      params: { assetIds: assetIds.join(','), timeRange },
    })
    return data
  },
}
