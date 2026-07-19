// Central data file for the ETFs & Mutual Funds module.
// Same layer as equityCatalog.ts — pure data, no API calls.
//
// expenseRatioPct / aumB / referencePrice / yieldPct are APPROXIMATE reference
// values (early 2026). Live NAV/price comes from /live-data/security-quotes;
// reference values keep pages rendering offline. Top holdings are indicative
// snapshots, not live portfolio data.

import type { SectorId } from './equityCatalog'

export type FundType = 'etf' | 'mutual'

export type FundCategoryId =
  | 'us-broad'
  | 'us-large-growth'
  | 'us-large-value'
  | 'us-small'
  | 'international'
  | 'emerging'
  | 'global'
  | 'sector'
  | 'dividend-income'
  | 'bond'
  | 'commodity'
  | 'crypto'
  | 'balanced'

export const FUND_CATEGORY_INFO: Record<FundCategoryId, { label: string; color: string }> = {
  'us-broad':        { label: 'US Broad Market',   color: '#3b82f6' },
  'us-large-growth': { label: 'US Large Growth',   color: '#8b5cf6' },
  'us-large-value':  { label: 'US Large Value',    color: '#f59e0b' },
  'us-small':        { label: 'US Small Cap',      color: '#ec4899' },
  'international':   { label: 'International',     color: '#06b6d4' },
  'emerging':        { label: 'Emerging Markets',  color: '#f97316' },
  'global':          { label: 'Global',            color: '#14b8a6' },
  'sector':          { label: 'Sector',            color: '#6366f1' },
  'dividend-income': { label: 'Dividend & Income', color: '#22c55e' },
  'bond':            { label: 'Bond',              color: '#64748b' },
  'commodity':       { label: 'Commodity',         color: '#a16207' },
  'crypto':          { label: 'Crypto',            color: '#eab308' },
  'balanced':        { label: 'Balanced',          color: '#0ea5e9' },
}

/** How the portfolio is constructed — beyond plain cap-weighted indexing. */
export type FundStrategy = 'index' | 'active' | 'equal-weight' | 'covered-call' | 'leveraged' | 'inverse'

export const FUND_STRATEGY_INFO: Record<FundStrategy, { label: string; description: string }> = {
  'index':        { label: 'Index',        description: 'Passively tracks a cap-weighted benchmark.' },
  'active':       { label: 'Active',       description: 'Manager discretion over holdings and weights.' },
  'equal-weight': { label: 'Equal Weight', description: 'Every constituent weighted equally — increased weighting of smaller names vs the cap-weighted index.' },
  'covered-call': { label: 'Covered Call', description: 'Sells call options against holdings for income, capping upside.' },
  'leveraged':    { label: 'Leveraged',    description: 'Daily-reset amplified (2×/3×) index exposure via derivatives.' },
  'inverse':      { label: 'Inverse',      description: 'Daily-reset short exposure — profits when the index falls.' },
}

export type FundRiskLevel = 'conservative' | 'moderate' | 'aggressive' | 'speculative'

export const FUND_RISK_INFO: Record<FundRiskLevel, { label: string; color: string }> = {
  conservative: { label: 'Conservative', color: '#22c55e' },
  moderate:     { label: 'Moderate',     color: '#3b82f6' },
  aggressive:   { label: 'Aggressive',   color: '#f59e0b' },
  speculative:  { label: 'Speculative',  color: '#ef4444' },
}

/** Strategy with a sensible default: tracked index → 'index', else 'active'. */
export function fundStrategy(f: Pick<FundEntry, 'strategy' | 'indexTracked'>): FundStrategy {
  return f.strategy ?? (f.indexTracked != null ? 'index' : 'active')
}

/**
 * Derived risk profile — a coarse suitability band from structure, not a
 * market-data risk score (that's the Risk Scores engine's job).
 */
export function fundRiskLevel(f: Pick<FundEntry, 'strategy' | 'indexTracked' | 'category'>): FundRiskLevel {
  const strategy = fundStrategy(f)
  if (strategy === 'leveraged' || strategy === 'inverse') return 'speculative'
  if (f.category === 'crypto') return 'speculative'
  if (f.category === 'bond') return 'conservative'
  if (['us-broad', 'us-large-value', 'dividend-income', 'balanced', 'global'].includes(f.category)) return 'moderate'
  return 'aggressive' // growth, small cap, international, emerging, sector, commodity
}

// Issuer-level frequent-trading policies for mutual funds (public prospectus
// policies — approximate summaries; check the fund's prospectus for specifics).
const MUTUAL_FUND_POLICY: Record<string, string> = {
  'Vanguard': 'Vanguard frequent-trading policy: after selling shares you cannot buy back into the same fund for 30 days (online purchases blocked).',
  'Fidelity': 'Fidelity excessive-trading policy: round trips within 30 days are flagged; repeated round trips lead to trading blocks.',
  'T. Rowe Price': 'T. Rowe Price frequent-trading policy: a 30-day purchase block applies after redeeming from the fund.',
  'American Funds': 'American Funds Class A shares carry a front-end sales load; frequent-trading purchases may be declined after a redemption.',
  'Dodge & Cox': 'Dodge & Cox monitors frequent trading; purchases may be declined after short-term round trips.',
  'PIMCO': 'PIMCO restricts excessive trading; short-term round trips may result in purchase blocks.',
}

/**
 * Trading restriction / minimum-holding disclaimer for a fund, or null.
 * Fund-specific note first (e.g. daily-reset leverage), then the issuer's
 * mutual-fund frequent-trading policy.
 */
export function fundTradingRestriction(f: Pick<FundEntry, 'tradingRestriction' | 'type' | 'issuer'>): string | null {
  if (f.tradingRestriction) return f.tradingRestriction
  if (f.type === 'mutual') {
    return MUTUAL_FUND_POLICY[f.issuer]
      ?? 'Mutual fund orders execute at end-of-day NAV; most issuers restrict repurchases within 30 days of a sale under frequent-trading policies — check the prospectus.'
  }
  return null
}

export interface FundHolding {
  symbol: string
  name: string
  weightPct: number
}

export interface FundEntry {
  /** Ticker, also the route param (lowercased). */
  symbol: string
  name: string
  type: FundType
  issuer: string
  category: FundCategoryId
  /** Annual expense ratio in percent (0.03 = 3 bps). */
  expenseRatioPct: number
  /** Approximate assets under management in billions USD. */
  aumB: number
  /** Approximate NAV/price USD — overridden by live quotes. */
  referencePrice: number
  /** Trailing 12-month distribution yield in percent; null if negligible. */
  yieldPct: number | null
  inceptionYear: number
  /** Index tracked; null for active funds. */
  indexTracked: string | null
  /** Indicative top holdings; empty for bond/commodity funds. */
  topHoldings: FundHolding[]
  description: string
  /** Official product page on the issuer's site. */
  website: string
  /** For sector/thematic funds: the GICS-style sector targeted (same ids as equityCatalog). */
  focusSector?: SectorId
  /** Narrower industry focus within that sector, e.g. "Semiconductors". */
  focusIndustry?: string
  /** Portfolio-construction strategy. Defaults via fundStrategy(): index when tracking, else active. */
  strategy?: FundStrategy
  /** Fund-specific trading restriction / minimum-holding note (leveraged daily resets, redemption fees…). */
  tradingRestriction?: string
}

