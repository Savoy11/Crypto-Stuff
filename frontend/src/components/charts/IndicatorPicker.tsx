'use client'

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { SlidersHorizontal, ChevronDown, X } from 'lucide-react'
import type { IndicatorMeta } from '@/components/charts/indicatorRegistry'

// ─────────────────────────────────────────────────────────────────────────────
// Shared indicator picker for every technical-analysis surface.
//
// Extracted from the crypto TA page, which was the only one that scaled: it
// groups by overlay/panel, carries each indicator's explanation as a tooltip,
// and keeps the selected set visible as removable chips. /equities and /macro
// rendered a flat chip row instead — workable at 18 indicators, unusable at 62.
//
// The `tip` text is the reason this is worth sharing rather than duplicating:
// it is the only place the app explains what an indicator means, and it existed
// on exactly one of the three pages.
// ─────────────────────────────────────────────────────────────────────────────

export interface IndicatorPickerProps {
  /** Indicators offered on this surface (see `indicatorsFor`). */
  indicators: readonly IndicatorMeta[]
  active: ReadonlySet<string>
  onToggle: (key: string) => void
  onClearAll: () => void
  /**
   * Optional note rendered under the groups — used by /macro to say which
   * indicators are withheld and why, rather than leaving a silent gap.
   */
  footnote?: string
}

export function IndicatorPicker({ indicators, active, onToggle, onClearAll, footnote }: IndicatorPickerProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click. Without this the panel covers the chart and there is
  // no obvious way to dismiss it.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const overlays = indicators.filter((i) => i.group === 'overlay')
  const panels = indicators.filter((i) => i.group === 'panel')

  function renderGroup(list: readonly IndicatorMeta[], activeClasses: string) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {list.map(({ key, label, tip }) => (
          <button
            key={key}
            type="button"
            title={tip}
            onClick={() => onToggle(key)}
            aria-pressed={active.has(key)}
            className={clsx(
              'px-2 py-0.5 rounded border text-[11px] font-medium transition-colors',
              active.has(key)
                ? activeClasses
                : 'border-border text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
            )}
          >
            {label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
            open
              ? 'border-accent-blue/60 bg-accent-blue/10 text-accent-blue'
              : 'border-border text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
          )}
        >
          <SlidersHorizontal size={12} aria-hidden />
          Indicators
          {active.size > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-accent-blue/20 text-accent-blue text-[10px] font-bold">
              {active.size}
            </span>
          )}
          <ChevronDown size={11} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden />
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1.5 z-50 bg-bg-card border border-border rounded-xl shadow-2xl w-[560px] max-w-[92vw] max-h-[460px] overflow-y-auto">
            <div className="p-3 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-wider">Overlays</span>
                  <span className="text-[10px] text-text-muted">— rendered on the price chart</span>
                </div>
                {renderGroup(overlays, 'border-amber-500/40 bg-amber-500/10 text-amber-400')}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-violet-400/80 uppercase tracking-wider">Panels</span>
                  <span className="text-[10px] text-text-muted">— each gets its own pane below the chart</span>
                </div>
                {renderGroup(panels, 'border-violet-500/40 bg-violet-500/10 text-violet-400')}
              </div>

              {footnote && (
                <p className="pt-2 border-t border-border text-[10px] leading-relaxed text-text-muted">{footnote}</p>
              )}

              {active.size > 0 && (
                <div className="pt-2 border-t border-border flex justify-end">
                  <button
                    type="button"
                    onClick={onClearAll}
                    className="text-[11px] text-text-muted hover:text-red-400 transition-colors"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected indicators stay visible outside the menu, each removable. */}
      {Array.from(active).map((key) => {
        const ind = indicators.find((i) => i.key === key)
        if (!ind) return null
        return (
          <span
            key={key}
            className={clsx(
              'inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded border text-[11px] font-medium',
              ind.group === 'overlay'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                : 'border-violet-500/40 bg-violet-500/10 text-violet-400'
            )}
          >
            {ind.label}
            <button
              type="button"
              onClick={() => onToggle(key)}
              title={`Remove ${ind.label}`}
              className="opacity-60 hover:opacity-100 transition-opacity"
            >
              <X size={9} aria-hidden />
            </button>
          </span>
        )
      })}
    </div>
  )
}
