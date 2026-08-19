'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { Filter, Loader2, RefreshCw, Telescope } from 'lucide-react'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { OutlierScanPanel } from '@/components/markets/OutlierScanPanel'
import { SignalBadge } from '@/components/charts/SignalBadge'
import { computeSignalSummary, rsi, sma, type OhlcvCandle, type Signal, type SignalSummary } from '@/lib/utils/indicators'
import { detectSetups, type DetectedSetup, type SetupKey } from '@/lib/utils/scanSetups'
import { runPool } from '@/lib/utils/runPool'
import { formatAdaptivePrice } from '@/lib/utils/format'
import { EQUITY_CATALOG, SECTOR_INFO, type SectorId } from '@/lib/data/equityCatalog'
import type { SecurityOhlcvResponse } from '@/app/live-data/security-ohlcv/route'

// ─── Equity Scanner ───────────────────────────────────────────────────────────
//
// Short-list items 6 and 7 (2026-08-19): one scanner per section, promoted to a
// top-level nav entry, and for equities specifically — ONE scanner, merging the
// technical screener with the AI Outlier Scan rather than leaving them on two
// different pages.
//
// It replaces the "Screener" tab that lived on /equities/technical-analysis and
// closes the maturity gap the review recorded (E14-E16): that tab ran RSI and
// vs-SMA over 24 hardcoded large-caps, while the crypto scanner ran seven setup
// detectors over the whole tracked universe. This runs the SAME seven detectors
// over the full curated catalog.
//
// Two deliberate differences from the crypto scanner, both about cost rather
// than ambition:
//  - No auto-refresh. Every row is a KEYED provider fetch (Tiingo/FMP); a
//    scanner that re-runs itself on a timer would quietly drain a free tier.
//    The crypto scanner refreshes because CoinGecko OHLCV is keyless.
//  - Windows, not timeframes. security-ohlcv serves daily bars only, so the
//    selector changes how much HISTORY the detectors read (3M/6M/1Y), not the
//    bar size. Labelling these "4H/1D/1W" would be a lie about the data.

const SCAN_UNIVERSE = EQUITY_CATALOG.map((e) => ({
  symbol: e.symbol,
  name: e.name,
  sector: e.sector,
}))

/** Concurrency cap — the same reasoning as the crypto scanner's pool. */
const SCAN_CONCURRENCY = 4

const WINDOWS = [
  { key: '3M' as const, label: '3M', hint: '~66 daily bars' },
  { key: '6M' as const, label: '6M', hint: '~130 daily bars' },
  { key: '1Y' as const, label: '1Y', hint: '~260 daily bars' },
]
type ScanWindow = (typeof WINDOWS)[number]['key']

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

type RowStatus = 'loading' | 'ok' | 'error'

interface ScanRow {
  symbol: string
  name: string
  sector: SectorId
  price: number | null
  rsi14: number | null
  vsSma50Pct: number | null
  setups: DetectedSetup[]
  signal: SignalSummary | null
  status: RowStatus
}

const SIGNAL_SCORE: Record<Signal, number> = {
  strong_buy: 2, buy: 1, neutral: 0, sell: -1, strong_sell: -2,
}
const signalRank = (s: SignalSummary | null) => (s ? SIGNAL_SCORE[s.overall] : -99)

const SORT_OPTIONS = [
  { key: 'setups' as const, label: 'Most setups' },
  { key: 'signal' as const, label: 'Signal' },
  { key: 'rsi' as const, label: 'RSI (low→high)' },
  { key: 'symbol' as const, label: 'Symbol' },
]
type SortKey = (typeof SORT_OPTIONS)[number]['key']

const emptyRows = (): ScanRow[] => SCAN_UNIVERSE.map((u) => ({
  symbol: u.symbol, name: u.name, sector: u.sector,
  price: null, rsi14: null, vsSma50Pct: null,
  setups: [], signal: null, status: 'loading' as RowStatus,
}))

