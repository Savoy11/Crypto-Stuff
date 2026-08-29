import { CATEGORY_META, type CoinCategory } from './portfolioCoins'
import { CLASS_LABELS, INSTRUMENT_BY_KEY, isSecurityKey, securitySymbol, type InstrumentClass } from './instruments'
import { getEquity } from './equityCatalog'
import { getFund } from './fundCatalog'

// ─── Core types ───────────────────────────────────────────────────────────────

export interface PortfolioHolding {
  cgId:            string
  symbol:          string
  name:            string
  targetAlloc:     number        // % of portfolio (0–100, sum must = 100)
  entryPrice:      number | null // USD price when position was "opened"
  addedAt:         string
}

export interface Portfolio {
  id:              string
  name:            string
  description:     string
  startingCapital: number        // hypothetical USD
  holdings:        PortfolioHolding[]
  createdAt:       string
  updatedAt:       string
}

// ─── Computed holding (live prices merged in) ─────────────────────────────────

export interface ComputedHolding {
  cgId:            string
  symbol:          string
  name:            string
  targetAlloc:     number
  currentPrice:    number | null
  entryPrice:      number | null
  currentValue:    number | null  // startingCapital * targetAlloc/100 * (current/entry)
  targetValue:     number         // startingCapital * targetAlloc/100
  pnlPct:          number | null  // % gain/loss vs entry
  pnlUsd:          number | null
  category:        CoinCategory
  /**
   * Which asset class this holding is. Non-catalog additions (a coin from the
   * CoinGecko search, a ticker from the universe lookup) still classify — the
   * key shape says which family it is even when no catalog entry exists.
   */
  class:           InstrumentClass
  /**
   * 1–10, or NULL when no catalog entry carries a vetted tier for this
   * holding. Never a fabricated middle value: a defaulted 5 read exactly like
   * an assessed 5 and silently shaped the portfolio's weighted risk.
   */
  riskTier:        number | null
  color:           string
  priceSource:     'live' | 'fallback' | 'none'
}

export interface PortfolioMetrics {
  totalTargetValue:   number
  totalCurrentValue:  number | null
  totalPnlUsd:        number | null
  totalPnlPct:        number | null
  /**
   * 1–10 over the allocation whose risk tier is actually known, or null when
   * no holding carries one. `riskCoveredPct` says how much of the portfolio
   * that judgment covers — render it next to the number, the same disclosure
   * contract as pricedPct.
   */
  weightedRisk:       number | null
  riskLabel:          'Conservative' | 'Moderate' | 'Aggressive' | 'Speculative' | null
  /** Share of target allocation with a known risk tier (0–100). */
  riskCoveredPct:     number
  categoryBreakdown:  CategorySlice[]
  largestPosition:    ComputedHolding | null
  stablecoinPct:      number
  pricesAvailable:    boolean
  hasEntryPrices:     boolean
  /**
   * Share of target capital that actually carries a live price (0–100).
   * `totalCurrentValue` and `totalPnlPct` describe only this slice — the page
   * discloses it rather than implying the figures cover the whole portfolio.
   */
  pricedPct:          number
  /** Target capital behind the priced slice, in USD. The P&L% denominator. */
  pricedCapital:      number
}

export interface CategorySlice {
  /** Crypto category id, or an asset-class id for non-crypto slices. */
  category:  string
  label:     string
  color:     string
  pct:       number           // % of portfolio by target allocation
  value:     number           // USD (target)
}

/**
 * Slice colors for the non-crypto classes. Crypto keeps its per-category
 * palette (that fine grain is meaningful — a stablecoin is not a meme coin);
 * other classes get one color each, since their internal taxonomy (GICS
 * sectors, fund categories) is not what this chart is answering.
 */
