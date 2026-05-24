'use client'

import { Shield, Bell, Database, AlertTriangle } from 'lucide-react'
import { MetricCard } from '@/components/ui/MetricCard'
import { useMarketOverview } from '@/hooks/useMarketData'
import { useAlertStats } from '@/hooks/useAlerts'
import { formatCompact, formatScore } from '@/lib/utils/format'
import { getScoreColor } from '@/lib/utils/risk'

export function MarketOverview() {
  const { data: overview, isLoading: overviewLoading } = useMarketOverview()
  const { data: alertStats, isLoading: alertsLoading } = useAlertStats()

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Total Assets Monitored"
        value={overview?.totalAssets?.toString() ?? '—'}
        subtitle="Active + Inactive"
        icon={<Database size={16} />}
        accentColor="#3b82f6"
        loading={overviewLoading}
      />

      <MetricCard
        title="Average Risk Score"
        value={
          overview ? (
            <span style={{ color: getScoreColor(overview.avgRiskScore) }}>
              {formatScore(overview.avgRiskScore)}
            </span>
          ) : '—'
        }
        subtitle="Portfolio composite"
        icon={<Shield size={16} />}
        accentColor={overview ? getScoreColor(overview.avgRiskScore) : '#3b82f6'}
        loading={overviewLoading}
        footer={
          overview && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-bg-elevated overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${overview.avgRiskScore}%`,
                    backgroundColor: getScoreColor(overview.avgRiskScore),
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-text-muted">
                {overview.avgRiskScore.toFixed(1)}/100
              </span>
            </div>
          )
        }
      />

      <MetricCard
        title="Active Alerts"
        value={alertStats?.unread?.toString() ?? '—'}
        subtitle={
          alertStats
            ? `${alertStats.critical} critical · ${alertStats.high} high`
            : 'Loading...'
        }
        icon={<Bell size={16} />}
        accentColor={
          alertStats && alertStats.critical > 0
            ? '#ef4444'
            : alertStats && alertStats.high > 0
            ? '#f97316'
            : '#f59e0b'
        }
        loading={alertsLoading}
        footer={
          alertStats && (
            <div className="flex items-center gap-2 flex-wrap">
              {alertStats.critical > 0 && (
                <span className="text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">
                  {alertStats.critical} CRIT
                </span>
              )}
              {alertStats.high > 0 && (
                <span className="text-[10px] font-mono bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded">
                  {alertStats.high} HIGH
                </span>
              )}
              {alertStats.medium > 0 && (
                <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                  {alertStats.medium} MED
                </span>
              )}
            </div>
          )
        }
      />

      <MetricCard
        title="High / Critical Risk"
        value={overview?.criticalHighCount?.toString() ?? '—'}
        subtitle="Assets requiring review"
        icon={<AlertTriangle size={16} />}
        accentColor={overview && overview.criticalHighCount > 0 ? '#ef4444' : '#10b981'}
        loading={overviewLoading}
        footer={
          overview && (
            <div className="text-[10px] text-text-muted">
              Total market: <span className="font-mono text-text-secondary">{formatCompact(overview.totalMarketCap)}</span>
            </div>
          )
        }
      />
    </div>
  )
}
