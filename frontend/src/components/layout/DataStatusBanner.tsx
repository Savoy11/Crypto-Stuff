'use client'

import { useQuery } from '@tanstack/react-query'
import { Radio, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { fetchLiveMarkets } from '@/lib/api/live/liveClient'
import { LIVE_DATA } from '@/lib/constants'

interface ProviderInfo {
  id: string
  name: string
  category: 'price' | 'news'
  config: { enabled: boolean; hasKey: boolean; lastStatus?: string }
}

async function fetchActiveProviders(): Promise<ProviderInfo[]> {
  try {
    const res = await fetch('/live-data/config')
    if (!res.ok) return []
    const data = await res.json()
    return (data.providers ?? []).filter(
      (p: ProviderInfo) =>
        p.config.enabled &&
        (p.config.hasKey || !p.config.lastStatus || p.config.lastStatus === 'active' || ['coingecko', 'binance'].includes(p.id))
    )
  } catch {
    return []
  }
}

export function DataStatusBanner() {
  const { data: marketData } = useQuery({
    queryKey: ['live-markets-status'],
    queryFn: fetchLiveMarkets,
    enabled: LIVE_DATA,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })

  const { data: activeProviders } = useQuery({
    queryKey: ['active-providers'],
    queryFn: fetchActiveProviders,
    enabled: LIVE_DATA,
    staleTime: 30 * 1000,
  })

  const ok = marketData?.ok ?? false
  const updatedAt = marketData?.updatedAt ?? null

  const priceProviders = (activeProviders ?? []).filter((p) => p.category === 'price')
  const newsProviders = (activeProviders ?? []).filter((p) => p.category === 'news')
  const priceLabel = priceProviders.map((p) => p.name).join(', ') || 'CoinGecko'
  const newsLabel = newsProviders.map((p) => p.name).join(', ')

  if (!ok) {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 text-xs border-b border-red-500/20 bg-red-500/5 text-red-300/90">
        <AlertTriangle size={13} aria-hidden />
        <span className="font-medium">Live data unavailable</span>
        <span className="text-red-300/60">
          — could not reach the market data source. Values may be missing or stale.
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs border-b border-emerald-500/20 bg-emerald-500/5 text-emerald-300/90">
      <Radio size={13} aria-hidden className="animate-pulse" />
      <span className="font-medium">Live data</span>
      <span className="text-emerald-300/60">
        — prices via <span className="text-emerald-300/90 font-medium">{priceLabel}</span>
        {newsLabel && (
          <> · news via <span className="text-emerald-300/90 font-medium">{newsLabel}</span></>
        )}
        {!newsLabel && ' · news: no source configured'}
        {' · '}derived metrics (risk, reserves) show N/A
      </span>
      {updatedAt && (
        <span className="ml-auto text-emerald-300/50 font-mono flex-shrink-0">
          updated {(() => { try { return formatDistanceToNow(parseISO(updatedAt), { addSuffix: true }) } catch { return '—' } })()}
        </span>
      )}
    </div>
  )
}
