'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { CalendarDays, ChevronLeft, ChevronRight, PiggyBank, Plus, Repeat } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { formatCurrency } from '@/lib/utils/format'
import type { BudgetsResponse } from '@/app/api/user/budget/budgets/route'
import type { CategoriesResponse, WireCategory } from '@/app/api/user/budget/categories/route'
import type { RecurringResponse } from '@/app/api/user/budget/recurring/route'

// Budget overview — monthly budgets vs actuals (docs/ROADMAP.md Phase 2).
// All data is the user's own (Postgres via /api/user/budget/*); there is no
// external provider, so this page carries no SourceLine.

export default function BudgetPage() {
  return (
    <ModuleGate module="budget">
      <BudgetInner />
    </ModuleGate>
  )
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map((n) => parseInt(n, 10))
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map((n) => parseInt(n, 10))
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function BudgetInner() {
  const qc = useQueryClient()
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const { data: catData } = useQuery<CategoriesResponse>({
    queryKey: ['budget-categories'],
    queryFn: () => fetch('/api/user/budget/categories').then((r) => r.json()),
  })
  const { data: budData, isLoading } = useQuery<BudgetsResponse>({
    queryKey: ['budget-budgets', month],
    queryFn: () => fetch(`/api/user/budget/budgets?month=${month}`).then((r) => r.json()),
  })
  const { data: recData } = useQuery<RecurringResponse>({
    queryKey: ['budget-recurring'],
    queryFn: () => fetch('/api/user/budget/recurring').then((r) => r.json()),
  })

  const categories = useMemo(() => catData?.categories ?? [], [catData])
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const budgetByCat = useMemo(() => new Map((budData?.budgets ?? []).map((b) => [b.categoryId, b.amount])), [budData])
  const actualByCat = useMemo(() => new Map((budData?.actuals ?? []).map((a) => [a.categoryId, a])), [budData])

  const dbDown = budData && !budData.ok

  // Income counts positive amounts in income categories; spend is the negated
  // sum over expense categories (kind rules live on the category, per schema).
  const totals = useMemo(() => {
    let income = 0, spend = 0, uncategorized = 0
    for (const a of budData?.actuals ?? []) {
      const kind = a.categoryId ? byId.get(a.categoryId)?.kind : undefined
      if (a.categoryId == null) uncategorized += a.total
      else if (kind === 'income') income += a.total
      else if (kind === 'expense') spend += a.total
      // transfers are deliberately excluded from both sides
    }
    return { income, spend: -spend, uncategorized }
  }, [budData, byId])

  const saveBudget = useMutation({
    mutationFn: async ({ categoryId, amount }: { categoryId: string; amount: number | null }) => {
      const res = await fetch('/api/user/budget/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, entries: [{ categoryId, amount }] }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Save failed')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget-budgets', month] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const confirmSuggestion = useMutation({
    mutationFn: async (s: { description: string; amount: number; cadence: string; nextDueAt: string }) => {
      const res = await fetch('/api/user/budget/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Confirm failed')
    },
    onSuccess: () => { toast.success('Recurring charge confirmed'); qc.invalidateQueries({ queryKey: ['budget-recurring'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Confirm failed'),
  })

  const commitDraft = (categoryId: string) => {
    const raw = drafts[categoryId]
    if (raw === undefined) return
    setDrafts((d) => { const { [categoryId]: _, ...rest } = d; return rest })
    const trimmed = raw.trim()
    if (trimmed === '') {
      if (budgetByCat.has(categoryId)) saveBudget.mutate({ categoryId, amount: null })
      return
    }
    const n = parseFloat(trimmed)
    if (!isFinite(n) || n < 0) { toast.error('Budget must be a non-negative number'); return }
    if (n === budgetByCat.get(categoryId)) return
    saveBudget.mutate({ categoryId, amount: n })
  }

  const expenseCats = categories.filter((c) => c.kind === 'expense')

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <PiggyBank className="h-6 w-6 text-accent-blue" aria-hidden />
        <PageHeader
          title="Budget"
          subtitle="Monthly targets vs what actually happened"
          description="Set a monthly amount per category and compare it against your recorded transactions. A category with no target set is shown as unbudgeted — that is different from a target of zero. All figures come from your own accounts and transactions."
          details={[
            { label: 'Data', text: 'Everything on this page is your own data, stored in your account database — no external market feed is involved.' },
            { label: 'Recurring', text: 'Detected recurring charges are suggestions inferred from transaction history; they are only treated as fact once you confirm them.' },
          ]}
        />
      </div>

      {dbDown && (
        <div className="rounded-card border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-400">
          {budData?.error ?? 'Database unavailable'}
        </div>
      )}

      {/* Month picker + KPIs */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-card px-2 py-1.5">
          <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="p-1 text-text-muted hover:text-text-primary" aria-label="Previous month"><ChevronLeft size={16} /></button>
          <span className="flex items-center gap-1.5 px-2 text-sm font-medium text-text-primary"><CalendarDays size={14} className="text-text-muted" aria-hidden />{monthLabel(month)}</span>
          <button onClick={() => setMonth((m) => shiftMonth(m, 1))} className="p-1 text-text-muted hover:text-text-primary" aria-label="Next month"><ChevronRight size={16} /></button>
        </div>
        <div className="flex gap-6 text-sm">
          <span className="text-text-secondary">Income <span className="font-mono text-emerald-400">{formatCurrency(totals.income)}</span></span>
          <span className="text-text-secondary">Spending <span className="font-mono text-red-400">{formatCurrency(totals.spend)}</span></span>
          <span className="text-text-secondary">Net <span className={clsx('font-mono', totals.income - totals.spend >= 0 ? 'text-emerald-400' : 'text-red-400')}>{formatCurrency(totals.income - totals.spend)}</span></span>
        </div>
      </div>

      {totals.uncategorized !== 0 && (
        <div className="rounded-card border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-400">
          {formatCurrency(Math.abs(totals.uncategorized))} this month is uncategorized — it appears in the totals above but in no category row below.{' '}
          <Link href="/budget/transactions" className="underline hover:text-amber-300">Categorize transactions →</Link>
        </div>
      )}

      {/* Budgets vs actuals */}
      <div className="rounded-card border border-border bg-bg-card overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_2fr_1fr] gap-2 px-4 py-2.5 border-b border-border text-[11px] font-medium uppercase tracking-wider text-text-muted">
          <span>Category</span><span className="text-right">Budget</span><span className="text-right">Spent</span><span>Progress</span><span className="text-right">Left</span>
        </div>
        {isLoading && <p className="px-4 py-8 text-center text-sm text-text-muted">Loading…</p>}
        {!isLoading && expenseCats.map((cat) => (
          <BudgetRow
            key={cat.id}
            cat={cat}
            budget={budgetByCat.get(cat.id)}
            spent={-(actualByCat.get(cat.id)?.total ?? 0)}
            draft={drafts[cat.id]}
            setDraft={(v) => setDrafts((d) => ({ ...d, [cat.id]: v }))}
            commit={() => commitDraft(cat.id)}
          />
        ))}
      </div>

      {/* Recurring */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-card border border-border bg-bg-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary"><Repeat size={14} className="text-accent-blue" aria-hidden />Confirmed recurring</h3>
          <div className="mt-3 space-y-2">
            {(recData?.confirmed ?? []).filter((r) => r.active).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <span className="text-text-secondary truncate pr-2">{r.description}</span>
                <span className="shrink-0 font-mono text-text-primary">{formatCurrency(r.amount)} <span className="text-text-muted">/ {r.cadence}</span></span>
              </div>
            ))}
            {(recData?.confirmed ?? []).filter((r) => r.active).length === 0 && (
              <p className="text-xs text-text-muted">Nothing confirmed yet.</p>
            )}
          </div>
        </div>
        <div className="rounded-card border border-border bg-bg-card p-4">
          <h3 className="text-sm font-semibold text-text-primary">Suggested recurring <span className="ml-1 text-[10px] font-normal text-text-muted">inferred from history — confirm to keep</span></h3>
          <div className="mt-3 space-y-2">
            {(recData?.suggestions ?? []).slice(0, 8).map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-text-secondary truncate">{s.description}</span>
                <span className="shrink-0 font-mono text-text-primary">{formatCurrency(s.amount)} <span className="text-text-muted">/ {s.cadence} ×{s.occurrences}</span></span>
                <button
                  onClick={() => confirmSuggestion.mutate({ description: s.description, amount: s.amount, cadence: s.cadence, nextDueAt: s.nextDueAt })}
                  className="shrink-0 flex items-center gap-1 rounded border border-border bg-bg-elevated px-2 py-0.5 text-[10px] text-text-secondary hover:text-text-primary"
                >
                  <Plus size={10} aria-hidden />Confirm
                </button>
              </div>
            ))}
            {(recData?.suggestions ?? []).length === 0 && <p className="text-xs text-text-muted">No recurring pattern detected — needs at least 3 similar transactions at a steady interval.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

function BudgetRow({ cat, budget, spent, draft, setDraft, commit }: {
  cat: WireCategory
  budget: number | undefined
  spent: number
  draft: string | undefined
  setDraft: (v: string) => void
  commit: () => void
}) {
  const pct = budget != null && budget > 0 ? Math.min((spent / budget) * 100, 100) : 0
  const over = budget != null && spent > budget
  return (
    <div className="grid grid-cols-[2fr_1fr_1fr_2fr_1fr] gap-2 items-center px-4 py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-text-primary">{cat.name}</span>
      <div className="text-right">
        <input
          value={draft ?? (budget != null ? String(budget) : '')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="—"
          inputMode="decimal"
          className="w-24 rounded border border-border bg-bg-elevated px-2 py-1 text-right font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
          aria-label={`Monthly budget for ${cat.name}`}
        />
      </div>
      <span className={clsx('text-right font-mono text-xs', spent > 0 ? 'text-text-primary' : 'text-text-muted')}>{spent > 0 ? formatCurrency(spent) : '—'}</span>
      <div className="h-2 rounded-full bg-bg-elevated overflow-hidden">
        {budget != null && budget > 0 && (
          <div className={clsx('h-full rounded-full', over ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
        )}
      </div>
      <span className={clsx('text-right font-mono text-xs', budget == null ? 'text-text-muted' : over ? 'text-red-400' : 'text-emerald-400')}>
        {budget == null ? 'unbudgeted' : formatCurrency(budget - spent)}
      </span>
    </div>
  )
}
