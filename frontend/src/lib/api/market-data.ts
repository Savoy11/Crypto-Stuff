import apiClient from './client'
import type { MarketData, PegDataPoint } from '@/types/asset'
import type { TimeRange } from '@/types/api'
import { USE_MOCK } from '@/lib/constants'
import { getMockMarketData, getMockPegHistory } from './mock/mockAssets'

export const marketDataApi = {
  getMarketOverview: async (): Promise<{
    totalAssets: number
    avgRiskScore: number
    activeAlerts: number
    criticalHighCount: number
    totalMarketCap: number
    totalVolume24h: number
  }> => {
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
    if (USE_MOCK) return getMockMarketData(assetId)
    const { data } = await apiClient.get<MarketData>(`/market-data/${assetId}`)
    return data
  },

  getPegHistory: async (assetId: string, timeRange: TimeRange = '7d'): Promise<PegDataPoint[]> => {
    if (USE_MOCK) return getMockPegHistory(assetId, timeRange)
    const { data } = await apiClient.get<PegDataPoint[]>(`/market-data/${assetId}/peg-history`, {
      params: { timeRange },
    })
    return data
  },

  getMultiAssetPegHistory: async (assetIds: string[], timeRange: TimeRange = '7d'): Promise<Record<string, PegDataPoint[]>> => {
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
