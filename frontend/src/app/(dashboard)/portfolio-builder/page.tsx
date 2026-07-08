'use client'

import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { AlertTriangle, BellRing, CheckCircle2, Compass, Info, Save, Trash2 } from 'lucide-react'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import { MetricCard } from '@/components/ui/MetricCard'
import { PieChart } from '@/components/charts/PieChart'
import { SECTOR_INFO, type SectorId } from '@/lib/data/equityCatalog'
import {
  ASSET_CLASS_INFO, BUILDER_STORAGE_KEY, buildPortfolio, reviewDue,
  type BuilderInputs, type BuiltPortfolio, type CryptoComfort, type SavedPlan,
} from '@/lib/data/portfolioBuilder'
import { formatCurrency } from '@/lib/utils/format'

// Portfolio Builder — premium module (own entitlement = separately sellable).
// v1: questionnaire → diversified target allocation with rationale, saved
// plans, and review reminders. Drift-vs-actual rebalancing hooks into real
// holdings once DB-backed portfolios land (see docs/ROADMAP.md).

function loadPlans(): SavedPlan[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(BUILDER_STORAGE_KEY) ?? '[]') } catch { return [] }
}
function savePlans(plans: SavedPlan[]) {
  try { localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(plans)) } catch { /* quota */ }
}

const RISK_LABELS = ['', 'Capital preservation', 'Very conservative', 'Conservative', 'Cautious', 'Balanced', 'Balanced growth', 'Growth', 'Aggressive growth', 'Very aggressive', 'Maximum growth']

function BuilderContent() {
  const [risk, setRisk] = useState(5)
  const [yearsToRetirement, setYearsToRetirement] = useState(25)
  const [yearsToFirstUse, setYearsToFirstUse] = useState(25)
  const [sectors, setSectors] = useState<SectorId[]>([])
  const [cryptoComfort, setCryptoComfort] = useState<CryptoComfort>('small')
  const [amount, setAmount] = useState(25_000)
  const [result, setResult] = useState<BuiltPortfolio | null>(null)
  const [plans, setPlans] = useState<SavedPlan[]>([])
  const [planName, setPlanName] = useState('')

  useEffect(() => { setPlans(loadPlans()) }, [])
  const dueReviews = useMemo(() => plans.filter(reviewDue), [plans])

  const toggleSector = (s: SectorId) =>
    setSectors((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])

  const build = () => setResult(buildPortfolio({
    riskTolerance: risk, yearsToRetirement, yearsToFirstUse, sectorFocus: sectors, cryptoComfort, amount,
  }))

  const savePlan = () => {
    if (!result) return
    const now = new Date().toISOString()
    const plan: SavedPlan = {
      id: Math.random().toString(36).slice(2, 10),
      name: planName.trim() || `Plan ${plans.length + 1}`,
      createdAt: now, lastReviewedAt: now, plan: result,
    }
    const next = [...plans, plan]
    setPlans(next); savePlans(next); setPlanName('')
  }

  const markReviewed = (id: string) => {
    const next = plans.map((p) => p.id === id ? { ...p, lastReviewedAt: new Date().toISOString() } : p)
    setPlans(next); savePlans(next)
  }
  const deletePlan = (id: string) => {
    const next = plans.filter((p) => p.id !== id)
    setPlans(next); savePlans(next)
  }

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
          <Compass size={18} className="text-accent-blue" aria-hidden />
        </div>
        <PageHeader
          title="Portfolio Builder"
          subtitle="Diversified target portfolios aligned to your risk, sectors, and spend dates"
          description="Answers to five questions produce a diversified allocation mapped to low-cost catalog instruments, each with a written rationale. The allocation anchors to when the money is actually used — not just the retirement date — and every plan carries drift bands and a review cadence."
          details={[
            { label: 'Rebalancing', text: 'Plans use ±5% absolute drift bands and a 90-day review reminder. Drift-vs-actual holdings connects when database-backed portfolios land.' },
            { label: 'Not advice', text: 'Educational tooling. Allocations are rules-based models, not personalized investment advice.' },
          ]}
        />
      </div>

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
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Sector focus <span className="normal-case">(optional, max 3 applied)</span></p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(SECTOR_INFO) as Array<[SectorId, { label: string; color: string }]>)
              .filter(([id]) => ['technology', 'financials', 'energy', 'healthcare', 'industrials', 'utilities', 'real-estate'].includes(id))
              .map(([id, info]) => (
                <button key={id} onClick={() => toggleSector(id)}
                  className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    sectors.includes(id) ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}>
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
                  {info.label}
                </button>
              ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-text-muted uppercase tracking-wider">Crypto comfort:</span>
          <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5">
            {([['none', 'None'], ['small', 'Small sleeve'], ['moderate', 'Moderate']] as Array<[CryptoComfort, string]>).map(([v, label]) => (
              <button key={v} onClick={() => setCryptoComfort(v)}
                className={clsx('px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  cryptoComfort === v ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={build}
            className="ml-auto px-4 py-2 rounded-lg bg-accent-blue text-sm font-medium text-white hover:bg-blue-500 transition-colors">
            Build portfolio
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard title="Diversification" value={`${result.diversificationScore}/100`} subtitle={`${result.classMix.length} asset classes`} accentColor="#10b981" />
            <MetricCard title="Equity / Defensive" value={`${Math.round(result.classMix.filter(c => ['us-equity','intl-equity','sector-tilt','crypto'].includes(c.assetClass)).reduce((s,c)=>s+c.pct,0))} / ${Math.round(result.classMix.filter(c => ['bonds','inflation','cash'].includes(c.assetClass)).reduce((s,c)=>s+c.pct,0))}`} subtitle="growth vs stability split" accentColor="#3b82f6" />
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
            <button onClick={savePlan}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-bg-elevated text-sm text-text-secondary hover:text-text-primary transition-colors">
              <Save size={14} aria-hidden /> Save plan
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
              return (
                <div key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
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
                  <button onClick={() => markReviewed(p.id)} className="text-xs text-accent-blue hover:underline">Mark reviewed</button>
                  <button onClick={() => deletePlan(p.id)} className="text-text-muted hover:text-red-400 transition-colors" aria-label={`Delete ${p.name}`}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-muted text-center leading-relaxed">
        Educational tooling, not investment advice. Allocations are rules-based models using approximate
        catalog data; consult a fiduciary adviser for personalized recommendations. Plans are stored in this
        browser until account sync lands.
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
