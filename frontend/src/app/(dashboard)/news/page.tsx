'use client'

import { useState, useMemo } from 'react'
import { Newspaper, ExternalLink, Clock, Tag, Zap } from 'lucide-react'
import { clsx } from 'clsx'
import { getMockNews, NEWS_CATEGORIES } from '@/lib/api/mock/mockNews'
import type { NewsArticle, NewsSentiment, NewsCategory } from '@/lib/api/mock/mockNews'
import { ASSET_TYPE_LABELS } from '@/lib/constants'

const ASSET_OPTIONS = [
  { value: 'all', label: 'All Assets' },
  { value: 'usdc', label: 'USDC' },
  { value: 'usdt', label: 'USDT' },
  { value: 'dai', label: 'DAI' },
  { value: 'frax', label: 'FRAX' },
  { value: 'tusd', label: 'TUSD' },
  { value: 'pyusd', label: 'PYUSD' },
  { value: 'usdp', label: 'USDP' },
  { value: 'gusd', label: 'GUSD' },
  { value: 'lusd', label: 'LUSD' },
  { value: 'busd', label: 'BUSD' },
]

const SENTIMENT_STYLES: Record<NewsSentiment, string> = {
  positive: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
  neutral: 'text-slate-400 bg-slate-400/10 border-slate-500/20',
  negative: 'text-red-400 bg-red-400/10 border-red-500/20',
}

const CATEGORY_STYLES: Record<NewsCategory, string> = {
  regulation: 'text-violet-400 bg-violet-400/10 border-violet-500/20',
  market: 'text-blue-400 bg-blue-400/10 border-blue-500/20',
  protocol: 'text-cyan-400 bg-cyan-400/10 border-cyan-500/20',
  security: 'text-red-400 bg-red-400/10 border-red-500/20',
  adoption: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
  macro: 'text-amber-400 bg-amber-400/10 border-amber-500/20',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function ArticleCard({ article }: { article: NewsArticle }) {
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
          <span
            className={clsx(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize',
              CATEGORY_STYLES[article.category]
            )}
          >
            {article.category}
          </span>
          <span
            className={clsx(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize',
              SENTIMENT_STYLES[article.sentiment]
            )}
          >
            {article.sentiment}
          </span>
        </div>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-text-muted hover:text-accent-blue transition-colors flex-shrink-0 mt-0.5"
          aria-label="Open article"
        >
          <ExternalLink size={13} aria-hidden />
        </a>
      </div>

      {/* Headline */}
      <h2 className="text-sm font-semibold text-text-primary leading-snug group-hover:text-accent-blue transition-colors">
        {article.headline}
      </h2>

      {/* Summary */}
      <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">
        {article.summary}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <div className="flex items-center gap-1.5">
          <Tag size={10} className="text-text-muted flex-shrink-0" aria-hidden />
          <div className="flex flex-wrap gap-1">
            {article.relatedAssets.map((id) => (
              <span
                key={id}
                className="px-1.5 py-0.5 rounded bg-accent-blue/10 border border-accent-blue/20 text-[10px] font-mono text-accent-blue uppercase"
              >
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

export default function NewsPage() {
  const [assetFilter, setAssetFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState<NewsCategory | 'all'>('all')

  const articles = useMemo(
    () => getMockNews(assetFilter, categoryFilter),
    [assetFilter, categoryFilter]
  )

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
            <h1 className="text-lg font-semibold text-text-primary">News & Analysis</h1>
            <p className="text-xs text-text-muted">Regulatory, protocol, and market updates for tracked assets</p>
          </div>
        </div>
        <span className="text-xs text-text-muted font-mono">{articles.length} stories</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Asset filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Asset:</span>
          <select
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className="bg-bg-secondary border border-border rounded px-2 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-accent-blue/60"
          >
            {ASSET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Category filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {NEWS_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value as NewsCategory | 'all')}
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

      {/* Breaking news */}
      {breaking.length > 0 && (
        <section aria-label="Breaking news">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} className="text-amber-400" aria-hidden />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Breaking</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {breaking.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}

      {/* Main feed */}
      {rest.length > 0 ? (
        <section aria-label="News feed">
          {breaking.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Latest</span>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {rest.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      ) : breaking.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <Newspaper size={36} className="mb-3 opacity-30" aria-hidden />
          <p className="text-sm">No stories match the current filters</p>
        </div>
      ) : null}
    </div>
  )
}
