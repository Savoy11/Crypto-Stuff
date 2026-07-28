'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Newspaper, ExternalLink, Clock, Tag, Zap, Loader2, RefreshCw, Coins, LineChart, Star } from 'lucide-react'
import { clsx } from 'clsx'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { useEntitlementStore } from '@/store/useEntitlementStore'
import { useFeedBiasStore } from '@/store/useFeedBiasStore'
import { useWatchlistBias } from '@/lib/watchlist/useWatchlistBias'
import { applyBias, matchesWatchlist } from '@/lib/watchlist/bias'
import type { LiveNewsArticle } from '@/app/live-data/news/route'
import type { MarketNewsResponse } from '@/app/live-data/market-news/route'

// Aggregate landing feed. Merges the two general news sources the suite has —
// /live-data/news (crypto) and /live-data/market-news (equities) — into one
// normalized Story shape, then renders a cross-module "Top Stories" strip
// followed by a section per enabled module.
//
// Entitlements live client-side (useEntitlementStore, localStorage-persisted),
// so the merge happens here rather than in a server aggregate route: the server
// has no way to know which modules are in the user's bundle.

/** /live-data/news wraps its articles — it does not return a bare array. */
interface CryptoNewsResponse {
  ok: boolean
  articles: LiveNewsArticle[]
  providers: Array<{ id: string; name: string }>
}

type StoryModule = 'crypto' | 'markets'

interface Story {
  id: string
  title: string
  summary: string
  source: string
  url: string
  publishedAt: string
  sentiment: 'positive' | 'neutral' | 'negative'
  category: string
  /** Asset ids (crypto) or ticker symbols (markets). */
  tags: string[]
  isBreaking: boolean
  module: StoryModule
}

const MODULE_META: Record<StoryModule, { label: string; icon: typeof Coins; badge: string; accent: string; tagHref: (t: string) => string }> = {
  crypto: {
    label: 'Crypto',
    icon: Coins,
    badge: 'text-accent-blue bg-accent-blue/10 border-accent-blue/25',
    accent: 'text-accent-blue',
    tagHref: (t) => `/assets/${t.toLowerCase()}`,
  },
  markets: {
    label: 'Markets',
    icon: LineChart,
    badge: 'text-violet-400 bg-violet-400/10 border-violet-500/25',
    accent: 'text-violet-400',
    tagHref: (t) => `/equities/${t.toLowerCase()}`,
  },
}

const SENTIMENT_STYLES = {
  positive: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
  neutral:  'text-slate-400 bg-slate-400/10 border-slate-500/20',
  negative: 'text-red-400 bg-red-400/10 border-red-500/20',
}

const TOP_STORY_COUNT = 5
const SECTION_STORY_COUNT = 8

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Breaking first, then most recent. */
function rank(a: Story, b: Story): number {
  if (a.isBreaking !== b.isBreaking) return a.isBreaking ? -1 : 1
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
}

