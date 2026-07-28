// Central data file for the Equities module.
// Same layer as transferFees.ts / stakingProviders.ts — pure data, no API calls.
//
// referencePrice / marketCapB / peRatio / dividendYieldPct / beta are
// APPROXIMATE reference values, compiled 2026-07-07 (see EQUITY_REFERENCE_AS_OF
// below). Live quotes from /live-data/security-quotes override price and change
// whenever a source is reachable; the reference values keep every page
// rendering offline.
//
// These drift, and visibly: NVDA's marketCapB was written at 4300 and is not
// re-checked on a schedule. That is tolerable ONLY because two things hold —
// live quotes win whenever reachable, and anything still showing a reference
// value is tagged with an amber `ref` badge in the UI. Do not add a surface
// that renders these numbers without that tag.
//
// Dated with a machine-readable constant rather than the prose "early 2026"
// it used to carry, so consumers can compute the age instead of guessing at it.
export const EQUITY_REFERENCE_AS_OF = '2026-07-07'
//
// Symbols use Yahoo Finance notation (BRK-B, not BRK.B) so one symbol string
// works across every live source (Yahoo, FMP).

export type SectorId =
  | 'technology'
  | 'communication-services'
  | 'consumer-discretionary'
  | 'consumer-staples'
  | 'financials'
  | 'healthcare'
  | 'energy'
  | 'industrials'
  | 'materials'
  | 'utilities'
  | 'real-estate'
  | 'other'

export const SECTOR_INFO: Record<SectorId, { label: string; color: string }> = {
  'technology':             { label: 'Technology',            color: '#3b82f6' },
  'communication-services': { label: 'Communication',         color: '#8b5cf6' },
  'consumer-discretionary': { label: 'Consumer Discretionary', color: '#ec4899' },
  'consumer-staples':       { label: 'Consumer Staples',      color: '#22c55e' },
  'financials':             { label: 'Financials',            color: '#f59e0b' },
  'healthcare':             { label: 'Healthcare',            color: '#06b6d4' },
  'energy':                 { label: 'Energy',                color: '#f97316' },
  'industrials':            { label: 'Industrials',           color: '#64748b' },
  'materials':              { label: 'Materials',             color: '#a16207' },
  'utilities':              { label: 'Utilities',             color: '#eab308' },
  'real-estate':            { label: 'Real Estate',           color: '#14b8a6' },
  'other':                  { label: 'Other',                 color: '#94a3b8' },
}

/** Map an FMP / free-form sector string onto our SectorId (fallback: 'other'). */
export function mapSectorName(raw: string | null | undefined): SectorId {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'technology':                                   return 'technology'
    case 'communication services':                       return 'communication-services'
    case 'consumer cyclical': case 'consumer discretionary': return 'consumer-discretionary'
    case 'consumer defensive': case 'consumer staples':  return 'consumer-staples'
    case 'financial services': case 'financial': case 'financials': return 'financials'
    case 'healthcare': case 'health care':               return 'healthcare'
    case 'energy':                                       return 'energy'
    case 'industrials': case 'industrial goods':         return 'industrials'
    case 'basic materials': case 'materials':            return 'materials'
    case 'utilities':                                    return 'utilities'
    case 'real estate':                                  return 'real-estate'
    default:                                             return 'other'
  }
}

export interface EquityEntry {
  /** Yahoo-style ticker, also the route param (lowercased). */
  symbol: string
  name: string
  sector: SectorId
  industry: string
  /** Approximate market cap in billions USD — reference only. */
  marketCapB: number
  /** Approximate share price USD — overridden by live quotes. */
  referencePrice: number
  /** Trailing P/E; null for unprofitable or not meaningful. */
  peRatio: number | null
  /** Annual dividend yield in percent; null = no dividend. */
  dividendYieldPct: number | null
  /** 5y beta vs S&P 500. */
  beta: number
  description: string
  website: string
}

/**
 * SEC EDGAR filings browser URL for a catalog symbol. EDGAR resolves tickers
 * directly (including dashed ones like BRK-B), so no CIK table is needed.
 * Pass a form type ('10-K', '10-Q', 'DEF 14A', …) to pre-filter, or omit for
 * all filings.
 */