const MEGA_CAP_HOLDINGS: FundHolding[] = [
  { symbol: 'NVDA', name: 'NVIDIA', weightPct: 7.5 },
  { symbol: 'MSFT', name: 'Microsoft', weightPct: 6.5 },
  { symbol: 'AAPL', name: 'Apple', weightPct: 6.3 },
  { symbol: 'AMZN', name: 'Amazon', weightPct: 4.0 },
  { symbol: 'META', name: 'Meta Platforms', weightPct: 2.9 },
]

export const FUND_CATALOG: FundEntry[] = [
  // ── US Broad Market ETFs ─────────────────────────────────────────────────────
  { symbol: 'SPY',  name: 'SPDR S&P 500 ETF Trust',            type: 'etf', issuer: 'State Street',  category: 'us-broad', expenseRatioPct: 0.0945, aumB: 660, referencePrice: 640, yieldPct: 1.2, inceptionYear: 1993, indexTracked: 'S&P 500', topHoldings: MEGA_CAP_HOLDINGS, website: 'https://www.ssga.com/us/en/individual/etfs/spdr-sp-500-etf-trust-spy', description: 'The original and most-traded S&P 500 ETF; deepest options market.' },
  { symbol: 'VOO',  name: 'Vanguard S&P 500 ETF',              type: 'etf', issuer: 'Vanguard',      category: 'us-broad', expenseRatioPct: 0.03,   aumB: 720, referencePrice: 590, yieldPct: 1.2, inceptionYear: 2010, indexTracked: 'S&P 500', topHoldings: MEGA_CAP_HOLDINGS, website: 'https://investor.vanguard.com/investment-products/etfs/profile/voo', description: 'Low-cost S&P 500 tracker; the largest ETF by assets.' },
  { symbol: 'IVV',  name: 'iShares Core S&P 500 ETF',          type: 'etf', issuer: 'BlackRock',     category: 'us-broad', expenseRatioPct: 0.03,   aumB: 640, referencePrice: 645, yieldPct: 1.2, inceptionYear: 2000, indexTracked: 'S&P 500', topHoldings: MEGA_CAP_HOLDINGS, website: 'https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf', description: 'iShares S&P 500 core holding at 3 bps.' },
  { symbol: 'VTI',  name: 'Vanguard Total Stock Market ETF',   type: 'etf', issuer: 'Vanguard',      category: 'us-broad', expenseRatioPct: 0.03,   aumB: 520, referencePrice: 315, yieldPct: 1.2, inceptionYear: 2001, indexTracked: 'CRSP US Total Market', topHoldings: MEGA_CAP_HOLDINGS, website: 'https://investor.vanguard.com/investment-products/etfs/profile/vti', description: 'Entire US market — large through micro cap — in one fund.' },
  { symbol: 'QQQ',  name: 'Invesco QQQ Trust',                 type: 'etf', issuer: 'Invesco',       category: 'us-large-growth', expenseRatioPct: 0.20, aumB: 380, referencePrice: 570, yieldPct: 0.5, inceptionYear: 1999, indexTracked: 'Nasdaq-100', topHoldings: MEGA_CAP_HOLDINGS, website: 'https://www.invesco.com/qqq-etf/en/home.html', description: 'Nasdaq-100 tracker; concentrated mega-cap tech exposure.' },
  { symbol: 'DIA',  name: 'SPDR Dow Jones Industrial Average ETF', type: 'etf', issuer: 'State Street', category: 'us-broad', expenseRatioPct: 0.16, aumB: 40, referencePrice: 470, yieldPct: 1.6, inceptionYear: 1998, indexTracked: 'Dow Jones Industrial Average', topHoldings: [], website: 'https://www.ssga.com/us/en/individual/etfs/spdr-dow-jones-industrial-average-etf-trust-dia', description: 'Price-weighted Dow 30 blue-chip exposure.' },
  { symbol: 'IWM',  name: 'iShares Russell 2000 ETF',          type: 'etf', issuer: 'BlackRock',     category: 'us-small', expenseRatioPct: 0.19, aumB: 75, referencePrice: 240, yieldPct: 1.1, inceptionYear: 2000, indexTracked: 'Russell 2000', topHoldings: [], website: 'https://www.ishares.com/us/products/239710/ishares-russell-2000-etf', description: 'The standard US small-cap benchmark tracker.' },
  { symbol: 'RSP',  name: 'Invesco S&P 500 Equal Weight ETF',  type: 'etf', issuer: 'Invesco',       category: 'us-broad', expenseRatioPct: 0.20, aumB: 75, referencePrice: 195, yieldPct: 1.5, inceptionYear: 2003, indexTracked: 'S&P 500 Equal Weight', strategy: 'equal-weight', topHoldings: [], website: 'https://www.invesco.com/us/financial-products/etfs/product-detail?audienceType=Investor&ticker=RSP', description: 'Equal-weights the S&P 500 — a hedge against mega-cap concentration.' },

  // ── Style ETFs ───────────────────────────────────────────────────────────────
  { symbol: 'VUG',  name: 'Vanguard Growth ETF',               type: 'etf', issuer: 'Vanguard', category: 'us-large-growth', expenseRatioPct: 0.04, aumB: 180, referencePrice: 460, yieldPct: 0.4, inceptionYear: 2004, indexTracked: 'CRSP US Large Growth', topHoldings: MEGA_CAP_HOLDINGS, website: 'https://investor.vanguard.com/investment-products/etfs/profile/vug', description: 'Large-cap growth at 4 bps; tech-heavy tilt.' },
  { symbol: 'VTV',  name: 'Vanguard Value ETF',                type: 'etf', issuer: 'Vanguard', category: 'us-large-value', expenseRatioPct: 0.04, aumB: 140, referencePrice: 185, yieldPct: 2.2, inceptionYear: 2004, indexTracked: 'CRSP US Large Value', topHoldings: [ { symbol: 'BRK-B', name: 'Berkshire Hathaway', weightPct: 3.6 }, { symbol: 'JPM', name: 'JPMorgan Chase', weightPct: 3.2 }, { symbol: 'XOM', name: 'Exxon Mobil', weightPct: 2.3 }, { symbol: 'UNH', name: 'UnitedHealth', weightPct: 1.9 }, { symbol: 'JNJ', name: 'Johnson & Johnson', weightPct: 1.8 } ], website: 'https://investor.vanguard.com/investment-products/etfs/profile/vtv', description: 'Large-cap value: financials, healthcare, energy tilt.' },
  { symbol: 'SCHD', name: 'Schwab US Dividend Equity ETF',     type: 'etf', issuer: 'Schwab',   category: 'dividend-income', expenseRatioPct: 0.06, aumB: 70, referencePrice: 28, yieldPct: 3.7, inceptionYear: 2011, indexTracked: 'Dow Jones US Dividend 100', topHoldings: [], website: 'https://www.schwabassetmanagement.com/products/schd', description: 'Quality dividend growers screened for balance-sheet strength.' },
  { symbol: 'VYM',  name: 'Vanguard High Dividend Yield ETF',  type: 'etf', issuer: 'Vanguard', category: 'dividend-income', expenseRatioPct: 0.06, aumB: 65, referencePrice: 135, yieldPct: 2.7, inceptionYear: 2006, indexTracked: 'FTSE High Dividend Yield', topHoldings: [], website: 'https://investor.vanguard.com/investment-products/etfs/profile/vym', description: 'Broad basket of above-average-yield US large caps.' },
  { symbol: 'VIG',  name: 'Vanguard Dividend Appreciation ETF', type: 'etf', issuer: 'Vanguard', category: 'dividend-income', expenseRatioPct: 0.06, aumB: 90, referencePrice: 205, yieldPct: 1.7, inceptionYear: 2006, indexTracked: 'S&P US Dividend Growers', topHoldings: [], website: 'https://investor.vanguard.com/investment-products/etfs/profile/vig', description: 'Companies with 10+ consecutive years of dividend increases.' },
  { symbol: 'JEPI', name: 'JPMorgan Equity Premium Income ETF', type: 'etf', issuer: 'JPMorgan', category: 'dividend-income', expenseRatioPct: 0.35, aumB: 40, referencePrice: 59, yieldPct: 8.0, inceptionYear: 2020, indexTracked: null, strategy: 'covered-call', topHoldings: [], website: 'https://am.jpmorgan.com/us/en/asset-management/adv/products/jpmorgan-equity-premium-income-etf-etf-shares-46641q332', description: 'Covered-call income strategy on low-volatility US equities.' },
  { symbol: 'JEPQ', name: 'JPMorgan Nasdaq Equity Premium Income ETF', type: 'etf', issuer: 'JPMorgan', category: 'dividend-income', expenseRatioPct: 0.35, aumB: 30, referencePrice: 57, yieldPct: 9.5, inceptionYear: 2022, indexTracked: null, strategy: 'covered-call', topHoldings: [], website: 'https://am.jpmorgan.com/us/en/asset-management/adv/products/jpmorgan-nasdaq-equity-premium-income-etf-etf-shares-46654q203', description: 'Covered-call income on Nasdaq-100 names; higher yield, capped upside.' },

  // ── International / Global ETFs ──────────────────────────────────────────────
  { symbol: 'VT',   name: 'Vanguard Total World Stock ETF',    type: 'etf', issuer: 'Vanguard',  category: 'global',        expenseRatioPct: 0.06, aumB: 55, referencePrice: 135, yieldPct: 1.8, inceptionYear: 2008, indexTracked: 'FTSE Global All Cap', topHoldings: [], website: 'https://investor.vanguard.com/investment-products/etfs/profile/vt', description: 'Every investable stock on Earth in one fund, cap-weighted.' },
  { symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', type: 'etf', issuer: 'Vanguard', category: 'international', expenseRatioPct: 0.05, aumB: 90, referencePrice: 72, yieldPct: 2.9, inceptionYear: 2011, indexTracked: 'FTSE Global All Cap ex US', topHoldings: [], website: 'https://investor.vanguard.com/investment-products/etfs/profile/vxus', description: 'All non-US developed and emerging markets.' },
  { symbol: 'VEA',  name: 'Vanguard FTSE Developed Markets ETF', type: 'etf', issuer: 'Vanguard', category: 'international', expenseRatioPct: 0.03, aumB: 150, referencePrice: 58, yieldPct: 2.9, inceptionYear: 2007, indexTracked: 'FTSE Developed All Cap ex US', topHoldings: [], website: 'https://investor.vanguard.com/investment-products/etfs/profile/vea', description: 'Developed international (Europe, Japan, Canada) at 3 bps.' },
  { symbol: 'VWO',  name: 'Vanguard FTSE Emerging Markets ETF', type: 'etf', issuer: 'Vanguard', category: 'emerging',      expenseRatioPct: 0.07, aumB: 90, referencePrice: 52, yieldPct: 3.0, inceptionYear: 2005, indexTracked: 'FTSE Emerging Markets All Cap', topHoldings: [], website: 'https://investor.vanguard.com/investment-products/etfs/profile/vwo', description: 'Broad EM exposure — China, India, Taiwan, Brazil.' },
  { symbol: 'EFA',  name: 'iShares MSCI EAFE ETF',             type: 'etf', issuer: 'BlackRock', category: 'international', expenseRatioPct: 0.32, aumB: 60, referencePrice: 90, yieldPct: 2.8, inceptionYear: 2001, indexTracked: 'MSCI EAFE', topHoldings: [], website: 'https://www.ishares.com/us/products/239623/ishares-msci-eafe-etf', description: 'The classic developed ex-North-America benchmark tracker.' },

  // ── Sector ETFs ──────────────────────────────────────────────────────────────
  { symbol: 'XLK',  name: 'Technology Select Sector SPDR',     type: 'etf', issuer: 'State Street', category: 'sector', expenseRatioPct: 0.09, aumB: 80, referencePrice: 270, yieldPct: 0.6, inceptionYear: 1998, indexTracked: 'Technology Select Sector', topHoldings: [ { symbol: 'NVDA', name: 'NVIDIA', weightPct: 15 }, { symbol: 'MSFT', name: 'Microsoft', weightPct: 14 }, { symbol: 'AAPL', name: 'Apple', weightPct: 13 }, { symbol: 'AVGO', name: 'Broadcom', weightPct: 6 }, { symbol: 'ORCL', name: 'Oracle', weightPct: 3 } ], website: 'https://www.sectorspdrs.com/mainfund/xlk', description: 'S&P 500 technology sector slice.', focusSector: 'technology', focusIndustry: 'Software, hardware & semiconductors' },
  { symbol: 'XLF',  name: 'Financial Select Sector SPDR',      type: 'etf', issuer: 'State Street', category: 'sector', expenseRatioPct: 0.09, aumB: 50, referencePrice: 53, yieldPct: 1.4, inceptionYear: 1998, indexTracked: 'Financial Select Sector', topHoldings: [ { symbol: 'BRK-B', name: 'Berkshire Hathaway', weightPct: 13 }, { symbol: 'JPM', name: 'JPMorgan Chase', weightPct: 10 }, { symbol: 'V', name: 'Visa', weightPct: 7 }, { symbol: 'MA', name: 'Mastercard', weightPct: 6 }, { symbol: 'BAC', name: 'Bank of America', weightPct: 4 } ], website: 'https://www.sectorspdrs.com/mainfund/xlf', description: 'S&P 500 financials: banks, payments, insurers.', focusSector: 'financials', focusIndustry: 'Banks, insurers & payments' },
  { symbol: 'XLE',  name: 'Energy Select Sector SPDR',         type: 'etf', issuer: 'State Street', category: 'sector', expenseRatioPct: 0.09, aumB: 35, referencePrice: 92, yieldPct: 3.3, inceptionYear: 1998, indexTracked: 'Energy Select Sector', topHoldings: [ { symbol: 'XOM', name: 'Exxon Mobil', weightPct: 22 }, { symbol: 'CVX', name: 'Chevron', weightPct: 16 }, { symbol: 'COP', name: 'ConocoPhillips', weightPct: 8 }, { symbol: 'SLB', name: 'SLB', weightPct: 4 }, { symbol: 'EOG', name: 'EOG Resources', weightPct: 4 } ], website: 'https://www.sectorspdrs.com/mainfund/xle', description: 'S&P 500 energy sector — oil majors and services.', focusSector: 'energy', focusIndustry: 'Oil, gas & energy services' },
  { symbol: 'XLV',  name: 'Health Care Select Sector SPDR',    type: 'etf', issuer: 'State Street', category: 'sector', expenseRatioPct: 0.09, aumB: 40, referencePrice: 150, yieldPct: 1.6, inceptionYear: 1998, indexTracked: 'Health Care Select Sector', topHoldings: [ { symbol: 'LLY', name: 'Eli Lilly', weightPct: 12 }, { symbol: 'JNJ', name: 'Johnson & Johnson', weightPct: 8 }, { symbol: 'ABBV', name: 'AbbVie', weightPct: 7 }, { symbol: 'UNH', name: 'UnitedHealth', weightPct: 6 }, { symbol: 'MRK', name: 'Merck', weightPct: 5 } ], website: 'https://www.sectorspdrs.com/mainfund/xlv', description: 'S&P 500 healthcare: pharma, insurers, devices.', focusSector: 'healthcare', focusIndustry: 'Pharma, insurers & med-tech' },
  { symbol: 'XLI',  name: 'Industrial Select Sector SPDR',     type: 'etf', issuer: 'State Street', category: 'sector', expenseRatioPct: 0.09, aumB: 20, referencePrice: 150, yieldPct: 1.3, inceptionYear: 1998, indexTracked: 'Industrial Select Sector', topHoldings: [], website: 'https://www.sectorspdrs.com/mainfund/xli', description: 'S&P 500 industrials: aerospace, machinery, transport.', focusSector: 'industrials', focusIndustry: 'Aerospace, machinery & transport' },
  { symbol: 'XLU',  name: 'Utilities Select Sector SPDR',      type: 'etf', issuer: 'State Street', category: 'sector', expenseRatioPct: 0.09, aumB: 20, referencePrice: 84, yieldPct: 2.7, inceptionYear: 1998, indexTracked: 'Utilities Select Sector', topHoldings: [], website: 'https://www.sectorspdrs.com/mainfund/xlu', description: 'S&P 500 utilities; data-center power demand theme.', focusSector: 'utilities', focusIndustry: 'Electric & multi-utilities' },
  { symbol: 'SMH',  name: 'VanEck Semiconductor ETF',          type: 'etf', issuer: 'VanEck',       category: 'sector', expenseRatioPct: 0.35, aumB: 30, referencePrice: 300, yieldPct: 0.4, inceptionYear: 2000, indexTracked: 'MVIS US Listed Semiconductor 25', topHoldings: [ { symbol: 'NVDA', name: 'NVIDIA', weightPct: 20 }, { symbol: 'TSM', name: 'TSMC', weightPct: 12 }, { symbol: 'AVGO', name: 'Broadcom', weightPct: 8 }, { symbol: 'AMD', name: 'AMD', weightPct: 5 }, { symbol: 'ASML', name: 'ASML', weightPct: 5 } ], website: 'https://www.vaneck.com/us/en/investments/semiconductor-etf-smh/', description: 'Concentrated semiconductor pure play — the AI supply chain.', focusSector: 'technology', focusIndustry: 'Semiconductors' },
  { symbol: 'VNQ',  name: 'Vanguard Real Estate ETF',          type: 'etf', issuer: 'Vanguard',     category: 'sector', expenseRatioPct: 0.13, aumB: 35, referencePrice: 95, yieldPct: 3.9, inceptionYear: 2004, indexTracked: 'MSCI US IMI Real Estate 25/50', topHoldings: [ { symbol: 'PLD', name: 'Prologis', weightPct: 6 }, { symbol: 'AMT', name: 'American Tower', weightPct: 5 }, { symbol: 'EQIX', name: 'Equinix', weightPct: 4 }, { symbol: 'WELL', name: 'Welltower', weightPct: 4 }, { symbol: 'O', name: 'Realty Income', weightPct: 3 } ], website: 'https://investor.vanguard.com/investment-products/etfs/profile/vnq', description: 'Broad US REIT exposure for income and diversification.', focusSector: 'real-estate', focusIndustry: 'Equity REITs' },
  { symbol: 'SOXX', name: 'iShares Semiconductor ETF',        type: 'etf', issuer: 'BlackRock',    category: 'sector', expenseRatioPct: 0.35, aumB: 14,  referencePrice: 230, yieldPct: 0.7, inceptionYear: 2001, indexTracked: 'NYSE Semiconductor', topHoldings: [], website: 'https://www.ishares.com/us/products/239705/ishares-phlx-semiconductor-etf', description: 'Concentrated US-listed semiconductor makers and designers.', focusSector: 'technology', focusIndustry: 'Semiconductors' },
  { symbol: 'IGV',  name: 'iShares Expanded Tech-Software ETF', type: 'etf', issuer: 'BlackRock',  category: 'sector', expenseRatioPct: 0.41, aumB: 9,   referencePrice: 95,  yieldPct: null, inceptionYear: 2001, indexTracked: 'S&P North American Expanded Technology Software', topHoldings: [], website: 'https://www.ishares.com/us/products/239771/ishares-north-american-techsoftware-etf', description: 'Application, systems, and infrastructure software makers.', focusSector: 'technology', focusIndustry: 'Software' },
  { symbol: 'HACK', name: 'Amplify Cybersecurity ETF',        type: 'etf', issuer: 'Amplify',      category: 'sector', expenseRatioPct: 0.60, aumB: 1.8, referencePrice: 68,  yieldPct: null, inceptionYear: 2014, indexTracked: 'Nasdaq ISE Cyber Security Select', topHoldings: [], website: 'https://amplifyetfs.com/hack/', description: 'Pure-play cybersecurity hardware, software, and services.', focusSector: 'technology', focusIndustry: 'Cybersecurity' },
  { symbol: 'SKYY', name: 'First Trust Cloud Computing ETF',  type: 'etf', issuer: 'First Trust',  category: 'sector', expenseRatioPct: 0.60, aumB: 3,   referencePrice: 105, yieldPct: null, inceptionYear: 2011, indexTracked: 'ISE CTA Cloud Computing', topHoldings: [], website: 'https://www.ftportfolios.com/retail/etf/etfsummary.aspx?Ticker=SKYY', description: 'Cloud infrastructure, platform, and software companies.', focusSector: 'technology', focusIndustry: 'Cloud Computing' },
  { symbol: 'XBI',  name: 'SPDR S&P Biotech ETF',             type: 'etf', issuer: 'State Street', category: 'sector', expenseRatioPct: 0.35, aumB: 5,   referencePrice: 92,  yieldPct: null, inceptionYear: 2006, indexTracked: 'S&P Biotechnology Select Industry', topHoldings: [], website: 'https://www.ssga.com/us/en/individual/etfs/spdr-sp-biotech-etf-xbi', description: 'Equal-weighted US biotech — heavy small/mid-cap exposure.', focusSector: 'healthcare', focusIndustry: 'Biotechnology' },
  { symbol: 'IBB',  name: 'iShares Biotechnology ETF',        type: 'etf', issuer: 'BlackRock',    category: 'sector', expenseRatioPct: 0.45, aumB: 6.5, referencePrice: 135, yieldPct: null, inceptionYear: 2001, indexTracked: 'NYSE Biotechnology', topHoldings: [], website: 'https://www.ishares.com/us/products/239699/ishares-nasdaq-biotechnology-etf', description: 'Cap-weighted biotech benchmark — large-cap tilt vs XBI.', focusSector: 'healthcare', focusIndustry: 'Biotechnology' },
  { symbol: 'IHI',  name: 'iShares U.S. Medical Devices ETF', type: 'etf', issuer: 'BlackRock',    category: 'sector', expenseRatioPct: 0.39, aumB: 5,   referencePrice: 58,  yieldPct: 0.5, inceptionYear: 2006, indexTracked: 'Dow Jones U.S. Select Medical Equipment', topHoldings: [], website: 'https://www.ishares.com/us/products/239516/ishares-us-medical-devices-etf', description: 'Medical device and equipment manufacturers.', focusSector: 'healthcare', focusIndustry: 'Medical Devices' },
  { symbol: 'KBE',  name: 'SPDR S&P Bank ETF',                type: 'etf', issuer: 'State Street', category: 'sector', expenseRatioPct: 0.35, aumB: 2,   referencePrice: 55,  yieldPct: 2.6, inceptionYear: 2005, indexTracked: 'S&P Banks Select Industry', topHoldings: [], website: 'https://www.ssga.com/us/en/individual/etfs/spdr-sp-bank-etf-kbe', description: 'Equal-weighted US banks, thrifts, and custody banks.', focusSector: 'financials', focusIndustry: 'Banks' },
  { symbol: 'KRE',  name: 'SPDR S&P Regional Banking ETF',    type: 'etf', issuer: 'State Street', category: 'sector', expenseRatioPct: 0.35, aumB: 3.5, referencePrice: 62,  yieldPct: 2.8, inceptionYear: 2006, indexTracked: 'S&P Regional Banks Select Industry', topHoldings: [], website: 'https://www.ssga.com/us/en/individual/etfs/spdr-sp-regional-banking-etf-kre', description: 'Equal-weighted US regional banks.', focusSector: 'financials', focusIndustry: 'Regional Banks' },
  { symbol: 'IAI',  name: 'iShares U.S. Broker-Dealers ETF',  type: 'etf', issuer: 'BlackRock',    category: 'sector', expenseRatioPct: 0.39, aumB: 1.5, referencePrice: 145, yieldPct: 1.0, inceptionYear: 2006, indexTracked: 'Dow Jones U.S. Select Investment Services', topHoldings: [], website: 'https://www.ishares.com/us/products/239504/ishares-us-brokerdealers-securities-exchanges-etf', description: 'Broker-dealers, exchanges, and capital-markets firms.', focusSector: 'financials', focusIndustry: 'Capital Markets' },
  { symbol: 'ITA',  name: 'iShares U.S. Aerospace & Defense ETF', type: 'etf', issuer: 'BlackRock', category: 'sector', expenseRatioPct: 0.39, aumB: 6,  referencePrice: 145, yieldPct: 0.8, inceptionYear: 2006, indexTracked: 'Dow Jones U.S. Select Aerospace & Defense', topHoldings: [], website: 'https://www.ishares.com/us/products/239502/ishares-us-aerospace-defense-etf', description: 'Defense primes, aerospace manufacturers, and suppliers.', focusSector: 'industrials', focusIndustry: 'Aerospace & Defense' },
  { symbol: 'PAVE', name: 'Global X U.S. Infrastructure Development ETF', type: 'etf', issuer: 'Global X', category: 'sector', expenseRatioPct: 0.47, aumB: 8, referencePrice: 42, yieldPct: 0.6, inceptionYear: 2017, indexTracked: 'Indxx U.S. Infrastructure Development', topHoldings: [], website: 'https://www.globalxetfs.com/funds/pave/', description: 'Construction, materials, and equipment behind US infrastructure.', focusSector: 'industrials', focusIndustry: 'Infrastructure' },
  { symbol: 'IYT',  name: 'iShares U.S. Transportation ETF',  type: 'etf', issuer: 'BlackRock',    category: 'sector', expenseRatioPct: 0.39, aumB: 0.8, referencePrice: 72,  yieldPct: 1.1, inceptionYear: 2003, indexTracked: 'S&P Transportation Select Industry FMC', topHoldings: [], website: 'https://www.ishares.com/us/products/239506/ishares-transportation-average-etf', description: 'Railroads, truckers, airlines, and logistics.', focusSector: 'industrials', focusIndustry: 'Transportation' },
  { symbol: 'JETS', name: 'U.S. Global Jets ETF',             type: 'etf', issuer: 'U.S. Global',  category: 'sector', expenseRatioPct: 0.60, aumB: 1,   referencePrice: 26,  yieldPct: null, inceptionYear: 2015, indexTracked: 'U.S. Global Jets', topHoldings: [], website: 'https://usglobaletfs.com/fund/jets/', description: 'Airlines, airports, and aircraft manufacturers.', focusSector: 'industrials', focusIndustry: 'Airlines' },
  { symbol: 'XOP',  name: 'SPDR S&P Oil & Gas Exploration ETF', type: 'etf', issuer: 'State Street', category: 'sector', expenseRatioPct: 0.35, aumB: 2.5, referencePrice: 135, yieldPct: 2.4, inceptionYear: 2006, indexTracked: 'S&P Oil & Gas Exploration & Production Select Industry', topHoldings: [], website: 'https://www.ssga.com/us/en/individual/etfs/spdr-sp-oil-gas-exploration-production-etf-xop', description: 'Equal-weighted US oil & gas explorers and producers.', focusSector: 'energy', focusIndustry: 'Oil & Gas E&P' },
  { symbol: 'OIH',  name: 'VanEck Oil Services ETF',          type: 'etf', issuer: 'VanEck',       category: 'sector', expenseRatioPct: 0.35, aumB: 1.5, referencePrice: 260, yieldPct: 1.2, inceptionYear: 2011, indexTracked: 'MVIS US Listed Oil Services 25', topHoldings: [], website: 'https://www.vaneck.com/us/en/investments/oil-services-etf-oih/', description: 'Oilfield services and drilling equipment companies.', focusSector: 'energy', focusIndustry: 'Oil Services' },
  { symbol: 'ICLN', name: 'iShares Global Clean Energy ETF',  type: 'etf', issuer: 'BlackRock',    category: 'sector', expenseRatioPct: 0.41, aumB: 1.5, referencePrice: 14,  yieldPct: 1.3, inceptionYear: 2008, indexTracked: 'S&P Global Clean Energy', topHoldings: [], website: 'https://www.ishares.com/us/products/239738/ishares-global-clean-energy-etf', description: 'Global solar, wind, and renewable power producers.', focusSector: 'energy', focusIndustry: 'Clean Energy' },
  { symbol: 'TAN',  name: 'Invesco Solar ETF',                type: 'etf', issuer: 'Invesco',      category: 'sector', expenseRatioPct: 0.67, aumB: 1,   referencePrice: 38,  yieldPct: null, inceptionYear: 2008, indexTracked: 'MAC Global Solar Energy', topHoldings: [], website: 'https://www.invesco.com/us/financial-products/etfs/product-detail?audienceType=Investor&ticker=TAN', description: 'Pure-play global solar energy value chain.', focusSector: 'energy', focusIndustry: 'Solar' },
  { symbol: 'URA',  name: 'Global X Uranium ETF',             type: 'etf', issuer: 'Global X',     category: 'sector', expenseRatioPct: 0.69, aumB: 3,   referencePrice: 32,  yieldPct: null, inceptionYear: 2010, indexTracked: 'Solactive Global Uranium & Nuclear Components', topHoldings: [], website: 'https://www.globalxetfs.com/funds/ura/', description: 'Uranium miners and nuclear-fuel component makers.', focusSector: 'energy', focusIndustry: 'Uranium & Nuclear' },
  { symbol: 'GDX',  name: 'VanEck Gold Miners ETF',           type: 'etf', issuer: 'VanEck',       category: 'sector', expenseRatioPct: 0.51, aumB: 15,  referencePrice: 44,  yieldPct: 1.0, inceptionYear: 2006, indexTracked: 'NYSE Arca Gold Miners', topHoldings: [], website: 'https://www.vaneck.com/us/en/investments/gold-miners-etf-gdx/', description: 'Large-cap global gold mining companies.', focusSector: 'materials', focusIndustry: 'Gold Miners' },
  { symbol: 'LIT',  name: 'Global X Lithium & Battery Tech ETF', type: 'etf', issuer: 'Global X',  category: 'sector', expenseRatioPct: 0.75, aumB: 1,   referencePrice: 45,  yieldPct: null, inceptionYear: 2010, indexTracked: 'Solactive Global Lithium', topHoldings: [], website: 'https://www.globalxetfs.com/funds/lit/', description: 'Lithium mining through battery production.', focusSector: 'materials', focusIndustry: 'Lithium & Battery' },
  { symbol: 'XRT',  name: 'SPDR S&P Retail ETF',              type: 'etf', issuer: 'State Street', category: 'sector', expenseRatioPct: 0.35, aumB: 0.3, referencePrice: 78,  yieldPct: 1.5, inceptionYear: 2006, indexTracked: 'S&P Retail Select Industry', topHoldings: [], website: 'https://www.ssga.com/us/en/individual/etfs/spdr-sp-retail-etf-xrt', description: 'Equal-weighted US retailers across formats.', focusSector: 'consumer-discretionary', focusIndustry: 'Retail' },
  { symbol: 'ITB',  name: 'iShares U.S. Home Construction ETF', type: 'etf', issuer: 'BlackRock',  category: 'sector', expenseRatioPct: 0.39, aumB: 2.5, referencePrice: 105, yieldPct: 0.5, inceptionYear: 2006, indexTracked: 'Dow Jones U.S. Select Home Construction', topHoldings: [], website: 'https://www.ishares.com/us/products/239527/ishares-us-home-construction-etf', description: 'Homebuilders plus building products and home improvement.', focusSector: 'consumer-discretionary', focusIndustry: 'Homebuilders' },

  // ── Bond ETFs ────────────────────────────────────────────────────────────────
  { symbol: 'BND',  name: 'Vanguard Total Bond Market ETF',    type: 'etf', issuer: 'Vanguard',  category: 'bond', expenseRatioPct: 0.03, aumB: 130, referencePrice: 74, yieldPct: 4.3, inceptionYear: 2007, indexTracked: 'Bloomberg US Aggregate Float Adjusted', topHoldings: [], website: 'https://investor.vanguard.com/investment-products/etfs/profile/bnd', description: 'Total US investment-grade bond market — the core bond holding.' },
  { symbol: 'AGG',  name: 'iShares Core US Aggregate Bond ETF', type: 'etf', issuer: 'BlackRock', category: 'bond', expenseRatioPct: 0.03, aumB: 120, referencePrice: 100, yieldPct: 4.2, inceptionYear: 2003, indexTracked: 'Bloomberg US Aggregate', topHoldings: [], website: 'https://www.ishares.com/us/products/239458/ishares-core-total-us-bond-market-etf', description: 'The iShares version of the total US bond market.' },
  { symbol: 'TLT',  name: 'iShares 20+ Year Treasury Bond ETF', type: 'etf', issuer: 'BlackRock', category: 'bond', expenseRatioPct: 0.15, aumB: 50, referencePrice: 90, yieldPct: 4.6, inceptionYear: 2002, indexTracked: 'ICE US Treasury 20+ Year', topHoldings: [], website: 'https://www.ishares.com/us/products/239454/ishares-20-year-treasury-bond-etf', description: 'Long-duration Treasuries — maximum interest-rate sensitivity.' },
  { symbol: 'IEF',  name: 'iShares 7-10 Year Treasury Bond ETF', type: 'etf', issuer: 'BlackRock', category: 'bond', expenseRatioPct: 0.15, aumB: 30, referencePrice: 95, yieldPct: 4.1, inceptionYear: 2002, indexTracked: 'ICE US Treasury 7-10 Year', topHoldings: [], website: 'https://www.ishares.com/us/products/239456/ishares-7-10-year-treasury-bond-etf', description: 'Intermediate Treasuries — the belly of the curve.' },
  { symbol: 'SHY',  name: 'iShares 1-3 Year Treasury Bond ETF', type: 'etf', issuer: 'BlackRock', category: 'bond', expenseRatioPct: 0.15, aumB: 25, referencePrice: 82, yieldPct: 4.3, inceptionYear: 2002, indexTracked: 'ICE US Treasury 1-3 Year', topHoldings: [], website: 'https://www.ishares.com/us/products/239452/ishares-1-3-year-treasury-bond-etf', description: 'Short Treasuries — cash-like with minimal duration risk.' },
  { symbol: 'LQD',  name: 'iShares iBoxx Investment Grade Corporate ETF', type: 'etf', issuer: 'BlackRock', category: 'bond', expenseRatioPct: 0.14, aumB: 30, referencePrice: 110, yieldPct: 4.9, inceptionYear: 2002, indexTracked: 'Markit iBoxx USD Liquid IG', topHoldings: [], website: 'https://www.ishares.com/us/products/239566/ishares-iboxx-investment-grade-corporate-bond-etf', description: 'Investment-grade corporate credit benchmark.' },
  { symbol: 'HYG',  name: 'iShares iBoxx High Yield Corporate ETF', type: 'etf', issuer: 'BlackRock', category: 'bond', expenseRatioPct: 0.49, aumB: 15, referencePrice: 80, yieldPct: 6.6, inceptionYear: 2007, indexTracked: 'Markit iBoxx USD Liquid HY', topHoldings: [], website: 'https://www.ishares.com/us/products/239565/ishares-iboxx-high-yield-corporate-bond-etf', description: 'High-yield ("junk") corporate bonds — credit risk premium.' },
  { symbol: 'TIP',  name: 'iShares TIPS Bond ETF',             type: 'etf', issuer: 'BlackRock', category: 'bond', expenseRatioPct: 0.19, aumB: 15, referencePrice: 110, yieldPct: 3.3, inceptionYear: 2003, indexTracked: 'Bloomberg US TIPS', topHoldings: [], website: 'https://www.ishares.com/us/products/239467/ishares-tips-bond-etf', description: 'Inflation-protected Treasuries.' },

  // ── Commodity & Crypto ETFs ──────────────────────────────────────────────────
  { symbol: 'GLD',  name: 'SPDR Gold Shares',                  type: 'etf', issuer: 'State Street', category: 'commodity', expenseRatioPct: 0.40, aumB: 120, referencePrice: 380, yieldPct: null, inceptionYear: 2004, indexTracked: 'Gold bullion (LBMA)', topHoldings: [], website: 'https://www.spdrgoldshares.com/', description: 'Physically backed gold — the largest commodity ETF.' },
  { symbol: 'IAU',  name: 'iShares Gold Trust',                type: 'etf', issuer: 'BlackRock',    category: 'commodity', expenseRatioPct: 0.25, aumB: 50, referencePrice: 77, yieldPct: null, inceptionYear: 2005, indexTracked: 'Gold bullion (LBMA)', topHoldings: [], website: 'https://www.ishares.com/us/products/239561/ishares-gold-trust-fund', description: 'Lower-cost physical gold alternative to GLD.' },
  { symbol: 'SLV',  name: 'iShares Silver Trust',              type: 'etf', issuer: 'BlackRock',    category: 'commodity', expenseRatioPct: 0.50, aumB: 20, referencePrice: 42, yieldPct: null, inceptionYear: 2006, indexTracked: 'Silver bullion (LBMA)', topHoldings: [], website: 'https://www.ishares.com/us/products/239855/ishares-silver-trust-fund', description: 'Physically backed silver exposure.' },
  { symbol: 'DBC',  name: 'Invesco DB Commodity Index ETF',    type: 'etf', issuer: 'Invesco',      category: 'commodity', expenseRatioPct: 0.87, aumB: 1.5, referencePrice: 22, yieldPct: null, inceptionYear: 2006, indexTracked: 'DBIQ Optimum Yield Diversified Commodity', topHoldings: [], website: 'https://www.invesco.com/us/financial-products/etfs/product-detail?audienceType=Investor&ticker=DBC', description: 'Diversified futures basket: energy, metals, agriculture.' },
  { symbol: 'IBIT', name: 'iShares Bitcoin Trust',             type: 'etf', issuer: 'BlackRock',    category: 'crypto', expenseRatioPct: 0.25, aumB: 80, referencePrice: 60, yieldPct: null, inceptionYear: 2024, indexTracked: 'Bitcoin (spot)', topHoldings: [], website: 'https://www.ishares.com/us/products/333011/ishares-bitcoin-trust-etf', description: 'Spot Bitcoin ETF — bridges the crypto module and brokerage accounts.' },
  { symbol: 'ETHA', name: 'iShares Ethereum Trust',            type: 'etf', issuer: 'BlackRock',    category: 'crypto', expenseRatioPct: 0.25, aumB: 10, referencePrice: 25, yieldPct: null, inceptionYear: 2024, indexTracked: 'Ether (spot)', topHoldings: [], website: 'https://www.ishares.com/us/products/337614/ishares-ethereum-trust-etf', description: 'Spot Ether ETF counterpart to IBIT.' },

  // ── Thematic / Active ETFs ───────────────────────────────────────────────────
  { symbol: 'ARKK', name: 'ARK Innovation ETF',                type: 'etf', issuer: 'ARK Invest', category: 'us-large-growth', expenseRatioPct: 0.75, aumB: 7, referencePrice: 65, yieldPct: null, inceptionYear: 2014, indexTracked: null, topHoldings: [ { symbol: 'TSLA', name: 'Tesla', weightPct: 10 }, { symbol: 'COIN', name: 'Coinbase', weightPct: 8 }, { symbol: 'ROKU', name: 'Roku', weightPct: 7 }, { symbol: 'PLTR', name: 'Palantir', weightPct: 5 }, { symbol: 'RBLX', name: 'Roblox', weightPct: 5 } ], website: 'https://www.ark-funds.com/funds/arkk', description: 'Active high-volatility bets on disruptive innovation.' },

  // ── Leveraged / Inverse / Options-Income ETFs ────────────────────────────────
  // Daily-reset products: strategy tags drive the Speculative risk profile and
  // the tradingRestriction disclaimer shown on registry + detail pages.
  { symbol: 'TQQQ', name: 'ProShares UltraPro QQQ',             type: 'etf', issuer: 'ProShares', category: 'us-large-growth', expenseRatioPct: 0.84, aumB: 26, referencePrice: 90, yieldPct: 1.1, inceptionYear: 2010, indexTracked: 'Nasdaq-100 (3× daily)', strategy: 'leveraged', topHoldings: [], website: 'https://www.proshares.com/our-etfs/leveraged-and-inverse/tqqq', description: '3× daily Nasdaq-100 — amplified tech exposure with daily reset.', tradingRestriction: 'Daily-reset 3× leverage: compounding makes multi-day returns diverge sharply from 3× the index. Designed for single-day tactical holds, not long-term positions.' },
  { symbol: 'SQQQ', name: 'ProShares UltraPro Short QQQ',       type: 'etf', issuer: 'ProShares', category: 'us-large-growth', expenseRatioPct: 0.95, aumB: 3, referencePrice: 22, yieldPct: null, inceptionYear: 2010, indexTracked: 'Nasdaq-100 (−3× daily)', strategy: 'inverse', topHoldings: [], website: 'https://www.proshares.com/our-etfs/leveraged-and-inverse/sqqq', description: '−3× daily Nasdaq-100 — profits when tech falls; decays when it chops.', tradingRestriction: 'Daily-reset −3× exposure: volatility drag erodes value over any multi-day hold even if the index falls. Single-day hedging instrument only.' },
  { symbol: 'UPRO', name: 'ProShares UltraPro S&P 500',         type: 'etf', issuer: 'ProShares', category: 'us-broad', expenseRatioPct: 0.91, aumB: 5, referencePrice: 95, yieldPct: null, inceptionYear: 2009, indexTracked: 'S&P 500 (3× daily)', strategy: 'leveraged', topHoldings: [], website: 'https://www.proshares.com/our-etfs/leveraged-and-inverse/upro', description: '3× daily S&P 500 with daily reset.', tradingRestriction: 'Daily-reset 3× leverage: multi-day returns diverge from 3× the index through compounding. Built for single-day tactical use.' },
  { symbol: 'SH',   name: 'ProShares Short S&P 500',            type: 'etf', issuer: 'ProShares', category: 'us-broad', expenseRatioPct: 0.88, aumB: 1.5, referencePrice: 40, yieldPct: null, inceptionYear: 2006, indexTracked: 'S&P 500 (−1× daily)', strategy: 'inverse', topHoldings: [], website: 'https://www.proshares.com/our-etfs/leveraged-and-inverse/sh', description: '−1× daily S&P 500 — the simplest index hedge.', tradingRestriction: 'Daily-reset −1× exposure: returns track the inverse of the index for one day only; longer holds drift from −1× through compounding.' },
  { symbol: 'SOXL', name: 'Direxion Daily Semiconductor Bull 3X', type: 'etf', issuer: 'Direxion', category: 'sector', focusSector: 'technology', focusIndustry: 'Semiconductors', expenseRatioPct: 0.76, aumB: 12, referencePrice: 30, yieldPct: 0.5, inceptionYear: 2010, indexTracked: 'ICE Semiconductor (3× daily)', strategy: 'leveraged', topHoldings: [], website: 'https://www.direxion.com/product/daily-semiconductor-bull-bear-3x-etfs', description: '3× daily semiconductors — among the most volatile listed ETFs.', tradingRestriction: 'Daily-reset 3× sector leverage on an already-volatile industry: multi-day holds can lose money even when semiconductors rise. Single-day instrument.' },
  { symbol: 'QYLD', name: 'Global X Nasdaq 100 Covered Call ETF', type: 'etf', issuer: 'Global X', category: 'dividend-income', expenseRatioPct: 0.61, aumB: 8, referencePrice: 18, yieldPct: 11.5, inceptionYear: 2013, indexTracked: 'Cboe Nasdaq-100 BuyWrite', strategy: 'covered-call', topHoldings: [], website: 'https://www.globalxetfs.com/funds/qyld/', description: 'Sells monthly at-the-money calls on the Nasdaq-100 for high income; upside fully capped.' },

  // ── Mutual Funds ─────────────────────────────────────────────────────────────
  { symbol: 'VTSAX', name: 'Vanguard Total Stock Market Index Admiral', type: 'mutual', issuer: 'Vanguard', category: 'us-broad', expenseRatioPct: 0.04, aumB: 1500, referencePrice: 155, yieldPct: 1.2, inceptionYear: 2000, indexTracked: 'CRSP US Total Market', topHoldings: MEGA_CAP_HOLDINGS, website: 'https://investor.vanguard.com/investment-products/mutual-funds/profile/vtsax', description: 'Mutual-fund share class of the total US market (VTI equivalent).' },
  { symbol: 'VFIAX', name: 'Vanguard 500 Index Admiral',       type: 'mutual', issuer: 'Vanguard', category: 'us-broad', expenseRatioPct: 0.04, aumB: 1300, referencePrice: 590, yieldPct: 1.2, inceptionYear: 2000, indexTracked: 'S&P 500', topHoldings: MEGA_CAP_HOLDINGS, website: 'https://investor.vanguard.com/investment-products/mutual-funds/profile/vfiax', description: 'The Bogle original — S&P 500 index mutual fund.' },
  { symbol: 'FXAIX', name: 'Fidelity 500 Index Fund',          type: 'mutual', issuer: 'Fidelity', category: 'us-broad', expenseRatioPct: 0.015, aumB: 600, referencePrice: 220, yieldPct: 1.2, inceptionYear: 1988, indexTracked: 'S&P 500', topHoldings: MEGA_CAP_HOLDINGS, website: 'https://fundresearch.fidelity.com/mutual-funds/summary/315911750', description: 'S&P 500 at 1.5 bps — among the cheapest funds anywhere.' },
  { symbol: 'VTIAX', name: 'Vanguard Total International Index Admiral', type: 'mutual', issuer: 'Vanguard', category: 'international', expenseRatioPct: 0.09, aumB: 450, referencePrice: 36, yieldPct: 2.9, inceptionYear: 2010, indexTracked: 'FTSE Global All Cap ex US', topHoldings: [], website: 'https://investor.vanguard.com/investment-products/mutual-funds/profile/vtiax', description: 'Mutual-fund share class of total international (VXUS equivalent).' },
  { symbol: 'VBTLX', name: 'Vanguard Total Bond Market Index Admiral', type: 'mutual', issuer: 'Vanguard', category: 'bond', expenseRatioPct: 0.05, aumB: 320, referencePrice: 9.7, yieldPct: 4.3, inceptionYear: 2001, indexTracked: 'Bloomberg US Aggregate Float Adjusted', topHoldings: [], website: 'https://investor.vanguard.com/investment-products/mutual-funds/profile/vbtlx', description: 'Mutual-fund share class of the total bond market (BND equivalent).' },
  { symbol: 'VWELX', name: 'Vanguard Wellington Fund',         type: 'mutual', issuer: 'Vanguard', category: 'balanced', expenseRatioPct: 0.26, aumB: 120, referencePrice: 48, yieldPct: 2.3, inceptionYear: 1929, indexTracked: null, topHoldings: [], website: 'https://investor.vanguard.com/investment-products/mutual-funds/profile/vwelx', description: 'The oldest US balanced fund — roughly 65/35 stocks and bonds, active.' },
  { symbol: 'VWINX', name: 'Vanguard Wellesley Income Fund',   type: 'mutual', issuer: 'Vanguard', category: 'balanced', expenseRatioPct: 0.23, aumB: 55, referencePrice: 27, yieldPct: 3.6, inceptionYear: 1970, indexTracked: null, topHoldings: [], website: 'https://investor.vanguard.com/investment-products/mutual-funds/profile/vwinx', description: 'Conservative 35/65 income-first balanced fund.' },
  { symbol: 'FCNTX', name: 'Fidelity Contrafund',              type: 'mutual', issuer: 'Fidelity', category: 'us-large-growth', expenseRatioPct: 0.39, aumB: 160, referencePrice: 24, yieldPct: null, inceptionYear: 1967, indexTracked: null, topHoldings: [ { symbol: 'META', name: 'Meta Platforms', weightPct: 12 }, { symbol: 'NVDA', name: 'NVIDIA', weightPct: 9 }, { symbol: 'BRK-B', name: 'Berkshire Hathaway', weightPct: 8 }, { symbol: 'MSFT', name: 'Microsoft', weightPct: 6 }, { symbol: 'AMZN', name: 'Amazon', weightPct: 6 } ], website: 'https://fundresearch.fidelity.com/mutual-funds/summary/316071109', description: 'Will Danoff’s flagship active growth fund.' },
  { symbol: 'PRGFX', name: 'T. Rowe Price Growth Stock Fund',  type: 'mutual', issuer: 'T. Rowe Price', category: 'us-large-growth', expenseRatioPct: 0.65, aumB: 55, referencePrice: 105, yieldPct: null, inceptionYear: 1950, indexTracked: null, topHoldings: [], website: 'https://www.troweprice.com/personal-investing/tools/fund-research/PRGFX', description: 'Long-running active large-growth strategy.' },
  { symbol: 'AGTHX', name: 'American Funds Growth Fund of America', type: 'mutual', issuer: 'Capital Group', category: 'us-large-growth', expenseRatioPct: 0.61, aumB: 280, referencePrice: 80, yieldPct: null, inceptionYear: 1973, indexTracked: null, topHoldings: [], website: 'https://www.capitalgroup.com/individual/investments/fund/agthx', description: 'Multi-manager active growth fund common in 401(k) plans.' },
  { symbol: 'DODGX', name: 'Dodge & Cox Stock Fund',           type: 'mutual', issuer: 'Dodge & Cox', category: 'us-large-value', expenseRatioPct: 0.51, aumB: 110, referencePrice: 265, yieldPct: 1.4, inceptionYear: 1965, indexTracked: null, topHoldings: [], website: 'https://www.dodgeandcox.com/individual-investor/us/en/our-funds/stock-fund-dodgx.html', description: 'Patient contrarian value investing since 1965.' },
  { symbol: 'PIMIX', name: 'PIMCO Income Fund (Institutional)', type: 'mutual', issuer: 'PIMCO', category: 'bond', expenseRatioPct: 0.62, aumB: 170, referencePrice: 10.4, yieldPct: 5.5, inceptionYear: 2007, indexTracked: null, topHoldings: [], website: 'https://www.pimco.com/en-us/investments/mutual-funds/income-fund/inst', description: 'Flagship multi-sector active bond income strategy.' },
]

export const FUND_BY_SYMBOL: Record<string, FundEntry> = Object.fromEntries(
  FUND_CATALOG.map((f) => [f.symbol.toUpperCase(), f])
)

export const ALL_FUND_SYMBOLS = FUND_CATALOG.map((f) => f.symbol)

export function getFund(symbol: string): FundEntry | undefined {
  return FUND_BY_SYMBOL[symbol.toUpperCase()]
}

// ─── Fee drag ─────────────────────────────────────────────────────────────────
// Projects the cost of a fund's expense ratio versus a low-cost benchmark.
// Used by the fund detail page's cost analyzer.

export interface FeeDragPoint {
  year: number
  withFee: number
  withBenchmarkFee: number
  feesPaid: number
}

export function computeFeeDrag(
  principal: number,
  expenseRatioPct: number,
  years: number,
  annualReturnPct = 7,
  benchmarkErPct = 0.03,
): FeeDragPoint[] {
  const points: FeeDragPoint[] = []
  const grossGrowth = 1 + annualReturnPct / 100
  let withFee = principal
  let withBenchmark = principal
  for (let year = 1; year <= years; year++) {
    withFee = withFee * grossGrowth * (1 - expenseRatioPct / 100)
    withBenchmark = withBenchmark * grossGrowth * (1 - benchmarkErPct / 100)
    points.push({
      year,
      withFee: Math.round(withFee),
      withBenchmarkFee: Math.round(withBenchmark),
      feesPaid: Math.round(withBenchmark - withFee),
    })
  }
  return points
}
