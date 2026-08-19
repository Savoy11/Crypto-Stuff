'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  User,
  GripVertical,
  RotateCcw,
  X,
  LayoutPanelLeft,
  DollarSign,
  BarChart2,
  Rss,
  TrendingUp,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useSession } from 'next-auth/react'
import { useAlertStore } from '@/store/useAlertStore'
import { useFeedStore, type FeedStatus } from '@/store/useFeedStore'
import { useEntitlementStore } from '@/store/useEntitlementStore'
import { usePopoutStore, POPOUT_META, type PopoutKey } from '@/store/usePopoutStore'
import { MODULES, moduleForPath, flattenNavItems, type ModuleId, type ModuleNavItem, type SuiteModule } from '@/lib/modules/registry'
import { APP_NAME, APP_VERSION } from '@/lib/constants'
import { migrateStorageKey } from '@/lib/utils/storageMigration'

// One-time key migration for the Finance Now rename — runs before any read below.
migrateStorageKey('caep:nav-order:v2', 'fn:nav-order:v2')
migrateStorageKey('caep:nav-collapsed', 'fn:nav-collapsed')


// Navigation is driven by the suite module registry (lib/modules/registry.ts).
// Each enabled module contributes a sidebar section; items can be drag-reordered
// within their section and the order persists per module.

type SectionOrder = Partial<Record<ModuleId, string[]>>

const STORAGE_KEY = 'fn:nav-order:v2'
const COLLAPSE_KEY = 'fn:nav-collapsed'
/** Expansion state for nav GROUPS (a nav item with children), keyed by href. */
const GROUP_KEY = 'fn:nav-groups'

/**
 * Does this path belong to this nav entry?
 *
 * Prefix-match with a specificity rule: a more specific sibling wins, so
 * /equities does not light up while you are on /equities/news. `siblings` is the
 * set the entry competes with — its own level, plus every child in the module,
 * since a child route is more specific than any parent.
 */
function matchesPath(pathname: string, href: string, siblings: ModuleNavItem[]): boolean {
  if (pathname === href) return true
  if (!pathname.startsWith(`${href}/`)) return false
  return !siblings.some((other) =>
    other.href !== href && other.href.length > href.length &&
    (pathname === other.href || pathname.startsWith(`${other.href}/`)),
  )
}

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

const STATUS_COLORS: Record<FeedStatus, string> = {
  live: 'bg-emerald-400',
  connecting: 'bg-amber-400 animate-pulse',
  degraded: 'bg-orange-400',
  offline: 'bg-red-400',
}

const STATUS_LABELS: Record<FeedStatus, string> = {
  live: 'Live',
  connecting: 'Loading',
  degraded: 'Degraded',
  offline: 'Offline',
}

interface SidebarProps {
  /** Whether the mobile drawer is open (ignored on lg+ where the sidebar is always shown). */
  open?: boolean
  /** Called when the user dismisses the mobile drawer (close button, backdrop, or nav). */
  onClose?: () => void
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { unreadCount } = useAlertStore()
  const feedStatus = useFeedStore((s) => s.status)
  const feedFailedCount = useFeedStore((s) => s.failedCount)
  const { data: session } = useSession()
  const user = session?.user
  const isEnabled = useEntitlementStore((s) => s.isEnabled)

  const [order, setOrder] = useState<SectionOrder>({})
  const [reordering, setReordering] = useState(false)
  const [drag, setDrag] = useState<{ mod: ModuleId; index: number } | null>(null)
  const [drop, setDrop] = useState<{ mod: ModuleId; index: number } | null>(null)

  // Collapsible module sections. `undefined` = automatic (expanded only while
  // the current route lives in that module); explicit true/false = the user's
  // saved choice from clicking a section header.
  const [collapsedChoice, setCollapsedChoice] = useState<Partial<Record<ModuleId, boolean>>>({})

  // Expansion of nav GROUPS (nested children), keyed by the parent's href.
  // Same convention as sections: undefined = automatic (open while the route is
  // inside the group), explicit boolean = the user's saved choice.
  const [groupChoice, setGroupChoice] = useState<Record<string, boolean>>({})

