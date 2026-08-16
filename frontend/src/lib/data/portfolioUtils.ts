import { CATEGORY_META, type CoinCategory } from './portfolioCoins'
import { INSTRUMENT_BY_KEY, isSecurityKey, securitySymbol } from './instruments'
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
  riskTier:        number
  color:           string
  priceSource:     'live' | 'fallback' | 'none'
}

export interface PortfolioMetrics {
  totalTargetValue:   number
  totalCurrentValue:  number | null
  totalPnlUsd:        number | null
  totalPnlPct:        number | null
  weightedRisk:       number          // 1–10
  riskLabel:          'Conservative' | 'Moderate' | 'Aggressive' | 'Speculative'
  categoryBreakdown:  CategorySlice[]
  largestPosition:    ComputedHolding | null
  stablecoinPct:      number
  pricesAvailable:    boolean
  hasEntryPrices:     boolean
}

export interface CategorySlice {
  category:  CoinCategory
  label:     string
  color:     string
  pct:       number           // % of portfolio by target allocation
  value:     number           // USD (target)
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
      riskTier:     meta?.riskTier ?? 5,
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

  // Weighted risk (by target allocation)
  const weightedRisk = holdings.reduce((acc, h) => {
    return acc + (h.riskTier * (h.targetAlloc / 100))
  }, 0)

  const riskLabel =
    weightedRisk <= 3 ? 'Conservative' :
    weightedRisk <= 5 ? 'Moderate' :
    weightedRisk <= 7 ? 'Aggressive' : 'Speculative'

  // P&L — only if at least one holding has entry price + live price
  const holdingsWithPnl = holdings.filter(h => h.pnlUsd != null)
  const hasEntryPrices  = holdings.some(h => h.entryPrice != null)
  const pricesAvailable = holdings.some(h => h.currentPrice != null)

  let totalCurrentValue: number | null = null
  let totalPnlUsd: number | null = null
  let totalPnlPct: number | null = null

  if (holdingsWithPnl.length > 0) {
    totalCurrentValue = holdings.reduce((acc, h) => acc + (h.currentValue ?? h.targetValue), 0)
    totalPnlUsd = holdingsWithPnl.reduce((acc, h) => acc + (h.pnlUsd ?? 0), 0)
    totalPnlPct = (totalPnlUsd / totalTarget) * 100
  } else if (pricesAvailable) {
    totalCurrentValue = totalTarget
  }

  // Category breakdown
  const catMap: Map<CoinCategory, number> = new Map()
  for (const h of holdings) {
    catMap.set(h.category, (catMap.get(h.category) ?? 0) + h.targetAlloc)
  }
  const categoryBreakdown: CategorySlice[] = Array.from(catMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, pct]) => ({
      category: cat,
      label:    CATEGORY_META[cat]?.label ?? cat,
      color:    CATEGORY_META[cat]?.color ?? '#64748b',
      pct,
      value:    totalTarget * (pct / 100),
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
    weightedRisk:   parseFloat(weightedRisk.toFixed(1)),
    riskLabel,
    categoryBreakdown,
    largestPosition,
    stablecoinPct,
    pricesAvailable,
    hasEntryPrices,
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

  if (metrics.weightedRisk >= 8) warns.push({ level: 'danger', message: 'Portfolio risk score is very high — suitable only for high-risk tolerance.' })
  else if (metrics.weightedRisk >= 6) warns.push({ level: 'warn', message: 'Portfolio leans aggressive — significant volatility expected.' })

  return warns
}
