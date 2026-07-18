'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, KeyRound, Landmark } from 'lucide-react'
import { clsx } from 'clsx'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import { STALE_TIME_LONG } from '@/lib/constants'
import type { MarketCalendarResponse } from '@/app/live-data/market-calendar/route'

// Earnings + US economic calendar for the next two weeks. Data via FMP
// (free key); shows an honest setup notice when no key is configured.

function groupByDate<T extends { date: string }>(rows: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const day = row.date.slice(0, 10)
    map.set(day, [...(map.get(day) ?? []), row])
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function CalendarContent() {
  const { data, isLoading } = useQuery<MarketCalendarResponse>({
    queryKey: ['market-calendar'],
    queryFn: () => fetch('/live-data/market-calendar?days=14').then((r) => r.json()),
    staleTime: STALE_TIME_LONG,
  })

  const catalogEarnings = (data?.earnings ?? []).filter((e) => e.inCatalog)
  const otherEarnings = (data?.earnings ?? []).filter((e) => !e.inCatalog)

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-6 w-6 text-accent-blue" aria-hidden />
        <PageHeader
          title="Market Calendar"
          subtitle="Earnings dates and high-impact US economic events — next 14 days"
          description="Earnings for tracked catalog stocks are listed first, then notable others. Economic events are filtered to medium/high-impact US releases (Fed decisions, CPI, jobs reports)."
          details={[{ label: 'Data source', text: 'Financial Modeling Prep earnings + economic calendars (free API key required).' }]}
        />
      </div>

      {isLoading ? (
        <div className="h-48 animate-shimmer bg-shimmer-gradient bg-[length:200%_100%] rounded-card" />
      ) : !data?.configured ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-8 text-center">
          <KeyRound className="mx-auto h-7 w-7 text-amber-400/70" aria-hidden />
          <p className="mt-2 text-sm font-medium text-slate-200">Calendar needs a (free) FMP API key</p>
          <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Earnings and economic calendars come from Financial Modeling Prep. Grab a free key at
            financialmodelingprep.com, then add it in{' '}
            <a href="/settings" className="text-accent-blue hover:underline">Settings → Integrations → Equity Market Data</a>{' '}
            (Financial Modeling Prep) — or set <code className="font-mono text-slate-300">FMP_API_KEY</code> in{' '}
            <code className="font-mono text-slate-300">frontend/.env.local</code>. The same key upgrades stock quotes suite-wide.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Earnings */}
          <div className="rounded-card border border-border bg-bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-medium text-text-secondary">Earnings — tracked stocks first</h2>
            </div>
            <div className="max-h-[62vh] overflow-y-auto divide-y divide-border/60">
              {catalogEarnings.length === 0 && otherEarnings.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-text-muted">No earnings in the next two weeks.</p>
              )}
              {groupByDate([...catalogEarnings, ...otherEarnings]).map(([day, rows]) => (
                <div key={day}>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">{dayLabel(day)}</p>
                  {rows.map((e, i) => (
                    <div key={`${e.symbol}-${i}`} className="px-4 py-2 flex items-center gap-3 text-sm">
                      {e.inCatalog ? (
                        <Link href={`/equities/${e.symbol.toLowerCase()}`} className="font-mono font-semibold text-accent-blue hover:underline w-16 truncate">{e.symbol}</Link>
                      ) : (
                        <span className="font-mono text-text-secondary w-16 truncate">{e.symbol}</span>
                      )}
                      <span className="flex-1 text-xs text-text-muted truncate">{e.name}</span>
                      {e.epsEstimate != null && (
                        <span className="text-[11px] font-mono text-text-muted">est. EPS {e.epsEstimate.toFixed(2)}</span>
                      )}
                      {e.time && <span className="text-[10px] text-text-muted uppercase">{e.time}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Economic events */}
          <div className="rounded-card border border-border bg-bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Landmark size={14} className="text-text-muted" aria-hidden />
              <h2 className="text-sm font-medium text-text-secondary">US Economic Events — medium/high impact</h2>
            </div>
            <div className="max-h-[62vh] overflow-y-auto divide-y divide-border/60">
              {(data?.economic ?? []).length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-text-muted">No notable events returned.</p>
              )}
              {groupByDate(data?.economic ?? []).map(([day, rows]) => (
                <div key={day}>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">{dayLabel(day)}</p>
                  {rows.map((ev, i) => (
                    <div key={`${ev.event}-${i}`} className="px-4 py-2 flex items-center gap-3 text-sm">
                      <span className="flex-1 text-text-secondary text-xs">{ev.event}</span>
                      {ev.impact && (
                        <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize',
                          ev.impact.toLowerCase() === 'high'
                            ? 'text-red-400 bg-red-400/10 border-red-500/20'
                            : 'text-amber-400 bg-amber-400/10 border-amber-500/20')}>
                          {ev.impact}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MarketCalendarPage() {
  return (
    <ModuleGate module="equities">
      <CalendarContent />
    </ModuleGate>
  )
}
