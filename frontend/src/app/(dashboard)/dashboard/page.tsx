'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Settings2, X, RotateCcw, EyeOff,
  GripHorizontal, Maximize2,
} from 'lucide-react'

import { MarketOverview }    from '@/components/dashboard/MarketOverview'
import { RiskHeatmap }       from '@/components/dashboard/RiskHeatmap'
import { PegStabilityChart } from '@/components/dashboard/PegStabilityChart'
import { LiquidityMonitor }  from '@/components/dashboard/LiquidityMonitor'
import { RecentAlerts }      from '@/components/dashboard/RecentAlerts'
import { FreeDataPanel }     from '@/components/dashboard/FreeDataPanel'
import { FloatingWidget }    from '@/components/dashboard/FloatingWidget'
import { ErrorBoundary }     from '@/components/ui/ErrorBoundary'
import { useDashboardStore } from '@/store/useDashboardStore'

// ── Widget registry ────────────────────────────────────────────────────────────

interface WidgetMeta {
  id: string
  label: string
  description: string
  span: 1 | 2 | 3
  component: React.ComponentType
}

const WIDGET_REGISTRY: WidgetMeta[] = [
  { id: 'market-overview',   label: 'Market Overview',     description: 'KPI cards — prices, volume, dominance',           span: 3, component: MarketOverview    },
  { id: 'risk-heatmap',      label: 'Risk Heatmap',        description: 'Asset risk scores across all monitored coins',     span: 2, component: RiskHeatmap      },
  { id: 'recent-alerts',     label: 'Recent Alerts',       description: 'Latest triggered alerts and threshold breaches',   span: 1, component: RecentAlerts     },
  { id: 'free-data',         label: 'Free Data Feeds',     description: 'Fear & Greed, funding rates, DeFi TVL, BTC stats', span: 3, component: FreeDataPanel    },
  { id: 'peg-stability',     label: 'Peg Stability Chart', description: 'Stablecoin peg deviation over time',               span: 2, component: PegStabilityChart },
  { id: 'liquidity-monitor', label: 'Liquidity Monitor',   description: 'Exchange liquidity depth across asset pairs',      span: 1, component: LiquidityMonitor  },
]

const REGISTRY_MAP = Object.fromEntries(WIDGET_REGISTRY.map((w) => [w.id, w]))

// ── Toggle switch ──────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-accent-blue' : 'bg-border'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
    </button>
  )
}

// ── Handle bar (shared between grid and drag overlay) ────────────────────────

