'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ChevronDown, Loader2, Sparkles, Telescope, Wrench } from 'lucide-react'

// Runs the Equity Screener agent, which scans the whole universe for
// sector-relative outliers and explains them. Lives on the Stock Registry.

const SCAN_TASK =
  'Scan the equities universe for the most statistically significant outliers. Call get_stock_outliers first, then investigate the most notable names and classify each as an opportunity, a trap, or fairly-explained. Group by theme and end with a short watch list.'

interface ScanResult {
  report: string
  toolsUsed: { name: string }[]
}

export function OutlierScanPanel() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/agents/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: SCAN_TASK, agentId: 'equity-screener' }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setError(data.error ?? 'Scan failed')
      else setResult({ report: data.report, toolsUsed: data.toolsUsed ?? [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    }
    setLoading(false)
  }

  return (
    <div className="rounded-card border border-violet-500/25 bg-violet-500/5 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="size-8 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
          <Telescope size={16} className="text-violet-400" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">AI Outlier Scan</p>
          <p className="text-[11px] text-text-muted">Scans the whole universe for sector-relative outliers and explains opportunities vs traps.</p>
        </div>
        <ChevronDown size={16} className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-violet-500/15 pt-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-text-muted">
              Runs the <Link href="/agent-config" className="text-accent-blue hover:underline">Equity Screener</Link> agent · takes 20–60s
            </p>
            <button
              onClick={run}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-violet-600 text-xs font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} aria-hidden />}
              {loading ? 'Scanning…' : result ? 'Re-run scan' : 'Run scan'}
            </button>
          </div>

          {loading && (
            <div className="space-y-2 py-1">
              <p className="text-xs text-text-muted flex items-center gap-2"><Loader2 size={13} className="animate-spin text-violet-400" aria-hidden /> Computing outliers and analyzing…</p>
              {[1, 2, 3].map((i) => <div key={i} className="h-3 rounded bg-bg-elevated animate-pulse" style={{ width: `${88 - i * 10}%` }} />)}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 bg-red-500/10 text-red-300 border border-red-500/20">
              <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
              <div>
                <p className="font-medium">Scan failed</p>
                <p className="text-red-400/90 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-border bg-bg-card">
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <Telescope size={13} className="text-violet-400" aria-hidden />
                <span className="text-xs font-semibold text-text-secondary">Outlier Report</span>
                {result.toolsUsed.length > 0 && (
                  <div className="ml-auto flex flex-wrap gap-1 justify-end">
                    {Array.from(new Set(result.toolsUsed.map((t) => t.name))).map((name) => (
                      <span key={name} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-bg-elevated text-text-muted border border-border">
                        <Wrench size={9} aria-hidden /> {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-4 py-3 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{result.report}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
