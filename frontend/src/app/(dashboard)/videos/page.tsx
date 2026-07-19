'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Video, ExternalLink, Clock, Loader2, RefreshCw, Search, X, Coins, LineChart, Sparkles, Youtube, AlertCircle, ArrowUpDown } from 'lucide-react'
import { clsx } from 'clsx'
import { PageHeader } from '@/components/ui/PageHeader'
import { useEntitlementStore } from '@/store/useEntitlementStore'
import type { VideoItem, VideosResponse } from '@/app/live-data/videos/route'
import type { VideoSearchResponse } from '@/app/live-data/video-search/route'
import type { ProviderMarket } from '@/lib/api/live/providers'

// Video feed — keyless YouTube channel Atom feeds, merged and ranked by recency.
// Channels are managed in Integrations → Video Sources (registry-driven), and
// the feed honours the user's bundle the same way /headlines does.

const MARKET_META: Record<ProviderMarket, { label: string; icon: typeof Coins; badge: string; accent: string }> = {
  crypto: {
    label: 'Crypto',
    icon: Coins,
    badge: 'text-accent-blue bg-accent-blue/10 border-accent-blue/25',
    accent: 'text-accent-blue',
  },
  equities: {
    label: 'Markets',
    icon: LineChart,
    badge: 'text-violet-400 bg-violet-400/10 border-violet-500/25',
    accent: 'text-violet-400',
  },
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** How many cards load their thumbnail eagerly — roughly the first two rows. */
const EAGER_THUMBNAILS = 6

type SortKey = 'newest' | 'oldest' | 'channel'
type RecencyKey = 'all' | '24h' | '7d' | '30d'
type MarketKey = 'all' | ProviderMarket

const RECENCY_WINDOWS: Record<Exclude<RecencyKey, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'channel', label: 'Channel A–Z' },
]

const RECENCIES: Array<{ value: RecencyKey; label: string }> = [
  { value: 'all', label: 'Any time' },
  { value: '24h', label: 'Past 24h' },
  { value: '7d', label: 'Past week' },
  { value: '30d', label: 'Past month' },
]

/**
 * Every whitespace-separated term must appear somewhere in the video's text.
 * AND rather than OR — with 120+ cards, narrowing is what the user wants.
 */
function matchesTerms(video: VideoItem, terms: string[]): boolean {
  if (terms.length === 0) return true
  // searchText, not summary — summary is truncated for display and matching
  // against it loses most of the description.
  const haystack = `${video.title} ${video.searchText || video.summary} ${video.channel}`.toLowerCase()
  return terms.every((t) => haystack.includes(t))
}

function VideoCard({ video, eager = false }: { video: VideoItem; eager?: boolean }) {
  const meta = MARKET_META[video.market]

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        'group bg-bg-card border rounded-lg overflow-hidden flex flex-col transition-all hover:border-accent-blue/40 hover:bg-bg-elevated',
        video.isNew ? 'border-amber-500/40' : 'border-border'
      )}
    >
      {/* Thumbnail — 16:9. Plain <img> since these are remote YouTube CDN URLs. */}
      <div className="relative aspect-video bg-bg-elevated overflow-hidden">
        {video.thumbnail ? (
          // Above-the-fold cards load eagerly: thumbnails ARE the content here,
          // so an empty grid is a worse failure than a few extra requests if a
          // browser's lazy-load heuristic is slow to fire. The long tail stays
          // lazy — this page renders up to 120 cards.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail}
            alt=""
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : 'auto'}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video size={24} className="text-text-muted opacity-40" aria-hidden />
          </div>
        )}
        {video.isNew && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/90 text-black uppercase tracking-wider">
            <Sparkles size={9} aria-hidden /> New
          </span>
        )}
        <span className={clsx('absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border backdrop-blur-sm uppercase tracking-wider', meta.badge)}>
          <meta.icon size={9} aria-hidden />
          {meta.label}
        </span>
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <h2 className="text-sm font-semibold text-text-primary leading-snug line-clamp-2 group-hover:text-accent-blue transition-colors">
          {video.title}
        </h2>

        {video.summary && (
          <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">{video.summary}</p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1 mt-auto border-t border-border/60">
          <span className="text-[11px] text-text-muted font-medium truncate">{video.channel}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="flex items-center gap-1 text-[11px] text-text-muted font-mono">
              <Clock size={10} aria-hidden />
              {timeAgo(video.publishedAt)}
            </span>
            <ExternalLink size={11} className="text-text-muted group-hover:text-accent-blue transition-colors" aria-hidden />
          </div>
        </div>
      </div>
    </a>
  )
}

