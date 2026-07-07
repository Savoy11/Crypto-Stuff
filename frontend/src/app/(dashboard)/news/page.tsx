'use client'

import { useState, useCallback, useMemo } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Newspaper, ExternalLink, Clock, Tag, Zap, Settings, Loader2, Share2, Check, RefreshCw, Search, X, Info } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import Link from 'next/link'
import { clsx } from 'clsx'
import { NEWS_CATEGORIES } from '@/lib/data/newsCategories'
import type { NewsCategory, NewsArticle } from '@/lib/data/newsCategories'
import { LIVE_DATA } from '@/lib/constants'
import type { LiveNewsArticle } from '@/app/live-data/news/route'
import { useAssetList } from '@/lib/hooks/useAssetList'
import { useTierStore } from '@/store/useTierStore'
import { resolveNewsProviders } from '@/lib/tier'

// ─── Shared types ─────────────────────────────────────────────────────────────

type AnyArticle = LiveNewsArticle | NewsArticle

const SENTIMENT_STYLES = {
  positive: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
  neutral:  'text-slate-400 bg-slate-400/10 border-slate-500/20',
  negative: 'text-red-400 bg-red-400/10 border-red-500/20',
}

const CATEGORY_STYLES: Record<string, string> = {
  regulation: 'text-violet-400 bg-violet-400/10 border-violet-500/20',
  market:     'text-blue-400 bg-blue-400/10 border-blue-500/20',
  protocol:   'text-cyan-400 bg-cyan-400/10 border-cyan-500/20',
  security:   'text-red-400 bg-red-400/10 border-red-500/20',
  adoption:   'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
  macro:      'text-amber-400 bg-amber-400/10 border-amber-500/20',
  global:     'text-teal-400 bg-teal-400/10 border-teal-500/20',
  general:    'text-slate-400 bg-slate-400/10 border-slate-500/20',
}

// Provider badge colours — each service gets a distinct tint
const PROVIDER_STYLES: Record<string, string> = {
  cryptopanic: 'text-orange-400 bg-orange-400/10 border-orange-500/20',
  messari:     'text-purple-400 bg-purple-400/10 border-purple-500/20',
  newsapi:     'text-sky-400 bg-sky-400/10 border-sky-500/20',
  unknown:     'text-slate-400 bg-slate-400/10 border-slate-500/20',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Article card ─────────────────────────────────────────────────────────────

function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false)

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (navigator.share) {
      try { await navigator.share({ title, url }) } catch { /* user cancelled */ }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Fallback for insecure contexts (http/preview iframe)
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleShare}
      className="text-text-muted hover:text-accent-blue transition-colors flex-shrink-0 mt-0.5"
      aria-label={copied ? 'Link copied' : 'Share article'}
    >
      {copied ? <Check size={13} className="text-emerald-400" aria-hidden /> : <Share2 size={13} aria-hidden />}
    </button>
  )
}

