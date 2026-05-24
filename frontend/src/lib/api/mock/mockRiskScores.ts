import type { RiskScore } from '@/types/asset'
import type { RiskSummary, RiskLeaderboardEntry } from '@/types/risk'
import type { PaginatedResponse, TimeRange } from '@/types/api'
import { MOCK_ASSETS } from './mockAssets'
import { subDays, format } from 'date-fns'

export async function getMockRiskScores(assetId: string, timeRange: TimeRange): Promise<RiskScore[]> {
  const asset = MOCK_ASSETS.find((a) => a.id === assetId) ?? MOCK_ASSETS[0]
  const days: Record<TimeRange, number> = {
    '1h': 0.04,
    '24h': 1,
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365,
  }
  const numDays = days[timeRange] ?? 30
  const count = Math.min(90, Math.max(1, Math.round(numDays)))

  return Array.from({ length: count }, (_, i) => {
    const score = Math.min(100, Math.max(0, asset.riskScore + (Math.random() - 0.5) * 10))
    const prev = i === 0 ? null : Math.min(100, Math.max(0, asset.riskScore + (Math.random() - 0.5) * 10))
    return {
      id: `rs-${asset.id}-${i}`,
      assetId: asset.id,
      overallScore: score,
      reserveScore: Math.min(100, score * 0.95 + 2),
      pegScore: Math.min(100, score + 1),
      networkScore: Math.min(100, score * 0.98),
      securityScore: Math.min(100, score * 1.01),
      riskBand: asset.riskBand,
      confidence: 0.82 + Math.random() * 0.15,
      percentileRank: Math.round(score * 0.9),
      scoreBreakdown: {
        reserveScore: Math.min(100, score * 0.95 + 2),
        reserveWeight: 35,
        pegScore: Math.min(100, score + 1),
        pegWeight: 30,
        networkScore: Math.min(100, score * 0.98),
        networkWeight: 20,
        securityScore: Math.min(100, score * 1.01),
        securityWeight: 15,
      },
      scoreDate: subDays(new Date(), count - i).toISOString(),
      previousScore: prev,
      scoreDelta: prev !== null ? score - prev : null,
    }
  })
}

export async function getMockRiskSummary(): Promise<RiskSummary> {
  const distribution = [
    { band: 'low' as const, count: 3, percentage: 30, totalMarketCap: 43_683_000_000 },
    { band: 'moderate' as const, count: 4, percentage: 40, totalMarketCap: 116_050_000_000 },
    { band: 'elevated' as const, count: 1, percentage: 10, totalMarketCap: 650_000_000 },
    { band: 'high' as const, count: 1, percentage: 10, totalMarketCap: 230_000_000 },
    { band: 'critical' as const, count: 1, percentage: 10, totalMarketCap: 2_100_000 },
  ]

  return {
    totalAssets: 10,
    avgScore: 68.4,
    distribution,
    trends: Array.from({ length: 30 }, (_, i) => ({
      date: format(subDays(new Date(), 30 - i), 'yyyy-MM-dd'),
      avgScore: 65 + Math.sin(i / 5) * 5 + Math.random() * 3,
      criticalCount: 1,
      highCount: 1,
      elevatedCount: 1,
      moderateCount: 4,
      lowCount: 3,
    })),
    lastUpdated: new Date().toISOString(),
  }
}

export async function getMockLeaderboard(
  params: { page?: number; pageSize?: number } = {}
): Promise<PaginatedResponse<RiskLeaderboardEntry>> {
  const sorted = [...MOCK_ASSETS].sort((a, b) => b.riskScore - a.riskScore)
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25
  const start = (page - 1) * pageSize

  const entries: RiskLeaderboardEntry[] = sorted.map((asset, i) => {
    const score = asset.riskScore
    return {
      assetId: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      assetName: asset.name,
      assetType: asset.assetType,
      riskScore: score,
      overallScore: score,
      reserveScore: Math.min(100, score * 0.95 + 2),
      pegScore: Math.min(100, score + 1),
      networkScore: Math.min(100, score * 0.98),
      securityScore: Math.min(100, score * 1.01),
      riskBand: asset.riskBand,
      previousRisk: score - (Math.random() * 4 - 2),
      rankChange: Math.round(Math.random() * 2 - 1),
      rank: i + 1,
      scoreDate: new Date().toISOString(),
    }
  })

  const paginated = entries.slice(start, start + pageSize)

  return {
    data: paginated,
    total: entries.length,
    page,
    pageSize,
    totalPages: Math.ceil(entries.length / pageSize),
    hasNext: start + pageSize < entries.length,
    hasPrev: page > 1,
  }
}
