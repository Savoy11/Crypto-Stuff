'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare, ExternalLink, Clock, TrendingUp, TrendingDown,
  Minus, Settings, Loader2, Share2, Check, ThumbsUp, Users, RefreshCw,
} from 'lucide-react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { SourceLine } from '@/components/ui/SourceLine'
import { LIVE_DATA } from '@/lib/constants'
import type { SocialSignal, AssetSentiment } from '@/app/live-data/social/route'
import { useAssetList } from '@/lib/hooks/useAssetList'

// ─── Read custom subreddits saved from the Integrations page ─────────────────

const SUBREDDIT_STORAGE_KEY = 'caep-custom-subreddits'

function useCustomSubreddits() {
  const [subreddits, setSubreddits] = useState<string[]>([])
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SUBREDDIT_STORAGE_KEY)
      if (stored) setSubreddits(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])
  return subreddits
}

// ─── Constants ────────────────────────────────────────────────────────────────


const PLATFORM_STYLES: Record<string, { label: string; color: string }> = {
  reddit:   { label: 'Reddit',   color: 'text-orange-400 bg-orange-400/10 border-orange-500/20' },
  twitter:  { label: 'Twitter',  color: 'text-sky-400 bg-sky-400/10 border-sky-500/20' },
  telegram: { label: 'Telegram', color: 'text-blue-400 bg-blue-400/10 border-blue-500/20' },
  other:    { label: 'Other',    color: 'text-slate-400 bg-slate-400/10 border-slate-500/20' },
}

const SENTIMENT_STYLES = {
  positive: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
  neutral:  'text-slate-400 bg-slate-400/10 border-slate-500/20',
  negative: 'text-red-400 bg-red-400/10 border-red-500/20',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Share button ─────────────────────────────────────────────────────────────

function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false)
  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (navigator.share) {
      try { await navigator.share({ title, url }) } catch { /* cancelled */ }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.focus(); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleShare} className="text-text-muted hover:text-violet-400 transition-colors" aria-label={copied ? 'Copied' : 'Share'}>
      {copied ? <Check size={13} className="text-emerald-400" /> : <Share2 size={13} />}
    </button>
  )
}

// ─── Sentiment bar ────────────────────────────────────────────────────────────

