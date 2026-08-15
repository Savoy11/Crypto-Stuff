import { NextRequest, NextResponse } from 'next/server'
import { EDGAR_HEADERS, resolveCik } from '@/lib/server/edgar'
import {
  computeRatios,
  deriveFreeCashFlow,
  deriveGrossProfit,
  type CompanyFundamentals,
  type CompanyRatios,
  type EpsBasis,
} from '@/lib/utils/companyRatios'

// The fundamentals/ratio shapes and every derivation live in lib/utils/companyRatios.ts
// (pure + vitest-covered). Re-exported here so existing importers of this route's
// types keep working.
export type { CompanyFundamentals, CompanyRatios, EpsBasis }

export const dynamic = 'force-dynamic'

// Audited fundamentals + derived financial ratios from SEC EDGAR's XBRL
// company-facts API:  GET /live-data/company-facts?symbol=AAPL
//
// Income/cash-flow figures come from the latest fiscal year reported in a
// 10-K (with the prior year for growth); balance-sheet figures from the most
// recent quarter or annual report. Valuation multiples that need a live price
// (P/E, P/S, P/B, market cap) are computed client-side from these figures.

export interface AnnualDataPoint {
  fiscalYearEnd: string             // YYYY-MM-DD
  revenue: number | null
  netIncome: number | null
  eps: number | null
}

export interface CompanyFactsResponse {
  ok: boolean
  symbol: string
  cik: string | null
  company: string | null
  fiscalYearEnd: string | null      // end date of the fiscal year the figures cover
  fundamentals: CompanyFundamentals | null
  ratios: CompanyRatios | null
  /** Annual history, newest first (up to 12 fiscal years). */
  annualSeries: AnnualDataPoint[]
  updatedAt: string
  source: string
  error?: string
}

interface Fact {
  end: string
  start?: string
  val: number
  fy?: number
  fp?: string
  form?: string
}

type ConceptMap = Record<string, { units?: Record<string, Fact[]> }>

const DAY = 86_400_000

function factsForConcept(taxonomy: ConceptMap, concept: string, unitPreference: string[]): Fact[] {
  const units = taxonomy[concept]?.units
  if (!units) return []
  for (const unit of unitPreference) {
    if (Array.isArray(units[unit]) && units[unit].length > 0) return units[unit]
  }
  return []
}

/**
 * Full-year values for a duration (flow) concept from 10-K annual contexts,
 * newest first. Companies change tags over time (e.g. NVDA's revenue moved
 * between Revenues and RevenueFromContractWithCustomer…), so the series merges
 * every listed concept; earlier-listed concepts win when both cover a year.
 */
function annual(
  taxonomy: ConceptMap,
  concepts: string[],
  units = ['USD'],
): { latest: Fact | null; prior: Fact | null; series: Fact[]; latestConcept: string | null } {
  const byEnd = new Map<string, { fact: Fact; concept: string }>()
  for (const concept of concepts) {
    const local = new Map<string, Fact>()
    for (const f of factsForConcept(taxonomy, concept, units)) {
      if (!f.form?.startsWith('10-K') || !f.start) continue
      const span = (Date.parse(f.end) - Date.parse(f.start)) / DAY
      if (span <= 300 || span >= 400) continue // full-year contexts only (10-Ks also carry quarterly comparatives)
      // 10-Ks restate prior years; keep the most recent filing's value per year
      const existing = local.get(f.end)
      if (!existing || (f.fy ?? 0) >= (existing.fy ?? 0)) local.set(f.end, f)
    }
    for (const [end, f] of local) if (!byEnd.has(end)) byEnd.set(end, { fact: f, concept })
  }
  const entries = [...byEnd.values()].sort((a, b) => b.fact.end.localeCompare(a.fact.end))
  const series = entries.map((e) => e.fact)
  // `latestConcept` is how the caller learns WHICH tag supplied the number — the
  // fallback lists are ordered by preference, so a value can silently come from a
  // materially different concept (diluted vs basic EPS being the one users see).
  return {
    latest: series[0] ?? null,
    prior: series[1] ?? null,
    series,
    latestConcept: entries[0]?.concept ?? null,
  }
}

