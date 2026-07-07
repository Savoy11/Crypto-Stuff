'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  LogOut,
  User,
  GripVertical,
  RotateCcw,
  LayoutPanelLeft,
  DollarSign,
  BarChart2,
  Rss,
  PieChart,
  TrendingUp,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAlertStore } from '@/store/useAlertStore'
import { useStreamStore } from '@/store/useStreamStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useEntitlementStore } from '@/store/useEntitlementStore'
import { usePopoutStore, POPOUT_META, type PopoutKey } from '@/store/usePopoutStore'
import { MODULES, type ModuleId, type SuiteModule } from '@/lib/modules/registry'
import { APP_NAME, APP_VERSION } from '@/lib/constants'

// Navigation is driven by the suite module registry (lib/modules/registry.ts).
// Each enabled module contributes a sidebar section; items can be drag-reordered
// within their section and the order persists per module.

type SectionOrder = Partial<Record<ModuleId, string[]>>

const STORAGE_KEY = 'caep:nav-order:v2'

function defaultOrder(mod: SuiteModule): string[] {
  return mod.navItems.map((item) => item.href)
}

function loadOrder(): SectionOrder {
  if (typeof window === 'undefined') return {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return {}
    const parsed: SectionOrder = JSON.parse(stored)
    // Merge with defaults so newly added pages always appear
    const merged: SectionOrder = {}
    for (const mod of MODULES) {
      const defaults = defaultOrder(mod)
      const saved = parsed[mod.id] ?? []
      const order = saved.filter((h) => defaults.includes(h))
      defaults.forEach((h) => { if (!order.includes(h)) order.push(h) })
      merged[mod.id] = order
    }
    return merged
  } catch {
    return {}
  }
}

function saveOrder(order: SectionOrder) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(order)) } catch {}
}

// ─── Popout launcher ──────────────────────────────────────────────────────────

const POPOUT_ICONS: Record<PopoutKey, React.ElementType> = {
  'prices':          DollarSign,
  'market-overview': BarChart2,
  'news-feed':       Rss,
  'staking-rates':   TrendingUp,
  'risk-heatmap':    PieChart,
}

