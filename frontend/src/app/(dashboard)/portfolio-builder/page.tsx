'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { clsx } from 'clsx'
import { AlertTriangle, Ban, BellRing, CheckCircle2, ChevronDown, ChevronUp, Compass, Info, Save, Trash2 } from 'lucide-react'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import { MetricCard } from '@/components/ui/MetricCard'
import { PieChart } from '@/components/charts/PieChart'
import { PlanMonitor } from '@/components/portfolio-builder/PlanMonitor'
import { SECTOR_INFO, type SectorId } from '@/lib/data/equityCatalog'
import {
  ASSET_CLASS_INFO, BUILDER_STORAGE_KEY, buildPortfolio, reviewDue,
  CRYPTO_STYLES, COMMODITY_STYLES, CURRENCY_STYLES, BOND_STYLES,
  type BuiltPortfolio, type CryptoComfort, type SavedPlan,
  type BuilderAssetClass, type SleeveAppetite,
  type CryptoStyle, type CommodityStyle, type CurrencyStyle, type BondStyle,
} from '@/lib/data/portfolioBuilder'
import { formatCurrency } from '@/lib/utils/format'

type SectorStance = 'focus' | 'exclude'

/**
 * Growth side of the Growth/Defensive metric. Complement is treated as
 * defensive, so the two always sum to 100 — listing both sides independently
 * would silently under-count the moment a new asset class lands.
 */
const GROWTH_SIDE: BuilderAssetClass[] = ['us-equity', 'intl-equity', 'sector-tilt', 'crypto', 'commodity']

/**
 * Opt-in sleeve selector. Every optional asset class uses the same three-step
 * control so none of them reads as more "default" than the others — these are
 * choices, not a ladder the user is expected to climb.
 */
