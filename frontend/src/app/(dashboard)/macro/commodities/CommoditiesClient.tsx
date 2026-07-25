'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, ArrowUpDown, Gem, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { MetricCard } from '@/components/ui/MetricCard'
import {
  COMMODITY_CATALOG, COMMODITY_CATEGORY_INFO, formatCommodityPrice,
  type CommodityCategoryId, type CommodityEntry,
} from '@/lib/data/commodityCatalog'
import { STALE_TIME_SHORT } from '@/lib/constants'

// Commodities registry — Macro Markets module. Live front-month futures
// quotes over the curated catalog; layout mirrors the other registry pages.

// No 'price': raw prices are not comparable across contracts (different units).
type SortKey = 'name' | 'category' | 'exchange' | 'change'

interface Quote { price: number | null; changePercent: number | null }
interface QuotesResponse { ok: boolean; quotes?: Record<string, Quote> }

const ALL_SYMBOLS = COMMODITY_CATALOG.map((c) => c.symbol)

export function CommoditiesClient() {
  const [category, setCategory] = useState<CommodityCategoryId | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('category')
  const [sortAsc, setSortAsc] = useState(true)

  const { data: quotes, isLoading, isError } = useQuery<Record<string, Quote>>({
    queryKey: ['commodity-quotes'],
    queryFn: async () => {
      const res = await fetch(`/live-data/security-quotes?symbols=${encodeURIComponent(ALL_SYMBOLS.join(','))}`)
      const json: QuotesResponse = await res.json()
      if (!json.ok || !json.quotes) throw new Error('quotes unavailable')
      return json.quotes
    },
    staleTime: STALE_TIME_SHORT,
    refetchInterval: 1000 * 60 * 2,
  })

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = COMMODITY_CATALOG.filter((c) =>
      (category === 'all' || c.category === category) &&
      (q === '' || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)))
    const dir = sortAsc ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir
      if (sortKey === 'category') return (a.category.localeCompare(b.category) || a.name.localeCompare(b.name)) * dir
      if (sortKey === 'exchange') return a.exchange.localeCompare(b.exchange) * dir
      const qa = quotes?.[a.symbol], qb = quotes?.[b.symbol]
      // No 'price' case: the Price column is deliberately not sortable. These
      // contracts quote in different units (gold $/oz, corn ¢/bu), so ordering
      // the raw numbers ranks cocoa above gold and means nothing. Converting to
      // a common unit would be worse — it implies a comparability that does not
      // exist between a bushel and a troy ounce. Percent change IS comparable
      // across contracts, so that is the sortable one.
      return ((qa?.changePercent ?? -Infinity) - (qb?.changePercent ?? -Infinity)) * dir
    })
  }, [category, search, sortKey, sortAsc, quotes])

  // KPI strip: coverage + the day's extremes across the whole catalog.
  const movers = useMemo(() => {
    const priced = COMMODITY_CATALOG
      .map((c) => ({ c, q: quotes?.[c.symbol] }))
      .filter((x): x is { c: CommodityEntry; q: Quote } => x.q?.changePercent != null)
    if (priced.length === 0) return null
    const sorted = [...priced].sort((a, b) => b.q.changePercent! - a.q.changePercent!)
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    // The extremes are only *labelled* gainer/decliner when they actually are
    // one. On a broad rally the bottom of a descending sort is still positive,
    // and a card headed "Biggest Decline" reading "+0.12% today" is a
    // contradiction the reader has to squint at to catch.
    return {
      up: best.q.changePercent! > 0 ? best : null,
      down: worst.q.changePercent! < 0 ? worst : null,
      pricedCount: priced.length,
    }
  }, [quotes])

  const setSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(key === 'name' || key === 'category' || key === 'exchange') }
  }

  const SortHeader = ({ label, k, right = false }: { label: string; k: SortKey; right?: boolean }) => (
    <th className={clsx('font-medium py-2 px-3', right ? 'text-right' : 'text-left')}>
      <button onClick={() => setSort(k)} className="inline-flex items-center gap-1 hover:text-text-primary transition-colors">
        {label}
        {sortKey === k
          ? (sortAsc ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />)
          : <ArrowUpDown size={11} className="opacity-40" aria-hidden />}
      </button>
    </th>
  )

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Gem size={18} className="text-amber-400" aria-hidden />
        </div>
        <PageHeader
          title="Commodities"
          subtitle={`${COMMODITY_CATALOG.length} front-month futures across ${Object.keys(COMMODITY_CATEGORY_INFO).length} categories`}
          description="Live continuous front-month contracts across metals, energy, agriculture, and livestock. Each contract quotes in its own market convention — dollars per barrel, cents per bushel — and is shown exactly that way rather than flattened into a fake common unit."
        />
      </div>

      {/* Data provenance */}
      <SourceLine id="macro-quotes" />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard title="Contracts" value={String(COMMODITY_CATALOG.length)} subtitle={`${movers?.pricedCount ?? 0} priced live`} accentColor="#f59e0b" />
        <MetricCard title="Categories" value={String(Object.keys(COMMODITY_CATEGORY_INFO).length)} subtitle="metals to livestock" accentColor="#3b82f6" />
        <MetricCard
          title="Top Gainer"
          value={movers?.up ? movers.up.c.name : '—'}
          subtitle={
            movers?.up ? `+${movers.up.q.changePercent!.toFixed(2)}% today`
            : movers ? 'nothing up today'
            : 'no live data'
          }
          accentColor="#10b981"
        />
        <MetricCard
          title="Biggest Decline"
          value={movers?.down ? movers.down.c.name : '—'}
          subtitle={
            movers?.down ? `${movers.down.q.changePercent!.toFixed(2)}% today`
            : movers ? 'nothing down today'
            : 'no live data'
          }
          accentColor="#ef4444"
        />
      </div>

      {isError && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-text-secondary leading-relaxed">
          Live futures quotes are unavailable right now. The catalog below still lists every contract; prices return when the feed recovers.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setCategory('all')}
          className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
            category === 'all' ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary')}>
          All
        </button>
        {(Object.entries(COMMODITY_CATEGORY_INFO) as Array<[CommodityCategoryId, { label: string; color: string }]>).map(([id, info]) => (
          <button key={id} onClick={() => setCategory(category === id ? 'all' : id)}
            className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              category === id ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary')}>
            <span className="size-1.5 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
            {info.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contracts…"
            className="w-52 rounded border border-border bg-bg-elevated pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-blue/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="rounded-card border border-border bg-bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted uppercase tracking-wider text-[10px] border-b border-border">
                <SortHeader label="Contract" k="name" />
                <SortHeader label="Category" k="category" />
                <SortHeader label="Exchange" k="exchange" />
                {/* Not sortable on purpose — see the sort comment above. */}
                <th className="font-medium py-2 px-3 text-right" title="Contracts quote in different units (gold $/oz, corn ¢/bu), so ranking raw prices is meaningless. Sort by Change instead.">
                  Price
                </th>
                <SortHeader label="Day" k="change" right />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((c) => {
                const q = quotes?.[c.symbol]
                const up = (q?.changePercent ?? 0) >= 0
                const info = COMMODITY_CATEGORY_INFO[c.category]
                return (
                  <tr key={c.slug} className="hover:bg-bg-elevated/50 transition-colors">
                    <td className="py-2.5 px-3">
                      <Link href={`/macro/commodities/${c.slug}`} className="group flex items-center gap-2.5">
                        <span className="font-medium text-text-primary group-hover:text-accent-blue transition-colors">{c.name}</span>
                        <span className="font-mono text-[11px] text-text-muted">{c.symbol}</span>
                      </Link>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
                        {info.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-text-muted">{c.exchange}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-text-primary">
                      {q?.price != null ? formatCommodityPrice(c, q.price) : isLoading ? '…' : '—'}
                    </td>
                    <td className={clsx('py-2.5 px-3 text-right font-mono tabular-nums text-xs',
                      q?.changePercent == null ? 'text-text-muted' : up ? 'text-emerald-400' : 'text-red-400')}>
                      {q?.changePercent != null ? `${up ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-xs text-text-muted">No contracts match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-text-muted text-center leading-relaxed">
        Continuous front-month contracts via the suite&rsquo;s live quote route. Quotes follow each market&rsquo;s own
        convention (¢/bu for grains, $/bbl for crude); ETF proxies are listed on each contract&rsquo;s detail page.
      </p>
    </div>
  )
}