export function secFilingsUrl(symbol: string, formType = ''): string {
  const params = new URLSearchParams({
    action: 'getcompany',
    CIK: symbol,
    type: formType,
    dateb: '',
    owner: 'include',
    count: '40',
  })
  return `https://www.sec.gov/cgi-bin/browse-edgar?${params.toString()}`
}

export const EQUITY_CATALOG: EquityEntry[] = [
  // ── Technology ───────────────────────────────────────────────────────────────
  { symbol: 'AAPL',  name: 'Apple',                sector: 'technology', industry: 'Consumer Electronics',      marketCapB: 3900, referencePrice: 255, peRatio: 39,  dividendYieldPct: 0.4,  beta: 1.1,  description: 'Designs iPhone, Mac, and wearables with a fast-growing services ecosystem.', website: 'https://www.apple.com' },
  { symbol: 'MSFT',  name: 'Microsoft',            sector: 'technology', industry: 'Software — Infrastructure', marketCapB: 3300, referencePrice: 445, peRatio: 34,  dividendYieldPct: 0.7,  beta: 0.9,  description: 'Cloud (Azure), productivity software, and AI infrastructure leader.', website: 'https://www.microsoft.com' },
  { symbol: 'NVDA',  name: 'NVIDIA',               sector: 'technology', industry: 'Semiconductors',            marketCapB: 4300, referencePrice: 178, peRatio: 48,  dividendYieldPct: 0.02, beta: 1.7,  description: 'Dominant AI accelerator and GPU designer powering data-center compute.', website: 'https://www.nvidia.com' },
  { symbol: 'AVGO',  name: 'Broadcom',             sector: 'technology', industry: 'Semiconductors',            marketCapB: 1600, referencePrice: 340, peRatio: 38,  dividendYieldPct: 0.7,  beta: 1.2,  description: 'Custom AI silicon, networking chips, and infrastructure software (VMware).', website: 'https://www.broadcom.com' },
  { symbol: 'ORCL',  name: 'Oracle',               sector: 'technology', industry: 'Software — Infrastructure', marketCapB: 620,  referencePrice: 220, peRatio: 38,  dividendYieldPct: 0.9,  beta: 1.0,  description: 'Database giant repositioned as an AI-era cloud infrastructure provider.', website: 'https://www.oracle.com' },
  { symbol: 'CRM',   name: 'Salesforce',           sector: 'technology', industry: 'Software — Application',    marketCapB: 250,  referencePrice: 260, peRatio: 40,  dividendYieldPct: 0.6,  beta: 1.3,  description: 'Leading CRM platform expanding into AI agents (Agentforce).', website: 'https://www.salesforce.com' },
  { symbol: 'AMD',   name: 'Advanced Micro Devices', sector: 'technology', industry: 'Semiconductors',          marketCapB: 340,  referencePrice: 210, peRatio: 95,  dividendYieldPct: null, beta: 1.7,  description: 'CPU and GPU designer, the main challenger in AI accelerators.', website: 'https://www.amd.com' },
  { symbol: 'ADBE',  name: 'Adobe',                sector: 'technology', industry: 'Software — Application',    marketCapB: 150,  referencePrice: 350, peRatio: 23,  dividendYieldPct: null, beta: 1.3,  description: 'Creative and document software with Firefly generative AI.', website: 'https://www.adobe.com' },
  { symbol: 'CSCO',  name: 'Cisco Systems',        sector: 'technology', industry: 'Networking',                marketCapB: 290,  referencePrice: 73,  peRatio: 27,  dividendYieldPct: 2.2,  beta: 0.8,  description: 'Enterprise networking, security, and observability (Splunk).', website: 'https://www.cisco.com' },
  { symbol: 'INTC',  name: 'Intel',                sector: 'technology', industry: 'Semiconductors',            marketCapB: 160,  referencePrice: 37,  peRatio: null, dividendYieldPct: null, beta: 1.1, description: 'x86 incumbent rebuilding around foundry services and AI PCs.', website: 'https://www.intel.com' },
  { symbol: 'QCOM',  name: 'Qualcomm',             sector: 'technology', industry: 'Semiconductors',            marketCapB: 190,  referencePrice: 175, peRatio: 17,  dividendYieldPct: 2.0,  beta: 1.2,  description: 'Mobile SoC and modem leader diversifying into automotive and IoT.', website: 'https://www.qualcomm.com' },
  { symbol: 'TXN',   name: 'Texas Instruments',    sector: 'technology', industry: 'Semiconductors',            marketCapB: 180,  referencePrice: 200, peRatio: 34,  dividendYieldPct: 2.7,  beta: 1.0,  description: 'Analog and embedded chips across industrial and automotive markets.', website: 'https://www.ti.com' },
  { symbol: 'IBM',   name: 'IBM',                  sector: 'technology', industry: 'IT Services',               marketCapB: 270,  referencePrice: 290, peRatio: 30,  dividendYieldPct: 2.3,  beta: 0.7,  description: 'Hybrid cloud (Red Hat), consulting, and watsonx enterprise AI.', website: 'https://www.ibm.com' },
  { symbol: 'NOW',   name: 'ServiceNow',           sector: 'technology', industry: 'Software — Application',    marketCapB: 200,  referencePrice: 950, peRatio: 130, dividendYieldPct: null, beta: 1.1,  description: 'Enterprise workflow automation platform with strong AI attach.', website: 'https://www.servicenow.com' },
  { symbol: 'PLTR',  name: 'Palantir Technologies', sector: 'technology', industry: 'Software — Application',   marketCapB: 430,  referencePrice: 180, peRatio: 250, dividendYieldPct: null, beta: 2.6,  description: 'Data-integration and AI platforms for government and enterprise.', website: 'https://www.palantir.com' },

  // ── Communication Services ───────────────────────────────────────────────────
  { symbol: 'GOOGL', name: 'Alphabet',             sector: 'communication-services', industry: 'Internet Content', marketCapB: 2900, referencePrice: 240, peRatio: 27, dividendYieldPct: 0.3, beta: 1.0, description: 'Search, YouTube, Google Cloud, and Gemini AI models.', website: 'https://abc.xyz' },
  { symbol: 'META',  name: 'Meta Platforms',       sector: 'communication-services', industry: 'Internet Content', marketCapB: 1700, referencePrice: 680, peRatio: 27, dividendYieldPct: 0.3, beta: 1.2, description: 'Facebook, Instagram, WhatsApp, and open-weight Llama AI models.', website: 'https://investor.atmeta.com' },
  { symbol: 'NFLX',  name: 'Netflix',              sector: 'communication-services', industry: 'Entertainment',    marketCapB: 470,  referencePrice: 1100, peRatio: 45, dividendYieldPct: null, beta: 1.3, description: 'Global streaming leader with a growing ads tier and live events.', website: 'https://www.netflix.com' },
  { symbol: 'DIS',   name: 'Walt Disney',          sector: 'communication-services', industry: 'Entertainment',    marketCapB: 210,  referencePrice: 115, peRatio: 20, dividendYieldPct: 0.9,  beta: 1.2, description: 'Parks, film studios, ESPN, and the Disney+ streaming bundle.', website: 'https://www.thewaltdisneycompany.com' },
  { symbol: 'TMUS',  name: 'T-Mobile US',          sector: 'communication-services', industry: 'Telecom',          marketCapB: 280,  referencePrice: 245, peRatio: 22, dividendYieldPct: 1.4,  beta: 0.6, description: 'US wireless carrier with the leading 5G network position.', website: 'https://www.t-mobile.com' },
  { symbol: 'VZ',    name: 'Verizon',              sector: 'communication-services', industry: 'Telecom',          marketCapB: 180,  referencePrice: 43,  peRatio: 10, dividendYieldPct: 6.2,  beta: 0.4, description: 'US telecom income staple with heavy fiber and 5G investment.', website: 'https://www.verizon.com' },
  { symbol: 'T',     name: 'AT&T',                 sector: 'communication-services', industry: 'Telecom',          marketCapB: 170,  referencePrice: 24,  peRatio: 12, dividendYieldPct: 4.6,  beta: 0.6, description: 'Streamlined telecom focused on 5G wireless and fiber broadband.', website: 'https://www.att.com' },

  // ── Consumer Discretionary ───────────────────────────────────────────────────
  { symbol: 'AMZN',  name: 'Amazon',               sector: 'consumer-discretionary', industry: 'Internet Retail', marketCapB: 2400, referencePrice: 230, peRatio: 36, dividendYieldPct: null, beta: 1.2, description: 'E-commerce, AWS cloud, advertising, and logistics at global scale.', website: 'https://www.amazon.com' },
  { symbol: 'TSLA',  name: 'Tesla',                sector: 'consumer-discretionary', industry: 'Auto Manufacturers', marketCapB: 1300, referencePrice: 410, peRatio: 200, dividendYieldPct: null, beta: 2.3, description: 'EVs, energy storage, and autonomy/robotaxi ambitions.', website: 'https://www.tesla.com' },
  { symbol: 'HD',    name: 'Home Depot',           sector: 'consumer-discretionary', industry: 'Home Improvement', marketCapB: 400,  referencePrice: 400, peRatio: 27, dividendYieldPct: 2.3, beta: 1.0, description: 'Largest home-improvement retailer, levered to housing turnover.', website: 'https://www.homedepot.com' },
  { symbol: 'MCD',   name: "McDonald's",           sector: 'consumer-discretionary', industry: 'Restaurants',     marketCapB: 220,  referencePrice: 305, peRatio: 26, dividendYieldPct: 2.3, beta: 0.7, description: 'Global franchised quick-service restaurant royalty machine.', website: 'https://www.mcdonalds.com' },
  { symbol: 'NKE',   name: 'Nike',                 sector: 'consumer-discretionary', industry: 'Footwear & Apparel', marketCapB: 110, referencePrice: 75, peRatio: 34, dividendYieldPct: 2.1, beta: 1.1, description: 'Global athletic footwear brand working through a turnaround.', website: 'https://www.nike.com' },
  { symbol: 'SBUX',  name: 'Starbucks',            sector: 'consumer-discretionary', industry: 'Restaurants',     marketCapB: 110,  referencePrice: 95,  peRatio: 30, dividendYieldPct: 2.6, beta: 1.0, description: 'Premium coffee chain executing a "back to Starbucks" reset.', website: 'https://www.starbucks.com' },
  { symbol: 'LOW',   name: "Lowe's",               sector: 'consumer-discretionary', industry: 'Home Improvement', marketCapB: 150,  referencePrice: 270, peRatio: 22, dividendYieldPct: 1.7, beta: 1.1, description: 'Second-largest home-improvement retailer with pro-customer push.', website: 'https://www.lowes.com' },
  { symbol: 'BKNG',  name: 'Booking Holdings',     sector: 'consumer-discretionary', industry: 'Travel Services',  marketCapB: 170,  referencePrice: 5200, peRatio: 28, dividendYieldPct: 0.7, beta: 1.3, description: 'Booking.com, Priceline, and OpenTable online travel platforms.', website: 'https://www.bookingholdings.com' },

  // ── Consumer Staples ─────────────────────────────────────────────────────────
  { symbol: 'WMT',   name: 'Walmart',              sector: 'consumer-staples', industry: 'Discount Stores',  marketCapB: 830, referencePrice: 103, peRatio: 40, dividendYieldPct: 0.9, beta: 0.7, description: 'Largest retailer, gaining share via grocery, e-commerce, and ads.', website: 'https://www.walmart.com' },
  { symbol: 'PG',    name: 'Procter & Gamble',     sector: 'consumer-staples', industry: 'Household Products', marketCapB: 390, referencePrice: 165, peRatio: 25, dividendYieldPct: 2.5, beta: 0.4, description: 'Consumer staples powerhouse (Tide, Pampers, Gillette).', website: 'https://www.pg.com' },
  { symbol: 'KO',    name: 'Coca-Cola',            sector: 'consumer-staples', industry: 'Beverages',        marketCapB: 300, referencePrice: 70,  peRatio: 27, dividendYieldPct: 2.8, beta: 0.6, description: 'Global beverage brand portfolio with a 60+ year dividend streak.', website: 'https://www.coca-colacompany.com' },
  { symbol: 'PEP',   name: 'PepsiCo',              sector: 'consumer-staples', industry: 'Beverages & Snacks', marketCapB: 210, referencePrice: 152, peRatio: 22, dividendYieldPct: 3.6, beta: 0.5, description: 'Snacks (Frito-Lay) and beverages with pricing-power resilience.', website: 'https://www.pepsico.com' },
  { symbol: 'COST',  name: 'Costco Wholesale',     sector: 'consumer-staples', industry: 'Discount Stores',  marketCapB: 420, referencePrice: 950, peRatio: 52, dividendYieldPct: 0.5, beta: 0.8, description: 'Membership warehouse club with best-in-class customer loyalty.', website: 'https://www.costco.com' },
  { symbol: 'PM',    name: 'Philip Morris Intl',   sector: 'consumer-staples', industry: 'Tobacco',          marketCapB: 250, referencePrice: 160, peRatio: 22, dividendYieldPct: 3.4, beta: 0.6, description: 'Smoke-free transition leader (IQOS, ZYN) with global reach.', website: 'https://www.pmi.com' },
  { symbol: 'MDLZ',  name: 'Mondelez',             sector: 'consumer-staples', industry: 'Confectioners',    marketCapB: 80,  referencePrice: 62,  peRatio: 20, dividendYieldPct: 3.1, beta: 0.5, description: 'Global snacking (Oreo, Cadbury) with emerging-market exposure.', website: 'https://www.mondelezinternational.com' },

  // ── Financials ───────────────────────────────────────────────────────────────
  { symbol: 'BRK-B', name: 'Berkshire Hathaway',   sector: 'financials', industry: 'Diversified Holding', marketCapB: 1050, referencePrice: 487, peRatio: 12, dividendYieldPct: null, beta: 0.9, description: 'Buffett-built conglomerate: insurance, railroads, energy, equities.', website: 'https://www.berkshirehathaway.com' },
  { symbol: 'JPM',   name: 'JPMorgan Chase',       sector: 'financials', industry: 'Banks — Diversified', marketCapB: 830,  referencePrice: 300, peRatio: 14, dividendYieldPct: 1.9, beta: 1.1, description: 'Largest US bank spanning consumer, investment banking, and markets.', website: 'https://www.jpmorganchase.com' },
  { symbol: 'V',     name: 'Visa',                 sector: 'financials', industry: 'Payments',            marketCapB: 630,  referencePrice: 330, peRatio: 30, dividendYieldPct: 0.7, beta: 1.0, description: 'Global card network earning a toll on digital payments volume.', website: 'https://www.visa.com' },
  { symbol: 'MA',    name: 'Mastercard',           sector: 'financials', industry: 'Payments',            marketCapB: 520,  referencePrice: 570, peRatio: 35, dividendYieldPct: 0.5, beta: 1.1, description: 'Second global payments network with value-added services growth.', website: 'https://www.mastercard.com' },
  { symbol: 'BAC',   name: 'Bank of America',      sector: 'financials', industry: 'Banks — Diversified', marketCapB: 350,  referencePrice: 47,  peRatio: 13, dividendYieldPct: 2.2, beta: 1.3, description: 'Second-largest US bank with rate-sensitive deposit franchise.', website: 'https://www.bankofamerica.com' },
  { symbol: 'WFC',   name: 'Wells Fargo',          sector: 'financials', industry: 'Banks — Diversified', marketCapB: 260,  referencePrice: 80,  peRatio: 14, dividendYieldPct: 2.0, beta: 1.2, description: 'US retail-heavy bank freed from its regulatory asset cap.', website: 'https://www.wellsfargo.com' },
  { symbol: 'GS',    name: 'Goldman Sachs',        sector: 'financials', industry: 'Capital Markets',     marketCapB: 220,  referencePrice: 700, peRatio: 16, dividendYieldPct: 1.7, beta: 1.4, description: 'Premier investment bank and trading house.', website: 'https://www.goldmansachs.com' },
  { symbol: 'MS',    name: 'Morgan Stanley',       sector: 'financials', industry: 'Capital Markets',     marketCapB: 220,  referencePrice: 140, peRatio: 17, dividendYieldPct: 2.6, beta: 1.3, description: 'Wealth-management-led bank with markets and IB franchises.', website: 'https://www.morganstanley.com' },
  { symbol: 'AXP',   name: 'American Express',     sector: 'financials', industry: 'Credit Services',     marketCapB: 230,  referencePrice: 330, peRatio: 22, dividendYieldPct: 1.0, beta: 1.2, description: 'Premium closed-loop card network with affluent customer base.', website: 'https://www.americanexpress.com' },
  { symbol: 'BLK',   name: 'BlackRock',            sector: 'financials', industry: 'Asset Management',    marketCapB: 170,  referencePrice: 1100, peRatio: 25, dividendYieldPct: 1.9, beta: 1.3, description: 'World’s largest asset manager; iShares ETF and Aladdin platforms.', website: 'https://www.blackrock.com' },
  { symbol: 'C',     name: 'Citigroup',            sector: 'financials', industry: 'Banks — Diversified', marketCapB: 160,  referencePrice: 87,  peRatio: 12, dividendYieldPct: 2.6, beta: 1.4, description: 'Global bank simplifying around services, markets, and US retail.', website: 'https://www.citigroup.com' },

  // ── Healthcare ───────────────────────────────────────────────────────────────
  { symbol: 'LLY',   name: 'Eli Lilly',            sector: 'healthcare', industry: 'Drug Manufacturers', marketCapB: 730, referencePrice: 810, peRatio: 45, dividendYieldPct: 0.8, beta: 0.4, description: 'GLP-1 (Mounjaro/Zepbound) leader with deep obesity pipeline.', website: 'https://www.lilly.com' },
  { symbol: 'UNH',   name: 'UnitedHealth Group',   sector: 'healthcare', industry: 'Healthcare Plans',   marketCapB: 320, referencePrice: 350, peRatio: 14, dividendYieldPct: 2.4, beta: 0.6, description: 'Largest US health insurer plus Optum care and data services.', website: 'https://www.unitedhealthgroup.com' },
  { symbol: 'JNJ',   name: 'Johnson & Johnson',    sector: 'healthcare', industry: 'Drug Manufacturers', marketCapB: 400, referencePrice: 165, peRatio: 18, dividendYieldPct: 3.0, beta: 0.5, description: 'Pharma and medtech blue chip with 60+ years of dividend growth.', website: 'https://www.jnj.com' },
  { symbol: 'ABBV',  name: 'AbbVie',               sector: 'healthcare', industry: 'Drug Manufacturers', marketCapB: 380, referencePrice: 215, peRatio: 17, dividendYieldPct: 3.1, beta: 0.6, description: 'Immunology franchise (Skyrizi, Rinvoq) past the Humira cliff.', website: 'https://www.abbvie.com' },
  { symbol: 'MRK',   name: 'Merck',                sector: 'healthcare', industry: 'Drug Manufacturers', marketCapB: 250, referencePrice: 100, peRatio: 13, dividendYieldPct: 3.2, beta: 0.4, description: 'Keytruda oncology leader managing patent-expiry transition.', website: 'https://www.merck.com' },
  { symbol: 'TMO',   name: 'Thermo Fisher',        sector: 'healthcare', industry: 'Diagnostics & Research', marketCapB: 210, referencePrice: 560, peRatio: 27, dividendYieldPct: 0.3, beta: 0.8, description: 'Life-science tools and services for pharma R&D and diagnostics.', website: 'https://www.thermofisher.com' },
  { symbol: 'ABT',   name: 'Abbott Laboratories',  sector: 'healthcare', industry: 'Medical Devices',    marketCapB: 230, referencePrice: 132, peRatio: 25, dividendYieldPct: 1.8, beta: 0.7, description: 'Diversified medtech; FreeStyle Libre glucose monitoring growth.', website: 'https://www.abbott.com' },
  { symbol: 'PFE',   name: 'Pfizer',               sector: 'healthcare', industry: 'Drug Manufacturers', marketCapB: 150, referencePrice: 26,  peRatio: 9,  dividendYieldPct: 6.5, beta: 0.6, description: 'Big pharma rebuilding growth post-COVID with oncology focus.', website: 'https://www.pfizer.com' },
  { symbol: 'AMGN',  name: 'Amgen',                sector: 'healthcare', industry: 'Biotechnology',      marketCapB: 160, referencePrice: 300, peRatio: 15, dividendYieldPct: 3.2, beta: 0.6, description: 'Large-cap biotech with obesity candidate MariTide in development.', website: 'https://www.amgen.com' },
  { symbol: 'ISRG',  name: 'Intuitive Surgical',   sector: 'healthcare', industry: 'Medical Instruments', marketCapB: 190, referencePrice: 530, peRatio: 60, dividendYieldPct: null, beta: 1.3, description: 'Da Vinci robotic-surgery monopoly with recurring instrument sales.', website: 'https://www.intuitive.com' },

  // ── Energy ───────────────────────────────────────────────────────────────────
  { symbol: 'XOM',   name: 'Exxon Mobil',          sector: 'energy', industry: 'Oil & Gas Integrated', marketCapB: 490, referencePrice: 115, peRatio: 14, dividendYieldPct: 3.4, beta: 0.9, description: 'Largest US oil major; Permian and Guyana production growth.', website: 'https://corporate.exxonmobil.com' },
  { symbol: 'CVX',   name: 'Chevron',              sector: 'energy', industry: 'Oil & Gas Integrated', marketCapB: 280, referencePrice: 160, peRatio: 15, dividendYieldPct: 4.1, beta: 1.0, description: 'Integrated major with Hess acquisition and strong balance sheet.', website: 'https://www.chevron.com' },
  { symbol: 'COP',   name: 'ConocoPhillips',       sector: 'energy', industry: 'Oil & Gas E&P',        marketCapB: 130, referencePrice: 105, peRatio: 13, dividendYieldPct: 3.0, beta: 1.2, description: 'Pure-play E&P with low-cost shale and LNG expansion.', website: 'https://www.conocophillips.com' },
  { symbol: 'SLB',   name: 'SLB (Schlumberger)',   sector: 'energy', industry: 'Oil & Gas Services',   marketCapB: 55,  referencePrice: 40,  peRatio: 12, dividendYieldPct: 2.9, beta: 1.4, description: 'Global oilfield services and digital subsurface leader.', website: 'https://www.slb.com' },

  // ── Industrials ──────────────────────────────────────────────────────────────
  { symbol: 'CAT',   name: 'Caterpillar',          sector: 'industrials', industry: 'Farm & Heavy Machinery', marketCapB: 260, referencePrice: 550, peRatio: 25, dividendYieldPct: 1.1, beta: 1.1, description: 'Construction and mining equipment; data-center power tailwind.', website: 'https://www.caterpillar.com' },
  { symbol: 'GE',    name: 'GE Aerospace',         sector: 'industrials', industry: 'Aerospace & Defense',   marketCapB: 320, referencePrice: 300, peRatio: 38, dividendYieldPct: 0.5, beta: 1.2, description: 'Jet-engine pure play with lucrative service aftermarket.', website: 'https://www.geaerospace.com' },
  { symbol: 'HON',   name: 'Honeywell',            sector: 'industrials', industry: 'Conglomerates',         marketCapB: 150, referencePrice: 230, peRatio: 24, dividendYieldPct: 2.0, beta: 1.0, description: 'Aerospace, automation, and materials; splitting into three companies.', website: 'https://www.honeywell.com' },
  { symbol: 'UPS',   name: 'United Parcel Service', sector: 'industrials', industry: 'Integrated Freight',   marketCapB: 90,  referencePrice: 105, peRatio: 15, dividendYieldPct: 6.2, beta: 1.0, description: 'Parcel logistics network resetting cost base amid volume shifts.', website: 'https://www.ups.com' },
  { symbol: 'BA',    name: 'Boeing',               sector: 'industrials', industry: 'Aerospace & Defense',   marketCapB: 160, referencePrice: 210, peRatio: null, dividendYieldPct: null, beta: 1.5, description: 'Commercial aircraft duopolist working through production recovery.', website: 'https://www.boeing.com' },
  { symbol: 'DE',    name: 'Deere & Company',      sector: 'industrials', industry: 'Farm & Heavy Machinery', marketCapB: 130, referencePrice: 480, peRatio: 20, dividendYieldPct: 1.3, beta: 1.0, description: 'Precision agriculture equipment with autonomy roadmap.', website: 'https://www.deere.com' },
  { symbol: 'LMT',   name: 'Lockheed Martin',      sector: 'industrials', industry: 'Aerospace & Defense',   marketCapB: 110, referencePrice: 470, peRatio: 17, dividendYieldPct: 2.8, beta: 0.4, description: 'Largest defense prime; F-35, missiles, and space systems.', website: 'https://www.lockheedmartin.com' },
  { symbol: 'RTX',   name: 'RTX',                  sector: 'industrials', industry: 'Aerospace & Defense',   marketCapB: 200, referencePrice: 150, peRatio: 26, dividendYieldPct: 1.7, beta: 0.7, description: 'Pratt & Whitney engines plus Raytheon defense systems.', website: 'https://www.rtx.com' },

  // ── Materials ────────────────────────────────────────────────────────────────
  { symbol: 'LIN',   name: 'Linde',                sector: 'materials', industry: 'Industrial Gases', marketCapB: 210, referencePrice: 450, peRatio: 30, dividendYieldPct: 1.3, beta: 0.9, description: 'Global industrial-gas leader with clean-hydrogen optionality.', website: 'https://www.linde.com' },
  { symbol: 'SHW',   name: 'Sherwin-Williams',     sector: 'materials', industry: 'Specialty Chemicals', marketCapB: 90, referencePrice: 360, peRatio: 31, dividendYieldPct: 0.8, beta: 1.1, description: 'Paint and coatings leader levered to housing and pro contractors.', website: 'https://www.sherwin-williams.com' },
  { symbol: 'FCX',   name: 'Freeport-McMoRan',     sector: 'materials', industry: 'Copper',           marketCapB: 60,  referencePrice: 42,  peRatio: 25, dividendYieldPct: 1.4, beta: 1.9, description: 'Major copper producer levered to electrification demand.', website: 'https://www.fcx.com' },

  // ── Utilities ────────────────────────────────────────────────────────────────
  { symbol: 'NEE',   name: 'NextEra Energy',       sector: 'utilities', industry: 'Regulated Electric', marketCapB: 160, referencePrice: 78, peRatio: 22, dividendYieldPct: 2.9, beta: 0.6, description: 'Largest US utility and renewables developer; data-center demand.', website: 'https://www.nexteraenergy.com' },
  { symbol: 'DUK',   name: 'Duke Energy',          sector: 'utilities', industry: 'Regulated Electric', marketCapB: 95,  referencePrice: 122, peRatio: 20, dividendYieldPct: 3.4, beta: 0.4, description: 'Southeast regulated utility with grid-modernisation capex.', website: 'https://www.duke-energy.com' },
  { symbol: 'SO',    name: 'Southern Company',     sector: 'utilities', industry: 'Regulated Electric', marketCapB: 100, referencePrice: 92,  peRatio: 21, dividendYieldPct: 3.1, beta: 0.4, description: 'Regulated utility with new Vogtle nuclear capacity online.', website: 'https://www.southerncompany.com' },

  // ── Real Estate ──────────────────────────────────────────────────────────────
  { symbol: 'PLD',   name: 'Prologis',             sector: 'real-estate', industry: 'Industrial REIT', marketCapB: 105, referencePrice: 115, peRatio: 30, dividendYieldPct: 3.5, beta: 1.1, description: 'Global logistics warehouse REIT serving e-commerce supply chains.', website: 'https://www.prologis.com' },
  { symbol: 'AMT',   name: 'American Tower',       sector: 'real-estate', industry: 'Specialty REIT',  marketCapB: 95,  referencePrice: 205, peRatio: 40, dividendYieldPct: 3.3, beta: 0.8, description: 'Global cell-tower REIT with data-center exposure via CoreSite.', website: 'https://www.americantower.com' },
  { symbol: 'O',     name: 'Realty Income',        sector: 'real-estate', industry: 'Retail REIT',     marketCapB: 50,  referencePrice: 57,  peRatio: 55, dividendYieldPct: 5.6, beta: 0.8, description: '"The Monthly Dividend Company" — triple-net retail REIT.', website: 'https://www.realtyincome.com' },
]

export const EQUITY_BY_SYMBOL: Record<string, EquityEntry> = Object.fromEntries(
  EQUITY_CATALOG.map((e) => [e.symbol.toUpperCase(), e])
)

export const ALL_EQUITY_SYMBOLS = EQUITY_CATALOG.map((e) => e.symbol)

export function getEquity(symbol: string): EquityEntry | undefined {
  return EQUITY_BY_SYMBOL[symbol.toUpperCase()]
}
