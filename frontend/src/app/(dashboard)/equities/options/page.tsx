'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Plus, Search, Sigma, Trash2 } from 'lucide-react'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import { TradeRiskReport } from '@/components/options/TradeRiskReport'
import {
  scoreOptionsTrade,
  type CompositeRisk, type OptionLegInput, type OptionsTradeInputs,
} from '@/lib/risk'
import { buildPreset, PRESETS, type PresetId } from '@/lib/options/presets'
import { STALE_TIME_SHORT } from '@/lib/constants'
import type { SecurityQuotesResponse } from '@/app/live-data/security-quotes/route'

// Trade Risk Scorer (P2-O2) — the UI for lib/risk/profiles/optionsTrade.ts,
// which shipped complete and tested with zero consumers.
//
// Everything options-level is USER-ENTERED in this version, and the page says
// so: there is no chain feed yet (that is P2-O3, gated on the P2-O1 data
// audit), and the honest framing until then is "copy these numbers from your
// broker's chain" — which the user is looking at anyway when sizing a trade.
// The one live number is the underlying price, prefillable from
// /live-data/security-quotes with the usual live/ref labeling.
//
// The engine's stance is the page's stance: it explains the risk of a trade
// you describe. It does not recommend trades.

// ─── Form state (strings, so partial typing never fights the parser) ─────────

interface LegForm {
  side: 'long' | 'short'
  type: 'call' | 'put'
  strike: string
  bid: string
  ask: string
  openInterest: string
  volume: string
  delta: string
}

const emptyLeg = (): LegForm => ({
  side: 'long', type: 'call', strike: '', bid: '', ask: '', openInterest: '', volume: '', delta: '',
})

const num = (s: string): number | undefined => {
  if (s.trim() === '') return undefined
  const v = Number(s)
  return Number.isFinite(v) ? v : undefined
}

/** Parse the form into engine inputs, or explain what's missing. */
function parseInputs(form: {
  underlying: string
  daysToExpiry: string
  legs: LegForm[]
  ivRank: string
  earningsInDays: string
  exDividendInDays: string
  maxLossMode: 'unset' | 'bounded' | 'unbounded'
  maxLossUsd: string
  maxProfitUsd: string
}): { inputs: OptionsTradeInputs | null; problems: string[] } {
  const problems: string[] = []

  const underlyingPrice = num(form.underlying)
  if (underlyingPrice === undefined || underlyingPrice <= 0) problems.push('an underlying price above 0')

  const daysToExpiry = num(form.daysToExpiry)
  if (daysToExpiry === undefined || daysToExpiry < 0) problems.push('days to expiry (0 or more)')

  const legs: OptionLegInput[] = []
  form.legs.forEach((leg, i) => {
    const strike = num(leg.strike)
    const bid = num(leg.bid)
    const ask = num(leg.ask)
    if (strike === undefined || strike <= 0) problems.push(`leg ${i + 1}: a strike above 0`)
    if (bid === undefined || bid < 0) problems.push(`leg ${i + 1}: a bid (0 or more)`)
    if (ask === undefined || ask < 0) problems.push(`leg ${i + 1}: an ask (0 or more)`)
    if (bid !== undefined && ask !== undefined && ask < bid) problems.push(`leg ${i + 1}: ask below bid`)
    if (strike === undefined || bid === undefined || ask === undefined) return
    legs.push({
      side: leg.side, type: leg.type, strike, bid, ask,
      openInterest: num(leg.openInterest),
      volume: num(leg.volume),
      delta: num(leg.delta),
    })
  })
  if (form.legs.length === 0) problems.push('at least one leg')

  if (problems.length > 0) return { inputs: null, problems }

  return {
    inputs: {
      underlyingPrice: underlyingPrice!,
      daysToExpiry: daysToExpiry!,
      legs,
      ivRank: num(form.ivRank),
      earningsInDays: num(form.earningsInDays),
      exDividendInDays: num(form.exDividendInDays),
      maxLossUsd: form.maxLossMode === 'unbounded' ? 'unbounded'
        : form.maxLossMode === 'bounded' ? num(form.maxLossUsd)
        : undefined,
      maxProfitUsd: num(form.maxProfitUsd),
    },
    problems: [],
  }
}

