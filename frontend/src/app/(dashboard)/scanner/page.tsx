'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  applyScannerFilters, hasActiveFilters, UNSUPPORTED_FILTERS,
  type ScannerFilters,
} from '@/lib/data/scannerFilters'
import { clsx } from 'clsx'
import { RefreshCw, Filter, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { computeSignalSummary, type OhlcvCandle, type Signal, type SignalSummary } from '@/lib/utils/indicators'
import { detectSetups, type SetupKey, type DetectedSetup } from '@/lib/utils/scanSetups'
import { rsi, sma } from '@/lib/utils/indicators'
import { formatAdaptivePrice } from '@/lib/utils/format'
import { runPool } from '@/lib/utils/runPool'
import { SignalBadge } from '@/components/charts/SignalBadge'
import { COINGECKO_IDS } from '@/lib/api/live/coingeckoIds'
import type { CoinListResponse } from '@/lib/types/coinList'

// ─── Crypto Scanner ───────────────────────────────────────────────────────────
//
// Was the "Scanner" tab on /technical-analysis until 2026-08-19. Short-list
// items 6 and 7: every section gets ONE scanner, promoted to a top-level nav
// entry. A scanner sweeps a universe to find candidates; a TA page charts one
// asset you already chose. Burying the first inside the second meant the
// discovery tool was reachable only by first picking something to look at.
//
// Unchanged in the move: 7 setup detectors, 3 timeframes, bounded-concurrency
// scanning and optional auto-refresh. This is the maturity bar the equities and
// macro scanners are measured against (the review's E14-E16 note).

const SUPPORTED_IDS = Object.keys(COINGECKO_IDS)

// ─── Scanner (multi-asset setup detection) ──────────────────────────────────────

const SETUP_META: Record<SetupKey, { label: string; tone: string }> = {
  breakout:               { label: 'Breakout',        tone: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  oversold_bounce:        { label: 'Oversold bounce', tone: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  overbought_fade:        { label: 'Overbought fade', tone: 'bg-red-500/15 text-red-400 border-red-500/30' },
  ma_cross:               { label: 'MA cross',        tone: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  volume_spike:           { label: 'Volume spike',    tone: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  obv_divergence:         { label: 'OBV divergence',  tone: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  volatility_compression: { label: 'Vol. squeeze',    tone: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
}

const SETUP_KEYS = Object.keys(SETUP_META) as SetupKey[]

type ScanStatus = 'loading' | 'ok' | 'error'

interface ScanRow {
  assetId: string
  setups: DetectedSetup[]
  signal: SignalSummary | null
  /** W3-4: RSI 14 and distance from SMA 50 — same columns the equity scanner
   *  shows, computed from the candles this scan already fetched. */
  rsi14: number | null
  vsSma50Pct: number | null
  status: ScanStatus
}

const SIGNAL_SCORE: Record<Signal, number> = {
  strong_buy: 2, buy: 1, neutral: 0, sell: -1, strong_sell: -2,
}
const signalRank = (s: SignalSummary | null): number =>
  s ? SIGNAL_SCORE[s.overall] : -99

// Daily history (1Y), weekly (3Y) and intraday (4H) windows the scanner runs on.
const SCAN_TIMEFRAMES = [
  { key: '4H', label: '4H', range: '4H' },
  { key: '1D', label: '1D', range: '1Y' },
  { key: '1W', label: '1W', range: '3Y' },
] as const
type ScanTimeframe = typeof SCAN_TIMEFRAMES[number]['key']

const SCAN_CONCURRENCY = 5
const SCAN_REFRESH_MS = 120_000

const SORT_OPTIONS = [
  { key: 'rank',    label: 'Market cap' },
  { key: 'price',   label: 'Price' },
  { key: 'setups',  label: 'Most setups' },
  { key: 'signal',  label: 'Signal' },
  { key: 'rsi',     label: 'RSI (low→high)' },
] as const

const SIGNAL_FILTER_OPTIONS: Array<{ value: Signal | 'all'; label: string }> = [
  { value: 'all', label: 'Any signal' },
  { value: 'strong_buy', label: 'Strong Buy' },
  { value: 'buy', label: 'Buy' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'sell', label: 'Sell' },
  { value: 'strong_sell', label: 'Strong Sell' },
]
type SortKey = typeof SORT_OPTIONS[number]['key']

function ScannerPanel() {
  const { data: coinListData } = useQuery<CoinListResponse>({
    queryKey: ['coin-list'],
    queryFn: () => fetch('/live-data/coin-list').then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  })

  // Whole monitored universe, enriched with live names + market-cap rank.
  const universe = useMemo(() => {
    const coinMap = new Map((coinListData?.coins ?? []).map(c => [c.symbol.toUpperCase(), c]))
    return SUPPORTED_IDS.map(id => {
      const sym = id.toUpperCase()
      const live = coinMap.get(sym)
      return { id, symbol: sym, label: live?.name ?? sym, rank: live?.rank ?? 9999 }
    })
  }, [coinListData])
  const metaById = useMemo(() => new Map(universe.map(u => [u.id, u])), [universe])

  const [timeframe, setTimeframe] = useState<ScanTimeframe>('1D')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [activeScan, setActiveScan] = useState<SetupKey | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  // W3-4: search, a signal filter, and an all-rows toggle. The old behaviour
  // hid every no-setup row unconditionally — "show all" lets the scanner double
  // as a universe overview with RSI/SMA readings per asset.
  const [search, setSearch] = useState('')
  const [signalFilter, setSignalFilter] = useState<Signal | 'all'>('all')
  const [showAll, setShowAll] = useState(false)
  // Screener-style universe filters (CoinMarketCap-shaped). Applied BEFORE the
  // scan: fewer coins means fewer OHLCV requests, so this makes a scan faster
  // rather than merely shortening the table.
  const [filters, setFilters] = useState<ScannerFilters>({})
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [rows, setRows] = useState<ScanRow[]>(
    () => SUPPORTED_IDS.map(id => ({ assetId: id, setups: [], signal: null, rsi14: null, vsSma50Pct: null, status: 'loading' as ScanStatus })),
  )
  const [scanning, setScanning] = useState(false)
  const [done, setDone] = useState(0)
  const [lastScan, setLastScan] = useState<Date | null>(null)
  const scanIdRef = useRef(0)

  const { data: marketsData } = useQuery({
    queryKey: ['scanner-prices'],
    queryFn: () => fetch('/live-data/markets').then(r => r.json()),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  // The universe the scan will actually sweep. Filters need market data, so if
  // it has not loaded the full universe is scanned and the UI says why — a
  // filter that silently matched nothing would read as "no results".
  const filterResult = useMemo(() => {
    const quotes = marketsData?.quotes ?? {}
    return applyScannerFilters(
      SUPPORTED_IDS,
      filters,
      (id: string) => {
        const q = quotes[id] ?? {}
        return {
          rank: metaById.get(id)?.rank ?? null,
          marketCap: q.marketCap ?? null,
          fdv: q.fdv ?? null,
          priceChange24h: q.priceChange24h ?? null,
          volume24h: q.volume24h ?? null,
        }
      },
    )
  }, [filters, marketsData, metaById])

  const scanUniverse = filterResult.matched
  const filtersActive = hasActiveFilters(filters)

  // runScan reads the universe through a ref rather than closing over it.
  // Otherwise its identity changes on every filter keystroke, and the
  // `useEffect(() => runScan(), [runScan])` below would fire a full OHLCV sweep
  // per character typed into a min/max box.
  const scanUniverseRef = useRef<string[]>(scanUniverse)
  scanUniverseRef.current = scanUniverse

  const runScan = useCallback(async () => {
    const myScan = ++scanIdRef.current
    const tf = SCAN_TIMEFRAMES.find(t => t.key === timeframe) ?? SCAN_TIMEFRAMES[1]
    setScanning(true)
    setDone(0)
    const sweep = scanUniverseRef.current
    setRows(sweep.map(id => ({ assetId: id, setups: [], signal: null, rsi14: null, vsSma50Pct: null, status: 'loading' as ScanStatus })))

    await runPool(sweep, SCAN_CONCURRENCY, async (id) => {
      let patch: Partial<ScanRow>
      try {
        const res = await fetch(`/live-data/ohlcv?id=${id}&range=${tf.range}`)
        const json = await res.json()
        const candles: OhlcvCandle[] = json.candles ?? []
        if (!json.ok || candles.length === 0) {
          patch = { status: 'error' }
        } else {
          const closes = candles.map(c => c.close)
          const rsiSeries = rsi(closes, 14)
          const sma50 = sma(closes, 50)
          const last = closes[closes.length - 1]
          const lastSma = sma50[sma50.length - 1]
          patch = {
            setups: detectSetups(candles),
            signal: candles.length >= 50 ? computeSignalSummary(candles) : null,
            rsi14: rsiSeries[rsiSeries.length - 1] ?? null,
            vsSma50Pct: lastSma ? ((last - lastSma) / lastSma) * 100 : null,
            status: 'ok',
          }
        }
      } catch {
        patch = { status: 'error' }
      }
      if (scanIdRef.current !== myScan) return // a newer scan superseded this one
      setRows(prev => prev.map(r => r.assetId === id ? { ...r, ...patch } : r))
      setDone(d => d + 1)
    })

    if (scanIdRef.current === myScan) {
      setScanning(false)
      setLastScan(new Date())
    }
  }, [timeframe])

  // Scan on mount and whenever the timeframe changes.
  useEffect(() => { runScan() }, [runScan])

  // Opt-in periodic rescan.
  useEffect(() => {
    if (!autoRefresh) return
    const iv = setInterval(() => runScan(), SCAN_REFRESH_MS)
    return () => clearInterval(iv)
  }, [autoRefresh, runScan])

  const counts = SETUP_KEYS.reduce<Record<string, number>>((acc, k) => {
    acc[k] = rows.filter(r => r.setups.some(s => s.key === k)).length
    return acc
  }, {})

  const failed = rows.filter(r => r.status === 'error').length

  const q = search.trim().toLowerCase()
  // Filters apply to the table immediately, so narrowing feels instant. Coins a
  // widened filter newly ADMITS have no scan data yet — counted below and
  // surfaced as a prompt rather than shown as empty rows.
  const matchedIds = useMemo(() => new Set(scanUniverse), [scanUniverse])
  const scannedIds = useMemo(() => new Set(rows.map(r => r.assetId)), [rows])
  const unscannedCount = scanUniverse.filter(id => !scannedIds.has(id)).length

  const filtered = rows
    .filter(r => !filtersActive || matchedIds.has(r.assetId))
    .filter(r => showAll || (activeScan === 'all' ? r.setups.length > 0 : r.setups.some(s => s.key === activeScan)))
    .filter(r => !showAll || activeScan === 'all' || r.setups.some(s => s.key === activeScan))
    .filter(r => signalFilter === 'all' || r.signal?.overall === signalFilter)
    .map(r => ({ ...r, meta: metaById.get(r.assetId) }))
    .filter(r => !q || r.assetId.toLowerCase().includes(q) || (r.meta?.label ?? '').toLowerCase().includes(q) || (r.meta?.symbol ?? '').toLowerCase().includes(q))
    .sort((a, b) => {
      // Price comes from the same markets quotes the table already renders.
      // Coins with no quote sort last rather than as 0 — an unknown price is
      // not a cheap one.
      if (sortKey === 'price') {
        const pa = marketsData?.quotes?.[a.assetId]?.price ?? null
        const pb = marketsData?.quotes?.[b.assetId]?.price ?? null
        if (pa === null && pb === null) return 0
        if (pa === null) return 1
        if (pb === null) return -1
        return pb - pa
      }
      if (sortKey === 'setups') return b.setups.length - a.setups.length
      if (sortKey === 'signal') return signalRank(b.signal) - signalRank(a.signal)
      if (sortKey === 'rsi') return (a.rsi14 ?? 999) - (b.rsi14 ?? 999)
      return (a.meta?.rank ?? 9999) - (b.meta?.rank ?? 9999)
    })

  const total = SUPPORTED_IDS.length

  return (
    <div className="flex flex-col gap-4">
      {/* Controls: timeframe · sort · refresh */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Timeframe</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {SCAN_TIMEFRAMES.map(tf => (
              <button
                key={tf.key}
                onClick={() => setTimeframe(tf.key)}
                disabled={scanning}
                className={clsx('px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                  timeframe === tf.key ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated')}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-bg-elevated border border-border rounded-lg px-2 py-1 text-xs text-text-secondary focus:outline-none focus:border-accent-blue/40"
          >
            {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        <select
          value={signalFilter}
          onChange={(e) => setSignalFilter(e.target.value as Signal | 'all')}
          aria-label="Signal filter"
          className="bg-bg-elevated border border-border rounded-lg px-2 py-1 text-xs text-text-secondary focus:outline-none focus:border-accent-blue/40"
        >
          {SIGNAL_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search coin…"
          className="w-32 rounded-lg border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary placeholder:text-text-muted/60 focus:border-accent-blue/40 focus:outline-none"
        />

        <button
          onClick={() => setShowAll(v => !v)}
          className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
            showAll ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
          title="Include assets with no detected setup — the scanner then doubles as a universe overview"
        >
          {showAll ? 'All assets' : 'With setups'}
        </button>

        <button
          onClick={() => setFiltersOpen(o => !o)}
          className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
            filtersActive ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
          title="Narrow the universe before scanning — fewer coins means a faster scan"
        >
          Filters{filtersActive ? ` · ${scanUniverse.length}/${SUPPORTED_IDS.length}` : ''}
        </button>

        <button
          onClick={() => setAutoRefresh(a => !a)}
          className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
            autoRefresh ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
          title={`Auto-rescan every ${SCAN_REFRESH_MS / 1000}s`}
        >
          Auto-refresh {autoRefresh ? 'on' : 'off'}
        </button>

        <button
          onClick={() => { if (!scanning) runScan() }}
          disabled={scanning}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-border text-text-secondary hover:bg-bg-elevated transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} /> Rescan
        </button>

        <div className="ml-auto text-[11px] text-text-muted">
          {scanning
            ? <span className="flex items-center gap-1.5"><RefreshCw size={11} className="animate-spin" /> Scanned {done}/{total}</span>
            : lastScan
              ? <span>Scanned {total} assets{failed > 0 ? ` · ${failed} unavailable` : ''} · {lastScan.toLocaleTimeString()}</span>
              : null}
        </div>
      </div>

      {filtersOpen && (
        <div className="rounded-xl border border-border bg-bg-card p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1">
              <span className="block text-[11px] font-medium text-text-secondary">Visible coin range</span>
              <select
                value={filters.topN ?? ''}
                onChange={(e) => setFilters(f => ({ ...f, topN: e.target.value ? Number(e.target.value) : null }))}
                className="w-full bg-bg-elevated border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-blue/40"
              >
                <option value="">All {SUPPORTED_IDS.length}</option>
                {[10, 25, 50].map(n => <option key={n} value={n}>Top {n} by rank</option>)}
              </select>
            </label>

            {([
              { key: 'marketCap', label: 'Market cap', unit: '$' },
              { key: 'fdv', label: 'FDV', unit: '$' },
              { key: 'volume24h', label: 'Volume (24h)', unit: '$' },
              { key: 'priceChange24h', label: 'Price change (24h)', unit: '%' },
            ] as const).map(({ key, label, unit }) => (
              <div key={key} className="space-y-1">
                <span className="block text-[11px] font-medium text-text-secondary">{label}</span>
                <div className="flex items-center gap-1.5">
                  {(['min', 'max'] as const).map(bound => (
                    <div key={bound} className="relative flex-1">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={filters[key]?.[bound] ?? ''}
                        onChange={(e) => setFilters(f => ({
                          ...f,
                          // '' clears the bound back to unset — NOT to 0, which
                          // would silently become a real constraint.
                          [key]: { ...f[key], [bound]: e.target.value === '' ? null : Number(e.target.value) },
                        }))}
                        placeholder={bound === 'min' ? 'Min' : 'Max'}
                        aria-label={`${label} ${bound}`}
                        className="w-full rounded-lg border border-border bg-bg-elevated px-2 py-1.5 pr-6 text-xs text-text-primary placeholder:text-text-muted/60 focus:border-accent-blue/40 focus:outline-none"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">{unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[11px]">
            <button
              onClick={() => setFilters({})}
              className="rounded-lg border border-border px-2.5 py-1 font-medium text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary"
            >
              Reset
            </button>
            <span className="text-text-secondary">
              <strong className="text-text-primary">{scanUniverse.length}</strong> of {SUPPORTED_IDS.length} coins match
            </span>
            {/* Never folded into the excluded count: nobody ran the test on these. */}
            {filterResult.unknown.length > 0 && (
              <span className="text-amber-400">
                {filterResult.unknown.length} not tested — no market data loaded for them
              </span>
            )}
            {unscannedCount > 0 && !scanning && (
              <button onClick={() => runScan()} className="text-accent-blue underline underline-offset-2">
                {unscannedCount} newly included — rescan to include them
              </button>
            )}
          </div>

          {/* Present-and-inert controls would tell a user they narrowed the set
              when they had not, so the ones we cannot support are named with the
              reason instead of rendered dead. */}
          <p className="text-[10px] leading-relaxed text-text-muted">
            Not offered here, and why:{' '}
            {UNSUPPORTED_FILTERS.map((f, i) => (
              <span key={f.label}>
                {i > 0 && ' · '}<strong className="text-text-secondary">{f.label}</strong> — {f.needs}
              </span>
            ))}
            . This scanner sweeps a curated {SUPPORTED_IDS.length}-coin universe rather than the whole market,
            so those filters would have little to sift even with the data.
          </p>
        </div>
      )}

      {/* Progress bar */}
      {scanning && (
        <div className="h-1 w-full rounded-full bg-bg-elevated overflow-hidden">
          <div className="h-full bg-accent-blue transition-all duration-200" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}

      {/* Scan-type filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={13} className="text-text-muted" />
        <button
          onClick={() => setActiveScan('all')}
          className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border', activeScan === 'all' ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
        >
          All setups
        </button>
        {SETUP_KEYS.map((k) => (
          <button
            key={k}
            onClick={() => setActiveScan(k)}
            className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border flex items-center gap-1.5', activeScan === k ? SETUP_META[k].tone : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
          >
            {SETUP_META[k].label}
            <span className="text-[10px] opacity-70">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>

      {!scanning && filtered.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          <Activity size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs">No assets currently match {activeScan === 'all' ? 'any setup' : SETUP_META[activeScan].label} on the {SCAN_TIMEFRAMES.find(t => t.key === timeframe)?.label} timeframe.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-bg-elevated">
                <th className="text-left px-4 py-2.5 text-text-muted font-medium">Asset</th>
                <th className="text-right px-3 py-2.5 text-text-muted font-medium">Price</th>
                <th className="text-right px-3 py-2.5 text-text-muted font-medium">RSI 14</th>
                <th className="text-right px-3 py-2.5 text-text-muted font-medium">vs SMA 50</th>
                <th className="text-center px-3 py-2.5 text-text-muted font-medium">Signal</th>
                <th className="text-left px-4 py-2.5 text-text-muted font-medium">Detected setups</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => (
                <tr key={row.assetId} className="hover:bg-bg-elevated transition-colors align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-text-primary">{row.meta?.symbol ?? row.assetId.toUpperCase()}</span>
                      <span className="text-text-muted">{row.meta?.label ?? ''}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sm text-text-primary whitespace-nowrap">
                    {(() => {
                      const price = marketsData?.quotes?.[row.assetId]?.price
                      return typeof price === 'number' ? formatAdaptivePrice(price) : <span className="text-text-muted text-xs">—</span>
                    })()}
                  </td>
                  <td className={clsx('px-3 py-3 text-right font-mono text-xs whitespace-nowrap',
                    row.rsi14 == null ? 'text-text-muted'
                      : row.rsi14 >= 70 ? 'text-red-400'
                      : row.rsi14 <= 30 ? 'text-emerald-400'
                      : 'text-text-secondary')}>
                    {row.rsi14 == null ? '—' : row.rsi14.toFixed(1)}
                  </td>
                  <td className={clsx('px-3 py-3 text-right font-mono text-xs whitespace-nowrap',
                    row.vsSma50Pct == null ? 'text-text-muted'
                      : row.vsSma50Pct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {row.vsSma50Pct == null ? '—' : `${row.vsSma50Pct >= 0 ? '+' : ''}${row.vsSma50Pct.toFixed(1)}%`}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {row.signal ? <SignalBadge signal={row.signal.overall} /> : <span className="text-text-muted text-[10px]">N/A</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      {row.setups.length === 0 && <span className="text-[11px] text-text-muted">none</span>}
                      {row.setups
                        .filter(s => activeScan === 'all' || s.key === activeScan)
                        .map((s, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className={clsx('px-1.5 py-0.5 rounded border text-[10px] font-medium shrink-0', SETUP_META[s.key].tone)}>
                              {SETUP_META[s.key].label}
                            </span>
                            <span className="text-[11px] text-text-muted">{s.detail}</span>
                          </div>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


function CryptoScannerInner() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Crypto Scanner"
        subtitle="Sweep every tracked coin for technical setups"
        description="Scans the whole monitored universe on the selected timeframe for breakouts, oversold bounces, overbought fades, moving-average crosses, volume spikes, OBV divergence and volatility compression. Rescan manually or leave auto-refresh on."
        details={[
          { label: 'What it is', text: 'A discovery tool: it looks across assets to find candidates. Technical Analysis is the other half — it charts the one asset you picked.' },
          { label: 'Setups', text: 'Seven detectors run per asset on real OHLCV history. A setup is a pattern the data shows, not a view on whether to trade it.' },
          { label: 'Timeframes', text: '4H, 1D and 1W. The detectors read the same way on each; only the bar spacing changes.' },
        ]}
      />
      <ScannerPanel />
      <SourceLine id="ohlcv" />
    </div>
  )
}

export default function CryptoScannerPage() {
  return (
    <ModuleGate module="crypto">
      <CryptoScannerInner />
    </ModuleGate>
  )
}
