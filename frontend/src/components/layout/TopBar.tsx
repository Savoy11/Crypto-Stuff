'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, Settings, RefreshCw, ChevronDown, Menu } from 'lucide-react'
import { useLiveAlerts }   from '@/hooks/useLiveAlerts'
import { LiveAlertRow }    from '@/components/alerts/LiveAlertRow'
import { useRefreshStore, INTERVAL_OPTIONS } from '@/store/useRefreshStore'
import { useGlobalRefresh } from '@/hooks/useGlobalRefresh'
import { SearchInput }     from '@/components/ui/SearchInput'
import { TierSwitch }      from '@/components/ui/TierSwitch'
import { clsx }            from 'clsx'

// ── Countdown badge ────────────────────────────────────────────────────────────

function Countdown() {
  const { intervalMs, lastRefreshedAt, isRefreshing } = useRefreshStore()
  const [secs, setSecs] = useState<number | null>(null)

  useEffect(() => {
    if (!intervalMs) { setSecs(null); return }
    function tick() {
      const base    = lastRefreshedAt ?? Date.now()
      const elapsed = Date.now() - base
      const remain  = Math.max(0, Math.ceil((intervalMs! - elapsed) / 1000))
      setSecs(remain)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [intervalMs, lastRefreshedAt])

  if (!intervalMs || isRefreshing) return null
  return (
    <span className="text-[10px] font-mono text-text-muted tabular-nums min-w-[22px] text-right">
      {secs}s
    </span>
  )
}

// ── Interval selector ─────────────────────────────────────────────────────────

function IntervalSelector() {
  const { intervalMs, setIntervalMs } = useRefreshStore()
  const [open, setOpen]               = useState(false)
  const ref                           = useRef<HTMLDivElement>(null)

  const current = INTERVAL_OPTIONS.find(o => o.ms === intervalMs) ?? INTERVAL_OPTIONS[0]

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[11px] font-medium text-text-muted hover:text-text-secondary transition-colors px-1.5 py-1 rounded hover:bg-bg-elevated"
        title="Auto-refresh interval"
      >
        <span>{current.ms ? `Auto ${current.label}` : 'Auto: Off'}</span>
        <ChevronDown size={10} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden min-w-[120px]">
          <div className="px-2 pt-2 pb-1">
            <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">Auto-refresh</p>
          </div>
          {INTERVAL_OPTIONS.map(opt => (
            <button
              key={String(opt.ms)}
              onClick={() => { setIntervalMs(opt.ms); setOpen(false) }}
              className={clsx(
                'w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between gap-4',
                intervalMs === opt.ms
                  ? 'bg-accent-blue/10 text-accent-blue'
                  : 'text-text-secondary hover:bg-bg-elevated',
              )}
            >
              {opt.label}
              {intervalMs === opt.ms && <span className="size-1.5 rounded-full bg-accent-blue" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Alerts bell dropdown ───────────────────────────────────────────────────────

function AlertsBell() {
  const { alerts, activeCount, criticalCount, checkedAt } = useLiveAlerts()
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
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary"
        aria-label={`Alerts${activeCount > 0 ? `, ${activeCount} active` : ''}`}
        title="Alerts"
      >
        <Bell size={16} aria-hidden />
        {activeCount > 0 && (
          <span
            className={clsx(
              'absolute top-1 right-1 size-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center',
              criticalCount > 0 ? 'bg-red-500' : 'bg-amber-500',
            )}
            aria-hidden
          >
            {activeCount > 9 ? '9+' : activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-bg-card shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-text-primary">Alerts</span>
            {activeCount > 0 && (
              <span className="text-[10px] text-text-muted">
                {criticalCount > 0 && <span className="text-red-400">{criticalCount} critical</span>}
                {criticalCount > 0 ? ' · ' : ''}{activeCount} active
              </span>
            )}
          </div>

          {alerts.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-text-muted">
              All monitored assets within range
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-border/50">
              {alerts.slice(0, 15).map((a) => <LiveAlertRow key={a.id} alert={a} />)}
            </div>
          )}

          <div className="px-4 py-2 border-t border-border">
            <span className="text-[10px] text-text-muted/70">
              Live peg &amp; 24h price-move monitoring{checkedAt ? ` · ${new Date(checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TopBar ────────────────────────────────────────────────────────────────────

interface TopBarProps {
  /** Opens the mobile navigation drawer (button hidden on lg+ where the sidebar is fixed). */
  onMenuClick?: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { isRefreshing } = useRefreshStore()
  const { refresh }      = useGlobalRefresh()

  return (
    <header
      className="fixed top-0 right-0 left-0 lg:left-sidebar h-topbar flex items-center justify-between px-4 sm:px-6 bg-bg-secondary border-b border-border z-20"
      role="banner"
    >
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="p-2 mr-2 -ml-1 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu size={18} aria-hidden />
      </button>

      {/* Search */}
      <div className="flex-1 max-w-sm">
        <SearchInput placeholder="Search assets, symbols..." className="w-full" />
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 ml-4">
        {/* Live indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
          <span className="text-xs font-mono text-emerald-400">LIVE</span>
        </div>

        {/* Tier switch */}
        <div className="hidden md:block">
          <TierSwitch />
        </div>

        {/* ── Refresh controls ── */}
        <div className="hidden md:flex items-center gap-1 pl-2 border-l border-border/60">
          {/* Countdown to next auto-refresh */}
          <Countdown />

          {/* Interval selector */}
          <IntervalSelector />

          {/* Manual refresh button */}
          <button
            onClick={refresh}
            disabled={isRefreshing}
            title="Refresh all data"
            className="p-1.5 rounded hover:bg-bg-elevated transition-colors text-text-muted hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={clsx('transition-colors', isRefreshing && 'animate-spin text-accent-blue')}
            />
          </button>
        </div>

        {/* Alerts bell */}
        <AlertsBell />

        {/* Settings. A Link, not a button: this was a dead control from the
            day it shipped (W3-9) — it had no onClick at all, so the most
            prominent settings affordance in the app did nothing. */}
        <Link
          href="/settings"
          className="p-2 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary"
          aria-label="Settings"
        >
          <Settings size={16} aria-hidden />
        </Link>
      </div>
    </header>
  )
}
