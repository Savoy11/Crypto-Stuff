import type { Metadata } from 'next'
import { MarketOverview } from '@/components/dashboard/MarketOverview'
import { RiskHeatmap } from '@/components/dashboard/RiskHeatmap'
import { PegStabilityChart } from '@/components/dashboard/PegStabilityChart'
import { LiquidityMonitor } from '@/components/dashboard/LiquidityMonitor'
import { RecentAlerts } from '@/components/dashboard/RecentAlerts'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage() {
  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-bold text-text-primary">Portfolio Overview</h1>
        <p className="text-sm text-text-muted mt-0.5">Real-time risk intelligence across monitored assets</p>
      </div>

      {/* KPI cards */}
      <ErrorBoundary>
        <MarketOverview />
      </ErrorBoundary>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Heatmap — 2 cols */}
        <div className="lg:col-span-2">
          <ErrorBoundary>
            <RiskHeatmap />
          </ErrorBoundary>
        </div>

        {/* Recent alerts — 1 col */}
        <div>
          <ErrorBoundary>
            <RecentAlerts />
          </ErrorBoundary>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Peg chart — 2 cols */}
        <div className="lg:col-span-2">
          <ErrorBoundary>
            <PegStabilityChart />
          </ErrorBoundary>
        </div>

        {/* Liquidity — 1 col */}
        <div>
          <ErrorBoundary>
            <LiquidityMonitor />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
