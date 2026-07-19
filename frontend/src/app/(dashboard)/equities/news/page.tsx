'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Newspaper, ExternalLink, Clock, Tag, Zap, Loader2, RefreshCw, Search, X } from 'lucide-react'
import { clsx } from 'clsx'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { useFeedBiasStore } from '@/store/useFeedBiasStore'
import { useWatchlistBias } from '@/lib/watchlist/useWatchlistBias'
import { applyBias, } from '@/lib/watchlist/bias'
import { PageHeader } from '@/components/ui/PageHeader'
import { EQUITY_CATALOG } from '@/lib/data/equityCatalog'
import type { MarketArticle, MarketNewsCategory, MarketNewsResponse } from '@/app/live-data/market-news/route'

// Equities counterpart of the crypto News page — same card layout, filters,
// and breaking section, fed by /live-data/market-news.

const SENTIMENT_STYLES = {
  positive: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
  neutral:  'text-slate-400 bg-slate-400/10 border-slate-500/20',
  negative: 'text-red-400 bg-red-400/10 border-red-500/20',
}

const CATEGORY_STYLES: Record<MarketNewsCategory, string> = {
  earnings: 'text-cyan-400 bg-cyan-400/10 border-cyan-500/20',
  analyst:  'text-violet-400 bg-violet-400/10 border-violet-500/20',
  macro:    'text-amber-400 bg-amber-400/10 border-amber-500/20',
  ma:       'text-pink-400 bg-pink-400/10 border-pink-500/20',
  dividend: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
  market:   'text-blue-400 bg-blue-400/10 border-blue-500/20',
  general:  'text-slate-400 bg-slate-400/10 border-slate-500/20',
}

const CATEGORIES: Array<{ value: MarketNewsCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'earnings', label: 'Earnings' },
  { value: 'analyst', label: 'Analyst Actions' },
  { value: 'macro', label: 'Macro & Fed' },
  { value: 'ma', label: 'M&A' },
  { value: 'dividend', label: 'Dividends & Buybacks' },
  { value: 'market', label: 'Market' },
  { value: 'general', label: 'General' },
]

