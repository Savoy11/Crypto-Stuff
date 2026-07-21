'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowDown, ArrowLeftRight, ArrowUp, ArrowUpDown, Banknote, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { MetricCard } from '@/components/ui/MetricCard'
import {
  CONVERTER_CURRENCIES, CURRENCY_CATALOG, CURRENCY_CATEGORY_INFO, formatFxRate,
  type CurrencyCategoryId,
} from '@/lib/data/currencyCatalog'
import { STALE_TIME_SHORT, STALE_TIME_LONG } from '@/lib/constants'
import type { FxRatesResponse } from '@/app/live-data/fx-rates/route'
import type { FxRatesExtendedResponse } from '@/app/live-data/fx-rates-extended/route'

// Currencies registry + converter — Macro Markets module.
// Intraday pair quotes via security-quotes (Yahoo); the converter uses daily
// ECB reference rates (/live-data/fx-rates) and says so, including the date.

type SortKey = 'name' | 'category' | 'rate' | 'change'

interface Quote { price: number | null; changePercent: number | null }
interface QuotesResponse { ok: boolean; quotes?: Record<string, Quote> }

const ALL_SYMBOLS = CURRENCY_CATALOG.map((c) => c.symbol)

/** ECB's 30 official currencies, keyed for O(1) tier lookup. */
const ECB_SET = new Set<string>(CONVERTER_CURRENCIES)

function Converter() {
  const [amount, setAmount] = useState('1000')
  const [from, setFrom] = useState('USD')
  const [to, setTo] = useState('EUR')

  const { data: ecb, isLoading: ecbLoading } = useQuery<FxRatesResponse>({
    queryKey: ['fx-rates'],
    queryFn: () => fetch('/live-data/fx-rates').then((r) => r.json()),
    staleTime: STALE_TIME_LONG,
  })
  // Separate query, separate provenance — never blended into one "rates"
  // object server-side, so a currency's tier is always traceable to which
  // fetch actually returned it.
  const { data: extended, isLoading: extendedLoading } = useQuery<FxRatesExtendedResponse>({
    queryKey: ['fx-rates-extended'],
    queryFn: () => fetch('/live-data/fx-rates-extended').then((r) => r.json()),
    staleTime: STALE_TIME_LONG,
  })

  const rates = useMemo(() => ({
    ...(ecb?.ok ? ecb.rates : {}),
    ...(extended?.ok ? extended.rates : {}),
  }), [ecb, extended])
  const isLoading = ecbLoading || extendedLoading
  const extendedCodes = useMemo(() => new Set(Object.keys(extended?.ok ? extended.rates ?? {} : {})), [extended])

  const parsed = parseFloat(amount)
  const valid = isFinite(parsed) && parsed >= 0 && !!rates[from] && !!rates[to]
  const rate = valid ? rates[to] / rates[from] : null
  const result = valid && rate != null ? parsed * rate : null
  // Only the ECB tier gets to say "official" — a conversion touching either
  // extended-tier leg must disclose the community source, not just the date.
  const usesExtended = extendedCodes.has(from) || extendedCodes.has(to)

  const selectClass = 'rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm font-mono text-text-primary focus:border-accent-blue/50 focus:outline-none max-w-[7rem]'
  const options = (
    <>
      <optgroup label="Official (ECB)">
        {CONVERTER_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </optgroup>
      {extendedCodes.size > 0 && (
        <optgroup label="Extended (community-sourced)">
          {[...extendedCodes].sort().map((c) => <option key={c} value={c}>{c}</option>)}
        </optgroup>
      )}
    </>
  )

  return (
    <div className="rounded-card border border-border bg-bg-card p-4">
      <h2 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
        <ArrowLeftRight size={14} className="text-accent-blue" aria-hidden /> Converter
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number" min={0} value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-32 rounded border border-border bg-bg-elevated px-3 py-1.5 text-sm font-mono tabular-nums text-text-primary focus:border-accent-blue/50 focus:outline-none"
          aria-label="Amount"
        />
        <select value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass} aria-label="From currency">
          {options}
        </select>
        <button
          onClick={() => { setFrom(to); setTo(from) }}
          className="p-1.5 rounded border border-border text-text-muted hover:text-accent-blue hover:border-accent-blue/40 transition-colors"
          aria-label="Swap currencies"
        >
          <ArrowLeftRight size={13} aria-hidden />
        </button>
        <select value={to} onChange={(e) => setTo(e.target.value)} className={selectClass} aria-label="To currency">
          {options}
        </select>
        <div className="ml-auto text-right">
          {result != null ? (
            <>
              <p className="text-lg font-mono tabular-nums font-semibold text-text-primary">
                {result.toLocaleString(undefined, { maximumFractionDigits: 2 })} {to}
              </p>
              <p className="text-[11px] text-text-muted font-mono tabular-nums">
                1 {from} = {rate!.toLocaleString(undefined, { maximumFractionDigits: 4 })} {to}
                {' · '}1 {to} = {(1 / rate!).toLocaleString(undefined, { maximumFractionDigits: 4 })} {from}
              </p>
            </>
          ) : (
            <p className="text-sm text-text-muted">{isLoading ? 'Loading rates…' : 'Reference rates unavailable'}</p>
          )}
        </div>
      </div>
      <p className="mt-3 pt-3 border-t border-border/60 text-[11px] text-text-muted leading-relaxed">
        {usesExtended ? (
          <>
            This conversion uses at least one <span className="text-amber-400">extended-tier</span> currency — sourced
            from a community-maintained daily feed{extended?.ok && extended.date ? ` (${extended.date})` : ''}, not the
            European Central Bank. Cross-checked against ECB where both cover the same currency; still indicative, not
            a dealable price.
          </>
        ) : (
          <>
            Daily ECB reference rates{ecb?.ok && ecb.date ? ` (published ${ecb.date})` : ''} via frankfurter.dev —
            indicative mid-market conversion, not a dealable price.
          </>
        )} Intraday moves show in the pairs table below.
      </p>
    </div>
  )
}

