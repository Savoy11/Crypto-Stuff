'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronDown, ExternalLink, Loader2, ScrollText } from 'lucide-react'
import { STALE_TIME_LONG } from '@/lib/constants'
import type { SecFiling, SecFilingsResponse } from '@/app/live-data/sec-filings/route'

// Tabbed feed of a company's SEC filings from EDGAR: annual reports (10-K),
// quarterly reports (10-Q), and material-event reports (8-K), each with its
// own "show older" pager that walks EDGAR's archives (1990s onward).

const TABS = [
  { id: '10-K', label: '10-K', hint: 'Annual reports' },
  { id: '10-Q', label: '10-Q', hint: 'Quarterly reports' },
  { id: '8-K',  label: '8-K',  hint: 'Material events' },
] as const

type TabId = typeof TABS[number]['id']

const INITIAL_LIMIT: Record<TabId, number> = { '10-K': 6, '10-Q': 8, '8-K': 8 }
const PAGE_SIZE = 10

function describeFiling(f: SecFiling): string {
  if (f.form.startsWith('10-K')) return `Annual report — fiscal year ended ${f.reportDate ?? f.filedAt}`
  if (f.form.startsWith('10-Q')) return `Quarterly report — period ended ${f.reportDate ?? f.filedAt}`
  const meaningful = f.itemLabels.filter(l => l !== 'Financial statements & exhibits')
  return (meaningful.length > 0 ? meaningful : f.itemLabels).join(' · ') || 'Filing'
}

export function SecFilingsFeed({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<TabId>('10-K')
  const [limits, setLimits] = useState<Record<TabId, number>>({ ...INITIAL_LIMIT })
  const limit = limits[tab]

  const { data, isLoading, error, isFetching } = useQuery<SecFilingsResponse>({
    queryKey: ['sec-filings', symbol, tab, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ symbol, form: tab, limit: String(limit) })
      const r = await fetch(`/live-data/sec-filings?${params.toString()}`)
      const j: SecFilingsResponse = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      return j
    },
    staleTime: STALE_TIME_LONG,
    placeholderData: keepPreviousData, // keep the list rendered while deeper history loads
  })

  const activeHint = TABS.find(t => t.id === tab)?.hint

  return (
    <div className="rounded-card border border-border bg-bg-card p-4">
      <h2 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
        <ScrollText size={14} className="text-text-muted" aria-hidden />
        SEC Filings
      </h2>

      <div className="flex rounded-lg border border-border bg-bg-primary p-0.5 mb-1" role="tablist" aria-label="Filing type">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              tab === id
                ? 'bg-bg-elevated text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-text-muted mb-3">{activeHint}</p>

      {isLoading && (
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 rounded bg-bg-elevated animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-text-muted">
          Filing feed unavailable — {error instanceof Error ? error.message : 'SEC EDGAR unreachable'}
        </p>
      )}

      {data && data.filings.length === 0 && (
        <p className="text-xs text-text-muted">No {activeHint?.toLowerCase()} on record.</p>
      )}

      {data && data.filings.length > 0 && (
        <ul className="space-y-2.5">
          {data.filings.map((f) => (
            <li key={f.accessionNumber}>
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded px-2 py-1.5 -mx-2 hover:bg-bg-elevated transition-colors group"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-text-muted tabular-nums">{f.filedAt}</span>
                  <span className="flex items-center gap-1.5">
                    {f.form !== tab && (
                      <span className="text-[9px] font-medium text-amber-400/80 border border-amber-400/30 rounded px-1" title="Amended filing">{f.form}</span>
                    )}
                    <ExternalLink size={10} className="text-text-muted group-hover:text-accent-blue transition-colors" aria-hidden />
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-text-secondary group-hover:text-text-primary transition-colors leading-snug">
                  {describeFiling(f)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {data?.hasMore && (
        <button
          onClick={() => setLimits(l => ({ ...l, [tab]: l[tab] + PAGE_SIZE }))}
          disabled={isFetching}
          className="mt-3 w-full flex items-center justify-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-50"
        >
          {isFetching
            ? <><Loader2 size={12} className="animate-spin" aria-hidden /> Loading older filings…</>
            : <><ChevronDown size={12} aria-hidden /> Show older filings</>}
        </button>
      )}

      <p className="mt-3 text-[11px] text-text-muted">Live from SEC EDGAR · filed by {data?.company ?? 'the registrant'}</p>
    </div>
  )
}