function ScannerPanel() {
  // Not named `window`: shadowing the global inside a client component is the
  // kind of thing that works until someone adds a `window.matchMedia` call.
  const [historyWindow, setHistoryWindow] = useState<ScanWindow>('6M')
  const [sector, setSector] = useState<SectorId | 'all'>('all')
  const [activeSetup, setActiveSetup] = useState<SetupKey | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('setups')
  const [rows, setRows] = useState<ScanRow[]>(emptyRows)
  const [scanning, setScanning] = useState(false)
  const [done, setDone] = useState(0)
  const [lastScan, setLastScan] = useState<Date | null>(null)
  const scanIdRef = useRef(0)

  const runScan = useCallback(async () => {
    const myScan = ++scanIdRef.current
    setScanning(true)
    setDone(0)
    setRows(emptyRows())

    await runPool(SCAN_UNIVERSE, SCAN_CONCURRENCY, async (u) => {
      let patch: Partial<ScanRow>
      try {
        const res = await fetch(`/live-data/security-ohlcv?symbol=${encodeURIComponent(u.symbol)}&range=${historyWindow}`)
        const json = (await res.json()) as SecurityOhlcvResponse
        const candles: OhlcvCandle[] = json.candles ?? []
        if (!json.ok || candles.length === 0) {
          patch = { status: 'error' }
        } else {
          const closes = candles.map((c) => c.close)
          const rsiSeries = rsi(closes, 14)
          const sma50 = sma(closes, 50)
          const last = closes[closes.length - 1]
          const lastSma = sma50[sma50.length - 1]
          patch = {
            price: last,
            rsi14: rsiSeries[rsiSeries.length - 1] ?? null,
            vsSma50Pct: lastSma ? ((last - lastSma) / lastSma) * 100 : null,
            setups: detectSetups(candles),
            signal: candles.length >= 50 ? computeSignalSummary(candles) : null,
            status: 'ok',
          }
        }
      } catch {
        patch = { status: 'error' }
      }
      // A newer scan supersedes this one — drop late results rather than
      // letting a stale window's numbers land in the current table.
      if (scanIdRef.current !== myScan) return
      setRows((prev) => prev.map((r) => (r.symbol === u.symbol ? { ...r, ...patch } : r)))
      setDone((d) => d + 1)
    })

    if (scanIdRef.current !== myScan) return
    setScanning(false)
    setLastScan(new Date())
  }, [historyWindow])

  // Deliberately NOT scanned on mount, and this is the same reasoning that
  // rules out auto-refresh: one visit is 79 keyed provider requests. The crypto
  // scanner runs on mount because its source is keyless and costs nothing;
  // spending someone's provider quota just because they opened a page is not a
  // trade this scanner gets to make on their behalf. Changing the window after
  // a scan re-runs it, because at that point the user has asked for results.
  const scannedOnce = useRef(false)
  useEffect(() => {
    if (!scannedOnce.current) return
    void runScan()
  }, [runScan])

  const visible = useMemo(() => {
    let out = rows
    if (sector !== 'all') out = out.filter((r) => r.sector === sector)
    if (activeSetup !== 'all') out = out.filter((r) => r.setups.some((s) => s.key === activeSetup))
    const sorted = [...out]
    if (sortKey === 'setups') sorted.sort((a, b) => b.setups.length - a.setups.length || a.symbol.localeCompare(b.symbol))
    else if (sortKey === 'signal') sorted.sort((a, b) => signalRank(b.signal) - signalRank(a.signal))
    else if (sortKey === 'rsi') sorted.sort((a, b) => (a.rsi14 ?? 999) - (b.rsi14 ?? 999))
    else sorted.sort((a, b) => a.symbol.localeCompare(b.symbol))
    return sorted
  }, [rows, sector, activeSetup, sortKey])

  const errored = rows.filter((r) => r.status === 'error').length
  const withSetups = rows.filter((r) => r.setups.length > 0).length

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-bg-elevated p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setHistoryWindow(w.key)}
              title={w.hint}
              className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                historyWindow === w.key ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary')}
            >
              {w.label}
            </button>
          ))}
        </div>

        <select
          value={sector}
          onChange={(e) => setSector(e.target.value as SectorId | 'all')}
          className="rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
          aria-label="Sector filter"
        >
          <option value="all">All sectors</option>
          {Object.entries(SECTOR_INFO).map(([id, info]) => (
            <option key={id} value={id}>{info.label}</option>
          ))}
        </select>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
          aria-label="Sort"
        >
          {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>

        <button
          onClick={() => { scannedOnce.current = true; void runScan() }}
          disabled={scanning}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
        >
          {scanning ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <RefreshCw size={12} aria-hidden />}
          {scanning ? `Scanning ${done}/${SCAN_UNIVERSE.length}` : lastScan ? 'Rescan' : 'Run scan'}
        </button>

        {lastScan && !scanning && (
          <span className="text-[11px] text-text-muted">Scanned {lastScan.toLocaleTimeString()}</span>
        )}
      </div>

      {/* Setup filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveSetup('all')}
          className={clsx('rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
            activeSetup === 'all' ? 'border-accent-blue/50 bg-accent-blue/10 text-accent-blue' : 'border-border bg-bg-elevated text-text-muted hover:text-text-secondary')}
        >
          <Filter size={10} className="mr-1 inline" aria-hidden /> All setups
        </button>
        {SETUP_KEYS.map((k) => (
          <button
            key={k}
            onClick={() => setActiveSetup(activeSetup === k ? 'all' : k)}
            className={clsx('rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              activeSetup === k ? SETUP_META[k].tone : 'border-border bg-bg-elevated text-text-muted hover:text-text-secondary')}
          >
            {SETUP_META[k].label}
          </button>
        ))}
      </div>

      {!lastScan && !scanning && (
        <p className="rounded-card border border-border bg-bg-card p-3 text-xs text-text-muted">
          Press <strong>Run scan</strong> to sweep the catalog. One scan is {SCAN_UNIVERSE.length} keyed
          provider requests, so it runs when you ask rather than on every visit.
        </p>
      )}

      {/* Coverage, never silently capped */}
      <p className="text-[11px] leading-relaxed text-text-muted">
        Scanning {SCAN_UNIVERSE.length} curated large-caps over {WINDOWS.find((w) => w.key === historyWindow)?.hint} of daily history.
        {' '}{withSetups} {withSetups === 1 ? 'name has' : 'names have'} at least one setup.
        {errored > 0 && (
          <> {errored} returned no history — the OHLCV providers are key-gated, so an unconfigured
          instance scans nothing rather than showing invented rows.</>
        )}
        {' '}The registry&rsquo;s broader universe is not scanned: one keyed OHLCV request per symbol
        makes a whole-universe sweep a quota decision, not a technical one.
      </p>

      {/* Results */}
      <div className="overflow-x-auto rounded-card border border-border bg-bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Symbol</th>
              <th className="px-4 py-2 text-left font-medium">Sector</th>
              <th className="px-4 py-2 text-right font-medium">Price</th>
              <th className="px-4 py-2 text-right font-medium">RSI 14</th>
              <th className="px-4 py-2 text-right font-medium">vs SMA 50</th>
              <th className="px-4 py-2 text-right font-medium">Signal</th>
              <th className="px-4 py-2 text-left font-medium">Setups</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {visible.map((row) => (
              <tr key={row.symbol} className="transition-colors hover:bg-bg-elevated/50">
                <td className="px-4 py-2">
                  <Link href={`/equities/${row.symbol}`} className="font-medium text-accent-blue hover:underline">
                    {row.symbol}
                  </Link>
                  <div className="max-w-[220px] truncate text-[11px] text-text-muted">{row.name}</div>
                </td>
                <td className="px-4 py-2 text-xs text-text-muted">{SECTOR_INFO[row.sector]?.label ?? row.sector}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-text-primary">
                  {row.price != null ? formatAdaptivePrice(row.price) : row.status === 'loading' ? '…' : '—'}
                </td>
                <td className={clsx('px-4 py-2 text-right font-mono tabular-nums',
                  row.rsi14 == null ? 'text-text-muted'
                    : row.rsi14 >= 70 ? 'text-red-400'
                    : row.rsi14 <= 30 ? 'text-emerald-400'
                    : 'text-text-secondary')}>
                  {row.rsi14 == null ? '—' : row.rsi14.toFixed(1)}
                </td>
                <td className={clsx('px-4 py-2 text-right font-mono tabular-nums',
                  row.vsSma50Pct == null ? 'text-text-muted'
                    : row.vsSma50Pct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {row.vsSma50Pct == null ? '—' : `${row.vsSma50Pct >= 0 ? '+' : ''}${row.vsSma50Pct.toFixed(1)}%`}
                </td>
                <td className="px-4 py-2 text-right">
                  {row.signal
                    ? <SignalBadge signal={row.signal.overall} />
                    : <span className="text-text-muted">{row.status === 'loading' ? '…' : '—'}</span>}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {row.setups.length === 0
                      ? <span className="text-[11px] text-text-muted">{row.status === 'loading' ? '…' : 'none'}</span>
                      : row.setups.map((s) => (
                        <span key={s.key} className={clsx('rounded border px-1.5 py-0.5 text-[10px] font-medium', SETUP_META[s.key].tone)} title={s.detail}>
                          {SETUP_META[s.key].label}
                        </span>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EquityScannerInner() {
  return (
    <div className="max-w-screen-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Telescope className="h-6 w-6 text-accent-blue" aria-hidden />
        <PageHeader
          title="Equity Scanner"
          subtitle="Technical setups across the catalog, plus the AI outlier scan"
          description="One scanner for equities: the same seven setup detectors the crypto scanner runs, over the curated large-cap catalog, alongside the sector-relative outlier scan the Equity Screener agent performs. Technical Analysis charts the one stock you picked; this finds candidates."
          details={[
            { label: 'Setups', text: 'Breakout, oversold bounce, overbought fade, MA cross, volume spike, OBV divergence, volatility squeeze — computed from real daily OHLCV, not reference data.' },
            { label: 'Windows', text: 'The provider serves daily bars only, so 3M/6M/1Y changes how much history the detectors read, not the bar size.' },
            { label: 'Why no auto-refresh', text: 'Every row is a keyed provider request. A scanner re-running itself on a timer would drain a free tier; the crypto scanner refreshes because its source is keyless.' },
          ]}
        />
      </div>
      <SourceLine id="security-ohlcv" />
      <OutlierScanPanel />
      <ScannerPanel />
    </div>
  )
}

export default function EquityScannerPage() {
  return (
    <ModuleGate module="equities">
      <EquityScannerInner />
    </ModuleGate>
  )
}
