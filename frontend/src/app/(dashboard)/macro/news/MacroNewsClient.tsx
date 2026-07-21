'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Banknote, Gem, Newspaper, Percent, RefreshCw, TrendingDown, TrendingUp, Zap } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { timeAgo } from '@/lib/utils/format'
import { STALE_TIME_MEDIUM } from '@/lib/constants'
import type { MacroNewsArticle, MacroNewsResponse, MacroPillar, MacroSentiment } from '@/app/live-data/macro-news/route'

// Macro Markets news — commodities, currencies, and bonds/rates only.
// Off-topic articles are dropped server-side; this page just filters and
// renders. Pillar chips narrow to one area; sentiment chips stack on top.

const PILLAR_INFO: Record<MacroPillar, { label: string; color: string; icon: typeof Gem }> = {
  commodities: { label: 'Commodities',  color: '#f59e0b', icon: Gem },
  currencies:  { label: 'Currencies',   color: '#22c55e', icon: Banknote },
  bonds:       { label: 'Bonds & Rates', color: '#8b5cf6', icon: Percent },
}

const SENTIMENT_INFO: Record<MacroSentiment, { label: string; className: string }> = {
  positive: { label: 'Positive', className: 'text-emerald-400' },
  negative: { label: 'Negative', className: 'text-red-400' },
  neutral:  { label: 'Neutral',  className: 'text-text-muted' },
}

function ArticleRow({ article }: { article: MacroNewsArticle }) {
  const pillar = PILLAR_INFO[article.pillar]
  const sentiment = SENTIMENT_INFO[article.sentiment]
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <a href={article.url} target="_blank" rel="noopener noreferrer"
            className="text-sm font-medium text-text-primary hover:text-accent-blue transition-colors leading-snug">
            {article.title}
          </a>
          {article.summary && (
            <p className="mt-1 text-xs text-text-muted leading-relaxed line-clamp-2">{article.summary}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="flex items-center gap-1.5 font-medium" style={{ color: pillar.color }}>
              <pillar.icon size={11} aria-hidden />
              {pillar.label}
            </span>
            <span className={clsx('flex items-center gap-1', sentiment.className)}>
              {article.sentiment === 'positive' && <TrendingUp size={11} aria-hidden />}
              {article.sentiment === 'negative' && <TrendingDown size={11} aria-hidden />}
              {sentiment.label}
            </span>
            <span className="text-text-muted">{article.source}</span>
            <span className="text-text-muted">{timeAgo(article.publishedAt)}</span>
            {article.isBreaking && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 font-medium">
                <Zap size={10} aria-hidden /> Breaking
              </span>
            )}
            {article.related.map((r) => (
              <Link key={r.href} href={r.href}
                className="px-1.5 py-0.5 rounded border border-border text-text-secondary hover:text-accent-blue hover:border-accent-blue/40 transition-colors">
                {r.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function MacroNewsClient() {
  const [pillar, setPillar] = useState<MacroPillar | 'all'>('all')
  const [sentiment, setSentiment] = useState<MacroSentiment | 'all'>('all')

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<MacroNewsResponse>({
    queryKey: ['macro-news'],
    queryFn: () => fetch('/live-data/macro-news?limit=60').then((r) => r.json()),
    staleTime: STALE_TIME_MEDIUM,
    refetchInterval: 1000 * 60 * 5,
  })

  const articles = useMemo(() => {
    let list = data?.ok ? data.articles : []
    if (pillar !== 'all') list = list.filter((a) => a.pillar === pillar)
    if (sentiment !== 'all') list = list.filter((a) => a.sentiment === sentiment)
    return list
  }, [data, pillar, sentiment])

  const counts = useMemo(() => {
    const all = data?.ok ? data.articles : []
    return {
      all: all.length,
      commodities: all.filter((a) => a.pillar === 'commodities').length,
      currencies: all.filter((a) => a.pillar === 'currencies').length,
      bonds: all.filter((a) => a.pillar === 'bonds').length,
    }
  }, [data])

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
          <Newspaper size={18} className="text-accent-blue" aria-hidden />
        </div>
        <PageHeader
          title="Macro News"
          subtitle="Commodities, currencies, and bonds — nothing else"
          description="Multi-feed news scoped strictly to the three macro pillars. Articles from general market feeds appear only when they are actually about commodities, currencies, or rates; everything else is dropped server-side. Detected instruments link to their detail pages."
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setPillar('all')}
          className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
            pillar === 'all' ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary')}>
          All ({counts.all})
        </button>
        {(Object.entries(PILLAR_INFO) as Array<[MacroPillar, typeof PILLAR_INFO[MacroPillar]]>).map(([id, info]) => (
          <button key={id} onClick={() => setPillar(pillar === id ? 'all' : id)}
            className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              pillar === id ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary')}>
            <span className="size-1.5 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
            {info.label} ({counts[id]})
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {(['positive', 'neutral', 'negative'] as MacroSentiment[]).map((s) => (
          <button key={s} onClick={() => setSentiment(sentiment === s ? 'all' : s)}
            className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              sentiment === s ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary')}>
            {SENTIMENT_INFO[s].label}
          </button>
        ))}
        <button onClick={() => refetch()} aria-label="Refresh news"
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded border border-border text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RefreshCw size={12} className={clsx(isRefetching && 'animate-spin')} aria-hidden /> Refresh
        </button>
      </div>

      {isError || (data && !data.ok) ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-text-secondary leading-relaxed">
          No news feeds are reachable right now. Articles return when at least one source recovers.
        </div>
      ) : isLoading ? (
        <p className="py-10 text-center text-xs text-text-muted">Fetching macro news…</p>
      ) : (
        <div className="rounded-card border border-border bg-bg-card overflow-hidden divide-y divide-border/40">
          {articles.map((a) => <ArticleRow key={a.id} article={a} />)}
          {articles.length === 0 && (
            <p className="py-10 text-center text-xs text-text-muted">Nothing matches the current filters.</p>
          )}
        </div>
      )}

      <p className="text-[11px] text-text-muted text-center leading-relaxed">
        Sources: Investing.com (commodities / forex / bonds), OilPrice, FXStreet, MarketWatch, CNBC — all keyless
        RSS. Sentiment is keyword-based and indicative, not a trading signal.
      </p>
    </div>
  )
}
