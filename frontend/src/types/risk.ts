import type { RiskBand } from './asset'

export interface RiskBandConfig {
  label: string
  color: string
  bgColor: string
  textColor: string
  borderColor: string
  min: number
  max: number
}

export interface RiskLeaderboardEntry {
  assetId: string
  symbol: string
  name: string
  assetType: string
  riskScore: number
  riskBand: RiskBand
  previousRisk: number | null
  rankChange: number | null
  rank: number
  scoreDate: string
}

export interface RiskDistribution {
  band: RiskBand
  count: number
  percentage: number
  totalMarketCap: number
}

export interface RiskTrend {
  date: string
  avgScore: number
  criticalCount: number
  highCount: number
  elevatedCount: number
  moderateCount: number
  lowCount: number
}

export interface RiskSummary {
  totalAssets: number
  avgScore: number
  distribution: RiskDistribution[]
  trends: RiskTrend[]
  lastUpdated: string
}
