'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQueries } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Activity, Loader2 } from 'lucide-react'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { rsi, sma, computeSignalSummary, type Signal } from '@/lib/utils/indicators'
import { SignalBadge } from '@/components/charts/SignalBadge'
import {
  MACRO_INSTRUMENTS, SCANNER_INSTRUMENTS, GROUPS, fmtLevel,
  type MacroGroup, type MacroInstrument,
} from '../macroInstruments'
import type { SecurityOhlcvResponse } from '@/app/live-data/security-ohlcv/route'

// ─── Macro Scanner ────────────────────────────────────────────────────────────
//
// Was the "Scanner" tab on /macro/technical-analysis until 2026-08-19 (items
// 6/7: one scanner per section, promoted to nav).
//
// Universe is the LIQUID subset — 29 of the 45 macro instruments. The 6
// delisted-ETF commodities and the 10 EM/cross FX pairs gap enough that a
// ranked RSI beside a liquid contract would read as comparable when it is not.
// All 45 still chart on the TA page; the exclusion is stated on-page, not
// silently applied.

// ─── Scanner tab ──────────────────────────────────────────────────────────────

interface ScannerRow {
  symbol: string
  name: string
  group: MacroGroup
  detailPath: string
  entry: MacroInstrument
  level: number | null
  rsi14: number | null
  vsSma50Pct: number | null
  overall: Signal | null
}

function ScannerTab() {
  const [group, setGroup] = useState<MacroGroup | 'All'>('All')

  const queries = useQueries({
    queries: SCANNER_INSTRUMENTS.map((m) => ({
      queryKey: ['security-ohlcv', m.symbol, '6M'],
      queryFn: () => fetch(`/live-data/security-ohlcv?symbol=${encodeURIComponent(m.symbol)}&range=6M`)
        .then((r) => r.json() as Promise<SecurityOhlcvResponse>),
      staleTime: 10 * 60 * 1000,
    })),
  })

  const loading = queries.some((q) => q.isLoading)
  const dataKey = queries.map((q) => q.dataUpdatedAt).join(',')

  const rows: ScannerRow[] = useMemo(() => {
    return SCANNER_INSTRUMENTS.map((m, i) => {
      const candles = queries[i].data?.candles ?? []
      const base = {
        symbol: m.symbol, name: m.name, group: m.group, detailPath: m.detailPath, entry: m,
      }
      if (candles.length < 30) {
        return { ...base, level: null, rsi14: null, vsSma50Pct: null, overall: null }
      }
      const closes = candles.map((c) => c.close)
      const last = closes[closes.length - 1]
      const rsiVals = rsi(closes, 14)
      const smaVals = sma(closes, 50)
      const sma50 = smaVals[smaVals.length - 1]
      return {
        ...base,
        level: last,
        rsi14: rsiVals[rsiVals.length - 1],
        vsSma50Pct: sma50 ? ((last - sma50) / sma50) * 100 : null,
        overall: computeSignalSummary(candles).overall,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey])

  const visible = group === 'All' ? rows : rows.filter((r) => r.group === group)
  const skipped = MACRO_INSTRUMENTS.length - SCANNER_INSTRUMENTS.length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['All', ...GROUPS] as Array<MacroGroup | 'All'>).map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={clsx('px-2.5 py-1 rounded text-xs font-medium border transition-colors',
              group === g
                ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                : 'text-text-muted border-border hover:text-text-secondary')}
          >
            {g}
          </button>
        ))}
        {loading && <Loader2 size={14} className="animate-spin text-text-muted" aria-hidden />}
      </div>

      {/* Never silently cap coverage — say what was left out and why. */}
      <p className="text-xs text-text-muted leading-relaxed">
        Scanning {SCANNER_INSTRUMENTS.length} of {MACRO_INSTRUMENTS.length} macro instruments over
        6 months of daily history. {skipped} thin {skipped === 1 ? 'market is' : 'markets are'} excluded —
        the delisted-ETF commodities (heating oil, coffee, cocoa, cotton, cattle, hogs) and the EM and
        cross FX pairs, whose series gap enough that a ranked RSI beside a liquid contract would read
        as comparable when it isn’t. All of them still chart on the Chart tab.
      </p>

      <div className="rounded-card border border-border bg-bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text-muted uppercase tracking-wider text-[10px]">
              <th className="px-4 py-2 text-left font-medium">Instrument</th>
              <th className="px-4 py-2 text-left font-medium">Area</th>
              <th className="px-4 py-2 text-right font-medium">Level</th>
              <th className="px-4 py-2 text-right font-medium">RSI 14</th>
              <th className="px-4 py-2 text-right font-medium">vs SMA 50</th>
              <th className="px-4 py-2 text-right font-medium">Signal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {visible.map((row) => {
              return (
                <tr key={row.symbol} className="hover:bg-bg-elevated/50 transition-colors">
                  <td className="px-4 py-2">
                    <Link href={row.detailPath} className="font-medium text-accent-blue hover:underline">
                      {row.name}
                    </Link>
                    <span className="ml-2 font-mono text-text-muted">{row.symbol}</span>
                  </td>
                  <td className="px-4 py-2 text-text-muted">{row.group}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-text-primary">
                    {fmtLevel(row.entry, row.level)}
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
                  {/* Same badge the crypto scanner renders — the three
                      scanners are one family now, so a signal must not look
                      different depending on which section you are in. */}
                  <td className="px-4 py-2 text-right">
                    {row.overall
                      ? <SignalBadge signal={row.overall} />
                      : <span className="text-text-muted">{loading ? '…' : 'no data'}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}


function MacroScannerInner() {
  return (
    <div className="space-y-5 max-w-screen-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-accent-blue" aria-hidden />
        <PageHeader
          title="Macro Scanner"
          subtitle="RSI, trend-vs-average and composite signal across the liquid macro universe"
          description="Ranks commodities, currencies and rates on the same indicator engine the crypto and equity scanners use. Levels follow each market's own convention — grains in cents per bushel, yields in percent, bond futures in points of par."
          details={[
            { label: 'Universe', text: 'The liquid subset: 29 of 45 macro instruments. Thin contracts and EM/cross FX pairs are excluded because a ranked reading beside a liquid one reads as comparable when it is not — they all still chart on Technical Analysis.' },
            { label: 'What it is', text: 'A discovery tool across instruments. The TA page is the other half: it charts the one instrument you picked.' },
          ]}
        />
      </div>
      <SourceLine id="macro-quotes" />
      <ScannerTab />
    </div>
  )
}

export default function MacroScannerPage() {
  return (
    <ModuleGate module="macro">
      <MacroScannerInner />
    </ModuleGate>
  )
}
