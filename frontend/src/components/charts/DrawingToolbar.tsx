'use client'

import clsx from 'clsx'
import { MousePointer2, PenLine, MoveHorizontal, Square, Hash, Ruler, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DrawingTool, Drawing } from '@/components/charts/CandlestickChart'

// ─────────────────────────────────────────────────────────────────────────────
// Shared drawing toolbar for every technical-analysis surface.
//
// This exists because the three TA pages each grew their own copy, and they
// drifted: crypto offered six tools, /equities five (Measure was simply never
// added), and /macro none at all despite rendering the same chart. A trader
// moving between them found the same control in a different place with a
// different set of tools.
//
// Placement is deliberately fixed here too — its own row, directly above the
// chart, under the indicator chips. Drawing acts on the canvas, so the control
// belongs against the canvas rather than up among the symbol and range pickers.
// ─────────────────────────────────────────────────────────────────────────────

const DRAWING_TOOLS: ReadonlyArray<{ tool: DrawingTool; label: string; Icon: LucideIcon; title?: string }> = [
  { tool: 'none', label: 'Select', Icon: MousePointer2 },
  { tool: 'trendline', label: 'Trendline', Icon: PenLine },
  { tool: 'hray', label: 'H. Ray', Icon: MoveHorizontal },
  { tool: 'rectangle', label: 'Rectangle', Icon: Square },
  { tool: 'fib', label: 'Fibonacci', Icon: Hash },
  {
    tool: 'measure',
    label: 'Measure',
    Icon: Ruler,
    title: 'Measure growth: click a start point, then an end point',
  },
]

export interface DrawingToolbarProps {
  active: DrawingTool
  onChange: (tool: DrawingTool) => void
  drawings: Drawing[]
  onClear: () => void
  /** Extra classes for the row wrapper (e.g. spacing that differs per page). */
  className?: string
}

export function DrawingToolbar({ active, onChange, drawings, onClear, className }: DrawingToolbarProps) {
  return (
    <div className={clsx('flex items-center gap-1.5 flex-wrap', className)}>
      <span className="text-[10px] text-text-muted uppercase tracking-wider mr-1">Draw</span>

      {DRAWING_TOOLS.map(({ tool, label, Icon, title }) => (
        <button
          key={tool}
          type="button"
          // Clicking the active tool returns to Select, so a drawing tool is
          // never sticky after the shape is drawn.
          onClick={() => onChange(active === tool ? 'none' : tool)}
          title={title ?? label}
          aria-pressed={active === tool}
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
            active === tool
              ? 'border-accent-blue/60 bg-accent-blue/10 text-accent-blue'
              : 'border-border text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
          )}
        >
          <Icon size={13} aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}

      {drawings.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          title="Clear all drawings"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium text-text-muted hover:text-red-400 hover:border-red-400/40 transition-colors"
        >
          <Trash2 size={13} aria-hidden />
          <span className="hidden sm:inline">Clear ({drawings.length})</span>
        </button>
      )}
    </div>
  )
}