export function CurrenciesClient() {
  const [category, setCategory] = useState<CurrencyCategoryId | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('category')
  const [sortAsc, setSortAsc] = useState(true)

  const { data: quotes, isLoading, isError } = useQuery<Record<string, Quote>>({
    queryKey: ['currency-quotes'],
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
    const filtered = CURRENCY_CATALOG.filter((c) =>
      (category === 'all' || c.category === category) &&
      (q === '' || c.name.toLowerCase().includes(q) || c.base.toLowerCase().includes(q) || c.quote.toLowerCase().includes(q)))
    const dir = sortAsc ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir
      if (sortKey === 'category') return (a.category.localeCompare(b.category) || a.name.localeCompare(b.name)) * dir
      const qa = quotes?.[a.symbol], qb = quotes?.[b.symbol]
      if (sortKey === 'rate') return ((qa?.price ?? -Infinity) - (qb?.price ?? -Infinity)) * dir
      return ((qa?.changePercent ?? -Infinity) - (qb?.changePercent ?? -Infinity)) * dir
    })
  }, [category, search, sortKey, sortAsc, quotes])

  const dxy = quotes?.['DX-Y.NYB']
  const mover = useMemo(() => {
    const priced = CURRENCY_CATALOG
      .filter((c) => c.category !== 'index')
      .map((c) => ({ c, q: quotes?.[c.symbol] }))
      .filter((x): x is { c: (typeof CURRENCY_CATALOG)[number]; q: Quote } => x.q?.changePercent != null)
    if (priced.length === 0) return null
    return priced.reduce((a, b) => (Math.abs(b.q.changePercent!) > Math.abs(a.q.changePercent!) ? b : a))
  }, [quotes])
  const pricedCount = CURRENCY_CATALOG.filter((c) => quotes?.[c.symbol]?.price != null).length

  const setSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(key === 'name' || key === 'category') }
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
        <div className="size-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Banknote size={18} className="text-emerald-400" aria-hidden />
        </div>
        <PageHeader
          title="Currencies"
          subtitle={`${CURRENCY_CATALOG.length} pairs and the dollar index, quoted live`}
          description="Intraday FX pair quotes with a daily ECB reference-rate converter. Pairs follow market convention — a rising USD/JPY means a stronger dollar, a rising EUR/USD a weaker one — so read direction against the base currency."
        />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard title="Pairs" value={String(CURRENCY_CATALOG.length)} subtitle={`${pricedCount} priced live`} accentColor="#22c55e" />
        <MetricCard
          title="Dollar Index"
          value={dxy?.price != null ? dxy.price.toFixed(2) : '—'}
          subtitle={dxy?.changePercent != null ? `${dxy.changePercent >= 0 ? '+' : ''}${dxy.changePercent.toFixed(2)}% today` : 'no live data'}
          accentColor="#8b5cf6"
        />
        <MetricCard
          title="Biggest Mover"
          value={mover ? mover.c.name : '—'}
          subtitle={mover ? `${mover.q.changePercent! >= 0 ? '+' : ''}${mover.q.changePercent!.toFixed(2)}% today` : 'no live data'}
          accentColor="#f59e0b"
        />
        <MetricCard title="Categories" value={String(Object.keys(CURRENCY_CATEGORY_INFO).length)} subtitle="majors to EM" accentColor="#3b82f6" />
      </div>

      <Converter />

      {isError && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-text-secondary leading-relaxed">
          Live FX quotes are unavailable right now. The catalog below still lists every pair; rates return when the feed recovers.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setCategory('all')}
          className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
            category === 'all' ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary')}>
          All
        </button>
        {(Object.entries(CURRENCY_CATEGORY_INFO) as Array<[CurrencyCategoryId, { label: string; color: string }]>).map(([id, info]) => (
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
            placeholder="Search pairs…"
            className="w-52 rounded border border-border bg-bg-elevated pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-blue/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="rounded-card border border-border bg-bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted uppercase tracking-wider text-[10px] border-b border-border">
                <SortHeader label="Pair" k="name" />
                <SortHeader label="Category" k="category" />
                <SortHeader label="Rate" k="rate" right />
                <SortHeader label="Day" k="change" right />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((c) => {
                const q = quotes?.[c.symbol]
                const up = (q?.changePercent ?? 0) >= 0
                const info = CURRENCY_CATEGORY_INFO[c.category]
                return (
                  <tr key={c.slug} className="hover:bg-bg-elevated/50 transition-colors">
                    <td className="py-2.5 px-3">
                      <Link href={`/macro/currencies/${c.slug}`} className="group flex items-center gap-2.5">
                        <span className="font-mono font-semibold text-text-primary group-hover:text-accent-blue transition-colors">{c.name}</span>
                        <span className="text-[11px] text-text-muted hidden sm:inline">{c.description.split(' — ')[0]}</span>
                      </Link>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
                        {info.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-text-primary">
                      {q?.price != null ? formatFxRate(c, q.price) : isLoading ? '…' : '—'}
                    </td>
                    <td className={clsx('py-2.5 px-3 text-right font-mono tabular-nums text-xs',
                      q?.changePercent == null ? 'text-text-muted' : up ? 'text-emerald-400' : 'text-red-400')}>
                      {q?.changePercent != null ? `${up ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-xs text-text-muted">No pairs match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-text-muted text-center leading-relaxed">
        Intraday quotes via the suite&rsquo;s live quote route; converter uses daily ECB reference rates.
        FX markets trade around the clock Sunday evening to Friday evening US time.
      </p>
    </div>
  )
}
