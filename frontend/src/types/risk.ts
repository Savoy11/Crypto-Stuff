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
// and whose hooks had no consumers. The per-coin risk surfaces that replaced
// them were themselves removed on 2026-08-29 (RP-6). What remains here is
// RiskBandConfig, which lib/risk/presentation.ts still uses for the risk
// surfaces that were separately decided and kept — the options Trade Risk
// Scorer, staking-provider risk, and the macro/equity profiles.