function WidgetHandleBar({
  label,
  dragHandleProps,
  onPopOut,
  onHide,
}: {
  label: string
  dragHandleProps?: Record<string, unknown>
  onPopOut?: () => void
  onHide?: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-elevated border-b border-border/60 rounded-t-xl select-none">
      <span
        {...dragHandleProps}
        className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary transition-colors touch-none"
        title="Drag to move"
      >
        <GripHorizontal size={14} />
      </span>
      <span className="flex-1 text-[11px] font-semibold text-text-secondary tracking-wide uppercase">
        {label}
      </span>
      {onPopOut && (
        <button
          onClick={onPopOut}
          title="Pop out"
          className="text-text-muted hover:text-accent-blue transition-colors p-0.5 rounded"
        >
          <Maximize2 size={13} />
        </button>
      )}
      {onHide && (
        <button
          onClick={onHide}
          title="Hide widget"
          className="text-text-muted hover:text-red-400 transition-colors p-0.5 rounded"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}

// ── Sortable widget card ───────────────────────────────────────────────────────

function SortableWidget({
  id,
  meta,
  onPopOut,
  onHide,
}: {
  id: string
  meta: WidgetMeta
  onPopOut: () => void
  onHide: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 0 : undefined,
  }

  const Comp = meta.component

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col rounded-xl overflow-hidden border border-border/80 shadow-card">
      <WidgetHandleBar
        label={meta.label}
        dragHandleProps={{ ...attributes, ...listeners }}
        onPopOut={onPopOut}
        onHide={onHide}
      />
      <div className="[&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none flex-1">
        <ErrorBoundary>
          <Comp />
        </ErrorBoundary>
      </div>
    </div>
  )
}

// ── Drag overlay ghost ─────────────────────────────────────────────────────────

function DragGhost({ label }: { label: string }) {
  return (
    <div className="rounded-xl overflow-hidden border-2 border-accent-blue/60 shadow-2xl opacity-90 bg-bg-card w-64">
      <WidgetHandleBar label={label} />
      <div className="h-16 flex items-center justify-center">
        <span className="text-xs text-text-muted">Moving…</span>
      </div>
    </div>
  )
}

// ── Customize panel ────────────────────────────────────────────────────────────

function CustomizePanel({ onClose }: { onClose: () => void }) {
  const { widgets, setVisible, reset } = useDashboardStore()
  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-text-primary">Customize Dashboard</p>
          <p className="text-xs text-text-muted mt-0.5">Drag widgets by their handle bar · toggle to show or hide</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="divide-y divide-border">
        {widgets.map((w) => {
          const meta = REGISTRY_MAP[w.id]
          if (!meta) return null
          return (
            <div key={w.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${w.visible ? 'text-text-primary' : 'text-text-muted'}`}>{meta.label}</p>
                <p className="text-xs text-text-muted truncate">{meta.description}</p>
              </div>
              <Toggle on={w.visible} onChange={(v) => setVisible(w.id, v)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [customizing, setCustomizing] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  // The dashboard layout/order/visibility is persisted to localStorage, so it
  // differs from the server's default render. Gate the persisted-dependent grid
  // behind a mount flag so the first client render matches the server (avoids
  // hydration mismatch), then render the real layout after mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const { widgets, poppedOut, reorder, popOut, dock, setVisible } = useDashboardStore()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const dockedVisible = widgets.filter((w) => w.visible && !poppedOut.includes(w.id))
  const dockedIds = dockedVisible.map((w) => w.id)
  const floatingIds = poppedOut.filter((id) => widgets.find((w) => w.id === id)?.visible !== false)

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over || active.id === over.id) return
    reorder(active.id as string, over.id as string)
  }

  const activeWidget = activeId ? REGISTRY_MAP[activeId] : null

  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Portfolio Overview</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Drag the <GripHorizontal size={12} className="inline-block mx-0.5 text-text-muted" /> handle bar on each widget to move it · <Maximize2 size={11} className="inline-block mx-0.5 text-text-muted" /> to pop out
          </p>
        </div>
        <button
          onClick={() => setCustomizing((v) => !v)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            customizing
              ? 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue'
              : 'bg-bg-card border-border text-text-muted hover:text-text-primary hover:border-border-hover'
          }`}
        >
          <Settings2 size={13} />
          Customize
        </button>
      </div>

      {customizing && <CustomizePanel onClose={() => setCustomizing(false)} />}

      {/* DnD grid — only rendered after mount to avoid a persisted-layout
          hydration mismatch. A static skeleton holds the space before then. */}
      {!mounted ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[3, 2, 1].map((span, i) => (
            <div
              key={i}
              className={`h-48 rounded-xl border border-border bg-bg-card animate-pulse ${
                span === 3 ? 'lg:col-span-3' : span === 2 ? 'lg:col-span-2' : 'lg:col-span-1'
              }`}
            />
          ))}
        </div>
      ) : dockedVisible.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={dockedIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ gridAutoFlow: 'dense' }}>
              {dockedVisible.map((w) => {
                const meta = REGISTRY_MAP[w.id]
                if (!meta) return null
                const spanClass = meta.span === 3 ? 'lg:col-span-3' : meta.span === 2 ? 'lg:col-span-2' : 'lg:col-span-1'
                return (
                  <div key={w.id} className={spanClass}>
                    <SortableWidget
                      id={w.id}
                      meta={meta}
                      onPopOut={() => popOut(w.id)}
                      onHide={() => setVisible(w.id, false)}
                    />
                  </div>
                )
              })}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeWidget && <DragGhost label={activeWidget.label} />}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-text-muted">
          <EyeOff size={32} className="mb-3 opacity-40" />
          <p className="text-sm font-medium">All widgets are hidden or popped out</p>
          <button onClick={() => setCustomizing(true)} className="mt-3 text-xs text-accent-blue hover:text-blue-400 transition-colors">
            Open Customize to restore them
          </button>
        </div>
      )}

      {/* Floating windows */}
      {mounted && floatingIds.map((id, idx) => {
        const meta = REGISTRY_MAP[id]
        if (!meta) return null
        const Comp = meta.component
        return (
          <FloatingWidget
            key={id}
            title={meta.label}
            initialX={160 + idx * 40}
            initialY={140 + idx * 40}
            onDock={() => dock(id)}
            onClose={() => { dock(id); setVisible(id, false) }}
          >
            <ErrorBoundary>
              <Comp />
            </ErrorBoundary>
          </FloatingWidget>
        )
      })}
    </div>
  )
}
