'use client'

import { Bell, Settings, RefreshCw, Menu } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAlertStore } from '@/store/useAlertStore'
import { SearchInput } from '@/components/ui/SearchInput'
import { clsx } from 'clsx'

interface TopBarProps {
  /** Opens the mobile navigation drawer (hamburger button, shown below lg). */
  onMenuClick?: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const router = useRouter()
  const { unreadCount } = useAlertStore()

  return (
    <header
      className="fixed top-0 right-0 left-0 lg:left-sidebar h-topbar flex items-center justify-between gap-2 px-4 sm:px-6 bg-bg-secondary border-b border-border z-20"
      role="banner"
    >
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="p-2 -ml-1 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu size={18} aria-hidden />
      </button>

      {/* Search */}
      <div className="flex-1 max-w-sm">
        <SearchInput
          placeholder="Search assets, symbols..."
          className="w-full"
        />
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 ml-4">
        {/* Live indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
          <span className="text-xs font-mono text-emerald-400">LIVE</span>
        </div>

        {/* Alerts bell */}
        <Link
          href="/alerts"
          className="relative p-2 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary"
          aria-label={`View alerts${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        >
          <Bell size={16} aria-hidden />
          {unreadCount > 0 && (
            <span
              className="absolute top-1 right-1 size-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center"
              aria-hidden
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Settings placeholder */}
        <button
          className="p-2 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary"
          aria-label="Settings"
        >
          <Settings size={16} aria-hidden />
        </button>
      </div>
    </header>
  )
}