function ArticleCard({ article }: { article: AnyArticle }) {
  const provider = 'provider' in article ? article.provider : 'unknown'
  const providerLabel = 'providerLabel' in article ? article.providerLabel : null
  const providerStyle = PROVIDER_STYLES[provider] ?? PROVIDER_STYLES.unknown
  const categoryStyle = CATEGORY_STYLES[article.category] ?? CATEGORY_STYLES.general

  return (
    <article
      className={clsx(
        'group bg-bg-card border rounded-lg p-4 flex flex-col gap-3 transition-all hover:border-accent-blue/40 hover:bg-bg-elevated',
        article.isBreaking ? 'border-amber-500/40' : 'border-border'
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {article.isBreaking && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
              <Zap size={9} aria-hidden /> Breaking
            </span>
          )}
          <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize', categoryStyle)}>
            {article.category}
          </span>
          <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize', SENTIMENT_STYLES[article.sentiment])}>
            {article.sentiment}
          </span>
          {/* Provider service badge */}
          {providerLabel && (
            <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', providerStyle)}>
              via {providerLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <ShareButton url={article.url} title={article.headline} />
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-text-muted hover:text-accent-blue transition-colors"
            aria-label="Open article"
          >
            <ExternalLink size={13} aria-hidden />
          </a>
        </div>
      </div>

      {/* Headline */}
      <h2 className="text-sm font-semibold text-text-primary leading-snug group-hover:text-accent-blue transition-colors">
        {article.headline}
      </h2>

      {/* Summary */}
      {article.summary && article.summary !== article.headline && (
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">{article.summary}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <div className="flex items-center gap-1.5">
          <Tag size={10} className="text-text-muted flex-shrink-0" aria-hidden />
          <div className="flex flex-wrap gap-1">
            {article.relatedAssets.map((id) => (
              <span key={id} className="px-1.5 py-0.5 rounded bg-accent-blue/10 border border-accent-blue/20 text-[10px] font-mono text-accent-blue uppercase">
                {id}
              </span>
            ))}
          </div>
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

// ─── Live news fetcher ────────────────────────────────────────────────────────

async function fetchLiveNews(
  asset: string,
  keywords: string[],
  providersFilter: string | null,
): Promise<{ articles: LiveNewsArticle[]; providers: { id: string; name: string }[] }> {
  const params = new URLSearchParams({ asset, limit: '60' })
  if (keywords.length > 0) params.set('q', keywords.join(','))
  if (providersFilter) params.set('providers', providersFilter)
  const res = await fetch(`/live-data/news?${params}`)
  if (!res.ok) return { articles: [], providers: [] }
  return res.json()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewsPage() {
  const [assetFilter, setAssetFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState<NewsCategory | 'all'>('all')
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'neutral' | 'negative'>('all')
  const [keywordInput, setKeywordInput] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const { assets: assetList } = useAssetList()

  const addKeyword = useCallback(() => {
    const trimmed = keywordInput.trim().toLowerCase()
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords((prev) => [...prev, trimmed])
    }
    setKeywordInput('')
  }, [keywordInput, keywords])

  const removeKeyword = useCallback((kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw))
  }, [])

  // Live mode: fetch from configured news providers. In the Custom tier the
  // user can select a subset of sources (TierSwitch multi-select) — that
  // selection flows through as a ?providers= filter.
  const tierMode = useTierStore((s) => s.mode)
  const customSources = useTierStore((s) => s.customSources)
  const providersFilter = resolveNewsProviders(tierMode, customSources)

  const { data: liveData, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['live-news', assetFilter, keywords, providersFilter],
    queryFn: () => fetchLiveNews(assetFilter, keywords, providersFilter),
    enabled: LIVE_DATA,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    // Keep the prior result visible while a new filter/keyword query runs, so
    // switching filters doesn't blank the list back to a full-page loader.
    placeholderData: keepPreviousData,
  })

  const liveArticles = useMemo<AnyArticle[]>(() => liveData?.articles ?? [], [liveData])
  const activeProviders = liveData?.providers ?? []
  const noProviders = LIVE_DATA && !isLoading && activeProviders.length === 0

  // Apply client-side filters to live articles
  const articles: AnyArticle[] = useMemo(() => {
    const base: AnyArticle[] = liveArticles.filter(
      (a) => categoryFilter === 'all' || a.category === categoryFilter
    )

    return base.filter((a) => {
      if (sentimentFilter !== 'all' && a.sentiment !== sentimentFilter) return false
      if (keywords.length > 0) {
        // Match by topic, not just the headline: fold in the article's
        // classified category, tagged assets, source, and sentiment alongside
        // the headline + summary. So "regulation", "btc", or "coindesk" match
        // articles on that topic even when the word isn't in the title.
        const topic = [
          a.headline,
          a.summary ?? '',
          a.category,
          a.sentiment,
          a.source,
          ...a.relatedAssets,
        ].join(' ').toLowerCase()
        if (!keywords.every((kw) => topic.includes(kw))) return false
      }
      return true
    })
  }, [liveArticles, categoryFilter, sentimentFilter, keywords])

  const breaking = articles.filter((a) => a.isBreaking)
  const rest = articles.filter((a) => !a.isBreaking)

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto w-full">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
            <Newspaper size={18} className="text-accent-blue" aria-hidden />
          </div>
          <div>
            <PageHeader
              title="News & Analysis"
              subtitle={LIVE_DATA && activeProviders.length > 0
                ? `Live feed from: ${activeProviders.map((p) => p.name).join(', ')}`
                : 'Regulatory, protocol, and market updates for tracked assets'}
              description="News & Analysis aggregates regulatory, protocol, and market stories from multiple providers. Each article is tagged with the assets it mentions and a sentiment score so you can filter by coin or quickly spot negative coverage."
              details={[
                { label: 'Asset detection', text: 'Articles are tagged using coin name/ticker matching, issuer mapping (e.g. Circle → USDC), and regulatory inference (e.g. MiCA → USDC, USDT).' },
                { label: 'Sentiment', text: 'Positive (green dot) · Neutral (grey) · Negative (red). Sentiment is inferred from headline keywords.' },
                { label: 'Sources', text: 'CAEP aggregates live RSS and JSON feeds from The Block, CoinDesk, Cointelegraph, and others. There is no mock mode — if no feed is reachable the list is shown as empty rather than seeded with fabricated articles.' },
                { label: 'Keyword filter', text: 'Type a word or phrase to filter the feed by topic. Keywords match against each story’s headline, summary, classified category, tagged assets, sentiment, and source — so terms like "regulation" or "btc" match relevant stories even when the word isn’t in the title. Multiple keywords are combined with AND (every keyword must match); matching is case-insensitive. Adding a keyword also queries the news providers (NewsAPI, GNews) for fresh stories on that term, so the feed pulls in matching coverage rather than only filtering what is already loaded.' },
              ]}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && <span className="text-xs text-text-muted font-mono">{articles.length} stories</span>}
          {LIVE_DATA && (
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-50"
              title="Refresh news feed"
            >
              <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
              Refresh
            </button>
          )}
          {LIVE_DATA && (
            <Link
              href="/settings"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Settings size={12} /> Manage sources
            </Link>
          )}
        </div>
      </div>

      {/* No providers configured */}
      {noProviders && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-8 text-center">
          <Newspaper className="mx-auto h-7 w-7 text-amber-400/70" />
          <p className="mt-2 font-medium text-slate-200 text-sm">No news sources configured</p>
          <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
            CryptoPanic now requires a paid API key (its free tier ended April 2026). Add a news source in Integrations to start seeing live news.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-accent-blue text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            <Settings size={14} /> Open Integrations
          </Link>
        </div>
      )}

      {/* Loading — only the full-page loader on the very first load with no
          content yet. Background refetches keep showing the existing list. */}
      {LIVE_DATA && isLoading && liveArticles.length === 0 && !isError && (
        <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Fetching from {activeProviders.length > 0 ? activeProviders.map((p) => p.name).join(', ') : 'news sources'}…</span>
        </div>
      )}

      {/* Error — only when the request actually failed and we have nothing cached. */}
      {LIVE_DATA && isError && liveArticles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
          <Info size={20} className="text-amber-400" />
          <span className="text-sm">Couldn&apos;t reach the news providers. They may be rate-limited or temporarily down.</span>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:bg-bg-elevated transition-colors"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Filters — visible whenever we have content to filter (or are past the
          initial load). Not gated on background refetches. */}
      {(!noProviders && (liveArticles.length > 0 || !isLoading)) && (
        <div className="flex flex-col gap-3">
          {/* Row 1: asset + sentiment + keyword search */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Asset */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Asset:</span>
              <select
                value={assetFilter}
                onChange={(e) => setAssetFilter(e.target.value)}
                className="bg-bg-secondary border border-border rounded px-2 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-accent-blue/60"
              >
                <option value="all">All Assets</option>
                {assetList.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.symbol})</option>
                ))}
              </select>
            </div>
            {/* Sentiment */}
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
                        : 'text-text-muted border-border hover:text-text-secondary hover:border-border/80 hover:bg-bg-elevated'
                    )}
                  >
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>
            </div>
            {/* Keyword search */}
            <div className="flex items-center gap-2 flex-1 min-w-48">
              <span className="text-xs text-text-muted shrink-0">Keywords:</span>
              <form
                className="flex gap-1.5 flex-1"
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
          </div>

          {/* Active keyword chips */}
          {keywords.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-text-muted">Filtering by:</span>
              {keywords.map((kw) => (
                <span key={kw} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-blue/10 border border-accent-blue/25 text-[11px] font-mono text-accent-blue">
                  {kw}
                  <button onClick={() => removeKeyword(kw)} className="hover:text-white transition-colors" aria-label={`Remove keyword ${kw}`}>
                    <X size={10} />
                  </button>
                </span>
              ))}
              <button onClick={() => setKeywords([])} className="text-[11px] text-text-muted hover:text-text-secondary transition-colors ml-1">
                Clear all
              </button>
            </div>
          )}

          {/* How keyword filtering works */}
          <div className="flex items-start gap-1.5 text-[11px] text-text-muted/80 leading-relaxed">
            <Info size={11} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
            <p>
              <span className="text-text-secondary font-medium">How keywords work:</span> type a word or phrase and press Enter (or “Add”) to filter the
              feed by <span className="text-text-secondary">topic</span>. A keyword is matched against each story’s headline, summary, classified category,
              tagged assets, sentiment, and source — so terms like <span className="text-text-secondary">“regulation”</span>,{' '}
              <span className="text-text-secondary">“btc”</span>, or a publication name match stories on that topic even when the word isn’t in the title. Add
              several keywords to narrow further — an article must match <span className="text-text-secondary">all</span> of them. Matching is
              case-insensitive and combines with the Asset, Sentiment, and Category filters. Adding a keyword also{' '}
              <span className="text-text-secondary">queries the news providers</span> for fresh stories on that term, so the feed pulls in matching
              coverage rather than only filtering what’s already loaded.
            </p>
          </div>

          {/* Row 2: category buttons — no "All" button; nothing selected = all
              categories, and reclicking the active category deselects it */}
          <div className="flex flex-wrap gap-1.5">
            {NEWS_CATEGORIES.filter((cat) => cat.value !== 'all').map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(categoryFilter === cat.value ? 'all' : (cat.value as NewsCategory))}
                title={categoryFilter === cat.value ? 'Click again to show all categories' : undefined}
                className={clsx(
                  'px-2.5 py-1 rounded text-xs font-medium border transition-all',
                  categoryFilter === cat.value
                    ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                    : 'text-text-muted border-border hover:text-text-secondary hover:border-border/80 hover:bg-bg-elevated'
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Breaking news */}
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

      {/* Main feed */}
      {!isLoading && rest.length > 0 && (
        <section aria-label="News feed">
          {breaking.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Latest</span>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {rest.map((article) => <ArticleCard key={article.id} article={article} />)}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!isLoading && !noProviders && articles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <Newspaper size={36} className="mb-3 opacity-30" aria-hidden />
          <p className="text-sm">No stories match the current filters</p>
        </div>
      )}
    </div>
  )
}
