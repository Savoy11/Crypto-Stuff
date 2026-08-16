// Quarter-over-quarter fund-holdings diff. Pure so the classification and
// turnover math backing /live-data/fund-holdings-history is testable — these
// numbers (deltaPct, turnoverPct) are shown to users as position changes.

/** Weight moves smaller than this (percentage points) count as unchanged. */
export const CHANGE_THRESHOLD_PP = 0.02
export const MAX_CHANGES = 80

export interface DisclosedHolding {
  key: string
  symbol: string | null
  name: string
  weightPct: number
  shares: number | null
}

export type ChangeAction = 'added' | 'exited' | 'increased' | 'decreased'

export interface HoldingsChangeRow {
  symbol: string | null
  name: string
  action: ChangeAction
  /** Weight in the current period; null for exited positions. */
  weightPct: number | null
  /** Weight in the previous period; null for new positions. */
  prevWeightPct: number | null
  /** weightPct - prevWeightPct (missing side treated as 0). */
  deltaPct: number
  shares: number | null
  prevShares: number | null
}

export interface HoldingsChangeSummary {
  added: number
  exited: number
  increased: number
  decreased: number
  unchanged: number
  /** Σ|Δweight| / 2 across all positions — a one-sided turnover estimate. */
  turnoverPct: number
  currentCount: number
  previousCount: number
}

export function diffHoldings(
  current: Map<string, DisclosedHolding>,
  previous: Map<string, DisclosedHolding>,
): { summary: HoldingsChangeSummary; changes: HoldingsChangeRow[] } {
  const changes: HoldingsChangeRow[] = []
  let increased = 0, decreased = 0, unchanged = 0, turnover = 0

  for (const [key, cur] of current) {
    const prev = previous.get(key)
    if (!prev) {
      turnover += cur.weightPct
      changes.push({
        symbol: cur.symbol, name: cur.name, action: 'added',
        weightPct: cur.weightPct, prevWeightPct: null, deltaPct: cur.weightPct,
        shares: cur.shares, prevShares: null,
      })
      continue
    }
    const delta = cur.weightPct - prev.weightPct
    turnover += Math.abs(delta)
    if (Math.abs(delta) < CHANGE_THRESHOLD_PP) { unchanged++; continue }
    if (delta > 0) increased++; else decreased++
    changes.push({
      symbol: cur.symbol, name: cur.name, action: delta > 0 ? 'increased' : 'decreased',
      weightPct: cur.weightPct, prevWeightPct: prev.weightPct, deltaPct: delta,
      shares: cur.shares, prevShares: prev.shares,
    })
  }
  for (const [key, prev] of previous) {
    if (current.has(key)) continue
    turnover += prev.weightPct
    changes.push({
      symbol: prev.symbol, name: prev.name, action: 'exited',
      weightPct: null, prevWeightPct: prev.weightPct, deltaPct: -prev.weightPct,
      shares: null, prevShares: prev.shares,
    })
  }

  changes.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
  const added = changes.filter((c) => c.action === 'added').length
  const exited = changes.filter((c) => c.action === 'exited').length

  return {
    summary: {
      added, exited, increased, decreased, unchanged,
      turnoverPct: Number((turnover / 2).toFixed(2)),
      currentCount: current.size,
      previousCount: previous.size,
    },
    changes: changes.slice(0, MAX_CHANGES).map((c) => ({
      ...c,
      weightPct: c.weightPct != null ? Number(c.weightPct.toFixed(3)) : null,
      prevWeightPct: c.prevWeightPct != null ? Number(c.prevWeightPct.toFixed(3)) : null,
      deltaPct: Number(c.deltaPct.toFixed(3)),
    })),
  }
}
