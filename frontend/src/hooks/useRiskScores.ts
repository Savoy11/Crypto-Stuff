import { useQuery } from '@tanstack/react-query'
import { riskScoresApi } from '@/lib/api/risk-scores'
import type { TimeRange } from '@/types/api'
import { STALE_TIME_SHORT, STALE_TIME_MEDIUM, STALE_TIME_LONG, GC_TIME } from '@/lib/constants'

export const RISK_KEYS = {
  all: ['risk-scores'] as const,
  summary: () => [...RISK_KEYS.all, 'summary'] as const,
  leaderboard: (params: { page?: number; pageSize?: number }) => [...RISK_KEYS.all, 'leaderboard', params] as const,
  assetScores: (assetId: string, timeRange: TimeRange) => [...RISK_KEYS.all, 'asset', assetId, timeRange] as const,
  latestScore: (assetId: string) => [...RISK_KEYS.all, 'latest', assetId] as const,
}

export function useRiskSummary() {
  return useQuery({
    queryKey: RISK_KEYS.summary(),
    queryFn: () => riskScoresApi.getSummary(),
    staleTime: STALE_TIME_MEDIUM,
    gcTime: GC_TIME,
    refetchInterval: 60_000,
  })
}

export function useRiskLeaderboard(params: { page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: RISK_KEYS.leaderboard(params),
    queryFn: () => riskScoresApi.getLeaderboard(params),
    staleTime: STALE_TIME_MEDIUM,
    gcTime: GC_TIME,
    placeholderData: (prev) => prev,
  })
}

export function useAssetRiskScores(assetId: string, timeRange: TimeRange = '30d') {
  return useQuery({
    queryKey: RISK_KEYS.assetScores(assetId, timeRange),
    queryFn: () => riskScoresApi.getAssetScores(assetId, timeRange),
    staleTime: STALE_TIME_MEDIUM,
    gcTime: GC_TIME,
    enabled: !!assetId,
  })
}

export function useLatestRiskScore(assetId: string) {
  return useQuery({
    queryKey: RISK_KEYS.latestScore(assetId),
    queryFn: () => riskScoresApi.getLatestScore(assetId),
    staleTime: STALE_TIME_SHORT,
    gcTime: GC_TIME,
    enabled: !!assetId,
    refetchInterval: 30_000,
  })
}
