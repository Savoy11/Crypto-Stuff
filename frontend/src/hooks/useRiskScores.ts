import { useQuery } from '@tanstack/react-query'
import { riskScoresApi } from '@/lib/api/risk-scores'
import type { TimeRange } from '@/types/api'
import { STALE_TIME_MEDIUM, GC_TIME } from '@/lib/constants'

// useRiskSummary / useRiskLeaderboard / useLatestRiskScore were removed in the
// M8 sweep — no consumers, and the api methods behind them were unreachable
// legacy-backend calls. See lib/api/risk-scores.ts.
export const RISK_KEYS = {
  all: ['risk-scores'] as const,
  assetScores: (assetId: string, timeRange: TimeRange) => [...RISK_KEYS.all, 'asset', assetId, timeRange] as const,
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
