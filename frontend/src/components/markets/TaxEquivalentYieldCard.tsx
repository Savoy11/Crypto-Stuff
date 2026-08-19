'use client'

import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Landmark } from 'lucide-react'
import { taxEquivalentYield, afterTaxYield, type TaxProfile } from '@/lib/utils/taxEquivalentYield'

/**
 * Tax-equivalent yield for a municipal bond fund (items 11/13).
 *
 * Renders only for funds whose income is federally tax-exempt. A muni's headline
 * yield is not comparable to a taxable fund's — MUB at 3.3% beside LQD at 5.2%
 * looks worse and, for a high-bracket investor, is not. This is the arithmetic
 * that makes the comparison honest, and it needs the reader's marginal rate,
 * which is why it is an input rather than an assumption.
 */

// Federal ordinary-income brackets. Deliberately a picker of the real bracket
// rates rather than a free number field: the figure people can state about
// themselves is "I'm in the 24% bracket", and inviting a made-up rate produces
// a made-up answer.
const FEDERAL_BRACKETS = [0, 10, 12, 22, 24, 32, 35, 37]

export function TaxEquivalentYieldCard({ symbol, yieldPct }: { symbol: string; yieldPct: number }) {
  const [federalPct, setFederalPct] = useState(24)
  const [statePct, setStatePct] = useState(0)
  const [stateExempt, setStateExempt] = useState(false)
  const [itemizes, setItemizes] = useState(false)

  const profile: TaxProfile = useMemo(
    () => ({ federalPct, statePct, stateExempt, deductStateFromFederal: itemizes }),
    [federalPct, statePct, stateExempt, itemizes],
  )
  const tey = useMemo(() => taxEquivalentYield(yieldPct, profile), [yieldPct, profile])

  // A concrete comparison beats an abstract one: 5.20% is roughly what
  // investment-grade corporates pay, so the reader sees which side wins for them.
  const CORPORATE_REFERENCE = 5.2
  const corporateAfterTax = afterTaxYield(CORPORATE_REFERENCE, profile)
  const muniWins = tey.taxEquivalentPct > CORPORATE_REFERENCE

  return (
    <div className="rounded-card border border-border bg-bg-card p-4 space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
        <Landmark size={14} className="text-text-muted" aria-hidden /> Tax-Equivalent Yield
      </h2>

      <p className="text-xs leading-relaxed text-text-muted">
        {symbol} pays {yieldPct.toFixed(2)}% free of federal income tax. Comparing that
        directly with a taxable fund&rsquo;s yield is the wrong comparison — this is what a
        taxable bond would have to pay to leave you with the same money.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-text-muted">
          Federal bracket
          <select
            value={federalPct}
            onChange={(e) => setFederalPct(Number(e.target.value))}
            className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-accent-blue/50 focus:outline-none"
          >
            {FEDERAL_BRACKETS.map((b) => <option key={b} value={b}>{b}%</option>)}
          </select>
        </label>
        <label className="text-xs text-text-muted">
          State marginal rate
          <input
            type="number" min={0} max={15} step={0.1} value={statePct}
            onChange={(e) => setStatePct(Number(e.target.value))}
            className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm font-mono text-text-primary focus:border-accent-blue/50 focus:outline-none"
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <label className="flex items-start gap-2 text-[11px] leading-relaxed text-text-muted">
          <input type="checkbox" checked={stateExempt} onChange={(e) => setStateExempt(e.target.checked)} className="mt-0.5 rounded border-border" />
          <span>
            My state also exempts this income.
            <span className="text-text-muted/70"> Usually true only for in-state issuers — a national
            fund like this one still owes state tax on its out-of-state holdings, so leaving this off
            is the safer default.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-[11px] leading-relaxed text-text-muted">
          <input type="checkbox" checked={itemizes} onChange={(e) => setItemizes(e.target.checked)} className="mt-0.5 rounded border-border" />
          <span>
            I itemize deductions.
            <span className="text-text-muted/70"> State tax then reduces federal taxable income, so the
            two rates do not simply add.</span>
          </span>
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-border bg-bg-elevated p-3">
          <div className="text-lg font-bold font-mono text-emerald-400">{tey.taxEquivalentPct.toFixed(2)}%</div>
          <div className="text-[11px] text-text-muted">
            Tax-equivalent yield · {(tey.effectiveRate * 100).toFixed(1)}% effective rate
          </div>
        </div>
        <div className="rounded border border-border bg-bg-elevated p-3">
          <div className={clsx('text-lg font-bold font-mono', muniWins ? 'text-emerald-400' : 'text-text-primary')}>
            {corporateAfterTax.toFixed(2)}%
          </div>
          <div className="text-[11px] text-text-muted">
            After-tax on a {CORPORATE_REFERENCE.toFixed(2)}% taxable bond
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-text-muted">
        {tey.upliftPct > 0
          ? <>At these rates the exemption is worth <strong>{tey.upliftPct.toFixed(2)} points</strong> of yield.{' '}</>
          : <>At a 0% marginal rate there is nothing to exempt, so the headline yield is the comparable one.{' '}</>}
        {muniWins
          ? `On a like-for-like comparison this fund beats a ${CORPORATE_REFERENCE.toFixed(2)}% taxable bond for you.`
          : `A ${CORPORATE_REFERENCE.toFixed(2)}% taxable bond still nets you more — munis are not automatically the better deal.`}
      </p>

      {/* The limits are part of the answer, not a disclaimer bolted on. */}
      <p className="border-t border-border/60 pt-2 text-[10px] leading-relaxed text-text-muted/80">
        Standard formula on rates you supplied — not tax advice, and not a projection of what you
        will keep. It does not model AMT, the de minimis rule, state-specific treatment of in-state
        issuers, the net investment income tax, or whether every distribution this fund makes is
        actually exempt (capital-gain distributions are not). Distribution yield is a reference
        snapshot from the fund catalog, not a live figure.
      </p>
    </div>
  )
}
