'use client'

import { useCallback, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Download, Loader2 } from 'lucide-react'
import { useEntitlementStore } from '@/store/useEntitlementStore'
import { averageMonthlySpend, monthTotals, type MonthSpend } from '@/lib/budget/aggregate'
import { formatCurrency } from '@/lib/utils/format'
import type { BudgetsResponse } from '@/app/api/user/budget/budgets/route'
import type { CategoriesResponse } from '@/app/api/user/budget/categories/route'

/**
 * "Use my Budget average" — the Budget → Retirement bridge (NT1 extension).
 *
 * The retirement planner asks for monthly essential expenses. The Budget module
 * already knows what the user actually spends, and in the owner's source
 * spreadsheet the two were wired together: `Hypotheticals` pulled its bill
 * totals from `Detailed Expense Breakdown` by cell reference. This restores
 * that link instead of asking for a number the user already owns.
 *
 * It fills the field and stops. It does NOT keep the planner in sync with the
 * budget: a projection is a set of assumptions the user chose, and having one
 * of them silently change because last month's groceries were high would make
 * the plan unreproducible.
 */

const MONTHS_TO_AVERAGE = 3

function recentMonths(now: Date, count: number): string[] {
  const out: string[] = []
  // Start from LAST month: the current one is partial, and averaging a
  // half-finished month in understates the figure every single time.
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export function UseBudgetSpend({ onApply, now = new Date() }: {
  onApply: (monthlyExpenses: number) => void
  /** Injectable for tests, per the house rule on clock-dependent behaviour. */
  now?: Date
}) {
  const budgetEnabled = useEntitlementStore((s) => s.isEnabled('budget'))
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (loading) return
    setLoading(true)
    setNote(null)
    try {
      const catRes = await fetch('/api/user/budget/categories')
      const cats = (await catRes.json()) as CategoriesResponse
      if (!catRes.ok || !cats.ok) throw new Error(cats.error ?? 'Could not read categories')
      const kindOf = (id: string) => cats.categories?.find((c) => c.id === id)?.kind

      const months = recentMonths(now, MONTHS_TO_AVERAGE)
      const results = await Promise.all(months.map(async (month): Promise<MonthSpend> => {
        const res = await fetch(`/api/user/budget/budgets?month=${month}`)
        const data = (await res.json()) as BudgetsResponse
        if (!res.ok || !data.ok) return { month, spend: 0, uncategorized: 0 }
        const totals = monthTotals(data.actuals ?? [], kindOf)
        return { month, spend: totals.spend, uncategorized: totals.uncategorized }
      }))

      const avg = averageMonthlySpend(results)
      if (avg.monthsUsed === 0) {
        setNote('No spending recorded in the last three complete months — nothing to average.')
        return
      }
      onApply(avg.averageMonthly)
      setNote(
        `${formatCurrency(avg.averageMonthly, 0)}/mo averaged over ${avg.monthsUsed} complete month${avg.monthsUsed === 1 ? '' : 's'}` +
        (avg.uncategorizedShare > 0.15
          ? ` — but ${Math.round(avg.uncategorizedShare * 100)}% of it is uncategorized, so it is a spending total, not yet an essentials total.`
          : '. This is total spending; trim it to essentials if your plan means essentials only.'),
      )
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [loading, now, onApply])

  // Nothing to offer when the module is off — and no nagging to enable it.
  if (!budgetEnabled) return null

  return (
    <div className="space-y-1">
      <button
        onClick={() => void run()}
        disabled={loading}
        className="flex items-center gap-1.5 rounded border border-border bg-bg-elevated px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Download size={12} aria-hidden />}
        Use my Budget average
      </button>
      {note && <p className="text-[11px] leading-relaxed text-text-muted">{note}</p>}
    </div>
  )
}
