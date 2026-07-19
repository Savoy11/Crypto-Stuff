'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Video, ExternalLink, Clock, Loader2, RefreshCw, Search, X, Coins, LineChart, Sparkles } from 'lucide-react'
import { clsx } from 'clsx'
import { PageHeader } from '@/components/ui/PageHeader'
import { useEntitlementStore } from '@/store/useEntitlementStore'
import type { VideoItem, VideosResponse } from '@/app/live-data/videos/route'
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

  const [channelFilter, setChannelFilter] = useState('all')
  const [search, setSearch] = useState('')

  const { data, isLoading, isFetching, refetch } = useQuery<VideosResponse>({
    queryKey: ['videos'],
    queryFn: () => fetch('/live-data/videos?limit=120').then((r) => r.json()),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  })

  const marketEnabled = (m: ProviderMarket) => (m === 'crypto' ? cryptoOn : marketsOn)

  // Filter on the entitlement rather than the query, for the same reason as
  // /headlines: the store rehydrates an effect after mount, so a fetch can land
  // before we know a module is disabled.
  const videos = useMemo(() => {
    const all = (data?.videos ?? []).filter((v) => marketEnabled(v.market))
    const term = search.trim().toLowerCase()
    return all.filter((v) => {
      if (channelFilter !== 'all' && v.provider !== channelFilter) return false
      if (term && !`${v.title} ${v.summary} ${v.channel}`.toLowerCase().includes(term)) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, channelFilter, search, cryptoOn, marketsOn])

  const channels = useMemo(
    () => (data?.channels ?? []).filter((c) => marketEnabled(c.market)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, cryptoOn, marketsOn]
  )

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
          <div className="relative max-w-sm">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search titles, channels…"
              className="w-full bg-bg-secondary border border-border rounded pl-7 pr-7 py-1.5 text-xs text-text-secondary placeholder:text-text-muted/60 focus:outline-none focus:border-accent-blue/60"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                aria-label="Clear search"
              >
                <X size={11} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setChannelFilter('all')}
              className={clsx(
                'px-2.5 py-1 rounded text-xs font-medium border transition-all',
                channelFilter === 'all'
                  ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                  : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated'
              )}
            >
              All Channels
            </button>
            {channels.map((c) => (
              <button
                key={c.provider}
                onClick={() => setChannelFilter(c.provider)}
                className={clsx(
                  'px-2.5 py-1 rounded text-xs font-medium border transition-all',
                  channelFilter === c.provider
                    ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                    : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated'
                )}
              >
                {c.channel}
              </button>
            ))}
          </div>
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
      {!isLoading && (cryptoOn || marketsOn) && videos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted text-center">
          <Video size={36} className="mb-3 opacity-30" aria-hidden />
          <p className="text-sm">
            {search || channelFilter !== 'all'
              ? 'No videos match the current filters.'
              : 'No videos available — channel feeds may be unreachable.'}
          </p>
        </div>
      )}
    </div>
  )
}
