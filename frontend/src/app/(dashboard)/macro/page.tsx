'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Banknote, Gem, Globe, Percent } from 'lucide-react'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import { STALE_TIME_SHORT } from '@/lib/constants'

// Macro Markets overview — the module's landing page while the three area
// toolsets build out (owner spec: docs/ROADMAP.md, "Macro Markets").
// Everything shown is live via the existing security-quotes route; if a
// symbol can't be priced it renders an explicit dash, never a made-up value.

interface MacroSymbol {
  symbol: string
  label: string
  /** How to render the quote value. */
  kind: 'usd' | 'pct-yield' | 'fx'
}

interface MacroArea {
  title: string
  icon: typeof Gem
  accent: string
  blurb: string
  status: string
  /** Set once the area's registry page exists — the card title links to it. */
  href?: string
  symbols: MacroSymbol[]
}

const AREAS: MacroArea[] = [
  {
    title: 'Commodities',
    icon: Gem,
    accent: '#f59e0b',
    blurb: 'Metals, energy, and agriculture futures with the same registry, detail, TA, and backtest tooling the Equities module has.',
    status: 'Live',
    href: '/macro/commodities',
    symbols: [
      { symbol: 'GC=F', label: 'Gold', kind: 'usd' },
      { symbol: 'SI=F', label: 'Silver', kind: 'usd' },
      { symbol: 'CL=F', label: 'WTI Crude', kind: 'usd' },
      { symbol: 'NG=F', label: 'Nat Gas', kind: 'usd' },
      { symbol: 'HG=F', label: 'Copper', kind: 'usd' },
    ],
  },
  {
    title: 'Currencies',
    icon: Banknote,
    accent: '#22c55e',
    blurb: 'Major and EM FX pairs, dollar index, and a converter — intraday via live quotes, daily ECB reference crosses.',
    status: 'Live',
    href: '/macro/currencies',
    symbols: [
      { symbol: 'EURUSD=X', label: 'EUR/USD', kind: 'fx' },
      { symbol: 'GBPUSD=X', label: 'GBP/USD', kind: 'fx' },
      { symbol: 'JPY=X', label: 'USD/JPY', kind: 'fx' },
      { symbol: 'DX-Y.NYB', label: 'Dollar Index', kind: 'fx' },
    ],
  },
  {
    title: 'Rates & Bonds',
    icon: Percent,
    accent: '#64748b',
    blurb: 'The official treasury yield curve, live yields and bond futures, and the bond ETF shelf. CUSIP-level bond quotes are licensed data — the page says so rather than pretending.',
    status: 'Live',
    href: '/macro/rates',
    symbols: [
      { symbol: '^IRX', label: '3-Month', kind: 'pct-yield' },
      { symbol: '^FVX', label: '5-Year', kind: 'pct-yield' },
      { symbol: '^TNX', label: '10-Year', kind: 'pct-yield' },
      { symbol: '^TYX', label: '30-Year', kind: 'pct-yield' },
    ],
  },
]

const ALL_SYMBOLS = AREAS.flatMap((a) => a.symbols.map((s) => s.symbol))

interface Quote {
  price: number | null
  changePercent: number | null
}
interface QuotesResponse {
  ok: boolean
  quotes?: Record<string, { price: number | null; changePercent: number | null }>
}

function fmtValue(kind: MacroSymbol['kind'], price: number): string {
  if (kind === 'pct-yield') return `${price.toFixed(2)}%`
  if (kind === 'fx') return price >= 10 ? price.toFixed(2) : price.toFixed(4)
  return price >= 100 ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${price.toFixed(2)}`
}

function MacroContent() {
  const { data, isLoading, isError } = useQuery<Record<string, Quote>>({
    queryKey: ['macro-overview-quotes'],
    queryFn: async () => {
      const res = await fetch(`/live-data/security-quotes?symbols=${encodeURIComponent(ALL_SYMBOLS.join(','))}`)
      const json: QuotesResponse = await res.json()
      if (!json.ok || !json.quotes) throw new Error('quotes unavailable')
      return json.quotes
    },
    staleTime: STALE_TIME_SHORT,
    refetchInterval: 1000 * 60 * 2,
  })

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
          <Globe size={18} className="text-accent-blue" aria-hidden />
        </div>
        <PageHeader
          title="Macro Markets"
          subtitle="Commodities, currencies, and rates — live now, toolsets building out"
          description="One module, three areas, mirroring the Crypto and Equities toolsets: registries with live quotes, detail pages with charts and news, shared technical analysis and backtests, and macro-aware AI agents. The quotes below are live through the same data plumbing the rest of the suite uses."
          details={[
            { label: 'Build order', text: 'Commodities first, then Currencies, then Rates & Bonds — richest free data first.' },
            { label: 'Data honesty', text: 'Everything shown is live or explicitly unavailable. Individual bond quotes (CUSIP-level) have no free source and will never be fabricated.' },
          ]}
        />
      </div>

      {isError && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-text-secondary leading-relaxed">
          Live macro quotes are unavailable right now — the quote source could not be reached. Values will appear when the feed recovers.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {AREAS.map((area) => (
          <div key={area.title} className="rounded-card border border-border bg-bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2.5">
              <area.icon size={15} style={{ color: area.accent }} aria-hidden />
              {area.href ? (
                <Link href={area.href} className="text-sm font-medium text-text-primary flex-1 hover:text-accent-blue transition-colors">
                  {area.title}
                </Link>
              ) : (
                <h2 className="text-sm font-medium text-text-primary flex-1">{area.title}</h2>
              )}
              <span className={clsx('px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border',
                area.href ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-bg-elevated border-border text-text-muted')}>
                {area.status}
              </span>
            </div>
            <div className="divide-y divide-border/40">
              {area.symbols.map((s) => {
                const q = data?.[s.symbol]
                const up = (q?.changePercent ?? 0) >= 0
                return (
                  <div key={s.symbol} className="px-4 py-2 flex items-center gap-3 text-sm">
                    <span className="text-xs text-text-secondary flex-1">{s.label}</span>
                    {q?.price != null ? (
                      <>
                        <span className="font-mono tabular-nums text-text-primary">{fmtValue(s.kind, q.price)}</span>
                        {q.changePercent != null && (
                          <span className={clsx('font-mono tabular-nums text-xs w-16 text-right', up ? 'text-emerald-400' : 'text-red-400')}>
                            {up ? '+' : ''}{q.changePercent.toFixed(2)}%
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="font-mono text-xs text-text-muted">{isLoading ? '…' : '—'}</span>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="px-4 py-3 border-t border-border/60 text-[11px] text-text-muted leading-relaxed">{area.blurb}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-text-muted text-center leading-relaxed">
        Quotes via the suite&rsquo;s live security-quotes route (Yahoo Finance primary). Yield figures are index levels
        quoted in percent; futures are front-month continuous contracts.
      </p>
    </div>
  )
}

export default function MacroPage() {
  return (
    <ModuleGate module="macro">
      <MacroContent />
    </ModuleGate>
  )
}