function SentimentBar({ summary }: { summary: AssetSentiment }) {
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
        <span className="text-sm font-semibold text-text-primary">{summary.label}</span>
        <div className="flex items-center gap-1.5">
          <TrendIcon size={13} className={trendColor} />
          <span className={clsx('text-xs font-mono font-semibold', trendColor)}>
            {score >= 0 ? '+' : ''}{(score * 100).toFixed(0)}
          </span>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="h-2 rounded-full overflow-hidden flex gap-px">
        {posPct > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${posPct}%` }} />}
        {neuPct > 0 && <div className="bg-slate-600 transition-all" style={{ width: `${neuPct}%` }} />}
        {negPct > 0 && <div className="bg-red-500 transition-all" style={{ width: `${negPct}%` }} />}
      </div>

      <div className="flex items-center justify-between text-[11px] text-text-muted">
        <span className="text-emerald-400">{posPct}% positive</span>
        <span className="flex items-center gap-1"><Users size={10} />{total} signals</span>
        <span className="text-red-400">{negPct}% negative</span>
      </div>
    </div>
  )
}

// ─── Signal card ──────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: SocialSignal }) {
  const platform = PLATFORM_STYLES[signal.platform] ?? PLATFORM_STYLES.other

  return (
    <article className="group bg-bg-card border border-border rounded-lg p-4 flex flex-col gap-3 transition-all hover:border-violet-500/30 hover:bg-bg-elevated">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', platform.color)}>
            {platform.label}
            {signal.subreddit && <span className="ml-1 opacity-70">r/{signal.subreddit}</span>}
          </span>
          <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize', SENTIMENT_STYLES[signal.sentiment])}>
            {signal.sentiment}
          </span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border border-slate-700 text-slate-400 bg-slate-800">
            via {signal.providerLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <ShareButton url={signal.url} title={signal.title} />
          <a
            href={signal.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-text-muted hover:text-violet-400 transition-colors"
            aria-label="Open post"
          >
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Title */}
      <h2 className="text-sm font-semibold text-text-primary leading-snug group-hover:text-violet-300 transition-colors">
        {signal.title}
      </h2>

      {/* Body excerpt */}
      {signal.body && (
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">{signal.body}</p>
      )}

      {/* Footer */}
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
          {signal.author && (
            <span className="text-[11px] text-text-muted">u/{signal.author}</span>
          )}
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

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function fetchSocial(asset: string, extraSubs: string[]): Promise<{
  signals: SocialSignal[]
  summaries: AssetSentiment[]
  providers: { id: string; name: string }[]
}> {
  const params = new URLSearchParams({ asset, limit: '50' })
  if (extraSubs.length > 0) params.set('subreddits', extraSubs.join(','))
  const res = await fetch(`/live-data/social?${params}`)
  if (!res.ok) return { signals: [], summaries: [], providers: [] }
  return res.json()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SocialPage() {
  const [assetFilter, setAssetFilter] = useState('all')
  const subreddits = useCustomSubreddits()
  const { assets: assetList } = useAssetList()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['live-social', assetFilter, subreddits],
    queryFn: () => fetchSocial(assetFilter, subreddits),
    enabled: LIVE_DATA,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const signals = data?.signals ?? []
  const summaries = data?.summaries ?? []
  const activeProviders = data?.providers ?? []
  const noProviders = LIVE_DATA && !isLoading && activeProviders.length === 0

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <MessageSquare size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Social Intelligence</h1>
            <p className="text-xs text-text-muted">
              {LIVE_DATA && activeProviders.length > 0
                ? `Live from: ${activeProviders.map((p) => p.name).join(', ')}`
                : 'Community sentiment and social signals across tracked assets'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && signals.length > 0 && (
            <span className="text-xs text-text-muted font-mono">{signals.length} signals</span>
          )}
          {LIVE_DATA && (
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-50"
              title="Refresh social signals"
            >
              <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Data provenance */}
      <SourceLine id="social" />

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Asset:</span>
          <select
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className="bg-bg-secondary border border-border rounded px-2 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-violet-500/60"
          >
              <option value="all">All Assets</option>
              {assetList.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.symbol})</option>
              ))}
          </select>
        </div>
        {subreddits.length > 0 && (
          <span className="text-xs text-slate-500">
            +{subreddits.length} custom subreddit{subreddits.length > 1 ? 's' : ''} active
          </span>
        )}
        <Link
          href="/settings"
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <Settings size={12} /> Manage subreddits
        </Link>
      </div>

      {/* No providers */}
      {noProviders && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-8 text-center">
          <MessageSquare className="mx-auto h-7 w-7 text-violet-400/70" />
          <p className="mt-2 font-medium text-slate-200 text-sm">No social sources configured</p>
          <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
            Reddit is active by default with no API key required. Check Integrations to verify it&apos;s enabled, or add LunarCrush/Santiment for deeper analytics.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
          >
            <Settings size={14} /> Open Integrations
          </Link>
        </div>
      )}

      {/* Loading */}
      {LIVE_DATA && isLoading && (
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
            {summaries.map((s) => <SentimentBar key={s.asset} summary={s} />)}
          </div>
        </section>
      )}

      {/* Signal feed */}
      {!isLoading && signals.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Recent Signals</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {signals.map((s) => <SignalCard key={s.id} signal={s} />)}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!isLoading && !noProviders && signals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <MessageSquare size={36} className="mb-3 opacity-30" />
          <p className="text-sm">No social signals found for this asset</p>
        </div>
      )}
    </div>
  )
}
