'use client'

import { X } from 'lucide-react'
import {
  GROUP_LABELS,
  type FieldDef, type FilterGroup, type FilterRule,
} from '@/lib/data/coinFilters'

/**
 * The stackable screener UI, shared by the Coins registry and Coin Discovery.
 *
 * Extracted rather than copied: the two pages screen different row shapes over
 * different field tables, but the CONTRACT the user reads — "at least / at
 * most", conditions AND together, and a separate not-tested count that names
 * the missing field — has to be the same in both places or the same control
 * means two things. The row type is generic; only the field table varies.
 */
export interface FilterStackProps<T> {
  fields: FieldDef<T>[]
  fieldByKey: Map<string, FieldDef<T>>
  rules: FilterRule[]
  onChange: (rules: FilterRule[]) => void
  /** Rows passing every condition. */
  matchCount: number
  /** Rows a condition could not be evaluated against. Never "excluded". */
  untested?: number
  missingByField?: Record<string, number>
  /** Factors this page cannot offer, and why. Rendered when supplied. */
  unavailable?: { label: string; needs: string }[]
}

// Monotonic rule ids. A counter rather than Date.now(): two rules added in the
// same millisecond would collide on a timestamp, and React's purity lint cannot
// tell an event handler from render anyway.
let ruleSeq = 0

export function FilterStack<T>({
  fields, fieldByKey, rules, onChange,
  matchCount, untested, missingByField, unavailable,
}: FilterStackProps<T>) {
  const addRule = (field: string) => onChange([
    ...rules,
    { id: `${field}-${++ruleSeq}`, field, operator: 'gte', value: 0 },
  ])
  const updateRule = (id: string, patch: Partial<FilterRule>) =>
    onChange(rules.map(x => (x.id === id ? { ...x, ...patch } : x)))
  const removeRule = (id: string) => onChange(rules.filter(x => x.id !== id))

  const groups = (Object.keys(GROUP_LABELS) as FilterGroup[])
    .filter(g => fields.some(f => f.group === g))

  return (
    <div className="space-y-3 rounded-card border border-border bg-bg-card p-4">
      {rules.length === 0 && (
        <p className="text-xs text-text-muted">
          Add conditions below. They <strong className="text-text-secondary">stack</strong> — every
          condition must hold, so you can ask for one thing to be higher and another lower at the
          same time.
        </p>
      )}

      {rules.map(r => {
        const def = fieldByKey.get(r.field)
        if (!def) return null
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-bg-elevated px-3 py-2">
            <span className="min-w-36 text-xs font-medium text-text-primary">{def.label}</span>
            <select
              value={r.operator}
              onChange={e => updateRule(r.id, { operator: e.target.value as 'gte' | 'lte' })}
              aria-label={`${def.label} comparison`}
              className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-text-primary focus:border-accent-blue/40 focus:outline-none"
            >
              <option value="gte">at least</option>
              <option value="lte">at most</option>
            </select>
            <input
              type="number"
              inputMode="decimal"
              value={Number.isFinite(r.value) ? r.value : ''}
              onChange={e => updateRule(r.id, { value: e.target.value === '' ? NaN : Number(e.target.value) })}
              aria-label={`${def.label} value`}
              className="w-32 rounded border border-border bg-bg-card px-2 py-1 font-mono text-xs text-text-primary focus:border-accent-blue/40 focus:outline-none"
            />
            <span className="text-[10px] text-text-muted">
              {def.unit === 'usd' ? 'USD' : def.unit === 'percent' ? '%' : def.unit === 'ratio' ? '×' : ''}
            </span>
            <span className="flex-1 text-[10px] leading-relaxed text-text-muted">{def.hint}</span>
            <button
              onClick={() => removeRule(r.id)}
              aria-label={`Remove ${def.label} condition`}
              className="text-text-muted transition-colors hover:text-red-400"
            >
              <X size={13} />
            </button>
          </div>
        )
      })}

      <div className="flex flex-wrap items-start gap-4 border-t border-border pt-3">
        {groups.map(group => (
          <div key={group} className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{GROUP_LABELS[group]}</p>
            <div className="flex flex-wrap gap-1.5">
              {fields.filter(f => f.group === group).map(f => (
                <button
                  key={f.key}
                  onClick={() => addRule(f.key)}
                  title={f.hint}
                  className="rounded border border-border px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:border-accent-blue/40 hover:text-accent-blue"
                >
                  + {f.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[11px]">
        {rules.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="rounded border border-border px-2 py-1 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary"
          >
            Clear conditions
          </button>
        )}
        <span className="text-text-secondary">
          <strong className="text-text-primary">{matchCount.toLocaleString()}</strong> match
        </span>
        {/* Counted apart from non-matches on purpose: nobody ran the test on
            these, so reporting them as excluded would be a result we did not
            compute. */}
        {!!untested && (
          <span className="text-amber-400">
            {untested} not tested —{' '}
            {Object.entries(missingByField ?? {})
              .map(([k, n]) => `${n} missing ${fieldByKey.get(k)?.label ?? k}`)
              .join(', ')}
          </span>
        )}
      </div>

      {!!unavailable?.length && (
        <p className="text-[10px] leading-relaxed text-text-muted">
          Not available here:{' '}
          {unavailable.map((f, i) => (
            <span key={f.label}>
              {i > 0 && ' · '}<strong className="text-text-secondary">{f.label}</strong> — {f.needs}
            </span>
          ))}
          . Every field above is a figure the feed reports, or arithmetic over two of them — nothing
          here is scored or graded.
        </p>
      )}
    </div>
  )
}