function SleeveRow({ label, appetite, onAppetite, styleValue, onStyle, styleOptions, note }: {
  label: string
  /** Omitted for bonds, which are always held — style only, no size choice. */
  appetite?: SleeveAppetite
  onAppetite?: (v: SleeveAppetite) => void
  styleValue: string
  onStyle: (v: string) => void
  styleOptions: Array<[string, string]>
  note: string
}) {
  const off = appetite === 'none'
  return (
    <div className="py-2 border-b border-border/40 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted uppercase tracking-wider w-24">{label}</span>
        {appetite !== undefined && onAppetite ? (
          <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5">
            {(['none', 'small', 'moderate'] as const).map((v) => (
              <button key={v} onClick={() => onAppetite(v)}
                className={clsx('px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors',
                  appetite === v ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}>
                {v}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-text-muted italic">always held</span>
        )}
        <select
          value={styleValue}
          onChange={(e) => onStyle(e.target.value)}
          disabled={off}
          aria-label={`${label} style`}
          className="rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none disabled:opacity-40"
        >
          {styleOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {/* The risk profile of the chosen style, stated where the choice is made
          rather than buried in the result. */}
      {!off && <p className="mt-1 ml-24 pl-2 text-[11px] text-text-muted leading-relaxed">{note}</p>}
    </div>
  )
}

const styleOptions = (t: Record<string, { label: string }>): Array<[string, string]> =>
  Object.entries(t).map(([v, { label }]) => [v, label])

/** Sectors with a catalog ETF to tilt into. */
const TILTABLE_SECTORS: SectorId[] = [
  'technology', 'financials', 'energy', 'healthcare', 'industrials', 'utilities', 'real-estate',
]

// Portfolio Builder — premium module (own entitlement = separately sellable).
// v1: questionnaire → diversified target allocation with rationale, saved
// plans, and review reminders. Drift-vs-actual rebalancing hooks into real
// holdings once DB-backed portfolios land (see docs/ROADMAP.md).

// ─── DB persistence ──────────────────────────────────────────────────────────
// Plans live in Postgres (/api/user/builder-plans, builder_plans table).
// localStorage remains only as an import source for plans saved before
// persistence landed — imported once, then the key is renamed so the import
// can never run twice or clobber server data.

async function fetchPlans(): Promise<SavedPlan[]> {
  const res = await fetch('/api/user/builder-plans')
  const json = await res.json()
  if (!res.ok || !json.ok) throw new Error(json.error ?? `Plans unavailable (${res.status})`)
  return json.plans as SavedPlan[]
}

function readLegacyPlans(): SavedPlan[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(BUILDER_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

const RISK_LABELS = ['', 'Capital preservation', 'Very conservative', 'Conservative', 'Cautious', 'Balanced', 'Balanced growth', 'Growth', 'Aggressive growth', 'Very aggressive', 'Maximum growth']

function BuilderContent() {
  const [risk, setRisk] = useState(5)
  const [yearsToRetirement, setYearsToRetirement] = useState(25)
  const [yearsToFirstUse, setYearsToFirstUse] = useState(25)
  const [sectorStance, setSectorStance] = useState<Partial<Record<SectorId, SectorStance>>>({})
  const [cryptoComfort, setCryptoComfort] = useState<CryptoComfort>('small')
  // Macro sleeves default off — they're deliberate additions, not opt-outs.
  const [commodityComfort, setCommodityComfort] = useState<SleeveAppetite>('none')
  const [currencyComfort, setCurrencyComfort] = useState<SleeveAppetite>('none')
  // Style defaults mirror the engine's, so an untouched form builds the same
  // plan the engine would produce from bare inputs.
  const [cryptoStyle, setCryptoStyle] = useState<CryptoStyle>('bitcoin')
  const [commodityStyle, setCommodityStyle] = useState<CommodityStyle>('balanced')
  const [currencyStyle, setCurrencyStyle] = useState<CurrencyStyle>('reserve')
  const [bondStyle, setBondStyle] = useState<BondStyle>('aggregate')
  const [amount, setAmount] = useState(25_000)
  const [result, setResult] = useState<BuiltPortfolio | null>(null)
  const [planName, setPlanName] = useState('')
  const [openPlanId, setOpenPlanId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const migrationRan = useRef(false)

  const plansQuery = useQuery({ queryKey: ['builder-plans'], queryFn: fetchPlans, staleTime: 30_000, retry: 1 })
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data])
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['builder-plans'] })

  const saveMutation = useMutation({
    mutationFn: async (payload: { name: string; plan: BuiltPortfolio }) => {
      const res = await fetch('/api/user/builder-plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Save failed')
    },
    onSuccess: () => { setPlanName(''); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  const reviewMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/user/builder-plans/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markReviewed: true }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Update failed')
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/user/builder-plans/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Delete failed')
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  })

  // One-time import of plans saved to this browser before DB persistence.
  // Runs only after the server has answered (never migrate into an erroring
  // API), preserves original timestamps so review reminders don't reset, and
  // renames the key afterwards so it cannot run twice.
  useEffect(() => {
    if (migrationRan.current || !plansQuery.isSuccess) return
    migrationRan.current = true
    const legacy = readLegacyPlans()
    if (legacy.length === 0) return
    ;(async () => {
      const res = await fetch('/api/user/builder-plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plans: legacy.map((p) => ({
            name: p.name, plan: p.plan, createdAt: p.createdAt, lastReviewedAt: p.lastReviewedAt,
          })),
        }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        localStorage.setItem(`${BUILDER_STORAGE_KEY}:imported`, localStorage.getItem(BUILDER_STORAGE_KEY) ?? '[]')
        localStorage.removeItem(BUILDER_STORAGE_KEY)
        toast.success(`Imported ${legacy.length} plan${legacy.length > 1 ? 's' : ''} saved in this browser`)
        invalidate()
      }
      // On failure: key stays put, the import simply retries next visit.
    })().catch(() => { /* server unreachable — retry next visit */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plansQuery.isSuccess])

  const dueReviews = useMemo(() => plans.filter((p) => reviewDue(p)), [plans])

  const sectorsWhere = (stance: SectorStance) =>
    (Object.entries(sectorStance) as Array<[SectorId, SectorStance]>)
      .filter(([, v]) => v === stance).map(([s]) => s)

  // One click tilts toward a sector, the next excludes it, the next clears.
  const cycleSector = (s: SectorId) => setSectorStance((prev) => ({
    ...prev,
    [s]: prev[s] === 'focus' ? 'exclude' : prev[s] === 'exclude' ? undefined : 'focus',
  }))

  const build = () => setResult(buildPortfolio({
    riskTolerance: risk, yearsToRetirement, yearsToFirstUse,
    sectorFocus: sectorsWhere('focus'), sectorExclude: sectorsWhere('exclude'),
    cryptoComfort, commodityComfort, currencyComfort,
    cryptoStyle, commodityStyle, currencyStyle, bondStyle,
    amount,
  }))

  const savePlan = () => {
    if (!result || saveMutation.isPending) return
    saveMutation.mutate({ name: planName.trim() || `Plan ${plans.length + 1}`, plan: result })
  }
  const markReviewed = (id: string) => reviewMutation.mutate(id)
  const deletePlan = (id: string) => deleteMutation.mutate(id)

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
          <Compass size={18} className="text-accent-blue" aria-hidden />
        </div>
        <PageHeader
          title="Portfolio Builder"
          subtitle="Diversified target portfolios aligned to your risk, sectors, and spend dates"
          description="A short questionnaire produces a diversified allocation mapped to low-cost catalog instruments, each with a written rationale. The allocation anchors to when the money is actually used — not just the retirement date — with bonds laddered to that spend date, and every plan carries drift bands and a review cadence."
          details={[
            { label: 'Rebalancing', text: 'Plans use ±5% absolute drift bands. Expand a saved plan to compare it against a real portfolio (live-priced) or weights you enter, and see the exact trades that close the gap.' },
            { label: 'Monitoring', text: 'Saved plans are checked for an ageing glide path, risk drift, fee creep, concentration, and holdings that fall outside the plan.' },
            { label: 'Not advice', text: 'Educational tooling. Allocations are rules-based models, not personalized investment advice.' },
          ]}
        />
      </div>

      {/* Persistence trouble — the builder still works, saving doesn't */}
      {plansQuery.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" aria-hidden />
          <div className="text-xs text-text-secondary leading-relaxed">
            <span className="font-medium text-red-300">Saved plans are unavailable</span>
            {' '}— {(plansQuery.error as Error)?.message ?? 'the plans API could not be reached'}.
            Building portfolios still works; saving and reviewing needs the database.
          </div>
        </div>
      )}

      {/* Review reminders */}
      {dueReviews.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <BellRing size={16} className="text-amber-400 flex-shrink-0 mt-0.5" aria-hidden />
          <div className="text-xs text-text-secondary leading-relaxed">
            <span className="font-medium text-amber-300">{dueReviews.length} plan{dueReviews.length > 1 ? 's' : ''} due for review</span>
            {' '}— confirm the allocation still fits your horizon and risk, then mark reviewed below.
          </div>
        </div>
      )}

      {/* Questionnaire */}
      <div className="rounded-card border border-border bg-bg-card p-5 space-y-5">
        <h2 className="text-sm font-medium text-text-secondary">1 · Tell the builder about the money</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-muted uppercase tracking-wider">Risk tolerance</span>
              <span className="font-medium text-accent-blue">{risk}/10 · {RISK_LABELS[risk]}</span>
            </div>
            <input type="range" min={1} max={10} value={risk} onChange={(e) => setRisk(Number(e.target.value))} className="w-full accent-blue-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-muted uppercase tracking-wider">Investment amount</span>
              <span className="font-mono text-text-primary">{formatCurrency(amount, 0)}</span>
            </div>
            <input type="range" min={1000} max={500000} step={1000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full accent-blue-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-muted uppercase tracking-wider">Years to retirement</span>
              <span className="font-mono text-text-primary">{yearsToRetirement}y</span>
            </div>
            <input type="range" min={0} max={45} value={yearsToRetirement} onChange={(e) => setYearsToRetirement(Number(e.target.value))} className="w-full accent-blue-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-muted uppercase tracking-wider">Years until this money is used</span>
              <span className="font-mono text-text-primary">{yearsToFirstUse}y</span>
            </div>
            <input type="range" min={0} max={45} value={yearsToFirstUse} onChange={(e) => setYearsToFirstUse(Number(e.target.value))} className="w-full accent-blue-500" />
          </label>
        </div>

        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
            Sectors <span className="normal-case">(optional — click once to tilt toward, twice to exclude; max 3 tilts applied)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(SECTOR_INFO) as Array<[SectorId, { label: string; color: string }]>)
              .filter(([id]) => TILTABLE_SECTORS.includes(id))
              .map(([id, info]) => {
                const stance = sectorStance[id]
                return (
                  <button key={id} onClick={() => cycleSector(id)}
                    aria-pressed={stance != null}
                    className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                      stance === 'focus' ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                        : stance === 'exclude' ? 'bg-red-500/10 text-red-400 border-red-500/30 line-through'
                        : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}>
                    {stance === 'exclude'
                      ? <Ban size={11} aria-hidden />
                      : <span className="size-1.5 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />}
                    {info.label}
                  </button>
                )
              })}
          </div>
          {sectorsWhere('exclude').length > 0 && (
            <p className="mt-2 text-[11px] text-amber-400/90 leading-relaxed">
              Excluding a sector removes its tilt, but the broad core funds still hold those companies at index weight —
              a true screen needs a screened fund, which this catalog doesn’t carry.
            </p>
          )}
        </div>

        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-1">
            Sleeves <span className="normal-case">(how much, and what kind — risk varies as much inside an asset class as between them)</span>
          </p>
          <SleeveRow
            label="Crypto" appetite={cryptoComfort} onAppetite={(v) => setCryptoComfort(v as CryptoComfort)}
            styleValue={cryptoStyle} onStyle={(v) => setCryptoStyle(v as CryptoStyle)}
            styleOptions={styleOptions(CRYPTO_STYLES)} note={CRYPTO_STYLES[cryptoStyle].note}
          />
          <SleeveRow
            label="Commodities" appetite={commodityComfort} onAppetite={setCommodityComfort}
            styleValue={commodityStyle} onStyle={(v) => setCommodityStyle(v as CommodityStyle)}
            styleOptions={styleOptions(COMMODITY_STYLES)} note={COMMODITY_STYLES[commodityStyle].note}
          />
          <SleeveRow
            label="Currency" appetite={currencyComfort} onAppetite={setCurrencyComfort}
            styleValue={currencyStyle} onStyle={(v) => setCurrencyStyle(v as CurrencyStyle)}
            styleOptions={styleOptions(CURRENCY_STYLES)} note={CURRENCY_STYLES[currencyStyle].note}
          />
          <SleeveRow
            label="Bonds"
            styleValue={bondStyle} onStyle={(v) => setBondStyle(v as BondStyle)}
            styleOptions={styleOptions(BOND_STYLES)} note={BOND_STYLES[bondStyle].note}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={build}
            className="ml-auto px-4 py-2 rounded-lg bg-accent-blue text-sm font-medium text-white hover:bg-blue-500 transition-colors">
            Build portfolio
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
            <MetricCard title="Diversification" value={`${result.diversificationScore}/100`} subtitle={`${result.classMix.length} asset classes`} accentColor="#10b981" />
            <MetricCard title="Growth / Defensive" value={`${Math.round(result.classMix.filter(c => GROWTH_SIDE.includes(c.assetClass)).reduce((s,c)=>s+c.pct,0))} / ${Math.round(result.classMix.filter(c => !GROWTH_SIDE.includes(c.assetClass)).reduce((s,c)=>s+c.pct,0))}`} subtitle="growth vs stability split" accentColor="#3b82f6" />
            <MetricCard title="Blended Cost" value={`${result.fees.blendedExpenseRatioPct.toFixed(2)}%`} subtitle={`${formatCurrency(result.fees.annualFeeUsd, 0)} a year`} accentColor="#06b6d4" />
            <MetricCard title="Rebalance Band" value={`±${result.driftBandPct}%`} subtitle="absolute drift per holding" accentColor="#f59e0b" />
            <MetricCard title="Review Cadence" value={`${result.reviewIntervalDays} days`} subtitle="suitability check reminder" accentColor="#8b5cf6" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="rounded-card border border-border bg-bg-card p-4">
              <h2 className="text-sm font-medium text-text-secondary mb-2">2 · Asset-class mix</h2>
              <PieChart
                data={result.classMix.map((c) => ({ name: ASSET_CLASS_INFO[c.assetClass].label, value: c.pct, color: ASSET_CLASS_INFO[c.assetClass].color }))}
                height={220}
              />
              <ul className="mt-2 space-y-1">
                {result.classMix.map((c) => (
                  <li key={c.assetClass} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-text-muted">
                      <span className="size-2 rounded-full" style={{ backgroundColor: ASSET_CLASS_INFO[c.assetClass].color }} aria-hidden />
                      {ASSET_CLASS_INFO[c.assetClass].label}
                    </span>
                    <span className="font-mono tabular-nums text-text-secondary">{c.pct.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="xl:col-span-2 rounded-card border border-border bg-bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-medium text-text-secondary">3 · Holdings &amp; rationale</h2>
              </div>
              <div className="divide-y divide-border/60">
                {result.holdings.map((h) => (
                  <div key={h.symbol} className="px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-semibold text-text-primary w-14">{h.symbol}</span>
                      <span className="text-xs text-text-muted flex-1 truncate">{h.name}</span>
                      <span className="font-mono tabular-nums text-accent-blue">{h.weightPct.toFixed(1)}%</span>
                      <span className="font-mono tabular-nums text-text-secondary text-xs w-20 text-right">{formatCurrency(h.amountUsd, 0)}</span>
                    </div>
                    <p className="mt-1 text-xs text-text-muted leading-snug">{h.rationale}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-border text-[11px] text-text-muted leading-relaxed">
                Weighted expense ratio {result.fees.blendedExpenseRatioPct.toFixed(3)}% —
                about {formatCurrency(result.fees.annualFeeUsd, 0)} a year, and roughly{' '}
                {formatCurrency(result.fees.horizonFeeDragUsd, 0)} of compounded cost over {result.horizonYears} years
                versus a 0.03% benchmark, assuming 7% annual returns.
                {result.fees.coveragePct < 99 && ` Costs are known for ${result.fees.coveragePct}% of the portfolio.`}
              </div>
            </div>
          </div>

          {/* Suitability notes */}
          {result.notes.length > 0 && (
            <div className="rounded-card border border-border bg-bg-card p-4 space-y-2">
              <h2 className="text-sm font-medium text-text-secondary">Suitability notes</h2>
              {result.notes.map((n, i) => (
                <p key={i} className="flex items-start gap-2 text-xs text-text-secondary leading-relaxed">
                  {n.level === 'warn'
                    ? <AlertTriangle size={13} className="text-amber-400 flex-shrink-0 mt-0.5" aria-hidden />
                    : <Info size={13} className="text-accent-blue flex-shrink-0 mt-0.5" aria-hidden />}
                  {n.message}
                </p>
              ))}
            </div>
          )}

          {/* Save */}
          <div className="flex items-center gap-2">
            <input
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="Name this plan (e.g. Retirement 2050)…"
              className="w-72 rounded border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue/50 focus:outline-none"
            />
            <button onClick={savePlan} disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-bg-elevated text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50">
              <Save size={14} aria-hidden /> {saveMutation.isPending ? 'Saving…' : 'Save plan'}
            </button>
          </div>
        </>
      )}

      {/* Saved plans */}
      {plans.length > 0 && (
        <div className="rounded-card border border-border bg-bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-medium text-text-secondary">Saved plans</h2>
          </div>
          <div className="divide-y divide-border/60">
            {plans.map((p) => {
              const due = reviewDue(p)
              const open = openPlanId === p.id
              return (
                <div key={p.id}>
                  <div className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-text-primary">{p.name}</span>
                      <span className="ml-2 text-xs text-text-muted">
                        {p.plan.holdings.length} holdings · risk {p.plan.inputs.riskTolerance}/10 · first use in {p.plan.inputs.yearsToFirstUse}y
                      </span>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Last reviewed {new Date(p.lastReviewedAt).toLocaleDateString()}
                      </p>
                    </div>
                    {due ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <BellRing size={11} aria-hidden /> Review due
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 size={11} aria-hidden /> Current
                      </span>
                    )}
                    <button
                      onClick={() => setOpenPlanId(open ? null : p.id)}
                      aria-expanded={open}
                      className="flex items-center gap-1 text-xs text-accent-blue hover:underline"
                    >
                      {open ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
                      Check drift
                    </button>
                    <button onClick={() => markReviewed(p.id)} className="text-xs text-accent-blue hover:underline">Mark reviewed</button>
                    <button onClick={() => deletePlan(p.id)} className="text-text-muted hover:text-red-400 transition-colors" aria-label={`Delete ${p.name}`}>
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                  {open && <PlanMonitor saved={p} />}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-muted text-center leading-relaxed">
        Educational tooling, not investment advice. Allocations are rules-based models using approximate
        catalog data; consult a fiduciary adviser for personalized recommendations. Saved plans persist to
        the local database and survive browser wipes.
      </p>
    </div>
  )
}

export default function PortfolioBuilderPage() {
  return (
    <ModuleGate module="builder">
      <BuilderContent />
    </ModuleGate>
  )
}