export default function VideosPage() {
  // Same bundle rules as /headlines: funds has no channels of its own, so it
  // shares the Markets (equities) set.
  const cryptoOn = useEntitlementStore((s) => s.isEnabled('crypto'))
  const equitiesOn = useEntitlementStore((s) => s.isEnabled('equities'))
  const fundsOn = useEntitlementStore((s) => s.isEnabled('funds'))
  const marketsOn = equitiesOn || fundsOn

  // Multi-select: empty set means "all channels".
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [recency, setRecency] = useState<RecencyKey>('all')
  const [marketFilter, setMarketFilter] = useState<MarketKey>('all')
  // The query actually submitted to YouTube — separate from `search`, which
  // filters locally as you type. Search costs 100 quota units, so it only runs
  // when explicitly submitted.
  const [ytQuery, setYtQuery] = useState('')

  const { data, isLoading, isFetching, refetch } = useQuery<VideosResponse>({
    queryKey: ['videos'],
    // Headroom for added channels — 10 channels x 15 already exceeds 120.
    queryFn: () => fetch('/live-data/videos?limit=240').then((r) => r.json()),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  })

  const searchQuery = useQuery<VideoSearchResponse>({
    queryKey: ['video-search', ytQuery],
    queryFn: () => fetch(`/live-data/video-search?q=${encodeURIComponent(ytQuery)}`).then((r) => r.json()),
    enabled: ytQuery.length > 0,
    staleTime: 60 * 60 * 1000, // quota is scarce — one call per query per hour
    refetchOnWindowFocus: false,
    retry: false,
  })

  const searchResults = searchQuery.data?.videos ?? []
  const searchConfigured = searchQuery.data?.configured ?? true
  const isSearchMode = ytQuery.length > 0

  const marketEnabled = (m: ProviderMarket) => (m === 'crypto' ? cryptoOn : marketsOn)

  const terms = useMemo(
    () => search.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [search]
  )

  // Filter on the entitlement rather than the query, for the same reason as
  // /headlines: the store rehydrates an effect after mount, so a fetch can land
  // before we know a module is disabled. Search results bypass the market and
  // channel filters — they're whole-of-YouTube and belong to no module.
  const videos = useMemo(() => {
    const base = isSearchMode
      ? searchResults
      : (data?.videos ?? []).filter((v) => marketEnabled(v.market))

    const cutoff = recency === 'all' ? 0 : Date.now() - RECENCY_WINDOWS[recency]

    const filtered = base.filter((v) => {
      if (!isSearchMode) {
        if (marketFilter !== 'all' && v.market !== marketFilter) return false
        if (selectedChannels.size > 0 && !selectedChannels.has(v.provider)) return false
      }
      if (cutoff && new Date(v.publishedAt).getTime() < cutoff) return false
      if (!matchesTerms(v, terms)) return false
      return true
    })

    const sorted = [...filtered]
    if (sort === 'newest') sorted.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    else if (sort === 'oldest') sorted.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())
    else sorted.sort((a, b) => a.channel.localeCompare(b.channel) || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    return sorted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, searchResults, isSearchMode, selectedChannels, terms, sort, recency, marketFilter, cryptoOn, marketsOn])

  // Counts are derived from the videos actually loaded, not from the route's
  // per-channel totals. The route fetches every channel in full then truncates
  // to the page limit by recency, so a channel's older items can be cut — and a
  // chip that promises 15 but delivers 3 on click is worse than no count.
  const channels = useMemo(() => {
    const loaded = new Map<string, number>()
    for (const v of data?.videos ?? []) {
      loaded.set(v.provider, (loaded.get(v.provider) ?? 0) + 1)
    }
    return (data?.channels ?? [])
      .filter((c) => marketEnabled(c.market))
      .map((c) => ({ ...c, count: loaded.get(c.provider) ?? 0 }))
      .filter((c) => c.count > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cryptoOn, marketsOn])

  const toggleChannel = (provider: string) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev)
      if (next.has(provider)) next.delete(provider)
      else next.add(provider)
      return next
    })
  }

  const activeFilterCount =
    (search ? 1 : 0) + (sort !== 'newest' ? 1 : 0) + (recency !== 'all' ? 1 : 0) +
    (marketFilter !== 'all' ? 1 : 0) + (selectedChannels.size > 0 ? 1 : 0)

  const clearFilters = () => {
    setSearch(''); setSort('newest'); setRecency('all')
    setMarketFilter('all'); setSelectedChannels(new Set()); setYtQuery('')
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
            <Video size={18} className="text-accent-blue" aria-hidden />
          </div>
          <PageHeader
            title="Videos"
            subtitle="Market and crypto video coverage across your bundle"
            description="Merges keyless YouTube channel feeds into one recency-ranked grid. Only modules enabled in your bundle contribute channels, so the feed changes with your entitlements."
            details={[
              { label: 'Sources', text: 'Channels are managed in Integrations → Video Sources. Built-ins can be toggled, and you can add any YouTube channel by id or feed URL.' },
              { label: 'Freshness', text: 'Feeds are cached for 10 minutes. Anything published in the last 24h is flagged New.' },
              { label: 'Bundle', text: 'Crypto channels follow the Crypto module; finance channels follow Equities or Funds. Funds has no channels of its own and shares the Markets set.' },
            ]}
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {!isLoading && <span className="text-xs text-text-muted font-mono">{videos.length} videos</span>}
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

      {/* No modules enabled */}
      {!cryptoOn && !marketsOn && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted text-center">
          <Video size={36} className="mb-3 opacity-30" aria-hidden />
          <p className="text-sm">No video-carrying modules are enabled in your bundle.</p>
          <Link href="/settings" className="mt-3 px-3 py-1.5 rounded text-xs bg-bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors">
            Open Integrations
          </Link>
        </div>
      )}

      {/* Filters */}
      {(cryptoOn || marketsOn) && (
        <div className="flex flex-col gap-3">
          {/* Search row — local filter as you type, YouTube search on submit */}
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); setYtQuery(search.trim()) }}
          >
            <div className="relative flex-1 min-w-56 max-w-md">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter loaded videos — or press Search YouTube…"
                className="w-full bg-bg-secondary border border-border rounded pl-7 pr-7 py-1.5 text-xs text-text-secondary placeholder:text-text-muted/60 focus:outline-none focus:border-accent-blue/60"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                  aria-label="Clear search"
                >
                  <X size={11} />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!search.trim() || searchQuery.isFetching}
              title="Search all of YouTube (uses API quota)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40 disabled:hover:bg-red-500/10"
            >
              {searchQuery.isFetching
                ? <Loader2 size={12} className="animate-spin" aria-hidden />
                : <Youtube size={12} aria-hidden />}
              Search YouTube
            </button>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs text-text-muted border border-border hover:text-text-secondary hover:bg-bg-elevated transition-colors"
              >
                <X size={11} aria-hidden />
                Clear {activeFilterCount}
              </button>
            )}
          </form>

          {/* Search-mode banner */}
          {isSearchMode && (
            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-red-500/25 bg-red-500/5">
              <div className="flex items-center gap-2 min-w-0">
                <Youtube size={13} className="text-red-400 flex-shrink-0" aria-hidden />
                <span className="text-xs text-text-secondary truncate">
                  {searchQuery.isFetching
                    ? <>Searching YouTube for <span className="text-text-primary font-medium">“{ytQuery}”</span>…</>
                    : <>YouTube results for <span className="text-text-primary font-medium">“{ytQuery}”</span> — channel and market filters don’t apply here.</>}
                </span>
              </div>
              <button
                // Clears the text too: leaving it set would re-apply it as a
                // local filter, so "Back to feed" would land on an empty grid.
                onClick={() => { setYtQuery(''); setSearch('') }}
                className="text-[11px] text-text-muted hover:text-text-secondary transition-colors flex-shrink-0"
              >
                Back to feed
              </button>
            </div>
          )}

          {/* Not-configured / error notice for YouTube search */}
          {isSearchMode && !searchQuery.isFetching && (!searchConfigured || searchQuery.data?.error) && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/25 bg-amber-500/5">
              <AlertCircle size={13} className="text-amber-400 flex-shrink-0 mt-0.5" aria-hidden />
              <p className="text-xs text-text-secondary leading-relaxed">
                {!searchConfigured ? (
                  <>
                    Whole-of-YouTube search needs a YouTube Data API key. Add one under{' '}
                    <Link href="/settings" className="text-accent-blue hover:underline">Integrations → Market Video Sources</Link>.
                    The channel feeds above keep working without it.
                  </>
                ) : searchQuery.data?.error}
              </p>
            </div>
          )}

          {/* Facets — hidden in search mode, where they don't apply */}
          {!isSearchMode && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {/* Market */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-text-muted">Market:</span>
                  {([['all', 'All'], ['crypto', 'Crypto'], ['equities', 'Markets']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setMarketFilter(value)}
                      disabled={value === 'crypto' ? !cryptoOn : value === 'equities' ? !marketsOn : false}
                      className={clsx(
                        'px-2 py-1 rounded text-xs font-medium border transition-all disabled:opacity-30',
                        marketFilter === value
                          ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                          : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Recency */}
                <div className="flex items-center gap-1.5">
                  <Clock size={11} className="text-text-muted" aria-hidden />
                  {RECENCIES.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setRecency(r.value)}
                      className={clsx(
                        'px-2 py-1 rounded text-xs font-medium border transition-all',
                        recency === r.value
                          ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                          : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated'
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                {/* Sort */}
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown size={11} className="text-text-muted" aria-hidden />
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    className="bg-bg-secondary border border-border rounded px-2 py-1 text-xs text-text-secondary focus:outline-none focus:border-accent-blue/60"
                  >
                    {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Channels — multi-select */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedChannels(new Set())}
                  className={clsx(
                    'px-2.5 py-1 rounded text-xs font-medium border transition-all',
                    selectedChannels.size === 0
                      ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                      : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated'
                  )}
                >
                  All Channels
                </button>
                {channels.map((c) => (
                  <button
                    key={c.provider}
                    onClick={() => toggleChannel(c.provider)}
                    className={clsx(
                      'px-2.5 py-1 rounded text-xs font-medium border transition-all',
                      selectedChannels.has(c.provider)
                        ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                        : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated'
                    )}
                  >
                    {c.channel}
                    <span className="ml-1 text-[10px] text-text-muted/70 font-mono">{c.count}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading video feeds…</span>
        </div>
      )}

      {/* Grid */}
      {!isLoading && videos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video, i) => (
            <VideoCard key={video.id} video={video} eager={i < EAGER_THUMBNAILS} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !searchQuery.isFetching && (cryptoOn || marketsOn) && videos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted text-center">
          <Video size={36} className="mb-3 opacity-30" aria-hidden />
          <p className="text-sm">
            {isSearchMode
              ? searchConfigured
                ? <>No YouTube results for “{ytQuery}”.</>
                : <>Add a YouTube Data API key to search beyond the channel feeds.</>
              : activeFilterCount > 0
                ? 'No videos match the current filters.'
                : 'No videos available — channel feeds may be unreachable.'}
          </p>
          {!isSearchMode && activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="mt-3 px-3 py-1.5 rounded text-xs bg-bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