function StoryCard({ story, showModule = false, onWatchlist = false }: { story: Story; showModule?: boolean; onWatchlist?: boolean }) {
  const meta = MODULE_META[story.module]

  return (
    <article
      className={clsx(
        'group bg-bg-card border rounded-lg p-4 flex flex-col gap-3 transition-all hover:border-accent-blue/40 hover:bg-bg-elevated',
        story.isBreaking ? 'border-amber-500/40' : 'border-border'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {showModule && (
            <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wider', meta.badge)}>
              <meta.icon size={9} aria-hidden />
              {meta.label}
            </span>
          )}
          {/* Makes the bias visible — otherwise reordering looks like chance. */}
          {onWatchlist && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-400/10 text-amber-300 border border-amber-400/25 uppercase tracking-wider"
              title="Mentions an asset on your watchlist"
            >
              <Star size={9} aria-hidden /> Watchlist
            </span>
          )}
          {story.isBreaking && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
              <Zap size={9} aria-hidden /> Breaking
            </span>
          )}
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border text-slate-400 bg-slate-400/10 border-slate-500/20">
            {story.category}
          </span>
          <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize', SENTIMENT_STYLES[story.sentiment])}>
            {story.sentiment}
          </span>
        </div>
        <a
          href={story.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-muted hover:text-accent-blue transition-colors flex-shrink-0 mt-0.5"
          aria-label="Open article"
        >
          <ExternalLink size={13} aria-hidden />
        </a>
      </div>

      <h2 className="text-sm font-semibold text-text-primary leading-snug group-hover:text-accent-blue transition-colors">
        {story.title}
      </h2>

      {story.summary && story.summary !== story.title && (
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">{story.summary}</p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <div className="flex items-center gap-1.5 min-w-0">
          {story.tags.length > 0 && (
            <>
              <Tag size={10} className="text-text-muted flex-shrink-0" aria-hidden />
              <div className="flex flex-wrap gap-1">
                {story.tags.slice(0, 4).map((tag) => (
                  <Link
                    key={tag}
                    href={meta.tagHref(tag)}
                    className="px-1.5 py-0.5 rounded bg-accent-blue/10 border border-accent-blue/20 text-[10px] font-mono text-accent-blue hover:bg-accent-blue/20 transition-colors uppercase"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[11px] text-text-muted font-medium">{story.source}</span>
          <span className="text-text-muted/40">·</span>
          <span className="flex items-center gap-1 text-[11px] text-text-muted font-mono">
            <Clock size={10} aria-hidden />
            {timeAgo(story.publishedAt)}
          </span>
        </div>
      </div>
    </article>
  )
}

export default function HeadlinesPage() {
  // `funds` has no general news feed of its own — fund detail pages reuse
  // market-news symbol-scoped — so it shares the Markets section with equities.
  const cryptoOn = useEntitlementStore((s) => s.isEnabled('crypto'))
  const equitiesOn = useEntitlementStore((s) => s.isEnabled('equities'))
  const fundsOn = useEntitlementStore((s) => s.isEnabled('funds'))
  const marketsOn = equitiesOn || fundsOn

  const watchlist = useWatchlistBias()
  const biasStrength = useFeedBiasStore((s) => s.getStrength('headlines'))

  /** Story → matchable shape. Crypto tags are asset ids, market tags are tickers. */
  const toBiasable = (s: Story) => ({
    assetIds: s.module === 'crypto' ? s.tags : undefined,
    symbols: s.module === 'markets' ? s.tags : undefined,
    text: `${s.title} ${s.summary}`,
  })

  const cryptoQuery = useQuery<CryptoNewsResponse>({
    queryKey: ['headlines', 'crypto'],
    queryFn: () => fetch('/live-data/news?limit=40').then((r) => r.json()),
    enabled: cryptoOn,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const marketsQuery = useQuery<MarketNewsResponse>({
    queryKey: ['headlines', 'markets'],
    queryFn: () => fetch('/live-data/market-news?limit=40').then((r) => r.json()),
    enabled: marketsOn,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const cryptoStories = useMemo<Story[]>(() => {
    // Gate on the entitlement, not just the query's `enabled` flag. The
    // entitlement store rehydrates from localStorage an effect after mount, so
    // a module's query can fire before we learn it's disabled — and React Query
    // keeps cached data when `enabled` later flips false. Without this check a
    // disabled module's stories linger in the top strip and the total count.
    if (!cryptoOn) return []
    const articles = cryptoQuery.data?.articles ?? []
    return articles.map((a) => ({
      id: `crypto:${a.id}`,
      title: a.headline,
      summary: a.summary,
      source: a.source,
      url: a.url,
      publishedAt: a.publishedAt,
      sentiment: a.sentiment,
      category: a.category,
      // 'general' is the route's catch-all bucket, not a real asset tag.
      tags: a.relatedAssets.filter((t) => t !== 'general'),
      isBreaking: a.isBreaking,
      module: 'crypto' as const,
    }))
  }, [cryptoOn, cryptoQuery.data])

  const marketStories = useMemo<Story[]>(() => {
    if (!marketsOn) return []
    const articles = marketsQuery.data?.articles ?? []
    return articles.map((a) => ({
      id: `markets:${a.id}`,
      title: a.title,
      summary: a.summary,
      source: a.source,
      url: a.url,
      publishedAt: a.publishedAt,
      sentiment: a.sentiment,
      category: a.category,
      tags: a.relatedSymbols,
      isBreaking: a.isBreaking,
      module: 'markets' as const,
    }))
  }, [marketsOn, marketsQuery.data])

  const topStories = useMemo(() => {
    // Round-robin across modules rather than a straight global sort. The two
    // feeds don't flag "breaking" on comparable terms — market-news marks
    // anything under an hour old — so a global sort lets whichever feed is
    // noisiest monopolize the strip, which defeats the point of a bundle-wide
    // view. Pick evenly from each module, then sort the winners for display.
    const pools = [cryptoStories, marketStories]
      .filter((p) => p.length > 0)
      .map((p) => [...p].sort(rank))

    const picked: Story[] = []
    for (let i = 0; picked.length < TOP_STORY_COUNT; i++) {
      const before = picked.length
      for (const pool of pools) {
        if (pool[i] && picked.length < TOP_STORY_COUNT) picked.push(pool[i])
      }
      if (picked.length === before) break // every pool exhausted
    }
    // Bias applies after the round-robin so module balance is preserved first —
    // watchlist matches rise within the strip rather than letting one module
    // take it over.
    return applyBias(picked.sort(rank), watchlist, biasStrength, toBiasable)

  }, [cryptoStories, marketStories, watchlist, biasStrength])

  // Sections exclude whatever was promoted to the top strip, so nothing repeats.
  const promoted = useMemo(() => new Set(topStories.map((s) => s.id)), [topStories])

  const sections = useMemo(() => {
    const out: Array<{ module: StoryModule; href: string; stories: Story[] }> = []
    if (cryptoOn) {
      out.push({
        module: 'crypto',
        href: '/news',
        // Bias before slicing, so a watchlist match outside the top N is
        // pulled into view rather than trimmed away first.
        stories: applyBias(cryptoStories.filter((s) => !promoted.has(s.id)).sort(rank), watchlist, biasStrength, toBiasable).slice(0, SECTION_STORY_COUNT),
      })
    }
    if (marketsOn) {
      out.push({
        module: 'markets',
        href: '/equities/news',
        stories: applyBias(marketStories.filter((s) => !promoted.has(s.id)).sort(rank), watchlist, biasStrength, toBiasable).slice(0, SECTION_STORY_COUNT),
      })
    }
    return out

  }, [cryptoOn, marketsOn, cryptoStories, marketStories, promoted, watchlist, biasStrength])

  const isLoading = (cryptoOn && cryptoQuery.isLoading) || (marketsOn && marketsQuery.isLoading)
  const isFetching = cryptoQuery.isFetching || marketsQuery.isFetching
  const totalStories = cryptoStories.length + marketStories.length

  const refetchAll = () => {
    if (cryptoOn) cryptoQuery.refetch()
    if (marketsOn) marketsQuery.refetch()
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
            title="Headlines"
            subtitle="Top stories across every module in your bundle"
            description="Merges the suite's general news feeds into one ranked view. Only modules enabled in your bundle contribute stories, so the sections below change with your entitlements."
            details={[
              { label: 'Ranking', text: 'Breaking stories first, then most recent. The top strip draws from all enabled modules; module sections below exclude anything already promoted so nothing repeats.' },
              { label: 'Sources', text: 'Crypto stories come from /live-data/news (multi-provider RSS + JSON). Market stories come from /live-data/market-news (Yahoo Finance, MarketWatch, CNBC).' },
              { label: 'Funds', text: 'The Funds module has no general feed of its own — fund coverage is symbol-scoped on fund detail pages — so it shares the Markets section with Equities.' },
            ]}
          />
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && <span className="text-xs text-text-muted font-mono">{totalStories} stories</span>}
          <button
            onClick={refetchAll}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {/* Data provenance */}
      <SourceLine id="headlines" />

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Gathering headlines across your bundle…</span>
        </div>
      )}

      {/* No modules enabled */}
      {!cryptoOn && !marketsOn && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted text-center">
          <Newspaper size={36} className="mb-3 opacity-30" aria-hidden />
          <p className="text-sm">No news-carrying modules are enabled in your bundle.</p>
          <Link href="/settings" className="mt-3 px-3 py-1.5 rounded text-xs bg-bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors">
            Open Integrations
          </Link>
        </div>
      )}

      {/* Top strip */}
      {!isLoading && topStories.length > 0 && (
        <section aria-label="Top stories">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} className="text-amber-400" aria-hidden />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Top Stories</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {topStories.map((story) => (
              <StoryCard key={story.id} story={story} showModule onWatchlist={matchesWatchlist(toBiasable(story), watchlist)} />
            ))}
          </div>
        </section>
      )}

      {/* Per-module sections */}
      {!isLoading && sections.map(({ module, href, stories }) => {
        const meta = MODULE_META[module]
        return (
          <section key={module} aria-label={`${meta.label} stories`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <meta.icon size={13} className={meta.accent} aria-hidden />
                <span className={clsx('text-xs font-semibold uppercase tracking-wider', meta.accent)}>{meta.label}</span>
              </div>
              <Link href={href} className="text-[11px] text-text-muted hover:text-accent-blue transition-colors">
                View all →
              </Link>
            </div>
            {stories.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {stories.map((story) => <StoryCard key={story.id} story={story} onWatchlist={matchesWatchlist(toBiasable(story), watchlist)} />)}
              </div>
            ) : (
              <p className="text-xs text-text-muted py-4">No additional {meta.label.toLowerCase()} stories — feeds may be unreachable.</p>
            )}
          </section>
        )
      })}
    </div>
  )
}
