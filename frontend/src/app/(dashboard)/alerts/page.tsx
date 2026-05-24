'use client'

import { useState } from 'react'
import { Bell, Filter, CheckCheck } from 'lucide-react'
import { AlertFeed } from '@/components/alerts/AlertFeed'
import { AlertFilters } from '@/components/alerts/AlertFilters'
import { useAlertStore } from '@/store/useAlertStore'
import { RAW_ALERTS } from '@/lib/api/mock/mockAlerts'

export default function AlertsPage() {
  const [showFilters, setShowFilters] = useState(false)
  const { markAllRead, unreadCount } = useAlertStore()

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Alert Center</h1>
            <p className="text-sm text-slate-400">
              Real-time risk events and threshold breaches
            </p>
          </div>
          {unreadCount > 0 && (
            <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-400">
              {unreadCount} unread
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-6">
        {showFilters && (
          <div className="w-64 flex-shrink-0">
            <AlertFilters />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <AlertFeed alerts={RAW_ALERTS} />
        </div>
      </div>
    </div>
  )
}