function PopoutLauncher() {
  const [open, setOpen] = useState(false)
  const { open: openPopout, popouts } = usePopoutStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-all',
          open
            ? 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
        )}
        title="Pop-out windows"
      >
        <LayoutPanelLeft size={16} className={open ? 'text-accent-blue' : 'text-text-muted'} aria-hidden />
        <span className="font-medium">Windows</span>
        {popouts.length > 0 && (
          <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-accent-blue/20 text-accent-blue text-[10px] font-bold flex items-center justify-center border border-accent-blue/30">
            {popouts.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-border bg-bg-card shadow-xl shadow-black/30 overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium">Open Window</p>
          </div>
          <div className="p-1.5 space-y-0.5">
            {(Object.keys(POPOUT_META) as PopoutKey[]).map((key) => {
              const Icon = POPOUT_ICONS[key]
              const isOpen = popouts.some((p) => p.key === key)
              return (
                <button
                  key={key}
                  onClick={() => { openPopout(key); setOpen(false) }}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-sm transition-colors text-left',
                    isOpen
                      ? 'bg-accent-blue/10 text-accent-blue'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                  )}
                >
                  <Icon size={14} aria-hidden className={isOpen ? 'text-accent-blue' : 'text-text-muted'} />
                  <span className="font-medium">{POPOUT_META[key].title}</span>
                  {isOpen && (
                    <span className="ml-auto text-[10px] text-accent-blue/70">open</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const STATUS_COLORS = {
  connected: 'bg-emerald-400',
  connecting: 'bg-amber-400 animate-pulse',
  disconnected: 'bg-slate-500',
  error: 'bg-red-400',
}

const STATUS_LABELS = {
  connected: 'Live',
  connecting: 'Connecting',
  disconnected: 'Offline',
  error: 'Error',
}

export function Sidebar() {
  const pathname = usePathname()
  const { unreadCount } = useAlertStore()
  const { connectionStatus } = useStreamStore()
  const { user, logout } = useAuthStore()
  const isEnabled = useEntitlementStore((s) => s.isEnabled)

  const [order, setOrder] = useState<SectionOrder>({})
  const [reordering, setReordering] = useState(false)
  const [drag, setDrag] = useState<{ mod: ModuleId; index: number } | null>(null)
  const [drop, setDrop] = useState<{ mod: ModuleId; index: number } | null>(null)

  // Load persisted order on mount
  useEffect(() => { setOrder(loadOrder()) }, [])

  const visibleModules = MODULES.filter((mod) => isEnabled(mod.id))

  const orderedItems = useCallback((mod: SuiteModule) => {
    const hrefs = order[mod.id] ?? defaultOrder(mod)
    return hrefs
      .map((href) => mod.navItems.find((item) => item.href === href))
      .filter(Boolean) as SuiteModule['navItems']
  }, [order])

  const handleDragStart = useCallback((e: React.DragEvent, mod: ModuleId, index: number) => {
    setDrag({ mod, index })
    e.dataTransfer.effectAllowed = 'move'
    // Transparent drag ghost
    const ghost = document.createElement('div')
    ghost.style.position = 'absolute'
    ghost.style.top = '-9999px'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => document.body.removeChild(ghost), 0)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, mod: ModuleId, index: number) => {
    if (drag?.mod !== mod) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDrop({ mod, index })
  }, [drag])

  const handleDrop = useCallback((e: React.DragEvent, mod: SuiteModule, index: number) => {
    e.preventDefault()
    if (!drag || drag.mod !== mod.id || drag.index === index) return
    setOrder((prev) => {
      const current = [...(prev[mod.id] ?? defaultOrder(mod))]
      const [moved] = current.splice(drag.index, 1)
      current.splice(index, 0, moved)
      const next = { ...prev, [mod.id]: current }
      saveOrder(next)
      return next
    })
    setDrag(null)
    setDrop(null)
  }, [drag])

  const handleDragEnd = useCallback(() => {
    setDrag(null)
    setDrop(null)
  }, [])

  const resetOrder = useCallback(() => {
    setOrder({})
    saveOrder({})
  }, [])

  return (
    <aside
      className="fixed inset-y-0 left-0 w-sidebar flex flex-col bg-sidebar-gradient border-r border-border z-30"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <div className="size-8 rounded bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center flex-shrink-0">
          <Activity size={16} className="text-accent-blue" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono font-bold text-sm text-text-primary tracking-wider">{APP_NAME}</div>
          <div className="text-[10px] text-text-muted leading-tight">Institutional Analytics</div>
        </div>
        {/* Reorder toggle */}
        <button
          onClick={() => setReordering((r) => !r)}
          title={reordering ? 'Done reordering' : 'Reorder navigation'}
          className={clsx(
            'flex-shrink-0 p-1.5 rounded transition-colors',
            reordering
              ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
              : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
          )}
        >
          <GripVertical size={14} aria-hidden />
        </button>
      </div>

      {/* Reorder mode banner */}
      {reordering && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-accent-blue/10 border-b border-accent-blue/20">
          <span className="text-[11px] text-accent-blue font-medium">Drag to reorder within a section</span>
          <button
            onClick={resetOrder}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary transition-colors"
            title="Reset to default order"
          >
            <RotateCcw size={10} aria-hidden />
            Reset
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto" role="navigation">
        {visibleModules.map((mod) => (
          <div key={mod.id} className={mod.label ? 'mt-4' : undefined}>
            {mod.label && (
              <p className="px-3 pb-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                {mod.label}
              </p>
            )}
            <ul className="space-y-0.5" role="list">
              {orderedItems(mod).map(({ href, label, icon: Icon, badge }, index) => {
                // Prefix-match, but a more specific sibling wins (e.g. /equities
                // stays inactive on /equities/news, which has its own entry).
                const isActive = pathname === href || (
                  pathname.startsWith(`${href}/`) &&
                  !mod.navItems.some((other) =>
                    other.href !== href && other.href.length > href.length &&
                    (pathname === other.href || pathname.startsWith(`${other.href}/`))
                  )
                )
                const isDragging = drag?.mod === mod.id && drag.index === index
                const isDropTarget = drop?.mod === mod.id && drop.index === index && drag?.index !== index

                return (
                  <li
                    key={href}
                    draggable={reordering}
                    onDragStart={reordering ? (e) => handleDragStart(e, mod.id, index) : undefined}
                    onDragOver={reordering ? (e) => handleDragOver(e, mod.id, index) : undefined}
                    onDrop={reordering ? (e) => handleDrop(e, mod, index) : undefined}
                    onDragEnd={reordering ? handleDragEnd : undefined}
                    className={clsx(
                      'rounded transition-all',
                      reordering && 'cursor-grab active:cursor-grabbing',
                      isDragging && 'opacity-40',
                      isDropTarget && 'ring-1 ring-accent-blue/50 ring-offset-1 ring-offset-transparent'
                    )}
                  >
                    {reordering ? (
                      <div
                        className={clsx(
                          'flex items-center justify-between px-3 py-2 rounded text-sm select-none',
                          isActive
                            ? 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20'
                            : 'text-text-secondary hover:bg-bg-elevated'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Icon size={16} aria-hidden className={isActive ? 'text-accent-blue' : 'text-text-muted'} />
                          <span className="font-medium">{label}</span>
                        </div>
                        <GripVertical size={14} className="text-text-muted flex-shrink-0" aria-hidden />
                      </div>
                    ) : (
                      <Link
                        href={href}
                        className={clsx(
                          'flex items-center justify-between px-3 py-2 rounded text-sm transition-all',
                          isActive
                            ? 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20'
                            : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                        )}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <div className="flex items-center gap-3">
                          <Icon size={16} aria-hidden className={isActive ? 'text-accent-blue' : 'text-text-muted'} />
                          <span className="font-medium">{label}</span>
                        </div>
                        {badge && unreadCount > 0 && (
                          <span
                            className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
                            aria-label={`${unreadCount} unread alerts`}
                          >
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        {/* Pop-out launcher */}
        <PopoutLauncher />

        {/* Connection status */}
        <div className="flex items-center gap-2 px-1">
          <span
            className={clsx('size-2 rounded-full flex-shrink-0', STATUS_COLORS[connectionStatus])}
            aria-label={`Connection: ${STATUS_LABELS[connectionStatus]}`}
          />
          <span className="text-xs text-text-muted">{STATUS_LABELS[connectionStatus]}</span>
          <span className="text-xs text-text-muted ml-auto font-mono">v{APP_VERSION}</span>
        </div>

        {/* User */}
        {user && (
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="size-7 rounded-full bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center flex-shrink-0">
                <User size={12} className="text-accent-blue" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-primary truncate">{user.name}</div>
                <div className="text-[10px] text-text-muted capitalize">{user.role}</div>
              </div>
            </div>
            <button
              onClick={logout}
              className="text-text-muted hover:text-text-secondary transition-colors p-1"
              aria-label="Log out"
            >
              <LogOut size={14} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
