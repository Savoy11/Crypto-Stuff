export interface RiskBandConfig {
  label: string
  color: string
  bgColor: string
  textColor: string
  borderColor: string
  min: number
  max: number
}

// RiskLeaderboardEntry / RiskDistribution / RiskTrend / RiskSummary were
// removed in the M8 sweep. They typed the legacy backend's risk-summary and
// leaderboard endpoints, whose api methods were unreachable behind `LIVE_DATA`
// and whose hooks had no consumers. The live risk surfaces (/risk-scores and
// the coin detail page) type their own shapes off /live-data/risk-scores.
