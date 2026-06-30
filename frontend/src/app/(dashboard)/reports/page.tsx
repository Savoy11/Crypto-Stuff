'use client'

import { useState, useEffect } from 'react'
import { FileBarChart, Calendar, AlertTriangle } from 'lucide-react'
import { formatDate } from '@/lib/utils/format'

// Institutional reports depend on derived risk scores, reserve attestations, and
// compliance metrics that have no free real-time data source. Rather than export
// reports built on unverified/fabricated figures, the page surfaces an explicit
// "not available" notice. See DATA-AVAILABILITY.md. When a backend that produces
// these analytics is connected, this page can render and export live reports.

export default function ReportsPage() {
  const [reportDate, setReportDate] = useState<string | null>(null)

  useEffect(() => {
    setReportDate(formatDate(new Date().toISOString()))
  }, [])

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileBarChart className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Institutional Reports</h1>
            <p className="text-sm text-slate-400">
              Generate and export compliance-grade analytics reports
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="h-4 w-4" />
          As of {reportDate ?? '—'}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-400/70" />
        <p className="mt-3 text-sm font-medium text-slate-200">Reports are not available</p>
        <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
          Institutional reports depend on derived risk scores, reserve attestations,
          and compliance metrics that have no free real-time data source. They are
          withheld rather than exported with unverified figures. See the live data
          you can export today on the Assets, Reserves, and News pages.
        </p>
      </div>
    </div>
  )
}