export const CLASS_SLICE_COLORS: Record<Exclude<InstrumentClass, 'crypto'>, string> = {
  equity:    '#3b82f6',
  etf:       '#8b5cf6',
  mutual:    '#a78bfa',
  commodity: '#f59e0b',
  currency:  '#10b981',
  rate:      '#14b8a6',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function computeHoldings(
  portfolio: Portfolio,
  prices: Record<string, number>
): ComputedHolding[] {
  return portfolio.holdings.map(h => {
    const meta       = INSTRUMENT_BY_KEY[h.cgId]
    const targetVal  = portfolio.startingCapital * (h.targetAlloc / 100)
    const price      = prices[h.cgId] ?? null
    const priceSource: 'live' | 'fallback' | 'none' = price != null ? 'live' : 'none'

    let currentValue: number | null = null
    let pnlPct: number | null = null
    let pnlUsd: number | null = null

    if (price != null && h.entryPrice != null && h.entryPrice > 0) {
      const returnRatio = price / h.entryPrice
      currentValue = targetVal * returnRatio
      pnlUsd = currentValue - targetVal
      pnlPct = ((price - h.entryPrice) / h.entryPrice) * 100
    } else if (price != null) {
      // No entry price — show current value = target value (no P&L)
      currentValue = targetVal
    }

    return {
      cgId:         h.cgId,
      symbol:       h.symbol,
      name:         h.name,
      targetAlloc:  h.targetAlloc,
      currentPrice: price,
      entryPrice:   h.entryPrice,
      currentValue,
      targetValue:  targetVal,
      pnlPct,
      pnlUsd,
      category:     meta?.category ?? 'unknown',
      // Key shape classifies even without a catalog entry: 'sec:' keys are
      // securities (default equity — the same default the server's classify()
      // applies), anything else is a CoinGecko id.
      class:        meta?.class ?? (isSecurityKey(h.cgId) ? 'equity' : 'crypto'),
      riskTier:     meta?.riskTier ?? null,
      color:        meta?.color ?? '#64748b',
      priceSource,
    }
  })
}

export function computeMetrics(
  portfolio: Portfolio,
  holdings: ComputedHolding[]
): PortfolioMetrics {
  const totalTarget = portfolio.startingCapital

  // Weighted risk — over the allocation whose tier is KNOWN, never padded
  // with a default. Renormalising by coveredAlloc keeps the number a genuine
  // 1–10 average of what was assessed; riskCoveredPct tells the reader how
  // much of the portfolio that judgment actually covers.
  const riskRated = holdings.filter(h => h.riskTier !== null)
  const coveredAlloc = riskRated.reduce((a, h) => a + h.targetAlloc, 0)
  const weightedRisk = coveredAlloc > 0
    ? riskRated.reduce((acc, h) => acc + (h.riskTier! * (h.targetAlloc / coveredAlloc)), 0)
    : null
  const riskCoveredPct = parseFloat(Math.min(100, coveredAlloc).toFixed(1))

  const riskLabel = weightedRisk === null ? null :
    weightedRisk <= 3 ? 'Conservative' :
    weightedRisk <= 5 ? 'Moderate' :
    weightedRisk <= 7 ? 'Aggressive' : 'Speculative'

  // P&L — only if at least one holding has entry price + live price.
  //
  // PB-1 (fixed 2026-08-18). This block used to read
  //   holdings.reduce((acc, h) => acc + (h.currentValue ?? h.targetValue), 0)
  // which values an unpriced holding **at cost** and folds it into the total —
  // contradicting the page's own stated invariant ("positions without a live
  // price are excluded from totals, never valued at cost"). Under partial
  // coverage that produced a total that looked complete and was not, and a P&L%
  // whose denominator included capital no live price ever touched, damping the
  // real move toward zero. Unpriced holdings now leave the totals entirely and
  // `pricedPct` reports what the figures actually cover.
  const holdingsWithPnl = holdings.filter(h => h.pnlUsd != null)
  const pricedHoldings  = holdings.filter(h => h.currentValue != null)
  const hasEntryPrices  = holdings.some(h => h.entryPrice != null)
  const pricesAvailable = pricedHoldings.length > 0

  const pricedCapital = pricedHoldings.reduce((acc, h) => acc + h.targetValue, 0)
  const pricedPct     = totalTarget > 0 ? (pricedCapital / totalTarget) * 100 : 0

  let totalCurrentValue: number | null = null
  let totalPnlUsd: number | null = null
  let totalPnlPct: number | null = null

  if (pricesAvailable) {
    totalCurrentValue = pricedHoldings.reduce((acc, h) => acc + (h.currentValue ?? 0), 0)
  }

  if (holdingsWithPnl.length > 0) {
    totalPnlUsd = holdingsWithPnl.reduce((acc, h) => acc + (h.pnlUsd ?? 0), 0)
    // Denominator is the capital these P&L figures are actually measured against
    // — the priced-with-entry slice — not the whole portfolio.
    const pnlCapital = holdingsWithPnl.reduce((acc, h) => acc + h.targetValue, 0)
    totalPnlPct = pnlCapital > 0 ? (totalPnlUsd / pnlCapital) * 100 : null
  }

  // Breakdown: crypto by its category (the fine grain is real information —
  // stablecoin vs meme is a risk statement), everything else by asset class.
  // The old crypto-only map sent every stock to a label-less 'equity' cast and
  // every macro instrument to 'Unknown', which read as a data problem rather
  // than a mixed portfolio.
  const sliceMap: Map<string, { label: string; color: string; pct: number }> = new Map()
  for (const h of holdings) {
    const key = h.class === 'crypto' ? `cat:${h.category}` : `class:${h.class}`
    const slice = sliceMap.get(key) ?? (h.class === 'crypto'
      ? { label: CATEGORY_META[h.category]?.label ?? h.category, color: CATEGORY_META[h.category]?.color ?? '#64748b', pct: 0 }
      : { label: CLASS_LABELS[h.class], color: CLASS_SLICE_COLORS[h.class as Exclude<InstrumentClass, 'crypto'>] ?? '#64748b', pct: 0 })
    slice.pct += h.targetAlloc
    sliceMap.set(key, slice)
  }
  const categoryBreakdown: CategorySlice[] = Array.from(sliceMap.entries())
    .sort((a, b) => b[1].pct - a[1].pct)
    .map(([key, s]) => ({
      category: key.slice(key.indexOf(':') + 1),
      label:    s.label,
      color:    s.color,
      pct:      s.pct,
      value:    totalTarget * (s.pct / 100),
    }))

  const largestPosition = holdings.length > 0
    ? holdings.reduce((a, b) => a.targetAlloc > b.targetAlloc ? a : b)
    : null

  const stablecoinPct = holdings
    .filter(h => h.category === 'stablecoin')
    .reduce((acc, h) => acc + h.targetAlloc, 0)

  return {
    totalTargetValue: totalTarget,
    totalCurrentValue,
    totalPnlUsd,
    totalPnlPct,
    weightedRisk:   weightedRisk === null ? null : parseFloat(weightedRisk.toFixed(1)),
    riskLabel,
    riskCoveredPct,
    categoryBreakdown,
    largestPosition,
    stablecoinPct,
    pricesAvailable,
    hasEntryPrices,
    pricedPct,
    pricedCapital,
  }
}

// ─── Estimated annual income ──────────────────────────────────────────────────

export interface AnnualIncomeEstimate {
  income:  number   // projected USD per year from reference yields
  covered: number   // holdings that contributed (had a yield and a value)
}

// Projected annual dividend/distribution income from security holdings'
// reference yields (crypto staking yield is tracked on the Staking page).
export function computeAnnualIncome(holdings: ComputedHolding[]): AnnualIncomeEstimate {
  let income = 0
  let covered = 0
  for (const h of holdings) {
    if (!isSecurityKey(h.cgId)) continue
    const sym = securitySymbol(h.cgId)
    const yieldPct = getEquity(sym)?.dividendYieldPct ?? getFund(sym)?.yieldPct ?? null
    const value = h.currentValue ?? h.targetValue
    if (yieldPct != null && value > 0) { income += value * yieldPct / 100; covered++ }
  }
  return { income, covered }
}

// ─── Backtest arithmetic ──────────────────────────────────────────────────────

export interface BacktestHoldingResult extends PortfolioHolding {
  priceThen: number | null
  priceNow:  number | null
  returnPct: number | null
  valueThen: number | null
  valueNow:  number | null
  allocVal:  number
  color:     string
}

export interface BacktestSummary {
  totalThen: number
  totalNow:  number
  pnlUsd:    number
  pnlPct:    number
}

export function computeBacktestResults(
  portfolio: Portfolio,
  pricesThen: Record<string, number | null>,
  pricesNow: Record<string, number | null>
): BacktestHoldingResult[] {
  return portfolio.holdings.map(h => {
    const priceThen = pricesThen[h.cgId] ?? null
    const priceNow  = pricesNow[h.cgId] ?? null
    const allocVal  = portfolio.startingCapital * (h.targetAlloc / 100)
    const meta      = INSTRUMENT_BY_KEY[h.cgId]

    let returnPct: number | null = null
    let valueThen: number | null = null
    let valueNow: number | null = null

    if (priceThen != null && priceNow != null && priceThen > 0) {
      returnPct = ((priceNow - priceThen) / priceThen) * 100
      valueThen = allocVal
      valueNow  = allocVal * (priceNow / priceThen)
    }
    return { ...h, priceThen, priceNow, returnPct, valueThen, valueNow, allocVal, color: meta?.color ?? '#64748b' }
  })
}

// Growth summary over the holdings that have both prices — partial coverage is
// reported via the results, never scaled up here.
export function summarizeBacktest(results: BacktestHoldingResult[]): BacktestSummary | null {
  const withData = results.filter(r => r.valueNow != null)
  if (!withData.length) return null
  const totalThen = withData.reduce((s, r) => s + (r.valueThen ?? 0), 0)
  const totalNow  = withData.reduce((s, r) => s + (r.valueNow  ?? 0), 0)
  return { totalThen, totalNow, pnlUsd: totalNow - totalThen, pnlPct: ((totalNow - totalThen) / totalThen) * 100 }
}

// Validate holdings — returns error strings (empty = valid)
export function validateHoldings(holdings: PortfolioHolding[]): string[] {
  const errors: string[] = []
  if (holdings.length === 0) { errors.push('Add at least one holding.'); return errors }
  const total = holdings.reduce((s, h) => s + h.targetAlloc, 0)
  if (Math.abs(total - 100) > 0.5) errors.push(`Allocations sum to ${total.toFixed(1)}% — must equal 100%.`)
  const dups = holdings.map(h => h.cgId).filter((id, i, arr) => arr.indexOf(id) !== i)
  if (dups.length) errors.push(`Duplicate coin: ${dups[0]}.`)
  holdings.forEach((h, i) => {
    if (h.targetAlloc <= 0) errors.push(`Row ${i + 1}: allocation must be greater than 0.`)
  })
  return errors
}

// Diversification warnings
export interface DiversificationWarning {
  level: 'info' | 'warn' | 'danger'
  message: string
}
export function getDiversificationWarnings(
  holdings: ComputedHolding[],
  metrics: PortfolioMetrics
): DiversificationWarning[] {
  const warns: DiversificationWarning[] = []

  if (holdings.length < 3) warns.push({ level: 'warn', message: 'Very few holdings — consider diversifying across more assets.' })

  const largest = metrics.largestPosition
  if (largest && largest.targetAlloc > 60) warns.push({ level: 'danger', message: `${largest.symbol} makes up ${largest.targetAlloc.toFixed(0)}% of the portfolio — highly concentrated.` })
  else if (largest && largest.targetAlloc > 40) warns.push({ level: 'warn', message: `${largest.symbol} at ${largest.targetAlloc.toFixed(0)}% is a dominant position.` })

  if (metrics.stablecoinPct > 50) warns.push({ level: 'info', message: `${metrics.stablecoinPct.toFixed(0)}% in stablecoins — low growth potential but preserves capital.` })

  const catCount = metrics.categoryBreakdown.length
  if (catCount === 1) warns.push({ level: 'warn', message: 'All holdings in one category — no cross-sector diversification.' })

  const memeAlloc = holdings.filter(h => h.category === 'meme').reduce((a, h) => a + h.targetAlloc, 0)
  if (memeAlloc > 20) warns.push({ level: 'danger', message: `${memeAlloc.toFixed(0)}% in meme coins — very high speculative risk.` })

  // No warning when weightedRisk is null — a warning derived from a number we
  // refused to fabricate would be fabricating it with extra steps.
  if (metrics.weightedRisk !== null) {
    if (metrics.weightedRisk >= 8) warns.push({ level: 'danger', message: 'Portfolio risk score is very high — suitable only for high-risk tolerance.' })
    else if (metrics.weightedRisk >= 6) warns.push({ level: 'warn', message: 'Portfolio leans aggressive — significant volatility expected.' })
  }

  return warns
}
