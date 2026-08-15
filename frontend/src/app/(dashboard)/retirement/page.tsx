'use client'

import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { AlertTriangle, Calculator, CreditCard, Landmark, PiggyBank, Target } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { ProvenanceNotice } from '@/components/ui/ProvenanceNotice'
import { DerivedNote } from '@/components/ui/DerivedNote'
import { formatCurrency } from '@/lib/utils/format'
import {
  projectRetirement,
  VEHICLES,
  type RetirementInputs,
  type VehicleId,
  type VehicleInput,
} from '@/lib/retirement/engine'
import { amortize, cardPayoff } from '@/lib/retirement/debt'
import { getLimitsProvenance, LIMITS_TAX_YEAR } from '@/lib/retirement/limits'

// Retirement planner — ported from the owner's planning spreadsheet
// (Budget_Sheet.xlsx). All arithmetic lives in lib/retirement/ (pure, vitest-
// covered); this page is input collection and presentation only.
//
// Every figure here is a PROJECTION from the user's own assumptions. There is
// no external provider and nothing is fetched, so this page carries no
// SourceLine — but it does carry provenance on the IRS contribution limits,
// which are hand-maintained reference data like any other curated table.

export default function RetirementPage() {
  return (
    <ModuleGate module="retirement">
      <RetirementInner />
    </ModuleGate>
  )
}

const DEFAULT_VEHICLES: VehicleInput[] = [
  { id: 'pretax401k', deferralPct: 0, currentBalance: 0, annualReturnPct: 7 },
  { id: 'roth401k', deferralPct: 8, currentBalance: 0, annualReturnPct: 10 },
  { id: 'rothIra', deferralPct: 7, currentBalance: 3000, annualReturnPct: 10 },
  { id: 'traditionalIra', deferralPct: 0, currentBalance: 0, annualReturnPct: 7 },
  { id: 'brokerage', deferralPct: 0, currentBalance: 0, annualReturnPct: 7 },
  { id: 'crypto', deferralPct: 0, currentBalance: 0, annualReturnPct: 7 },
]

function Field({ label, value, onChange, step = 1, suffix, hint }: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  suffix?: string
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-bg-elevated border border-border rounded-lg px-2.5 py-1.5 text-sm font-mono tabular-nums text-text-primary focus:outline-none focus:border-accent-blue"
        />
        {suffix && <span className="text-xs text-text-muted w-4">{suffix}</span>}
      </div>
      {hint && <span className="text-[10px] text-text-muted">{hint}</span>}
    </label>
  )
}

function Kpi({ label, value, sub, tone = 'default' }: {
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'good' | 'warn'
}) {
  return (
    <div className="rounded-card border border-border bg-bg-card p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={clsx('mt-1 text-xl font-mono tabular-nums font-semibold',
        tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-text-primary')}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-text-muted">{sub}</p>}
    </div>
  )
}

