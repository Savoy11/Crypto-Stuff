import apiClient from './client'
import type { RiskScore } from '@/types/asset'
import type { RiskSummary, RiskLeaderboardEntry } from '@/types/risk'
import type { PaginatedResponse, TimeRange } from '@/types/api'
import { LIVE_DATA } from '@/lib/constants'

// Composite risk scoring is a derived analytic with no free real-time source.
// In strict live mode it is reported as empty (the UI shows an explicit
// "not available" notice) rather than falling back to mock scores.
const EMPTY_RISK_SUMMARY: RiskSummary = {
  totalAssets: 0,
  avgScore: 0,
  distribution: [],
  trends: [],
  lastUpdated: new Date(0).toISOString(),
}

const EMPTY_LEADERBOARD: PaginatedResponse<RiskLeaderboardEntry> = {
  data: [],
  total: 0,
  page: 1,
  pageSize: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
}

export const riskScoresApi = {
  getSummary: async (): Promise<RiskSummary> => {
    if (LIVE_DATA) return EMPTY_RISK_SUMMARY
    const { data } = await apiClient.get<RiskSummary>('/risk-scores/summary')
    return data
  },

  getLeaderboard: async (params: { page?: number; pageSize?: number } = {}): Promise<PaginatedResponse<RiskLeaderboardEntry>> => {
    if (LIVE_DATA) return EMPTY_LEADERBOARD
    const { data } = await apiClient.get<PaginatedResponse<RiskLeaderboardEntry>>('/risk-scores/leaderboard', { params })
    return data
  },

  getAssetScores: async (assetId: string, timeRange: TimeRange = '30d'): Promise<RiskScore[]> => {
    if (LIVE_DATA) return []
    const { data } = await apiClient.get<RiskScore[]>(`/risk-scores/${assetId}`, { params: { timeRange } })
    return data
  },

  getLatestScore: async (assetId: string): Promise<RiskScore | null> => {
    if (LIVE_DATA) return null
    const { data } = await apiClient.get<RiskScore>(`/risk-scores/${assetId}/latest`)
    return data
  },
}