const CATEGORY_LABELS: Record<MarketNewsCategory, string> = {
  earnings: 'earnings', analyst: 'analyst', macro: 'macro',
  ma: 'M&A', dividend: 'dividend', market: 'market', general: 'general',
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function ArticleCard({ article }: { article: MarketArticle }) {
  return (
    <article
      className={clsx(
        'group bg-bg-card border rounded-lg p-4 flex flex-col gap-3 transition-all hover:border-accent-blue/40 hover:bg-bg-elevated',
        article.isBreaking ? 'border-amber-500/40' : 'border-border'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {article.isBreaking && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
              <Zap size={9} aria-hidden /> Breaking
            </span>
          )}
          <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', CATEGORY_STYLES[article.category])}>
            {CATEGORY_LABELS[article.category]}
          </span>
          <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize', SENTIMENT_STYLES[article.sentiment])}>
            {article.sentiment}
          </span>
        </div>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-muted hover:text-accent-blue transition-colors flex-shrink-0 mt-0.5"
          aria-label="Open article"
        >
          <ExternalLink size={13} aria-hidden />
        </a>
      </div>

      <h2 className="text-sm font-semibold text-text-primary leading-snug group-hover:text-accent-blue transition-colors">
        {article.title}
      </h2>

      {article.summary && article.summary !== article.title && (
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">{article.summary}</p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <div className="flex items-center gap-1.5 min-w-0">
          {article.relatedSymbols.length > 0 && (
            <>
              <Tag size={10} className="text-text-muted flex-shrink-0" aria-hidden />
              <div className="flex flex-wrap gap-1">
                {article.relatedSymbols.slice(0, 4).map((sym) => (
                  <Link
                    key={sym}
                    href={`/equities/${sym.toLowerCase()}`}
                    className="px-1.5 py-0.5 rounded bg-accent-blue/10 border border-accent-blue/20 text-[10px] font-mono text-accent-blue hover:bg-accent-blue/20 transition-colors"
                  >
                    {sym}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[11px] text-text-muted font-medium">{article.source}</span>
          <span className="text-text-muted/40">·</span>
          <span className="flex items-center gap-1 text-[11px] text-text-muted font-mono">
            <Clock size={10} aria-hidden />
            {timeAgo(article.publishedAt)}
          </span>
        </div>
      </div>
    </article>
  )
}

function EquityNewsContent() {
  const [symbolFilter, setSymbolFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState<MarketNewsCategory | 'all'>('all')
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'neutral' | 'negative'>('all')
  const [keywordInput, setKeywordInput] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])

  const { data, isLoading, isFetching, refetch } = useQuery<MarketNewsResponse>({
    queryKey: ['equity-news', symbolFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' })
      if (symbolFilter !== 'all') params.set('symbol', symbolFilter)
      return fetch(`/live-data/market-news?${params}`).then((r) => r.json())
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const watchlist = useWatchlistBias()
  const biasStrength = useFeedBiasStore((s) => s.getStrength('market-news'))
  /** Market articles carry ticker tags; text is the fallback. */
  const toBiasable = (a: MarketArticle) => ({
    symbols: a.relatedSymbols,
    text: `${a.title} ${a.summary}`,
  })

  const articles = useMemo(() => {
    const filtered = (data?.articles ?? []).filter((a) => {
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false
      if (sentimentFilter !== 'all' && a.sentiment !== sentimentFilter) return false
      if (symbolFilter !== 'all' && !a.relatedSymbols.includes(symbolFilter)) return false
      if (keywords.length > 0) {
        const topic = [a.title, a.summary, a.category, a.sentiment, a.source, ...a.relatedSymbols]
          .join(' ').toLowerCase()
        if (!keywords.every((kw) => topic.includes(kw))) return false
      }
      return true
    })
    return applyBias(filtered, watchlist, biasStrength, toBiasable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, categoryFilter, sentimentFilter, symbolFilter, keywords, watchlist, biasStrength])

  const breaking = articles.filter((a) => a.isBreaking)
  const rest = articles.filter((a) => !a.isBreaking)

  const addKeyword = () => {
    const trimmed = keywordInput.trim().toLowerCase()
    if (trimmed && !keywords.includes(trimmed)) setKeywords((prev) => [...prev, trimmed])
    setKeywordInput('')
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
            <Newspaper size={18} className="text-accent-blue" aria-hidden />
          </div>
          <PageHeader
            title="Market News"
            subtitle="Earnings, analyst actions, macro, and market stories with ticker tagging"
            description="Aggregates stock-market headlines from Yahoo Finance, MarketWatch, and CNBC RSS feeds. Each article is classified by category, scored for sentiment from headline keywords, and tagged with catalog tickers it mentions."
            details={[
              { label: 'Ticker detection', text: 'Company-name matching plus $CASHTAG / uppercase ticker matching against the equity catalog. Ticker chips link to the stock detail page.' },
              { label: 'Symbol filter', text: 'Selecting a symbol also queries Yahoo Finance’s per-ticker feed for dedicated coverage.' },
            ]}
          />
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && <span className="text-xs text-text-muted font-mono">{articles.length} stories</span>}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Symbol:</span>
            <select
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              className="bg-bg-secondary border border-border rounded px-2 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-accent-blue/60"
            >
              <option value="all">All Stocks</option>
              {EQUITY_CATALOG.map((e) => (
                <option key={e.symbol} value={e.symbol}>{e.name} ({e.symbol})</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Sentiment:</span>
            <div className="flex gap-1">
              {(['all', 'positive', 'neutral', 'negative'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSentimentFilter(s)}
                  className={clsx(
                    'px-2.5 py-1 rounded text-xs font-medium border transition-all capitalize',
                    sentimentFilter === s
                      ? s === 'positive' ? 'bg-emerald-400/15 text-emerald-400 border-emerald-500/30'
                        : s === 'negative' ? 'bg-red-400/15 text-red-400 border-red-500/30'
                        : s === 'neutral' ? 'bg-slate-400/15 text-slate-300 border-slate-500/30'
                        : 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                      : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated'
                  )}
                >
                  {s === 'all' ? 'All' : s}
                </button>
              ))}
            </div>
          </div>
          <form
            className="flex gap-1.5 flex-1 min-w-48"
            onSubmit={(e) => { e.preventDefault(); addKeyword() }}
          >
            <div className="relative flex-1">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                placeholder="Add keyword filter…"
                className="w-full bg-bg-secondary border border-border rounded pl-6 pr-2 py-1.5 text-xs text-text-secondary placeholder:text-text-muted/60 focus:outline-none focus:border-accent-blue/60"
              />
            </div>
            <button
              type="submit"
              disabled={!keywordInput.trim()}
              className="px-2.5 py-1 rounded text-xs font-medium border border-border bg-bg-secondary text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors disabled:opacity-40"
            >
              Add
            </button>
          </form>
        </div>

        {keywords.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-text-muted">Filtering by:</span>
            {keywords.map((kw) => (
              <span key={kw} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-blue/10 border border-accent-blue/25 text-[11px] font-mono text-accent-blue">
                {kw}
                <button onClick={() => setKeywords((prev) => prev.filter((k) => k !== kw))} className="hover:text-white transition-colors" aria-label={`Remove keyword ${kw}`}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={clsx(
                'px-2.5 py-1 rounded text-xs font-medium border transition-all',
                categoryFilter === cat.value
                  ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                  : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Fetching market headlines…</span>
        </div>
      )}

      {/* Breaking */}
      {!isLoading && breaking.length > 0 && (
        <section aria-label="Breaking news">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} className="text-amber-400" aria-hidden />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Breaking</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {breaking.map((article) => <ArticleCard key={article.id} article={article} />)}
          </div>
        </section>
      )}

      {/* Feed */}
      {!isLoading && rest.length > 0 && (
        <section aria-label="News feed">
          {breaking.length > 0 && (
            <div className="mb-3">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Latest</span>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {rest.map((article) => <ArticleCard key={article.id} article={article} />)}
          </div>
        </section>
      )}

      {/* Empty */}
      {!isLoading && articles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <Newspaper size={36} className="mb-3 opacity-30" aria-hidden />
          <p className="text-sm">No stories match the current filters — feeds may be unreachable.</p>
        </div>
      )}
    </div>
  )
}

export default function EquityNewsPage() {
  return (
    <ModuleGate module="equities">
      <EquityNewsContent />
    </ModuleGate>
  )
}
