'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Database,
  Shield,
  Vault,
  Bell,
  Star,
  FileBarChart,
  Activity,
  LogOut,
  User,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAlertStore } from '@/store/useAlertStore'
import { useStreamStore } from '@/store/useStreamStore'
import { useAuthStore } from '@/store/useAuthStore'
import { APP_NAME, APP_VERSION } from '@/lib/constants'

const NAV_ITEMS: Array<{ href: string; label: string; icon: React.ElementType; badge?: boolean }> = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/assets', label: 'Assets', icon: Database },
  { href: '/risk-scores', label: 'Risk Scores', icon: Shield },
  { href: '/reserves', label: 'Reserves', icon: Vault },
  { href: '/alerts', label: 'Alerts', icon: Bell, badge: true },
  { href: '/watchlist', label: 'Watchlist', icon: Star },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
]

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
        <div>
          <div className="font-mono font-bold text-sm text-text-primary tracking-wider">{APP_NAME}</div>
          <div className="text-[10px] text-text-muted leading-tight">Institutional Analytics</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto" role="navigation">
        <ul className="space-y-0.5" role="list">
          {NAV_ITEMS.map(({ href, label, icon: Icon, badge }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <li key={href}>
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
                    <Icon
                      size={16}
                      aria-hidden
                      className={isActive ? 'text-accent-blue' : 'text-text-muted'}
                    />
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
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-3 border-t border-border space-y-2">
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
