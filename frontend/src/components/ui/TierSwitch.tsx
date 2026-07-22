'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ChevronDown, Zap, Crown, Sliders, Check } from 'lucide-react'
import { useTierStore } from '@/store/useTierStore'
import { TIER_CATEGORIES, TIER_LABELS, TIER_COLORS, type TierMode, type TierCategory } from '@/lib/tier'

interface LiveProviderInfo {
  id: string
  name: string
  category: string
  market?: 'crypto' | 'equities' | 'macro'
  config: { enabled: boolean }
}

async function fetchLiveProviders(): Promise<LiveProviderInfo[]> {
  const res = await fetch('/live-data/config')
  if (!res.ok) return []
  const data = await res.json()
  return data.providers ?? []
}

const TIER_ICONS: Record<TierMode, React.ReactNode> = {
  free:   <Zap size={11} />,
  paid:   <Crown size={11} />,
  custom: <Sliders size={11} />,
}

const TIER_DESCRIPTIONS: Record<TierMode, string> = {
  free:   'Keyless public APIs — Binance, DefiLlama, Alternative.me',
  paid:   'Premium APIs using your configured API keys',
  custom: 'Mix and match sources per data category',
}

export function TierSwitch() {
  const { mode, customSources, setMode, setCustomSource } = useTierStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Live provider list — powers the multi-select option lists (News Feed) so
  // they reflect exactly what's enabled on the Integrations page, including
  // each custom RSS feed individually. Only fetched once the dropdown is
  // opened; cached after that.
  const { data: liveProviders } = useQuery({
    queryKey: ['tier-switch-live-providers'],
    queryFn: fetchLiveProviders,
    enabled: open,
    staleTime: 30_000,
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Enabled providers for a category, scoped to its market (so crypto selectors
  // never pull in equity providers, which share category ids like 'news').
  const enabledProvidersFor = (cat: TierCategory, key: string) =>
    (liveProviders ?? []).filter((p) =>
      p.category === (cat.providerCategory ?? key) &&
      (p.market ?? 'crypto') === (cat.market ?? 'crypto') &&
      p.config.enabled,
    )

  const cryptoCats = Object.entries(TIER_CATEGORIES).filter(([, c]) => (c.market ?? 'crypto') === 'crypto')
  const equityCats = Object.entries(TIER_CATEGORIES).filter(([, c]) => c.market === 'equities')
  const macroCats = Object.entries(TIER_CATEGORIES).filter(([, c]) => c.market === 'macro')

  function renderRow(key: string, cat: TierCategory) {
    // Equity rows are informational — they reflect the live registry rather
    // than the free/paid toggle (equity sourcing is managed on Integrations).
    if (cat.informational) {
      const enabled = enabledProvidersFor(cat, key)
      return (
        <div key={key} className="px-4 py-2.5 border-b border-border/50 last:border-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-text-primary">{cat.label}</p>
              <p className="text-[10px] text-text-muted">{cat.description}</p>
            </div>
            <span className="flex-shrink-0 text-[10px] font-mono text-text-muted">{enabled.length} active</span>
          </div>
          {enabled.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {enabled.map((p) => (
                <span key={p.id} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary border border-border/60">
                  {p.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-text-muted/70 italic">
              No sources enabled — turn one on in Settings → Integrations.
            </p>
          )}
        </div>
      )
    }

    const activeLabel = mode === 'custom' && customSources[key]
      ? customSources[key]
      : mode === 'paid' ? cat.paidSourceLabel : cat.freeSourceLabel
    const isSame = cat.freeSource === cat.paidSource

    const selected = (customSources[key] ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean)
    const toggleOption = (id: string) => {
      const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
      setCustomSource(key, next.join(','))
    }
    const liveOptions = cat.multi
      ? enabledProvidersFor(cat, key).map((p) => ({ id: p.id, label: p.name }))
      : []

    return (
      <div key={key} className="px-4 py-2.5 border-b border-border/50 last:border-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-primary">{cat.label}</p>
            <p className="text-[10px] text-text-muted">{cat.description}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            {mode === 'custom' && !cat.multi ? (
              <select
                value={customSources[key] ?? cat.freeSource}
                onChange={(e) => setCustomSource(key, e.target.value)}
                className="text-[10px] bg-bg-secondary border border-border rounded px-1.5 py-0.5 text-text-secondary focus:outline-none focus:border-accent-blue/60"
              >
                <option value={cat.freeSource}>{cat.freeSourceLabel}</option>
                {cat.paidSource !== cat.freeSource && (
                  <option value={cat.paidSource}>{cat.paidSourceLabel}</option>
                )}
              </select>
            ) : mode === 'custom' && cat.multi ? (
              <span className="text-[10px] text-text-muted">
                {selected.length > 0 ? `${selected.length} selected` : 'all sources'}
              </span>
            ) : (
              <span className={clsx(
                'inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded',
                isSame ? 'text-text-muted bg-bg-elevated' : mode === 'paid' ? 'text-amber-400 bg-amber-400/10' : 'text-emerald-400 bg-emerald-400/10',
              )}>
                {activeLabel}
              </span>
            )}
          </div>
        </div>

        {mode === 'custom' && cat.multi && (
          liveOptions.length > 0 ? (
            <div className="mt-2 grid grid-cols-1 gap-1">
              {liveOptions.map((opt) => {
                const checked = selected.length === 0 || selected.includes(opt.id)
                return (
                  <label key={opt.id} className="flex items-center gap-2 cursor-pointer text-[11px] text-text-secondary hover:text-text-primary">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        // From the implicit "all" state, unchecking one
                        // materialises the explicit remaining set.
                        if (selected.length === 0) {
                          setCustomSource(key, liveOptions.map((o) => o.id).filter((id) => id !== opt.id).join(','))
                        } else {
                          toggleOption(opt.id)
                        }
                      }}
                      className="accent-blue-500 size-3"
                    />
                    {opt.label}
                  </label>
                )
              })}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-text-muted/70 italic">
              No {cat.label.toLowerCase()} sources enabled — enable one in Settings → Integrations.
            </p>
          )
        )}
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      {/* Badge trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors',
          TIER_COLORS[mode],
          'hover:opacity-80',
        )}
        title={`Data tier: ${TIER_LABELS[mode]}`}
      >
        {TIER_ICONS[mode]}
        <span className="font-mono">{TIER_LABELS[mode]}</span>
        <ChevronDown size={10} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-xl border border-border bg-bg-card shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-text-primary">Data Source Tier</p>
            <p className="text-[11px] text-text-muted mt-0.5">Controls which APIs power each data category</p>
          </div>

          {/* Tier selector */}
          <div className="p-3 border-b border-border grid grid-cols-3 gap-2">
            {(['free', 'paid', 'custom'] as TierMode[]).map((t) => (
              <button
                key={t}
                onClick={() => setMode(t)}
                className={clsx(
                  'flex flex-col items-center gap-1.5 p-2.5 rounded-lg border text-center transition-all',
                  mode === t
                    ? TIER_COLORS[t]
                    : 'border-border text-text-muted hover:text-text-secondary hover:bg-bg-elevated',
                )}
              >
                <span className="text-lg">{TIER_ICONS[t]}</span>
                <span className="text-[11px] font-semibold">{TIER_LABELS[t]}</span>
              </button>
            ))}
          </div>

          {/* Description */}
          <div className="px-4 py-2 border-b border-border bg-bg-elevated">
            <p className="text-[11px] text-text-muted">{TIER_DESCRIPTIONS[mode]}</p>
          </div>

          {/* Per-category breakdown */}
          <div className="max-h-80 overflow-y-auto">
            {cryptoCats.map(([key, cat]) => renderRow(key, cat))}

            {equityCats.length > 0 && (
              <div className="px-4 py-1.5 bg-bg-elevated/60 border-y border-border/60">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Equities</p>
                <p className="text-[10px] text-text-muted/70">Sourced from the registry — manage on Settings → Integrations</p>
              </div>
            )}
            {equityCats.map(([key, cat]) => renderRow(key, cat))}

            {macroCats.length > 0 && (
              <div className="px-4 py-1.5 bg-bg-elevated/60 border-y border-border/60">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Macro</p>
                <p className="text-[10px] text-text-muted/70">Sourced from the registry — manage on Settings → Integrations</p>
              </div>
            )}
            {macroCats.map(([key, cat]) => renderRow(key, cat))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 bg-bg-elevated border-t border-border">
            <p className="text-[10px] text-text-muted">
              {mode === 'paid'
                ? 'API keys configured in Settings → Integrations'
                : mode === 'free'
                ? 'All sources are keyless — no API keys required'
                : 'Custom sources saved to local storage'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
