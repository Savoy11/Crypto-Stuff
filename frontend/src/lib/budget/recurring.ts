// Recurring-transaction detection (Budget module). Pure logic — unit-tested
// in __tests__/recurring.test.ts. Produces SUGGESTIONS: the schema stores
// inferred rules as confirmed=false and the UI presents them as such, never
// as facts (see recurring_rules in db/schema/budget.ts).

export interface RecurringCandidateTx {
  description: string
  amount: number
  postedAt: string // ISO date
}

export interface RecurringSuggestion {
  /** Normalized merchant key the group matched on. */
  key: string
  /** Most recent description, for display. */
  description: string
  /** Median amount of the group (signed). */
  amount: number
  cadence: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
  occurrences: number
  lastSeen: string
  /** Estimated next due date (lastSeen + cadence). */
  nextDueAt: string
}

/**
 * Normalize a bank description into a grouping key: lowercase, strip digits
 * (store numbers, reference ids, dates baked into the string) and collapse
 * whitespace. "NETFLIX.COM 866-579-7172 #4821" and "NETFLIX.COM 866-579-7172
 * #4907" must group together.
 */
export function merchantKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[0-9#*]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const CADENCES: Array<{ cadence: RecurringSuggestion['cadence']; days: number; tolerance: number }> = [
  { cadence: 'weekly', days: 7, tolerance: 2 },
  { cadence: 'biweekly', days: 14, tolerance: 3 },
  { cadence: 'monthly', days: 30, tolerance: 5 },
  { cadence: 'quarterly', days: 91, tolerance: 10 },
  { cadence: 'yearly', days: 365, tolerance: 20 },
]

function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Detect likely recurring charges. Requirements per group, all deliberate:
 * ≥3 occurrences (two data points define no rhythm), a consistent interval
 * matching a known cadence within tolerance, and amounts within 25% of the
 * median (a merchant you buy variable amounts from is a habit, not a
 * subscription). Amount agreement uses magnitude, so salary (positive) and
 * subscriptions (negative) both detect.
 */
export function detectRecurring(txs: RecurringCandidateTx[]): RecurringSuggestion[] {
  const groups = new Map<string, RecurringCandidateTx[]>()
  for (const tx of txs) {
    const key = merchantKey(tx.description)
    if (key.length < 3) continue
    const list = groups.get(key)
    if (list) list.push(tx)
    else groups.set(key, [tx])
  }

  const out: RecurringSuggestion[] = []
  for (const [key, list] of groups) {
    if (list.length < 3) continue
    const sorted = [...list].sort((a, b) => a.postedAt.localeCompare(b.postedAt))

    const medAmountMag = median(sorted.map((t) => Math.abs(t.amount)))
    if (medAmountMag === 0) continue
    const steady = sorted.filter((t) => Math.abs(Math.abs(t.amount) - medAmountMag) / medAmountMag <= 0.25)
    if (steady.length < 3) continue

    const gaps: number[] = []
    for (let i = 1; i < steady.length; i++) {
      gaps.push((new Date(steady[i].postedAt).getTime() - new Date(steady[i - 1].postedAt).getTime()) / 86_400_000)
    }
    const medGap = median(gaps)
    const cadence = CADENCES.find((c) => Math.abs(medGap - c.days) <= c.tolerance)
    if (!cadence) continue
    // Every gap must roughly fit the cadence — one matching median with wild
    // scatter is coincidence, not rhythm.
    if (!gaps.every((g) => Math.abs(g - cadence.days) <= cadence.tolerance * 2)) continue

    const last = steady[steady.length - 1]
    const signedMedian = median(steady.map((t) => t.amount))
    out.push({
      key,
      description: last.description,
      amount: Math.round(signedMedian * 100) / 100,
      cadence: cadence.cadence,
      occurrences: steady.length,
      lastSeen: last.postedAt,
      nextDueAt: addDays(last.postedAt, cadence.days),
    })
  }
  return out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
}
