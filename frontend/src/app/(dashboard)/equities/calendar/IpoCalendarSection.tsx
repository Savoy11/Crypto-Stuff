'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Rocket, KeyRound, AlertTriangle } from 'lucide-react'
import { SourceLine } from '@/components/ui/SourceLine'
import { formatIpoPriceRange } from '@/lib/data/ipoCalendar'
import type { IpoCalendarResponse } from '@/app/live-data/ipo-calendar/route'
import { STALE_TIME_LONG } from '@/lib/constants'

// Upcoming IPOs. Deliberately a SIBLING of the earnings/economic grid rather
// than a panel inside it: those need an FMP key and this needs an Alpha Vantage
// one, so nesting it would hide IPOs from someone who has the key for them.

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function IpoCalendarSection() {
  const { data, isLoading } = useQuery<IpoCalendarResponse>({
    queryKey: ['ipo-calendar'],
    queryFn: () => fetch('/live-data/ipo-calendar').then((r) => r.json()),
    staleTime: STALE_TIME_LONG,
  })

  const events = data?.events ?? []
  // Group by date so a day with four listings reads as one day, not four rows.
  const byDate = events.reduce<Record<string, typeof events>>((acc, e) => {
    (acc[e.ipoDate] ??= []).push(e)
    return acc
  }, {})

  return (
    <div className="rounded-card border border-border bg-bg-card">
      <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
        <Rocket className="h-4 w-4 text-accent-blue" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Upcoming IPOs</h2>
          <p className="text-[11px] text-text-muted">
            Expected listings over roughly the next three months
          </p>
        </div>
      </div>

      <div className="px-4 py-3">
        {isLoading ? (
          <div className="h-24 animate-shimmer bg-shimmer-gradient bg-[length:200%_100%] rounded" />
        ) : !data?.configured ? (
          <div className="rounded border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-center">
            <KeyRound className="mx-auto h-5 w-5 text-amber-400/70" aria-hidden />
            <p className="mt-1.5 text-xs font-medium text-slate-200">IPO calendar needs a (free) Alpha Vantage key</p>
            <p className="mt-1 text-[11px] text-slate-400 max-w-md mx-auto leading-relaxed">
              This is a different key from the earnings calendar&rsquo;s. Add one in{' '}
              <Link href="/settings" className="text-accent-blue hover:underline">Settings → Integrations</Link>{' '}
              or set <code className="font-mono text-slate-300">ALPHA_VANTAGE_API_KEY</code>. The IPO calendar is on its free tier.
            </p>
          </div>
        ) : !data.ok ? (
          // A failure is never rendered as an empty calendar: "no IPOs are
          // scheduled" is a claim about the market, not about our request.
          <div className="rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 flex gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400/80 mt-0.5" aria-hidden />
            <div className="text-[11px] leading-relaxed text-slate-300">
              <p className="font-medium text-slate-200">
                {data.reason === 'rate-limited'
                  ? 'Alpha Vantage daily request limit reached'
                  : 'IPO calendar unavailable'}
              </p>
              <p className="mt-0.5 text-slate-400">
                {data.reason === 'rate-limited'
                  ? 'The free tier allows 25 requests a day. This is a limit on our requests — not a statement that no IPOs are scheduled. It resets daily.'
                  : data.detail ?? 'The provider did not return a usable response.'}
              </p>
            </div>
          </div>
        ) : events.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-muted">
            No upcoming listings in the provider&rsquo;s window.
          </p>
        ) : (
          <div className="space-y-3">
            {Object.entries(byDate).map(([date, rows]) => (
              <div key={date}>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">{fmtDate(date)}</p>
                <div className="divide-y divide-border/40 rounded border border-border/60">
                  {rows.map((e) => {
                    const range = formatIpoPriceRange(e)
                    return (
                      <div key={`${e.symbol}-${e.ipoDate}`} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <Link
                            href={`/equities/${e.symbol.toLowerCase()}`}
                            className="font-mono text-xs font-medium text-text-primary hover:text-accent-blue transition-colors"
                          >
                            {e.symbol}
                          </Link>
                          <p className="truncate text-[11px] text-text-secondary">{e.name}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          {/* An unset range says so. The feed writes it as 0, and
                              "$0.00" would state a price the filing does not give. */}
                          <p className={range ? 'font-mono tabular-nums text-xs text-text-primary' : 'text-[11px] italic text-text-muted'}>
                            {range ?? 'price not set'}
                          </p>
                          {e.exchange && <p className="text-[11px] text-text-muted">{e.exchange}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            <p className="pt-1 text-[11px] leading-relaxed text-text-muted">
              Dates are the issuer&rsquo;s expected listing date and move often; a listing can be postponed or
              withdrawn. Price ranges are indicative until set at pricing.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-border/60 px-4 py-2">
        <SourceLine id="ipo-calendar" />
      </div>
    </div>
  )
}
