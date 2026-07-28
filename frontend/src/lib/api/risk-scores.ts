import type { RiskScore } from '@/types/asset'
import type { TimeRange } from '@/types/api'

// Per-asset composite risk *history* is a derived analytic with no free
// real-time source, so this reads as empty and the chart shows an explicit
// "not available" notice rather than mock scores. (The live composites the
// app does surface come from /live-data/risk-scores via lib/risk.)
//
// getSummary / getLeaderboard / getLatestScore were removed in the M8 sweep:
// their legacy-backend paths sat behind `if (LIVE_DATA)` early returns —
// unreachable, since `LIVE_DATA` is a hardcoded `true` — and their hooks
// (useRiskSummary, useRiskLeaderboard, useLatestRiskScore) had no consumers.
export const riskScoresApi = {
  getAssetScores: async (_assetId: string, _timeRange: TimeRange = '30d'): Promise<RiskScore[]> => [],
}