function RetirementInner() {
  const [form, setForm] = useState<Omit<RetirementInputs, 'vehicles'>>({
    currentAge: 31,
    targetRetirementAge: 60,
    planToAge: 100,
    monthlyGrossIncome: 6000,
    currentEmergencySavings: 3000,
    emergencySavingsGoal: 20000,
    emergencyAllocationPct: 15,
    companyMatchPct: 5,
    monthlyExpenses: 2000,
    otherMonthlyIncome: 0,
  })
  const [vehicles, setVehicles] = useState<VehicleInput[]>(DEFAULT_VEHICLES)

  const set = <K extends keyof typeof form>(key: K) => (v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: v }))

  const setVehicle = (id: VehicleId, patch: Partial<VehicleInput>) =>
    setVehicles((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)))

  const projection = useMemo(() => projectRetirement({ ...form, vehicles }), [form, vehicles])
  const provenance = useMemo(() => getLimitsProvenance(), [])

  // ── Debt calculators ──
  const [loan, setLoan] = useState({ principal: 200_000, annualRatePct: 6.275, termYears: 30, monthsPaid: 12, downPayment: 0 })
  const [card, setCard] = useState({ balance: 2342, aprPct: 29.49, creditLimit: 4750, monthlyPayment: 300 })
  const schedule = useMemo(() => amortize(loan), [loan])
  const payoff = useMemo(() => cardPayoff(card), [card])

  const months = (n: number | null) =>
    n === null ? 'never at this rate' : n === 0 ? 'already there' : `${n} mo (${(n / 12).toFixed(1)} yr)`

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<PiggyBank size={20} />}
        title="Retirement Planner"
        description="Project what your contributions become by your target retirement age, and what that pays per month once you stop working. Every figure is derived from the assumptions you enter — nothing here is fetched, forecast, or advice."
      />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label={`Projected at age ${form.targetRetirementAge}`}
          value={formatCurrency(projection.totalProjectedBalance, 0)}
          sub={`${projection.yearsToRetirement} years of contributions`}
        />
        <Kpi
          label="Monthly income in retirement"
          value={formatCurrency(projection.monthlyRetirementIncome, 0)}
          sub={`drawn down over ${projection.yearsInRetirement} years, to age ${form.planToAge}`}
        />
        <Kpi
          label="Retirement savings rate"
          value={`${projection.savingsRatePct.toFixed(1)}%`}
          sub={`of gross, excluding the ${formatCurrency(projection.employerMonthlyContribution, 0)}/mo employer match`}
        />
        <Kpi
          label="Left after saving and bills"
          value={formatCurrency(projection.monthlyAfterSavingsAndExpenses, 0)}
          tone={projection.affordable ? 'good' : 'warn'}
          sub={projection.affordable ? 'the plan balances' : 'the plan does not balance as entered'}
        />
      </div>

      {projection.warnings.length > 0 && (
        <div className="rounded-card border border-amber-500/30 bg-amber-500/10 p-4 space-y-1.5">
          {projection.warnings.map((w) => (
            <p key={w} className="flex gap-2 text-xs text-amber-300">
              <AlertTriangle size={14} className="shrink-0 mt-px" aria-hidden />
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Inputs ── */}
        <div className="rounded-card border border-border bg-bg-card p-4 space-y-4">
          <h2 className="text-sm font-medium text-text-secondary flex items-center gap-2">
            <Target size={14} className="text-text-muted" aria-hidden /> Your situation
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current age" value={form.currentAge} onChange={set('currentAge')} />
            <Field label="Retire at" value={form.targetRetirementAge} onChange={set('targetRetirementAge')} />
            <Field label="Plan to age" value={form.planToAge} onChange={set('planToAge')} hint="drawdown horizon" />
            <Field label="Monthly gross" value={form.monthlyGrossIncome} onChange={set('monthlyGrossIncome')} step={100} />
            <Field label="Monthly expenses" value={form.monthlyExpenses} onChange={set('monthlyExpenses')} step={50} hint="essentials only" />
            <Field label="Employer match" value={form.companyMatchPct} onChange={set('companyMatchPct')} step={0.5} suffix="%" />
            <Field label="Other income at retirement" value={form.otherMonthlyIncome} onChange={set('otherMonthlyIncome')} step={100} hint="pension, annuity, rental, Social Security" />
          </div>

          <h3 className="text-xs font-medium text-text-secondary pt-2">Emergency fund</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Saved so far" value={form.currentEmergencySavings} onChange={set('currentEmergencySavings')} step={500} />
            <Field label="Goal" value={form.emergencySavingsGoal} onChange={set('emergencySavingsGoal')} step={1000} />
            <Field label="Of gross, monthly" value={form.emergencyAllocationPct} onChange={set('emergencyAllocationPct')} step={1} suffix="%" />
          </div>
          <div className="rounded border border-border bg-bg-elevated p-3 text-xs space-y-1">
            <p className="text-text-secondary">
              {formatCurrency(projection.emergency.monthlyContribution, 0)}/mo → goal in{' '}
              <span className="font-mono">{months(projection.emergency.monthsToGoal)}</span>
            </p>
            {projection.emergency.monthsOfExpensesCovered != null && (
              <p className="text-text-muted">
                Current balance covers {projection.emergency.monthsOfExpensesCovered.toFixed(1)} months of essentials.
              </p>
            )}
          </div>
        </div>

        {/* ── Vehicles ── */}
        <div className="lg:col-span-2 rounded-card border border-border bg-bg-card p-4 space-y-3">
          <h2 className="text-sm font-medium text-text-secondary flex items-center gap-2">
            <Landmark size={14} className="text-text-muted" aria-hidden /> Where the money goes
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
                  <th className="py-2 text-left font-medium">Account</th>
                  <th className="py-2 text-right font-medium">% of gross</th>
                  <th className="py-2 text-right font-medium">Balance now</th>
                  <th className="py-2 text-right font-medium">Return</th>
                  <th className="py-2 text-right font-medium">At retirement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {vehicles.map((v) => {
                  const meta = VEHICLES.find((m) => m.id === v.id)!
                  const proj = projection.vehicles.find((p) => p.id === v.id)!
                  return (
                    <tr key={v.id}>
                      <td className="py-2 pr-3 align-top">
                        <span className="text-text-primary" title={meta.note}>{meta.label}</span>
                        <p className="text-[10px] text-text-muted max-w-[22rem] leading-snug">{meta.note}</p>
                        {proj.capWarning && (
                          <p className="text-[10px] text-amber-300 mt-0.5">{proj.capWarning}</p>
                        )}
                      </td>
                      <td className="py-2 w-24">
                        <input type="number" step={1} value={v.deferralPct}
                          onChange={(e) => setVehicle(v.id, { deferralPct: Number(e.target.value) })}
                          className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-right text-xs font-mono tabular-nums text-text-primary focus:outline-none focus:border-accent-blue" />
                      </td>
                      <td className="py-2 w-32 pl-2">
                        <input type="number" step={500} value={v.currentBalance}
                          onChange={(e) => setVehicle(v.id, { currentBalance: Number(e.target.value) })}
                          className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-right text-xs font-mono tabular-nums text-text-primary focus:outline-none focus:border-accent-blue" />
                      </td>
                      <td className="py-2 w-20 pl-2">
                        <input type="number" step={0.5} value={v.annualReturnPct}
                          onChange={(e) => setVehicle(v.id, { annualReturnPct: Number(e.target.value) })}
                          className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-right text-xs font-mono tabular-nums text-text-primary focus:outline-none focus:border-accent-blue" />
                      </td>
                      <td className="py-2 pl-3 text-right font-mono tabular-nums text-text-secondary align-top">
                        {formatCurrency(proj.projectedBalance, 0)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-mono tabular-nums">
                  <td className="py-2 text-text-muted font-sans text-xs">Total</td>
                  <td className="py-2 text-right text-xs text-text-secondary">{projection.savingsRatePct.toFixed(1)}%</td>
                  <td colSpan={2} />
                  <td className="py-2 pl-3 text-right font-semibold text-text-primary">
                    {formatCurrency(projection.totalProjectedBalance, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-1">
            {(['pretax', 'roth', 'taxable'] as const).map((t) => (
              <div key={t} className="rounded border border-border bg-bg-elevated p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">
                  {t === 'pretax' ? 'Taxed on withdrawal' : t === 'roth' ? 'Tax-free withdrawal' : 'Taxable account'}
                </p>
                <p className="text-sm font-mono tabular-nums text-text-secondary mt-0.5">
                  {formatCurrency(projection.byTreatment[t], 0)}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-text-muted">
            The pre-tax and Roth balances are <strong>not</strong> worth the same amount: withdrawals from the
            pre-tax column are taxed as ordinary income, and this projection does not deduct that tax. Neither
            does it deduct capital-gains tax on the taxable column.
          </p>

          <ProvenanceNotice
            label={`IRS limits, tax year ${LIMITS_TAX_YEAR}`}
            staleLabel="IRS limits may be out of date — contributions could be capped wrongly"
            confidence={provenance.confidence}
            stale={provenance.stale}
          >
            Contribution caps are hand-maintained reference data, last checked {provenance.verifiedAt}
            {' '}({provenance.ageDays} days ago). The IRS re-indexes them every year; a stale limit would tell
            you that you are maxed out while you still have room.
          </ProvenanceNotice>
        </div>
      </div>

      <DerivedNote what="Retirement projections">
        Projections compound monthly at the return you enter for each account, and the drawdown divides the
        final balance evenly across the years to your plan-to age — it assumes <strong>no growth after
        retirement</strong>, which understates a portfolio that stays invested. Nothing here accounts for
        inflation, taxes, sequence-of-returns risk, or IRA income eligibility. These are the arithmetic
        consequences of your assumptions, not a forecast or a recommendation.
      </DerivedNote>

      {/* ── Debt ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-card border border-border bg-bg-card p-4 space-y-3">
          <h2 className="text-sm font-medium text-text-secondary flex items-center gap-2">
            <Calculator size={14} className="text-text-muted" aria-hidden /> Loan
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" value={loan.principal} onChange={(v) => setLoan({ ...loan, principal: v })} step={1000} />
            <Field label="Down payment" value={loan.downPayment} onChange={(v) => setLoan({ ...loan, downPayment: v })} step={1000} />
            <Field label="Rate" value={loan.annualRatePct} onChange={(v) => setLoan({ ...loan, annualRatePct: v })} step={0.125} suffix="%" />
            <Field label="Term (years)" value={loan.termYears} onChange={(v) => setLoan({ ...loan, termYears: v })} />
            <Field label="Payments made" value={loan.monthsPaid} onChange={(v) => setLoan({ ...loan, monthsPaid: v })} />
          </div>
          <dl className="grid grid-cols-2 gap-y-1.5 text-xs pt-1">
            {[
              ['Monthly payment', formatCurrency(schedule.monthlyPayment)],
              ['Total interest', formatCurrency(schedule.totalInterest, 0)],
              ['Paid so far (principal)', formatCurrency(schedule.principalPaid, 0)],
              ['Paid so far (interest)', formatCurrency(schedule.interestPaid, 0)],
              ['Principal remaining', formatCurrency(schedule.remainingPrincipal, 0)],
              ['Interest remaining', formatCurrency(schedule.remainingInterest, 0)],
              ['Next payment → interest', formatCurrency(schedule.nextInterest)],
              ['Next payment → principal', formatCurrency(schedule.nextPrincipal)],
              ['Payments left', String(schedule.remainingPayments)],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-text-muted">{k}</dt>
                <dd className="text-right font-mono tabular-nums text-text-secondary">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-card border border-border bg-bg-card p-4 space-y-3">
          <h2 className="text-sm font-medium text-text-secondary flex items-center gap-2">
            <CreditCard size={14} className="text-text-muted" aria-hidden /> Credit card payoff
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Balance" value={card.balance} onChange={(v) => setCard({ ...card, balance: v })} step={50} />
            <Field label="Credit limit" value={card.creditLimit} onChange={(v) => setCard({ ...card, creditLimit: v })} step={500} />
            <Field label="APR" value={card.aprPct} onChange={(v) => setCard({ ...card, aprPct: v })} step={0.25} suffix="%" />
            <Field label="Monthly payment" value={card.monthlyPayment} onChange={(v) => setCard({ ...card, monthlyPayment: v })} step={25} />
          </div>
          <dl className="grid grid-cols-2 gap-y-1.5 text-xs pt-1">
            <dt className="text-text-muted">Interest per cycle</dt>
            <dd className="text-right font-mono tabular-nums text-text-secondary">{formatCurrency(payoff.monthlyInterest)}</dd>
            <dt className="text-text-muted">Utilization</dt>
            <dd className="text-right font-mono tabular-nums text-text-secondary">
              {payoff.utilizationPct != null ? `${payoff.utilizationPct.toFixed(1)}%` : '—'}
            </dd>
            <dt className="text-text-muted">Time to clear</dt>
            <dd className={clsx('text-right font-mono tabular-nums', payoff.neverPaysOff ? 'text-red-400' : 'text-text-secondary')}>
              {months(payoff.monthsToPayOff)}
            </dd>
            <dt className="text-text-muted">Interest to clear</dt>
            <dd className="text-right font-mono tabular-nums text-text-secondary">
              {payoff.totalInterestToPayOff != null ? formatCurrency(payoff.totalInterestToPayOff) : '—'}
            </dd>
          </dl>
          {payoff.neverPaysOff && (
            <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
              This payment does not cover one cycle&apos;s interest, so the balance grows rather than falls —
              it never pays off. Raise the payment above {formatCurrency(payoff.monthlyInterest)} to make progress.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