/** Most recent value for an instant (balance-sheet) concept, from any 10-K/10-Q. */
function instant(taxonomy: ConceptMap, concepts: string[], units = ['USD']): Fact | null {
  const byEnd = new Map<string, Fact>()
  for (const concept of concepts) {
    for (const f of factsForConcept(taxonomy, concept, units)) {
      if (f.start || !(f.form?.startsWith('10-K') || f.form?.startsWith('10-Q'))) continue
      if (!byEnd.has(f.end)) byEnd.set(f.end, f)
    }
  }
  const sorted = [...byEnd.values()].sort((a, b) => b.end.localeCompare(a.end))
  return sorted[0] ?? null
}

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? '').trim().toUpperCase()

  const fail = (status: number, error: string) => NextResponse.json(
    {
      ok: false, symbol, cik: null, company: null, fiscalYearEnd: null,
      fundamentals: null, ratios: null, annualSeries: [],
      updatedAt: new Date().toISOString(), source: 'SEC EDGAR (XBRL company facts)', error,
    } satisfies CompanyFactsResponse,
    { status }
  )

  if (!symbol) return fail(400, 'symbol required')

  try {
    const resolved = await resolveCik(symbol)
    if (!resolved) return fail(404, `No SEC registrant found for ticker ${symbol}`)
    const { cik, company } = resolved

    const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
      headers: EDGAR_HEADERS,
      next: { revalidate: 21_600 }, // fundamentals change only when a new report is filed
    })
    if (!res.ok) return fail(503, `SEC company facts: HTTP ${res.status}`)
    const data = await res.json() as { facts?: { 'us-gaap'?: ConceptMap; dei?: ConceptMap } }
    const gaap = data.facts?.['us-gaap']
    if (!gaap) return fail(503, 'No US-GAAP facts on record for this registrant')
    const dei = data.facts?.dei ?? {}

    const revenue = annual(gaap, ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'])
    const costOfRevenue = annual(gaap, ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'])
    const grossProfit = annual(gaap, ['GrossProfit'])
    const operatingIncome = annual(gaap, ['OperatingIncomeLoss'])
    const netIncome = annual(gaap, ['NetIncomeLoss'])
    const eps = annual(gaap, ['EarningsPerShareDiluted', 'EarningsPerShareBasic'], ['USD/shares'])
    const ocf = annual(gaap, ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'])
    const capex = annual(gaap, ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'])

    const assets = instant(gaap, ['Assets'])
    const liabilities = instant(gaap, ['Liabilities'])
    const equity = instant(gaap, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'])
    const assetsCurrent = instant(gaap, ['AssetsCurrent'])
    const liabilitiesCurrent = instant(gaap, ['LiabilitiesCurrent'])
    const cash = instant(gaap, ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'])
    const longTermDebt = instant(gaap, ['LongTermDebtNoncurrent', 'LongTermDebt'])
    const shares = instant(dei, ['EntityCommonStockSharesOutstanding'], ['shares'])
      ?? instant(gaap, ['CommonStockSharesOutstanding'], ['shares'])

    if (!revenue.latest && !netIncome.latest && !assets) {
      return fail(503, 'Company facts contained no usable fundamentals')
    }

    const grossProfitVal = deriveGrossProfit(
      grossProfit.latest?.val ?? null,
      revenue.latest?.val ?? null,
      costOfRevenue.latest?.val ?? null,
    )
    const fcf = deriveFreeCashFlow(ocf.latest?.val ?? null, capex.latest?.val ?? null)

    const fundamentals: CompanyFundamentals = {
      revenue: revenue.latest?.val ?? null,
      revenuePrior: revenue.prior?.val ?? null,
      grossProfit: grossProfitVal,
      operatingIncome: operatingIncome.latest?.val ?? null,
      netIncome: netIncome.latest?.val ?? null,
      netIncomePrior: netIncome.prior?.val ?? null,
      eps: eps.latest?.val ?? null,
      epsBasis: eps.latestConcept === 'EarningsPerShareDiluted' ? 'diluted'
        : eps.latestConcept === 'EarningsPerShareBasic' ? 'basic'
        : null,
      operatingCashFlow: ocf.latest?.val ?? null,
      capex: capex.latest?.val ?? null,
      freeCashFlow: fcf,
      assets: assets?.val ?? null,
      liabilities: liabilities?.val ?? null,
      equity: equity?.val ?? null,
      assetsCurrent: assetsCurrent?.val ?? null,
      liabilitiesCurrent: liabilitiesCurrent?.val ?? null,
      cash: cash?.val ?? null,
      longTermDebt: longTermDebt?.val ?? null,
      sharesOutstanding: shares?.val ?? null,
      balanceSheetAsOf: equity?.end ?? assets?.end ?? null,
    }

    const ratios: CompanyRatios = computeRatios(fundamentals)

    // Annual history: merge the per-concept series on fiscal-year-end date
    const byEnd = new Map<string, AnnualDataPoint>()
    const point = (end: string): AnnualDataPoint => {
      let p = byEnd.get(end)
      if (!p) { p = { fiscalYearEnd: end, revenue: null, netIncome: null, eps: null }; byEnd.set(end, p) }
      return p
    }
    for (const f of revenue.series) point(f.end).revenue = f.val
    for (const f of netIncome.series) point(f.end).netIncome = f.val
    for (const f of eps.series) point(f.end).eps = f.val
    const annualSeries = [...byEnd.values()]
      .filter(p => p.revenue != null || p.netIncome != null)
      .sort((a, b) => b.fiscalYearEnd.localeCompare(a.fiscalYearEnd))
      .slice(0, 12)

    return NextResponse.json({
      ok: true, symbol, cik, company,
      fiscalYearEnd: revenue.latest?.end ?? netIncome.latest?.end ?? null,
      fundamentals, ratios, annualSeries,
      updatedAt: new Date().toISOString(), source: 'SEC EDGAR (XBRL company facts)',
    } satisfies CompanyFactsResponse)
  } catch (e) {
    return fail(503, e instanceof Error ? e.message : 'SEC EDGAR unreachable')
  }
}
