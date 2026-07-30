'use client'

import { useEffect, useMemo, useState } from 'react'
import { Sunrise, RefreshCw, KeyRound } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { hydratePortfolios, usePortfolioStore } from '@/store/usePortfolioStore'
import { hydrateWatchlists, useWatchlistStore, type WatchList } from '@/store/useWatchlistStore'
import { INSTRUMENT_BY_KEY } from '@/lib/data/instruments'
import { migrateStorageKey } from '@/lib/utils/storageMigration'

// One-time key migration for the Finance Now rename — runs before any read below.
migrateStorageKey('caep:daily-brief:v1', 'fn:daily-brief:v1')


// AI Daily Brief — "your holdings, what moved, why, and what's ahead."
// Reuses the research agent (Anthropic key via agent runner) and grounds the
// prompt in the user's actual portfolio + watchlist symbols. The agent pulls
// live prices/news through its tools, so the brief reflects real data.

const LAST_BRIEF_KEY = 'fn:daily-brief:v1'

interface StoredBrief { text: string; generatedAt: string }

function collectContext(
  portfolios: ReturnType<typeof usePortfolioStore.getState>['portfolios'],
  watchlists: WatchList[],
): string[] {
  const symbols = new Set<string>()
  for (const p of portfolios) {
    for (const h of p.holdings) {
      const inst = INSTRUMENT_BY_KEY[h.cgId]
      if (inst) symbols.add(`${inst.symbol} (${inst.class})`)
    }
  }
  for (const list of watchlists) {
    for (const key of list.keys) {
      const inst = INSTRUMENT_BY_KEY[key]
      if (inst) symbols.add(`${inst.symbol} (${inst.class})`)
    }
  }
  return Array.from(symbols).slice(0, 30)
}

export default function DailyBriefPage() {
  const { portfolios } = usePortfolioStore()
  const watchlists = useWatchlistStore((s) => s.lists)
  useEffect(() => { void hydratePortfolios(); void hydrateWatchlists() }, [])
  const [brief, setBrief] = useState<StoredBrief | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsKey, setNeedsKey] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LAST_BRIEF_KEY)
      if (stored) setBrief(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const symbols = useMemo(() => collectContext(portfolios, watchlists), [portfolios, watchlists])

  const generate = async () => {
    setLoading(true); setError(null); setNeedsKey(false)
    const universe = symbols.length > 0 ? symbols.join(', ') : 'BTC (crypto), ETH (crypto), SPY (etf), QQQ (etf)'
    const task = [
      `Produce today's investor morning brief for a user tracking these instruments: ${universe}.`,
      'Structure: 1) Market pulse — one short paragraph on overall crypto + equity market tone using live data.',
      '2) Their instruments — biggest movers among the list with the price change and, where news explains it, one line of why.',
      '3) Worth watching — 2-3 upcoming considerations (events, trends in the news feed).',
      'Keep it under 350 words, plain language, no financial advice, cite which data you pulled.',
    ].join(' ')
    try {
      const res = await fetch('/api/agents/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      })
      const data = await res.json()
      if (res.status === 503) { setNeedsKey(true); return }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Agent error')
      const next: StoredBrief = { text: data.report, generatedAt: new Date().toISOString() }
      setBrief(next)
      try { localStorage.setItem(LAST_BRIEF_KEY, JSON.stringify(next)) } catch { /* quota */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate brief')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sunrise className="h-6 w-6 text-amber-400" aria-hidden />
          <PageHeader
            title="Daily Brief"
            subtitle="Your holdings, what moved, why, and what's ahead — AI-generated from live data"
            description="The brief is grounded in your actual portfolios and watchlists: the research agent pulls live prices and news through the app's own data routes and synthesizes a short morning read. Requires an Anthropic API key in .env.local."
            details={[
              { label: 'Context', text: symbols.length > 0 ? `Covering ${symbols.length} instruments from your portfolios and watchlists.` : 'No portfolio/watchlist holdings found — a default market brief will be generated.' },
              { label: 'Not advice', text: 'Informational synthesis of live data — not investment advice.' },
            ]}
          />
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} aria-hidden />
          {loading ? 'Generating…' : brief ? 'Regenerate' : "Generate today's brief"}
        </button>
      </div>

      <SourceLine id="brief" />

      {needsKey && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-8 text-center">
          <KeyRound className="mx-auto h-7 w-7 text-amber-400/70" aria-hidden />
          <p className="mt-2 text-sm font-medium text-slate-200">The brief needs an Anthropic API key</p>
          <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Set <code className="font-mono text-slate-300">ANTHROPIC_API_KEY</code> in{' '}
            <code className="font-mono text-slate-300">frontend/.env.local</code> and restart the dev server —
            the same key powers the Research and AI Agents sections.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">{error}</p>
      )}

      {brief && !needsKey && (
        <article className="rounded-card border border-border bg-bg-card p-6">
          <p className="text-[11px] text-text-muted mb-4">
            Generated {new Date(brief.generatedAt).toLocaleString()} · from live prices and news at generation time
          </p>
          <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{brief.text}</div>
        </article>
      )}

      {!brief && !needsKey && !loading && (
        <div className="rounded-card border border-dashed border-border p-10 text-center text-sm text-text-muted">
          No brief yet today — hit “Generate” and the agent will pull live prices and headlines for your instruments.
        </div>
      )}
    </div>
  )
}
