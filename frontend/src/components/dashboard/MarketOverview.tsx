'use client'

import { Bell, Database, TrendingUp } from 'lucide-react'
import { MetricCard } from '@/components/ui/MetricCard'
import { useMarketOverview } from '@/hooks/useMarketData'
import { useAlertStats } from '@/hooks/useAlerts'
import { useAssetsWithStore } from '@/hooks/useAssets'
import { formatCompact, formatOrNA } from '@/lib/utils/format'

export function MarketOverview() {
  const { data: overview, isLoading: overviewLoading } = useMarketOverview()
  const { data: alertStats, isLoading: alertsLoading } = useAlertStats()
  const { data: assetsData } = useAssetsWithStore()
  const totalAssets = assetsData?.total ?? overview?.totalAssets ?? null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      <MetricCard
        title="Total Assets Monitored"
        value={totalAssets?.toString() ?? '—'}
        subtitle="Active + Inactive"
        icon={<Database size={16} />}
        accentColor="#3b82f6"
        loading={overviewLoading}
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
        title="Total Market Cap"
        value={overview ? formatOrNA(overview.totalMarketCap, formatCompact) : '—'}
        subtitle="All monitored assets"
        icon={<TrendingUp size={16} />}
        accentColor="#10b981"
        loading={overviewLoading}
      />
    </div>
  )
}
