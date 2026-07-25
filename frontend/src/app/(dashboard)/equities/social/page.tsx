'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare, ExternalLink, Clock, TrendingUp, TrendingDown,
  Minus, Loader2, ThumbsUp, Users, RefreshCw,
} from 'lucide-react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { SourceLine } from '@/components/ui/SourceLine'
import { EQUITY_CATALOG } from '@/lib/data/equityCatalog'
import type { StockSocialSignal, StockSentimentSummary, StockSocialResponse } from '@/app/live-data/stock-social/route'

// Equities counterpart of the crypto Social page — Reddit finance subreddits
// and StockTwits streams via /live-data/stock-social.

const PLATFORM_STYLES: Record<string, { label: string; color: string }> = {
  reddit:     { label: 'Reddit',     color: 'text-orange-400 bg-orange-400/10 border-orange-500/20' },
  stocktwits: { label: 'StockTwits', color: 'text-sky-400 bg-sky-400/10 border-sky-500/20' },
}

const SENTIMENT_STYLES = {
  positive: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
  neutral:  'text-slate-400 bg-slate-400/10 border-slate-500/20',
  negative: 'text-red-400 bg-red-400/10 border-red-500/20',
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function SentimentBar({ summary }: { summary: StockSentimentSummary }) {
  const { positive, neutral, negative, total } = summary
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
  const posPct = pct(positive)
  const negPct = pct(negative)
  const neuPct = 100 - posPct - negPct

  const score = summary.sentimentScore
  const TrendIcon = score > 0.1 ? TrendingUp : score < -0.1 ? TrendingDown : Minus
  const trendColor = score > 0.1 ? 'text-emerald-400' : score < -0.1 ? 'text-red-400' : 'text-slate-400'

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Link href={`/equities/${summary.symbol.toLowerCase()}`} className="text-sm font-semibold text-text-primary hover:text-accent-blue transition-colors">
          {summary.label}
        </Link>
        <div className="flex items-center gap-1.5">
          <TrendIcon size={13} className={trendColor} />
          <span className={clsx('text-xs font-mono font-semibold', trendColor)}>
            {score >= 0 ? '+' : ''}{(score * 100).toFixed(0)}
          </span>
        </div>
      </div>

      <div className="h-2 rounded-full overflow-hidden flex gap-px">
        {posPct > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${posPct}%` }} />}
        {neuPct > 0 && <div className="bg-slate-600 transition-all" style={{ width: `${neuPct}%` }} />}
        {negPct > 0 && <div className="bg-red-500 transition-all" style={{ width: `${negPct}%` }} />}
      </div>

      <div className="flex items-center justify-between text-[11px] text-text-muted">
        <span className="text-emerald-400">{posPct}% bullish</span>
        <span className="flex items-center gap-1"><Users size={10} />{total} signals</span>
        <span className="text-red-400">{negPct}% bearish</span>
      </div>
    </div>
  )
}

function SignalCard({ signal }: { signal: StockSocialSignal }) {
  const platform = PLATFORM_STYLES[signal.platform] ?? PLATFORM_STYLES.reddit

  return (
    <article className="group bg-bg-card border border-border rounded-lg p-4 flex flex-col gap-3 transition-all hover:border-violet-500/30 hover:bg-bg-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', platform.color)}>
            {platform.label}
            {signal.subreddit && <span className="ml-1 opacity-70">r/{signal.subreddit}</span>}
          </span>
          <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize', SENTIMENT_STYLES[signal.sentiment])}>
            {signal.sentiment === 'positive' ? 'bullish' : signal.sentiment === 'negative' ? 'bearish' : 'neutral'}
          </span>
          {signal.symbols.slice(0, 3).map((sym) => (
            <Link
              key={sym}
              href={`/equities/${sym.toLowerCase()}`}
              className="px-1.5 py-0.5 rounded bg-accent-blue/10 border border-accent-blue/20 text-[10px] font-mono text-accent-blue hover:bg-accent-blue/20 transition-colors"
            >
              ${sym}
            </Link>
          ))}
        </div>
        <a
          href={signal.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-muted hover:text-violet-400 transition-colors flex-shrink-0 mt-0.5"
          aria-label="Open post"
        >
          <ExternalLink size={13} />
        </a>
      </div>

      <h2 className="text-sm font-semibold text-text-primary leading-snug group-hover:text-violet-300 transition-colors">
        {signal.title}
      </h2>

      {signal.body && (
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">{signal.body}</p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <div className="flex items-center gap-2">
          {signal.score > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-text-muted">
              <ThumbsUp size={10} className="text-violet-400" />
              {signal.score.toLocaleString()}
            </span>
          )}
          {signal.upvoteRatio !== undefined && (
            <span className="text-[11px] text-text-muted font-mono">
              {Math.round(signal.upvoteRatio * 100)}% upvoted
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[11px] text-text-muted">{signal.platform === 'reddit' ? 'u/' : '@'}{signal.author}</span>
          <span className="text-text-muted/40">·</span>
          <span className="flex items-center gap-1 text-[11px] text-text-muted font-mono">
            <Clock size={10} />
            {timeAgo(signal.publishedAt)}
          </span>
        </div>
      </div>
    </article>
  )
}

function EquitySocialContent() {
  const [symbolFilter, setSymbolFilter] = useState('all')

  const { data, isLoading, isFetching, refetch } = useQuery<StockSocialResponse>({
    queryKey: ['stock-social', symbolFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '40' })
      if (symbolFilter !== 'all') params.set('symbol', symbolFilter)
      return fetch(`/live-data/stock-social?${params}`).then((r) => r.json())
    },
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const signals = data?.signals ?? []
  const summaries = data?.summaries ?? []
  const activeProviders = data?.providers ?? []

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <MessageSquare size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Stock Social Intelligence</h1>
            <p className="text-xs text-text-muted">
              {activeProviders.length > 0
                ? `Live from: ${activeProviders.map((p) => p.name).join(' + ')}`
                : 'Retail sentiment from finance communities — no API keys required'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && signals.length > 0 && (
            <span className="text-xs text-text-muted font-mono">{signals.length} signals</span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Data provenance */}
      <SourceLine id="stock-social" />

      {/* Symbol filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted">Symbol:</span>
        <select
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-2 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-violet-500/60"
        >
          <option value="all">All Stocks (trending)</option>
          {EQUITY_CATALOG.map((e) => (
            <option key={e.symbol} value={e.symbol}>{e.name} ({e.symbol})</option>
          ))}
        </select>
        <span className="text-[11px] text-text-muted ml-2">
          Bullish/bearish tags come from StockTwits author labels where declared, keyword scoring otherwise.
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Fetching social signals…</span>
        </div>
      )}

      {/* Sentiment summaries */}
      {!isLoading && summaries.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Sentiment Overview</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summaries.map((s) => <SentimentBar key={s.symbol} summary={s} />)}
          </div>
        </section>
      )}

      {/* Feed */}
      {!isLoading && signals.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Recent Signals</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {signals.map((s) => <SignalCard key={s.id} signal={s} />)}
          </div>
        </section>
      )}

      {/* Empty */}
      {!isLoading && signals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <MessageSquare size={36} className="mb-3 opacity-30" />
          <p className="text-sm">No social signals available — Reddit/StockTwits may be unreachable.</p>
        </div>
      )}
    </div>
  )
}

export default function EquitySocialPage() {
  return (
    <ModuleGate module="equities">
      <EquitySocialContent />
    </ModuleGate>
  )
}
