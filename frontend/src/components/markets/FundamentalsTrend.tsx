'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp } from 'lucide-react'
import { BarChart } from '@/components/charts/BarChart'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'
import { STALE_TIME_LONG } from '@/lib/constants'
import { formatCompact } from '@/lib/utils/format'
import type { CompanyFactsResponse } from '@/app/live-data/company-facts/route'

// Annual revenue & net income history from SEC EDGAR XBRL filings.
// Shares the ['company-facts', symbol] query with FinancialRatios, so the two
// sections cost one fetch between them.

export function FundamentalsTrend({ symbol }: { symbol: string }) {
  const { data, isLoading } = useQuery<CompanyFactsResponse>({
    queryKey: ['company-facts', symbol],
    queryFn: async () => {
      const r = await fetch(`/live-data/company-facts?symbol=${encodeURIComponent(symbol)}`)
      const j: CompanyFactsResponse = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      return j
    },
    staleTime: STALE_TIME_LONG * 6,
  })

  const points = (data?.annualSeries ?? [])
    .slice()
    .reverse() // oldest → newest for the x-axis
    .map(p => ({
      fy: p.fiscalYearEnd.slice(0, 4),
      revenue: p.revenue,
      netIncome: p.netIncome,
    }))

  if (!isLoading && points.length < 2) return null // nothing meaningful to plot

  return (
    <div className="rounded-card border border-border bg-bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-text-secondary flex items-center gap-2">
          <TrendingUp size={14} className="text-text-muted" aria-hidden />
          Revenue & Earnings History
        </h2>
        <span className="text-[11px] text-text-muted">annual · SEC EDGAR</span>
      </div>

      {isLoading ? (
        <LoadingSkeleton className="h-56 w-full" />
      ) : (
        <BarChart
          data={points}
          series={[
            { key: 'revenue',   label: 'Revenue',    color: '#3b82f6' },
            { key: 'netIncome', label: 'Net Income', color: '#10b981' },
          ]}
          xKey="fy"
          yFormatter={(v) => formatCompact(Number(v))}
          tooltipFormatter={(v, name) => [formatCompact(Number(v)), name]}
          height={230}
          showLegend
        />
      )}
    </div>
  )
}
