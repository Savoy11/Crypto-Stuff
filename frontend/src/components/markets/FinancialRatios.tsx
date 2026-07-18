'use client'

import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Calculator } from 'lucide-react'
import { ExplainedLabel } from '@/components/ui/ExplainedLabel'
import { STALE_TIME_LONG } from '@/lib/constants'
import { formatCompact, formatCompactNumber, formatCurrency, formatRatio } from '@/lib/utils/format'
import type { CompanyFactsResponse } from '@/app/live-data/company-facts/route'

// Financial ratios & metrics computed from SEC EDGAR XBRL company facts
// (audited filings). Valuation multiples combine those fundamentals with the
// page's quote price; when the price is a reference value they carry the
// app-wide amber "ref" tag.

interface FinancialRatiosProps {
  symbol: string
  price: number
  priceIsLive: boolean
}

type Row = {
  label: string
  value: string
  /** Hover explanation: what the metric is and why it matters. */
  explain: string
  ref?: boolean
  /** Signed fraction rendered as a colored YoY chip, e.g. 0.06 → "+6.0% YoY" */
  growth?: number | null
}

const dash = '—'
const pct = (v: number | null) => (v == null ? dash : formatRatio(v, 1))
const times = (v: number | null) => (v == null ? dash : `${v.toFixed(2)}×`)
const usd = (v: number | null) => (v == null ? dash : formatCompact(v))

