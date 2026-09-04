'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, KeyRound, Landmark } from 'lucide-react'
import { clsx } from 'clsx'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { STALE_TIME_LONG } from '@/lib/constants'
import type { EarningsEvent, EconomicEvent, MarketCalendarResponse } from '@/app/live-data/market-calendar/route'
import { IpoCalendarSection } from './IpoCalendarSection'

// W3-6 (2026-08-20): "the calendar should look more like a calendar and allow
// users to flip through the months." The list view became a month GRID with
// prev/next navigation; a day's events expand below the grid when clicked.
// Range is bounded to ±12 months (the route clamps too) — FMP serves far dates
// thinly, and an honest empty month beats an unbounded pager into nothing.

const MONTH_SPAN = 12

interface MonthRef { year: number; month: number } // month 0-11

function monthKey(m: MonthRef): string {
  return `${m.year}-${String(m.month + 1).padStart(2, '0')}`
}

function monthLabel(m: MonthRef): string {
  return new Date(Date.UTC(m.year, m.month, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function shiftMonth(m: MonthRef, by: number): MonthRef {
  const d = new Date(Date.UTC(m.year, m.month + by, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() }
}

function monthOffsetFromNow(m: MonthRef): number {
  const now = new Date()
  return (m.year - now.getFullYear()) * 12 + (m.month - now.getMonth())
}

/**
 * The grid's cells: leading blanks so day 1 lands under its weekday, then every
 * day of the month. Weeks start Sunday, matching every US market calendar.
 */
function monthCells(m: MonthRef): Array<string | null> {
  const first = new Date(Date.UTC(m.year, m.month, 1))
  const daysInMonth = new Date(Date.UTC(m.year, m.month + 1, 0)).getUTCDate()
  const cells: Array<string | null> = Array.from({ length: first.getUTCDay() }, () => null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${m.year}-${String(m.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return cells
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function CalendarContent() {
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [month, setMonth] = useState<MonthRef>({ year: today.getFullYear(), month: today.getMonth() })
  const [selectedDay, setSelectedDay] = useState<string | null>(todayIso)

  const { data, isLoading, isFetching } = useQuery<MarketCalendarResponse>({
    queryKey: ['market-calendar', monthKey(month)],
    queryFn: () => fetch(`/live-data/market-calendar?month=${monthKey(month)}`).then((r) => r.json()),
    staleTime: STALE_TIME_LONG,
    // Keep the previous month's grid visible while the next one loads — a
    // flash to empty on every arrow press reads as data loss.
    placeholderData: (prev) => prev,
  })

  const { earningsByDay, econByDay } = useMemo(() => {
    const e = new Map<string, EarningsEvent[]>()
    for (const row of data?.earnings ?? []) {
      const day = row.date.slice(0, 10)
      e.set(day, [...(e.get(day) ?? []), row])
    }
    const c = new Map<string, EconomicEvent[]>()
    for (const row of data?.economic ?? []) {
      const day = row.date.slice(0, 10)
      c.set(day, [...(c.get(day) ?? []), row])
    }
    return { earningsByDay: e, econByDay: c }
  }, [data])

  const cells = useMemo(() => monthCells(month), [month])
  const offset = monthOffsetFromNow(month)
  const selEarnings = selectedDay ? earningsByDay.get(selectedDay) ?? [] : []
  const selEcon = selectedDay ? econByDay.get(selectedDay) ?? [] : []

  return (
    <div className="space-y-5 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-6 w-6 text-accent-blue" aria-hidden />
        <PageHeader
          title="Market Calendar"
          subtitle="Earnings, IPOs, and high-impact US economic events"
          description="A month grid of earnings dates for tracked and notable stocks, plus medium/high-impact US economic releases. Click a day for its full list; flip months with the arrows."
          details={[{ label: 'Data source', text: 'Financial Modeling Prep. Earnings works on a free key; the economic-events calendar is a paid FMP endpoint and stays empty on the free tier.' }]}
        />
      </div>

      <SourceLine id="market-calendar" />

      {/* Outside the FMP gate on purpose — IPOs come from Alpha Vantage, so
          someone with that key but no FMP key still sees them. */}
      <IpoCalendarSection />

      {isLoading ? (
        <div className="h-96 animate-shimmer bg-shimmer-gradient bg-[length:200%_100%] rounded-card" />
      ) : !data?.configured ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-8 text-center">
          <KeyRound className="mx-auto h-7 w-7 text-amber-400/70" aria-hidden />
          <p className="mt-2 text-sm font-medium text-slate-200">Calendar needs a (free) FMP API key</p>
          <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Earnings and economic calendars come from Financial Modeling Prep. Grab a free key at
            financialmodelingprep.com, then add it in{' '}
            <Link href="/settings" className="text-accent-blue hover:underline">Settings → Integrations → Equity Market Data</Link>{' '}
            (Financial Modeling Prep) — or set <code className="font-mono text-slate-300">FMP_API_KEY</code> in{' '}
            <code className="font-mono text-slate-300">frontend/.env.local</code>. The same key upgrades stock quotes suite-wide.
          </p>
        </div>
      ) : (
        <>
          {/* Month navigation */}
          <div className="flex items-center justify-between rounded-card border border-border bg-bg-card px-4 py-2.5">
            <button
              onClick={() => { setMonth((m) => shiftMonth(m, -1)); setSelectedDay(null) }}
              disabled={offset <= -MONTH_SPAN}
              aria-label="Previous month"
              className="rounded p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-text-primary">{monthLabel(month)}</h2>
              {offset !== 0 && (
                <button
                  onClick={() => { setMonth({ year: today.getFullYear(), month: today.getMonth() }); setSelectedDay(todayIso) }}
                  className="rounded border border-border px-2 py-0.5 text-[11px] text-text-muted transition-colors hover:text-text-primary"
                >
                  Today
                </button>
              )}
              {isFetching && <span className="text-[11px] text-text-muted">updating…</span>}
            </div>
            <button
              onClick={() => { setMonth((m) => shiftMonth(m, 1)); setSelectedDay(null) }}
              disabled={offset >= MONTH_SPAN}
              aria-label="Next month"
              className="rounded p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Month grid */}
          <div className="overflow-hidden rounded-card border border-border bg-bg-card">
            <div className="grid grid-cols-7 border-b border-border">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-text-muted">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((iso, i) => {
                if (!iso) return <div key={`blank-${i}`} className="min-h-[84px] border-b border-r border-border/40 bg-bg-elevated/20" />
                const dayEarnings = earningsByDay.get(iso) ?? []
                const dayEcon = econByDay.get(iso) ?? []
                const catalogRows = dayEarnings.filter((e) => e.inCatalog)
                const isToday = iso === todayIso
                const isSelected = iso === selectedDay
                const dayNum = Number(iso.slice(8, 10))
                return (
                  <button
                    key={iso}
                    onClick={() => setSelectedDay(isSelected ? null : iso)}
                    className={clsx(
                      'min-h-[84px] border-b border-r border-border/40 p-1.5 text-left align-top transition-colors',
                      isSelected ? 'bg-accent-blue/10' : 'hover:bg-bg-elevated/60',
                    )}
                    aria-pressed={isSelected}
                    aria-label={`${iso}: ${dayEarnings.length} earnings, ${dayEcon.length} economic events`}
                  >
                    <span className={clsx(
                      'inline-flex size-5 items-center justify-center rounded-full text-[11px] font-medium',
                      isToday ? 'bg-accent-blue text-white' : 'text-text-secondary',
                    )}>
                      {dayNum}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {/* Tracked names first, at most three chips per cell —
                          the day panel below carries the full list. */}
                      {catalogRows.slice(0, 3).map((e) => (
                        <span key={e.symbol} className="block truncate rounded bg-accent-blue/15 px-1 py-px font-mono text-[10px] text-accent-blue">
                          {e.symbol}
                        </span>
                      ))}
                      {dayEarnings.length > catalogRows.slice(0, 3).length && (
                        <span className="block px-1 text-[10px] text-text-muted">
                          +{dayEarnings.length - catalogRows.slice(0, 3).length} more
                        </span>
                      )}
                      {dayEcon.length > 0 && (
                        <span className="block truncate px-1 text-[10px] text-amber-400">
                          {dayEcon.length} econ
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected-day detail */}
          {selectedDay && (selEarnings.length > 0 || selEcon.length > 0) && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-card border border-border bg-bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5">
                  <h3 className="text-sm font-medium text-text-secondary">
                    Earnings · {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                  </h3>
                </div>
                <div className="max-h-80 divide-y divide-border/60 overflow-y-auto">
                  {selEarnings.length === 0 && <p className="px-4 py-6 text-center text-sm text-text-muted">No earnings this day.</p>}
                  {selEarnings.map((e, i) => (
                    <div key={`${e.symbol}-${i}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                      {e.inCatalog ? (
                        <Link href={`/equities/${e.symbol.toLowerCase()}`} className="w-16 truncate font-mono font-semibold text-accent-blue hover:underline">{e.symbol}</Link>
                      ) : (
                        <span className="w-16 truncate font-mono text-text-secondary">{e.symbol}</span>
                      )}
                      <span className="flex-1 truncate text-xs text-text-muted">{e.name}</span>
                      {e.epsEstimate != null && <span className="font-mono text-[11px] text-text-muted">est. EPS {e.epsEstimate.toFixed(2)}</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-card border border-border bg-bg-card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                  <Landmark size={14} className="text-text-muted" aria-hidden />
                  <h3 className="text-sm font-medium text-text-secondary">US Economic Events</h3>
                </div>
                <div className="max-h-80 divide-y divide-border/60 overflow-y-auto">
                  {selEcon.length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-text-muted leading-relaxed">
                      No events this day. FMP&rsquo;s economic calendar is a <span className="text-text-secondary">paid-tier endpoint</span> —
                      on a free key it is always empty (earnings are unaffected).
                    </p>
                  )}
                  {selEcon.map((ev, i) => (
                    <div key={`${ev.event}-${i}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="flex-1 text-xs text-text-secondary">{ev.event}</span>
                      {ev.impact && (
                        <span className={clsx('rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize',
                          ev.impact.toLowerCase() === 'high'
                            ? 'border-red-500/20 bg-red-400/10 text-red-400'
                            : 'border-amber-500/20 bg-amber-400/10 text-amber-400')}>
                          {ev.impact}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
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
