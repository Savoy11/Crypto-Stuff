'use client'

import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { ChevronDown, Zap, Crown, Sliders, Check } from 'lucide-react'
import { useTierStore } from '@/store/useTierStore'
import { TIER_CATEGORIES, TIER_LABELS, TIER_COLORS, type TierMode } from '@/lib/tier'

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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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
          <div className="max-h-72 overflow-y-auto">
            {Object.entries(TIER_CATEGORIES).map(([key, cat]) => {
              const activeSource = mode === 'custom' && customSources[key]
                ? customSources[key]
                : mode === 'paid' ? cat.paidSource : cat.freeSource
              const activeLabel = mode === 'custom' && customSources[key]
                ? customSources[key]
                : mode === 'paid' ? cat.paidSourceLabel : cat.freeSourceLabel
              const isSame = cat.freeSource === cat.paidSource

              return (
                <div key={key} className="px-4 py-2.5 border-b border-border/50 last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-primary">{cat.label}</p>
                      <p className="text-[10px] text-text-muted">{cat.description}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {mode === 'custom' ? (
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
                </div>
              )
            })}
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