export function FinancialRatios({ symbol, price, priceIsLive }: FinancialRatiosProps) {
  const { data, isLoading, error } = useQuery<CompanyFactsResponse>({
    queryKey: ['company-facts', symbol],
    queryFn: async () => {
      const r = await fetch(`/live-data/company-facts?symbol=${encodeURIComponent(symbol)}`)
      const j: CompanyFactsResponse = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      return j
    },
    staleTime: STALE_TIME_LONG * 6, // fundamentals move on filing cadence, not tick cadence
  })

  const f = data?.fundamentals
  const ra = data?.ratios

  const marketCap = f?.sharesOutstanding != null ? price * f.sharesOutstanding : null
  const pe = f?.epsDiluted != null && f.epsDiluted !== 0 ? price / f.epsDiluted : null
  const ps = marketCap != null && f?.revenue ? marketCap / f.revenue : null
  const pb = marketCap != null && f?.equity ? marketCap / f.equity : null

  const groups: Array<{ title: string; rows: Row[] }> = f && ra ? [
    {
      title: 'Valuation',
      rows: [
        { label: 'Market Cap', value: usd(marketCap), ref: !priceIsLive,
          explain: 'The total value the market puts on the company (share price × shares outstanding). It sets the company’s size class — mega, large, mid cap — and its weight in indexes.' },
        { label: 'P/E (FY, diluted)', value: times(pe), ref: !priceIsLive,
          explain: 'How many dollars you pay for $1 of annual profit. A high P/E means the market expects strong growth; a low one can signal a bargain — or a business in trouble. Only meaningful vs. peers and history.' },
        { label: 'Price / Sales', value: times(ps), ref: !priceIsLive,
          explain: 'Market cap per dollar of revenue. Useful when earnings are thin or negative, where P/E breaks down. Compare within the same industry — software commands far higher P/S than retail.' },
        { label: 'Price / Book', value: times(pb), ref: !priceIsLive,
          explain: 'Price relative to accounting net worth. Below 1× can mean a bargain or a business earning poor returns on its assets. Most relevant for banks and asset-heavy companies.' },
        { label: 'Shares Outstanding', value: f.sharesOutstanding != null ? formatCompactNumber(f.sharesOutstanding) : dash,
          explain: 'Total shares in existence. A shrinking count (buybacks) gives each remaining share a bigger claim on profits; a growing count dilutes existing holders.' },
      ],
    },
    {
      title: 'Profitability',
      rows: [
        { label: 'Gross Margin', value: pct(ra.grossMargin),
          explain: 'The share of revenue left after direct production costs. High, stable gross margins signal pricing power — often the clearest financial fingerprint of a competitive moat.' },
        { label: 'Operating Margin', value: pct(ra.operatingMargin),
          explain: 'Profit from core operations per dollar of revenue, after overhead like R&D and sales. Measures how efficiently the whole business runs before financing and taxes.' },
        { label: 'Net Margin', value: pct(ra.netMargin),
          explain: 'The bottom line: how many cents of each revenue dollar survive every cost, interest, and tax. The margin that ultimately accrues to shareholders.' },
        { label: 'Return on Equity', value: pct(ra.roe),
          explain: 'Profit relative to shareholders’ capital — how hard the owners’ money works. Note: heavy buybacks shrink equity and can inflate ROE (Apple’s exceeds 100% for this reason).' },
        { label: 'Return on Assets', value: pct(ra.roa),
          explain: 'Profit per dollar of assets, ignoring how they were financed. Good for comparing capital-heavy businesses to capital-light ones, and harder to flatter with leverage than ROE.' },
      ],
    },
    {
      title: 'Balance Sheet',
      rows: [
        { label: 'Current Ratio', value: times(ra.currentRatio),
          explain: 'Short-term assets vs. bills due within a year. Below 1× means near-term obligations exceed liquid resources — a liquidity red flag unless the business collects cash fast (retailers often run below 1× safely).' },
        { label: 'Liabilities / Equity', value: times(ra.liabilitiesToEquity),
          explain: 'Total leverage: everything the company owes relative to owners’ capital. Higher leverage amplifies both returns and losses, and leaves less cushion when conditions tighten.' },
        { label: 'LT Debt / Equity', value: times(ra.debtToEquity),
          explain: 'Long-term borrowings vs. equity. Cheap debt can boost shareholder returns, but high ratios mean refinancing risk when rates rise and less flexibility in downturns.' },
        { label: 'Cash & Equivalents', value: usd(f.cash),
          explain: 'Immediately spendable liquidity — the buffer that funds operations through downturns and enables buybacks, dividends, and acquisitions without borrowing.' },
        { label: 'Shareholders’ Equity', value: usd(f.equity),
          explain: 'Book value: assets minus liabilities — the accounting net worth. The denominator behind ROE and Price/Book.' },
      ],
    },
    {
      title: 'Income & Cash Flow',
      rows: [
        { label: 'Revenue', value: usd(f.revenue), growth: ra.revenueGrowthYoY,
          explain: 'Total sales for the fiscal year — the top line. Sustained revenue growth is the raw material for everything else; margins can only be squeezed so far.' },
        { label: 'Net Income', value: usd(f.netIncome), growth: ra.netIncomeGrowthYoY,
          explain: 'Profit after every expense and tax — the earnings behind EPS and the P/E ratio.' },
        { label: 'Diluted EPS', value: f.epsDiluted != null ? formatCurrency(f.epsDiluted) : dash,
          explain: 'Profit per share counting all potential shares from options and convertibles — the most conservative per-share earnings figure, and the one P/E uses here.' },
        { label: 'Operating Cash Flow', value: usd(f.operatingCashFlow),
          explain: 'Actual cash the operations generated. Harder to massage than accounting earnings — persistent gaps between net income and operating cash flow are a classic warning sign.' },
        { label: 'Free Cash Flow', value: usd(f.freeCashFlow),
          explain: 'Cash left after capital spending — the money genuinely available for dividends, buybacks, debt paydown, or acquisitions. Many investors value companies on this above all else.' },
      ],
    },
  ] : []

  return (
    <section className="rounded-card border border-border bg-bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-sm font-medium text-text-secondary flex items-center gap-2">
          <Calculator size={14} className="text-text-muted" aria-hidden />
          Financial Ratios & Metrics
        </h2>
        {data?.fiscalYearEnd && (
          <p className="text-[11px] text-text-muted">
            Fiscal year ended {data.fiscalYearEnd}
            {f?.balanceSheetAsOf && f.balanceSheetAsOf !== data.fiscalYearEnd && ` · balance sheet as of ${f.balanceSheetAsOf}`}
          </p>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 rounded bg-bg-elevated animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-text-muted">
          Fundamentals unavailable — {error instanceof Error ? error.message : 'SEC EDGAR unreachable'}
        </p>
      )}

      {groups.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          {groups.map(({ title, rows }) => (
            <div key={title}>
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-text-muted mb-2">{title}</h3>
              <dl className="space-y-2">
                {rows.map(({ label, value, explain, ref, growth }) => (
                  <div key={label} className="flex items-baseline justify-between gap-2 text-sm">
                    <dt className="text-text-muted text-xs">
                      <ExplainedLabel label={label} explain={explain} />
                    </dt>
                    <dd className="font-mono tabular-nums text-text-primary text-right">
                      {value}
                      {ref && value !== dash && (
                        <span className="ml-1 text-[9px] text-amber-400/70 align-top font-sans" title="Uses reference price — live quote unavailable">ref</span>
                      )}
                      {growth != null && (
                        <span className={clsx('ml-1.5 text-[10px] font-sans', growth >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {growth >= 0 ? '+' : ''}{(growth * 100).toFixed(1)}% YoY
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-text-muted">
        Computed from audited XBRL filings via SEC EDGAR · income & cash-flow figures are latest fiscal year; balance sheet is most recent report
        {' · '}some line items don’t apply to every industry (banks report no gross margin or current ratio)
      </p>
    </section>
  )
}
