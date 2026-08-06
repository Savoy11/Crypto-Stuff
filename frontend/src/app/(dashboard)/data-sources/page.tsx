'use client'

import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Database, KeyRound, ShieldCheck, ShieldAlert, Scale, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  DATA_SOURCES, SOURCE_STATUS_META, PROVIDER_AUTH_META,
  type DataSourceEntry, type SourceStatus,
} from '@/lib/data/dataSources'
import type { SourceTermsListResponse } from '@/app/live-data/source-terms/route'

const VERDICT_META = {
  approved:    { label: 'Approved',    cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20' },
  conditional: { label: 'Conditional', cls: 'text-amber-400 bg-amber-400/10 border-amber-500/20' },
  prohibited:  { label: 'Prohibited',  cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
} as const

/**
 * The terms-compliance record, on the page that already answers "where does
 * this data come from?" — because "and are we allowed to use it?" is the same
 * question's other half, and keeping them apart is how a source ends up in the
 * app that nobody checked.
 *
 * Prohibited entries are listed FIRST and expanded by default. They are the
 * ones that explain missing functionality elsewhere in the app, so burying
 * them under thirty approvals would defeat the point.
 */
function SourceTermsPanel() {
  const [open, setOpen] = useState(false)
  const { data } = useQuery<SourceTermsListResponse>({
    queryKey: ['source-terms'],
    queryFn: () => fetch('/live-data/source-terms').then((r) => r.json()),
    staleTime: Infinity, // a static in-repo registry; it cannot change without a deploy
  })

  const entries = useMemo(() => {
    const order = { prohibited: 0, conditional: 1, approved: 2 }
    return [...(data?.entries ?? [])].sort(
      (a, b) => order[a.verdict] - order[b.verdict] || a.name.localeCompare(b.name)
    )
  }, [data])

  const prohibited = entries.filter((e) => e.verdict === 'prohibited')
  const p = data?.provenance

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-start gap-2 flex-wrap">
          <Scale size={14} className="text-text-muted mt-0.5" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-text-primary">Source terms &amp; permitted use</h2>
            <p className="mt-1 text-[11px] text-text-muted leading-relaxed">
              What each site’s terms of use say about being read by software, and the verdict that
              follows. A <span className="text-red-400">prohibited</span> host is blocked in code — the
              app cannot fetch it however it is configured. User-added sources are checked against their
              robots.txt and terms before they can be saved.
              {p && (
                <> Registry dated by its oldest entry: <span className="font-mono">{p.verifiedAt}</span>
                  {p.needsReview > 0 && (
                    <span className="text-amber-400"> · {p.needsReview} entr{p.needsReview === 1 ? 'y' : 'ies'} past the review window</span>
                  )}
                  .</>
              )}
            </p>
          </div>
          {p && (
            <span className="text-[11px] text-text-muted shrink-0">
              {p.total} sources · {p.prohibited} prohibited
            </span>
          )}
        </div>
      </div>

      {/* Prohibited first, always visible — these explain gaps elsewhere. */}
      {prohibited.map((e) => (
        <div key={e.domain} className="p-4 border-b border-border bg-red-500/[0.04]">
          <div className="flex items-center gap-2 flex-wrap">
            <ShieldAlert size={13} className="text-red-400 shrink-0" />
            <span className="text-sm font-semibold text-text-primary">{e.name}</span>
            <span className="font-mono text-[11px] text-text-muted">{e.domain}</span>
            <span className={clsx('px-1.5 py-0.5 text-[10px] font-semibold rounded border', VERDICT_META.prohibited.cls)}>
              {VERDICT_META.prohibited.label}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-text-muted leading-relaxed">{e.finding}</p>
          <a href={e.termsUrl} target="_blank" rel="noopener noreferrer"
             className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent-blue hover:underline">
            Terms <ExternalLink size={9} />
          </a>
        </div>
      ))}

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-4 py-2.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        <ChevronDown size={12} className={clsx('transition-transform', open && 'rotate-180')} />
        {open ? 'Hide' : 'Show'} the other {entries.length - prohibited.length} reviewed sources
      </button>

      {open && (
        <div className="divide-y divide-border/60 border-t border-border">
          {entries.filter((e) => e.verdict !== 'prohibited').map((e) => {
            const meta = VERDICT_META[e.verdict]
            return (
              <div key={e.domain} className="p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-text-primary">{e.name}</span>
                  <span className="font-mono text-[11px] text-text-muted">{e.domain}</span>
                  <span className={clsx('px-1.5 py-0.5 text-[10px] font-semibold rounded border', meta.cls)}>{meta.label}</span>
                  <a href={e.termsUrl} target="_blank" rel="noopener noreferrer"
                     className="ml-auto inline-flex items-center gap-1 text-[11px] text-accent-blue hover:underline shrink-0">
                    Terms <ExternalLink size={9} />
                  </a>
                </div>
                <p className="mt-1.5 text-[11px] text-text-muted leading-relaxed">{e.finding}</p>
                {e.conditions?.length ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {e.conditions.map((c, i) => (
                      <li key={i} className="text-[11px] text-text-secondary flex gap-1.5">
                        <span className="text-amber-400/70">•</span>{c}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-1.5 text-[10px] text-text-muted/70">
                  Reviewed {e.verifiedAt} · confidence {e.confidence}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const MODULE_TITLES: Record<DataSourceEntry['module'], string> = {
  crypto: 'Crypto', equities: 'Equities', funds: 'ETFs & Funds', macro: 'Macro Markets', shared: 'Shared / Cross-module',
}
const MODULE_ORDER: DataSourceEntry['module'][] = ['crypto', 'equities', 'funds', 'macro', 'shared']
const STATUS_ORDER: SourceStatus[] = ['live', 'partial', 'key-gated', 'derived', 'unavailable']

function StatusChip({ status }: { status: SourceStatus }) {
  const m = SOURCE_STATUS_META[status]
  return <span className={clsx('px-1.5 py-0.5 text-[10px] font-semibold rounded border', m.cls)}>{m.label}</span>
}

function SourceRow({ e }: { e: DataSourceEntry }) {
  return (
    <div className="p-4 border-t border-border first:border-t-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">{e.surface}</span>
            <StatusChip status={e.status} />
          </div>
          {e.route && <div className="mt-0.5 font-mono text-[11px] text-text-muted">{e.route}</div>}
        </div>
        {e.cadence && <span className="text-[11px] text-text-muted shrink-0">{e.cadence}</span>}
      </div>

      {/* Providers */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {e.providers.map((p, i) => {
          const authMeta = PROVIDER_AUTH_META[p.auth]
          const inner = (
            <>
              <span className="font-medium text-text-secondary">{p.name}</span>
              {p.host && <span className="font-mono text-[10px] text-text-muted">{p.host}</span>}
              {p.auth !== 'none' && <span className={clsx('text-[9px] uppercase tracking-wide', authMeta.cls)}>{authMeta.label}</span>}
              {p.role !== 'primary' && <span className="text-[9px] text-text-muted italic">{p.role}</span>}
              {p.url && <ExternalLink size={9} className="text-text-muted shrink-0" />}
            </>
          )
          const cls = 'inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border bg-bg-elevated text-xs'
          return p.url
            ? <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className={clsx(cls, 'hover:border-border-hover transition-colors')}>{inner}</a>
            : <span key={i} className={cls}>{inner}</span>
        })}
      </div>

      {(e.notes || e.staticData?.length) && (
        <p className="mt-2 text-[11px] text-text-muted leading-relaxed">
          {e.notes}
          {e.staticData?.length ? (
            <> {e.notes ? ' ' : ''}<span className="text-text-secondary">Reference/fallback:</span> {e.staticData.map((s, i) => (
              <code key={i} className="font-mono text-[10px] text-text-muted">{s}{i < e.staticData!.length - 1 ? ', ' : ''}</code>
            ))}</>
          ) : null}
        </p>
      )}
    </div>
  )
}

export default function DataSourcesPage() {
  const [statusFilter, setStatusFilter] = useState<SourceStatus | 'all'>('all')
  const [authFilter, setAuthFilter] = useState<'all' | 'keyless' | 'keyed'>('all')

  const filtered = useMemo(() => DATA_SOURCES.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (authFilter === 'keyless' && !e.providers.some(p => p.auth === 'none')) return false
    if (authFilter === 'keyed' && !e.providers.some(p => p.auth !== 'none')) return false
    return true
  }), [statusFilter, authFilter])

  const counts = useMemo(() => {
    const c = { total: DATA_SOURCES.length } as Record<string, number>
    for (const s of STATUS_ORDER) c[s] = DATA_SOURCES.filter(e => e.status === s).length
    return c
  }, [])

  return (
    <div className="space-y-5 p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Data Sources"
        subtitle="Every surface in Finance Now and exactly where its data comes from"
        description="Finance Now runs live-only against public data providers. This catalog is generated from the same registry that powers the app, so it never drifts from the code — it lists each surface, its upstream provider(s), whether a key/paid plan is required, and its refresh cadence."
        details={[
          { label: 'Status', text: 'Live = real provider at request time · Partial = some fields static/estimate · Key-gated = needs a key/paid plan · Derived = computed from other live data · Not available = no free source (shown as an explicit notice).' },
          { label: 'Provenance', text: 'Individual pages show a matching source badge. Full status audit lives in DATA-AVAILABILITY.md; the machine-generated inventory in DATA-SOURCES.md (npm run data-sources).' },
          { label: 'Permitted use', text: 'Every host below has a dated terms verdict (see the panel underneath). Prohibited hosts are blocked in code, and a source nobody has reviewed cannot be added without an explicit acknowledgement.' },
        ]}
      />

      <SourceTermsPanel />

      {/* Status summary */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <div className="rounded-lg border border-border bg-bg-card p-3">
          <div className="text-lg font-bold text-text-primary">{counts.total}</div>
          <div className="text-[10px] text-text-muted uppercase tracking-wide">Surfaces</div>
        </div>
        {STATUS_ORDER.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(f => f === s ? 'all' : s)}
            className={clsx(
              'rounded-lg border p-3 text-left transition-colors',
              statusFilter === s ? SOURCE_STATUS_META[s].cls : 'border-border bg-bg-card hover:border-border-hover'
            )}
          >
            <div className="text-lg font-bold text-text-primary">{counts[s]}</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wide">{SOURCE_STATUS_META[s].label}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted flex items-center gap-1"><ShieldCheck size={13} /> Auth:</span>
        {([['all', 'All'], ['keyless', 'Keyless'], ['keyed', 'Needs key/paid']] as const).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setAuthFilter(v)}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              authFilter === v ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/40' : 'border-border text-text-muted hover:text-text-primary')}
          >
            {v === 'keyless' && <KeyRound size={11} className="inline mr-1 opacity-60" />}
            {l}
          </button>
        ))}
        {statusFilter !== 'all' && (
          <button onClick={() => setStatusFilter('all')} className="ml-auto text-xs text-accent-blue hover:underline">
            Clear status filter ({SOURCE_STATUS_META[statusFilter].label})
          </button>
        )}
      </div>

      {/* Grouped by module */}
      {MODULE_ORDER.map(m => {
        const entries = filtered.filter(e => e.module === m)
        if (!entries.length) return null
        return (
          <div key={m}>
            <div className="flex items-center gap-2 mb-2">
              <Database size={14} className="text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">{MODULE_TITLES[m]}</h2>
              <span className="text-xs text-text-muted">{entries.length}</span>
            </div>
            <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
              {entries.map(e => <SourceRow key={e.id} e={e} />)}
            </div>
          </div>
        )
      })}

      <div className="rounded-lg border border-border bg-bg-elevated p-3 text-xs text-text-muted leading-relaxed">
        <span className="font-semibold text-text-secondary">How this stays accurate: </span>
        this page and <code className="font-mono">DATA-SOURCES.md</code> are both generated from
        <code className="font-mono"> src/lib/data/dataSources.ts</code>. Running <code className="font-mono">npm run data-sources -- --verify</code> cross-checks
        the registry against the hosts actually fetched in each <code className="font-mono">/live-data</code> route, so an undocumented source fails the check.
        Live/partial status is validated separately by <code className="font-mono">npm run audit</code>.
      </div>
    </div>
  )
}