// ─── Shared field bits ────────────────────────────────────────────────────────

const FIELD =
  'w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm font-mono tabular-nums text-text-primary placeholder:text-text-muted/60 focus:border-accent-blue/50 focus:outline-none'
const LABEL = 'text-[11px] text-text-muted uppercase tracking-wider'

function Toggle<T extends string>({ value, options, onChange }: {
  value: T
  options: Array<{ v: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5">
      {options.map(({ v, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={clsx('px-2 py-1 rounded text-[11px] font-medium transition-colors',
            value === v ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OptionsScorerPage() {
  return (
    <ModuleGate module="equities">
      <OptionsScorerInner />
    </ModuleGate>
  )
}

function OptionsScorerInner() {
  const [symbol, setSymbol] = useState('')
  const [underlying, setUnderlying] = useState('')
  const [daysToExpiry, setDaysToExpiry] = useState('30')
  const [legs, setLegs] = useState<LegForm[]>([emptyLeg()])
  const [ivRank, setIvRank] = useState('')
  const [earningsInDays, setEarningsInDays] = useState('')
  const [exDividendInDays, setExDividendInDays] = useState('')
  const [maxLossMode, setMaxLossMode] = useState<'unset' | 'bounded' | 'unbounded'>('unset')
  const [maxLossUsd, setMaxLossUsd] = useState('')
  const [maxProfitUsd, setMaxProfitUsd] = useState('')
  const [presetNote, setPresetNote] = useState<string | null>(null)

  // The one live number on the page. Fetched on demand, labeled live vs ref.
  const cleanSymbol = symbol.trim().toUpperCase()
  const { data: quoteData, isFetching: quoteLoading, refetch: fetchQuote } = useQuery<SecurityQuotesResponse>({
    queryKey: ['security-quotes', cleanSymbol],
    queryFn: () => fetch(`/live-data/security-quotes?symbols=${encodeURIComponent(cleanSymbol)}`).then((r) => r.json()),
    enabled: false, // explicit button — a scorer page shouldn't poll
    staleTime: STALE_TIME_SHORT,
  })
  const quote = quoteData?.quotes?.[cleanSymbol]
  const quoteIsLive = !!quote && quoteData?.source !== 'reference' && !quote.reference

  const prefillFromQuote = async () => {
    if (!cleanSymbol) return
    const res = await fetchQuote()
    const q = res.data?.quotes?.[cleanSymbol]
    if (q?.price != null) setUnderlying(String(q.price))
  }

  const applyPreset = (id: PresetId) => {
    const price = num(underlying)
    if (price === undefined || price <= 0) {
      setPresetNote('Enter (or fetch) an underlying price first — presets derive their strikes from it.')
      return
    }
    const preset = buildPreset(id, price)
    setLegs(preset.legs.map((l) => ({ ...emptyLeg(), side: l.side, type: l.type, strike: String(l.strike) })))
    if (preset.maxLossUsd !== undefined) {
      setMaxLossMode('bounded')
      setMaxLossUsd(String(preset.maxLossUsd))
    } else {
      setMaxLossMode('unset')
      setMaxLossUsd('')
    }
    setPresetNote(preset.note)
  }

  const setLeg = (i: number, patch: Partial<LegForm>) =>
    setLegs((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const { inputs, problems } = useMemo(
    () => parseInputs({ underlying, daysToExpiry, legs, ivRank, earningsInDays, exDividendInDays, maxLossMode, maxLossUsd, maxProfitUsd }),
    [underlying, daysToExpiry, legs, ivRank, earningsInDays, exDividendInDays, maxLossMode, maxLossUsd, maxProfitUsd],
  )

  const risk: CompositeRisk | null = useMemo(() => {
    if (!inputs) return null
    try {
      return scoreOptionsTrade(inputs)
    } catch {
      return null
    }
  }, [inputs])

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <Sigma className="h-6 w-6 text-accent-blue" aria-hidden />
        <PageHeader
          title="Trade Risk Scorer"
          subtitle="Describe an options position and see its risk broken into scored dimensions"
        />
      </div>

      {/* Stance + data honesty, up front */}
      <p className="text-xs text-text-muted leading-relaxed rounded-card border border-border bg-bg-card p-3">
        This scores the risk of a trade <em>you</em> describe — liquidity, IV environment, assignment,
        time decay, and whether the loss is bounded. It does not recommend trades, and nothing here is
        investment advice. There is no options chain feed yet, so copy strikes and quotes from your
        broker&rsquo;s chain; the underlying price is the one number this page can fetch live.
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ── Left: the trade ── */}
        <div className="space-y-4">
          {/* Underlying */}
          <div className="rounded-card border border-border bg-bg-card p-4 space-y-3">
            <h2 className="text-sm font-medium text-text-secondary">Underlying</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
              <label className="block">
                <span className={LABEL}>Symbol (optional)</span>
                <div className="mt-1 flex gap-1">
                  <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="AAPL" className={FIELD} />
                  <button
                    type="button"
                    onClick={prefillFromQuote}
                    disabled={!cleanSymbol || quoteLoading}
                    title="Fetch the current price"
                    className="px-2 rounded border border-border bg-bg-elevated text-text-muted hover:text-text-primary disabled:opacity-40 transition-colors"
                  >
                    <Search size={13} aria-hidden />
                  </button>
                </div>
              </label>
              <label className="block">
                <span className={LABEL}>Price</span>
                <input value={underlying} onChange={(e) => setUnderlying(e.target.value)} placeholder="0.00" className={clsx(FIELD, 'mt-1')} />
              </label>
              <label className="block">
                <span className={LABEL}>Days to expiry</span>
                <input value={daysToExpiry} onChange={(e) => setDaysToExpiry(e.target.value)} className={clsx(FIELD, 'mt-1')} />
              </label>
            </div>
            {quote && (
              <p className="text-[11px] text-text-muted">
                Fetched {cleanSymbol}: <span className="font-mono">{quote.price}</span>{' '}
                {quoteIsLive
                  ? <span className="text-emerald-400">live via {quoteData?.source}</span>
                  : <span className="text-amber-400">reference price — live source unreachable</span>}
              </p>
            )}
          </div>

          {/* Presets */}
          <div className="rounded-card border border-border bg-bg-card p-4 space-y-2">
            <h2 className="text-sm font-medium text-text-secondary">Start from a structure</h2>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  title={p.description}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-border text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed">
              Presets prefill sides, types and strikes from the underlying price — never prices or open
              interest, which must come from a real chain.
              {presetNote && <span className="block mt-1 text-amber-400/90">{presetNote}</span>}
            </p>
          </div>

          {/* Legs */}
          <div className="rounded-card border border-border bg-bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-text-secondary">Legs</h2>
              <button
                type="button"
                onClick={() => setLegs((prev) => [...prev, emptyLeg()])}
                disabled={legs.length >= 4}
                className="flex items-center gap-1 px-2 py-1 rounded border border-border bg-bg-elevated text-xs text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors"
              >
                <Plus size={12} aria-hidden /> Add leg
              </button>
            </div>
            {legs.map((leg, i) => (
              <div key={i} className="rounded border border-border/60 bg-bg-elevated/40 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono text-text-muted">#{i + 1}</span>
                  <Toggle value={leg.side} options={[{ v: 'long', label: 'Long' }, { v: 'short', label: 'Short' }]} onChange={(v) => setLeg(i, { side: v })} />
                  <Toggle value={leg.type} options={[{ v: 'call', label: 'Call' }, { v: 'put', label: 'Put' }]} onChange={(v) => setLeg(i, { type: v })} />
                  {legs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLegs((prev) => prev.filter((_, j) => j !== i))}
                      title="Remove leg"
                      className="ml-auto p-1 rounded text-text-muted hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {([
                    ['strike', 'Strike'], ['bid', 'Bid'], ['ask', 'Ask'],
                    ['openInterest', 'OI'], ['volume', 'Volume'], ['delta', 'Delta'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className={LABEL}>{label}</span>
                      <input
                        value={leg[key]}
                        onChange={(e) => setLeg(i, { [key]: e.target.value })}
                        placeholder={key === 'delta' ? '±0.30' : ''}
                        className={clsx(FIELD, 'mt-1 px-1.5 text-xs')}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Context */}
          <div className="rounded-card border border-border bg-bg-card p-4 space-y-3">
            <h2 className="text-sm font-medium text-text-secondary">Context <span className="text-text-muted font-normal">— all optional; blanks lower confidence, not the score</span></h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className={LABEL}>IV rank (0–100)</span>
                <input value={ivRank} onChange={(e) => setIvRank(e.target.value)} placeholder="from your broker" className={clsx(FIELD, 'mt-1')} />
              </label>
              <label className="block">
                <span className={LABEL}>Earnings in (days)</span>
                <input value={earningsInDays} onChange={(e) => setEarningsInDays(e.target.value)} className={clsx(FIELD, 'mt-1')} />
              </label>
              <label className="block">
                <span className={LABEL}>Ex-dividend in (days)</span>
                <input value={exDividendInDays} onChange={(e) => setExDividendInDays(e.target.value)} className={clsx(FIELD, 'mt-1')} />
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <span className={LABEL}>Max loss</span>
                <div className="mt-1">
                  <Toggle
                    value={maxLossMode}
                    options={[{ v: 'unset', label: 'Not set' }, { v: 'bounded', label: 'Bounded' }, { v: 'unbounded', label: 'Unbounded' }]}
                    onChange={setMaxLossMode}
                  />
                </div>
              </div>
              {maxLossMode === 'bounded' && (
                <label className="block">
                  <span className={LABEL}>Max loss USD</span>
                  <input value={maxLossUsd} onChange={(e) => setMaxLossUsd(e.target.value)} className={clsx(FIELD, 'mt-1 w-32')} />
                </label>
              )}
              <label className="block">
                <span className={LABEL}>Max profit USD</span>
                <input value={maxProfitUsd} onChange={(e) => setMaxProfitUsd(e.target.value)} className={clsx(FIELD, 'mt-1 w-32')} />
              </label>
            </div>
            <p className="text-[11px] text-text-muted">
              &ldquo;Unbounded&rdquo; is a real choice — naked short exposure is exactly what the
              defined-risk dimension exists to flag. Don&rsquo;t leave it unset to make a trade score
              better.
            </p>
          </div>
        </div>

        {/* ── Right: the verdict ── */}
        <div className="space-y-4">
          {risk ? (
            <TradeRiskReport risk={risk} />
          ) : (
            <div className="rounded-card border border-border bg-bg-card p-4">
              <h2 className="text-sm font-medium text-text-secondary">Score</h2>
              <p className="mt-2 text-xs text-text-muted">
                {problems.length > 0
                  ? <>Still needed: {problems.join('; ')}.</>
                  : 'Fill in the trade to see its risk breakdown.'}
              </p>
            </div>
          )}
          <p className="text-[11px] text-text-muted leading-relaxed">
            Scored by the app&rsquo;s options-trade risk profile (liquidity 30% · IV environment 20% ·
            defined risk 20% · assignment 15% · time decay 15%) on the canonical safety scale used
            across Finance Now. Methodology: docs/architecture/risk-framework.md.
          </p>
        </div>
      </div>
    </div>
  )
}
