'use client'

import React, { useMemo, useState } from 'react'
import { ExternalLink, Database, KeyRound, ShieldCheck } from 'lucide-react'
import { clsx } from 'clsx'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  DATA_SOURCES, SOURCE_STATUS_META, PROVIDER_AUTH_META,
  type DataSourceEntry, type SourceStatus,
} from '@/lib/data/dataSources'

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
        ]}
      />

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
