import apiClient from './client'
import type { RiskScore } from '@/types/asset'
import type { RiskSummary, RiskLeaderboardEntry } from '@/types/risk'
import type { PaginatedResponse, TimeRange } from '@/types/api'
import { USE_MOCK } from '@/lib/constants'
import { getMockRiskScores, getMockRiskSummary, getMockLeaderboard } from './mock/mockRiskScores'

export const riskScoresApi = {
  getSummary: async (): Promise<RiskSummary> => {
    if (USE_MOCK) return getMockRiskSummary()
    const { data } = await apiClient.get<RiskSummary>('/risk-scores/summary')
    return data
  },

  getLeaderboard: async (params: { page?: number; pageSize?: number } = {}): Promise<PaginatedResponse<RiskLeaderboardEntry>> => {
    if (USE_MOCK) return getMockLeaderboard(params)
    const { data } = await apiClient.get<PaginatedResponse<RiskLeaderboardEntry>>('/risk-scores/leaderboard', { params })
    return data
  },

  getAssetScores: async (assetId: string, timeRange: TimeRange = '30d'): Promise<RiskScore[]> => {
    if (USE_MOCK) return getMockRiskScores(assetId, timeRange)
    const { data } = await apiClient.get<RiskScore[]>(`/risk-scores/${assetId}`, { params: { timeRange } })
    return data
  },

  getLatestScore: async (assetId: string): Promise<RiskScore> => {
    if (USE_MOCK) {
      const scores = await getMockRiskScores(assetId, '7d')
      return scores[scores.length - 1]
    }
    const { data } = await apiClient.get<RiskScore>(`/risk-scores/${assetId}/latest`)
    return data
  },
}