  // Load persisted order + collapse choices on mount
  useEffect(() => {
    setOrder(loadOrder())
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY)
      if (stored) setCollapsedChoice(JSON.parse(stored))
    } catch { /* ignore */ }
    try {
      const stored = localStorage.getItem(GROUP_KEY)
      if (stored) setGroupChoice(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const activeModule = moduleForPath(pathname)

  // Navigating into a module always reveals its items, even if it was
  // manually collapsed earlier.
  useEffect(() => {
    if (activeModule && collapsedChoice[activeModule.id] === true) {
      setCollapsedChoice((prev) => {
        const next = { ...prev, [activeModule.id]: false }
        try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)) } catch {}
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const isExpanded = useCallback((mod: SuiteModule) => {
    if (!mod.label || reordering) return true // core section + reorder mode always show items
    const choice = collapsedChoice[mod.id]
    if (choice !== undefined) return !choice
    return activeModule?.id === mod.id
  }, [collapsedChoice, activeModule, reordering])

  const toggleSection = useCallback((mod: SuiteModule) => {
    setCollapsedChoice((prev) => {
      const next = { ...prev, [mod.id]: isExpanded(mod) }
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [isExpanded])

  const isGroupOpen = useCallback((item: ModuleNavItem) => {
    const choice = groupChoice[item.href]
    if (choice !== undefined) return choice
    // Automatic: a group opens when the current route is inside it, so landing
    // on a child page by link or deep link never leaves it hidden.
    return (item.children ?? []).some((c) => pathname === c.href || pathname.startsWith(`${c.href}/`))
      || pathname === item.href
  }, [groupChoice, pathname])

  const toggleGroup = useCallback((item: ModuleNavItem) => {
    setGroupChoice((prev) => {
      const next = { ...prev, [item.href]: !isGroupOpen(item) }
      try { localStorage.setItem(GROUP_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [isGroupOpen])

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
      className={clsx(
        'fixed inset-y-0 left-0 w-sidebar flex flex-col bg-sidebar-gradient border-r border-border z-30',
        'transition-transform duration-200 ease-out',
        // Off-canvas drawer on small screens; always visible from lg up
        open ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0'
      )}
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
        {/* Close button — mobile drawer only */}
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors lg:hidden"
          aria-label="Close navigation menu"
        >
          <X size={16} aria-hidden />
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
        {visibleModules.map((mod) => {
          const expanded = isExpanded(mod)
          const containsActive = activeModule?.id === mod.id
          return (
          <div key={mod.id} className={mod.label ? 'mt-3' : undefined}>
            {mod.label && (
              <button
                onClick={() => toggleSection(mod)}
                aria-expanded={expanded}
                className={clsx(
                  'w-full flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors',
                  containsActive && !expanded
                    ? 'text-accent-blue hover:bg-bg-elevated'
                    : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
                )}
              >
                {expanded
                  ? <ChevronDown size={11} className="flex-shrink-0" aria-hidden />
                  : <ChevronRight size={11} className="flex-shrink-0" aria-hidden />}
                <span>{mod.label}</span>
                {!expanded && (
                  <span className="ml-auto font-mono text-[9px] text-text-muted/70 normal-case tracking-normal">
                    {flattenNavItems(mod.navItems).length}
                  </span>
                )}
              </button>
            )}
            {expanded && (
            <ul className="space-y-0.5" role="list">
              {orderedItems(mod).map((item, index) => {
                const { href, label, icon: Icon, badge } = item
                const siblings = flattenNavItems(mod.navItems)
                const isActive = matchesPath(pathname, href, siblings)
                const children = item.children ?? []
                const groupOpen = children.length > 0 && isGroupOpen(item)
                // A collapsed group whose child is the current page still shows
                // as active, or navigating into it would look like leaving the
                // section entirely.
                const childActive = children.some((c) => matchesPath(pathname, c.href, siblings))
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
                        onClick={onClose}
                        className={clsx(
                          'flex items-center justify-between px-3 py-2 rounded text-sm transition-all',
                          isActive
                            ? 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20'
                            : childActive && !groupOpen
                              ? 'text-accent-blue hover:bg-bg-elevated'
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
                        {/* Chevron toggles the group WITHOUT navigating — the
                            label still routes, so a parent that is also a real
                            page keeps working as a link. */}
                        {children.length > 0 && (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-expanded={groupOpen}
                            aria-label={`${groupOpen ? 'Collapse' : 'Expand'} ${label}`}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleGroup(item) }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault(); e.stopPropagation(); toggleGroup(item)
                              }
                            }}
                            className="p-0.5 -mr-1 rounded text-text-muted hover:text-text-primary"
                          >
                            {groupOpen
                              ? <ChevronDown size={13} aria-hidden />
                              : <ChevronRight size={13} aria-hidden />}
                          </span>
                        )}
                      </Link>
                    )}

                    {/* Child items. Hidden in reorder mode: only top-level
                        entries are draggable, and showing undraggable rows
                        beside draggable ones reads as a broken affordance. */}
                    {children.length > 0 && groupOpen && !reordering && (
                      <ul className="mt-0.5 ml-4 space-y-0.5 border-l border-border/60 pl-2" role="list">
                        {children.map((child) => {
                          const childIsActive = matchesPath(pathname, child.href, siblings)
                          const ChildIcon = child.icon
                          return (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                onClick={onClose}
                                className={clsx(
                                  'flex items-center gap-2.5 px-2.5 py-1.5 rounded text-[13px] transition-all',
                                  childIsActive
                                    ? 'bg-accent-blue/10 text-accent-blue'
                                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
                                )}
                                aria-current={childIsActive ? 'page' : undefined}
                              >
                                <ChildIcon size={14} aria-hidden className={childIsActive ? 'text-accent-blue' : 'text-text-muted'} />
                                <span>{child.label}</span>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
            )}
          </div>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        {/* Pop-out launcher */}
        <PopoutLauncher />

        {/* Connection status */}
        <div className="flex items-center gap-2 px-1">
          <span
            className={clsx('size-2 rounded-full flex-shrink-0', STATUS_COLORS[feedStatus])}
            aria-label={`Data feeds: ${STATUS_LABELS[feedStatus]}`}
          />
          <span
            className="text-xs text-text-muted"
            title={
              feedFailedCount > 0
                ? `${feedFailedCount} data ${feedFailedCount === 1 ? 'feed is' : 'feeds are'} failing on this screen`
                : undefined
            }
          >
            {STATUS_LABELS[feedStatus]}
            {feedFailedCount > 0 && ` (${feedFailedCount})`}
          </span>
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
                {/* `name` is nullable in the users table, and the Auth.js
                    session carries no role — the removed legacy backend was
                    the only thing that had one. Email is the identifier that
                    always exists, so it fills in for a missing name and
                    otherwise sits underneath it. */}
                <div className="text-xs font-medium text-text-primary truncate">
                  {user.name ?? user.email}
                </div>
                {user.name && user.email && (
                  <div className="text-[10px] text-text-muted truncate">{user.email}</div>
                )}
              </div>
            </div>
            {/* Logout removed while the login wall is disabled (see (dashboard)/layout.tsx).
                Restore this button when re-enabling login. */}
          </div>
        )}
      </div>
    </aside>
  )
}
