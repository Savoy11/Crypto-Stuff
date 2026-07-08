'use client'

import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { clsx } from 'clsx'
import { ExternalLink, Newspaper } from 'lucide-react'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'
import { STALE_TIME_MEDIUM } from '@/lib/constants'
import type { MarketNewsResponse, MarketSentiment } from '@/app/live-data/market-news/route'

// Headline list shared by the equities and funds modules.
// Pass a symbol for per-ticker news; omit for general market headlines.

const SENTIMENT_STYLES: Record<MarketSentiment, string> = {
  positive: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
  negative: 'text-red-400 bg-red-400/10 border-red-500/20',
  neutral:  'text-slate-400 bg-slate-400/10 border-slate-500/20',
}

export function MarketNewsList({ symbol, limit = 10 }: { symbol?: string; limit?: number }) {
  const { data, isLoading } = useQuery<MarketNewsResponse>({
    queryKey: ['market-news', symbol ?? 'general', limit],
    queryFn: () => {
      const params = new URLSearchParams()
      if (symbol) params.set('symbol', symbol)
      params.set('limit', String(limit))
      return fetch(`/live-data/market-news?${params}`).then((r) => r.json())
    },
    staleTime: STALE_TIME_MEDIUM,
    refetchInterval: 5 * 60_000,
  })

  return (
    <div className="rounded-card border border-border bg-bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Newspaper size={14} className="text-text-muted" aria-hidden />
        <h2 className="text-sm font-medium text-text-secondary">
          {symbol ? `${symbol} News` : 'Market News'}
        </h2>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 4 }, (_, i) => <LoadingSkeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : data?.articles?.length ? (
        <ul className="divide-y divide-border/60">
          {data.articles.map((article) => (
            <li key={article.id}>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-3 hover:bg-bg-elevated/40 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary leading-snug group-hover:text-accent-blue transition-colors">
                    {article.title}
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    {article.source}
                    {' · '}
                    {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                  <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize', SENTIMENT_STYLES[article.sentiment])}>
                    {article.sentiment}
                  </span>
                  <ExternalLink size={12} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
                </div>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-text-muted">
          No headlines available right now — news feeds may be unreachable.
        </p>
      )}
    </div>
  )
}
