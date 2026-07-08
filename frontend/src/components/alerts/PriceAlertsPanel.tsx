'use client'

import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { BellPlus, BellRing, CheckCircle2, RotateCcw, Trash2 } from 'lucide-react'
import { usePriceAlertStore, type AlertCondition, type AlertInstrumentKind } from '@/store/usePriceAlertStore'
import { ASSET_LIST } from '@/lib/data/assetList'
import { COINGECKO_IDS } from '@/lib/api/live/coingeckoIds'
import { EQUITY_CATALOG } from '@/lib/data/equityCatalog'
import { FUND_CATALOG } from '@/lib/data/fundCatalog'
import { formatCurrency } from '@/lib/utils/format'

// User-defined price alerts panel — create/list/re-arm alerts on any tracked
// instrument. Checks run every minute while the app is open (client-side
// monitor); server-side delivery arrives with the backend.

interface Option {
  kind: AlertInstrumentKind
  target: string
  label: string
  group: string
}

const OPTIONS: Option[] = [
  ...ASSET_LIST
    .filter((a) => COINGECKO_IDS[a.id])
    .map((a) => ({ kind: 'crypto' as const, target: COINGECKO_IDS[a.id], label: `${a.symbol} — ${a.name}`, group: 'Crypto' })),
  ...EQUITY_CATALOG.map((e) => ({ kind: 'security' as const, target: e.symbol, label: `${e.symbol} — ${e.name}`, group: 'Stocks' })),
  ...FUND_CATALOG.map((f) => ({ kind: 'security' as const, target: f.symbol, label: `${f.symbol} — ${f.name}`, group: 'ETFs & Funds' })),
]

export function PriceAlertsPanel() {
  const { alerts, addAlert, removeAlert, rearmAlert } = usePriceAlertStore()
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Option | null>(null)
  const [condition, setCondition] = useState<AlertCondition>('below')
  const [price, setPrice] = useState('')

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q || picked) return []
    return OPTIONS.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 8)
  }, [search, picked])

  const create = () => {
    const value = parseFloat(price)
    if (!picked || !isFinite(value) || value <= 0) return
    addAlert({ kind: picked.kind, target: picked.target, label: picked.label.split(' — ')[0], condition, price: value })
    // Ask for browser-notification permission the first time an alert is set
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    setPicked(null); setSearch(''); setPrice('')
  }

  const armed = alerts.filter((a) => a.triggeredAt === null)
  const fired = alerts.filter((a) => a.triggeredAt !== null)

  return (
    <div className="rounded-xl border border-border bg-bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <BellPlus size={15} className="text-accent-blue" aria-hidden />
          <h2 className="text-sm font-medium text-text-secondary">Price Alerts</h2>
          <span className="text-xs text-text-muted">— any coin, stock, or fund · checked every minute while the app is open</span>
        </div>
        {armed.length > 0 && (
          <span className="text-xs font-mono text-text-muted">{armed.length} armed</span>
        )}
      </div>

      {/* Create row */}
      <div className="p-4 flex flex-wrap items-start gap-2 border-b border-border/60">
        <div className="relative w-64">
          <input
            value={picked ? picked.label : search}
            onChange={(e) => { setPicked(null); setSearch(e.target.value) }}
            placeholder="Search instrument (BTC, NVDA, VOO…)"
            className="w-full rounded border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue/50 focus:outline-none"
          />
          {matches.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-bg-card shadow-xl shadow-black/40 z-20 overflow-hidden">
              {matches.map((o) => (
                <button
                  key={`${o.kind}:${o.target}`}
                  onClick={() => { setPicked(o); setSearch('') }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors"
                >
                  <span className="truncate">{o.label}</span>
                  <span className="text-[10px] text-text-muted flex-shrink-0 ml-2">{o.group}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5">
          {(['below', 'above'] as AlertCondition[]).map((c) => (
            <button
              key={c}
              onClick={() => setCondition(c)}
              className={clsx('px-2.5 py-1.5 rounded text-xs font-medium capitalize transition-colors',
                condition === c ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-center rounded border border-border bg-bg-elevated px-2">
          <span className="text-xs text-text-muted">$</span>
          <input
            type="number"
            min={0}
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create() }}
            placeholder="Price"
            className="w-28 bg-transparent px-1.5 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </div>
        <button
          onClick={create}
          disabled={!picked || !parseFloat(price)}
          className="px-3 py-2 rounded-lg bg-accent-blue text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Set alert
        </button>
      </div>

      {/* Alert list */}
      {alerts.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-text-muted">
          No price alerts yet — set one above and you&rsquo;ll get a toast plus a browser notification when it triggers.
        </p>
      ) : (
        <div className="divide-y divide-border/60">
          {[...armed, ...fired].map((a) => (
            <div key={a.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              {a.triggeredAt === null
                ? <BellRing size={14} className="text-accent-blue flex-shrink-0" aria-hidden />
                : <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" aria-hidden />}
              <span className="font-mono font-semibold text-text-primary w-16 truncate">{a.label}</span>
              <span className="text-xs text-text-muted">
                {a.condition === 'above' ? '≥' : '≤'} <span className="font-mono text-text-secondary">{formatCurrency(a.price, a.price < 1 ? 4 : 2)}</span>
              </span>
              <span className="ml-auto text-[11px] text-text-muted">
                {a.triggeredAt === null
                  ? 'armed'
                  : `fired ${new Date(a.triggeredAt).toLocaleString()} at ${formatCurrency(a.triggeredPrice ?? 0, 2)}`}
              </span>
              {a.triggeredAt !== null && (
                <button onClick={() => rearmAlert(a.id)} title="Re-arm alert" className="text-text-muted hover:text-accent-blue transition-colors">
                  <RotateCcw size={13} aria-hidden />
                </button>
              )}
              <button onClick={() => removeAlert(a.id)} title="Delete alert" className="text-text-muted hover:text-red-400 transition-colors">
                <Trash2 size={13} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
