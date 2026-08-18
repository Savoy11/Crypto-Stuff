import type { LucideIcon } from 'lucide-react'
import {
  Flame,
  Video,
  Database,
  Star,
  Newspaper,
  MessageSquare,
  ArrowLeftRight,
  Coins,
  Search,
  TrendingUp,
  CandlestickChart,
  Briefcase,
  FlaskConical,
  Settings,
  Bot,
  Microscope,
  Wallet,
  LineChart,
  Landmark,
  Compass,
  GitCompareArrows,
  CalendarDays,
  Sunrise,
  Globe,
  Gem,
  Banknote,
  Percent,
  Network,
  Activity,
  Sigma,
  PiggyBank,
  Goal,
  ReceiptText,
} from 'lucide-react'

// ─── Suite module registry ────────────────────────────────────────────────────
// Finance Now is organised as a suite of entitlement-gated modules (see docs/ROADMAP.md).
// Each module contributes a section of sidebar navigation and owns a set of
// route prefixes. The sidebar renders from this registry filtered by the
// user's entitlements; in local dev every module is enabled by default.
//
// Rules that keep module boundaries clean:
//  1. A module's pages import shared code only from components/ui,
//     components/charts, components/markets, lib/ core, and its own folders —
//     never from another module's internals.
//  2. Cross-module data flows through /live-data or /api/v1 routes, never
//     through direct imports of another module's page code.
//  3. Every optional module's pages are wrapped in <ModuleGate module="…">, at
//     the component boundary rather than inside the page's JSX, so a disabled
//     module never mounts the page and its queries never fire.

export type ModuleId = 'core' | 'crypto' | 'equities' | 'macro' | 'funds' | 'budget' | 'retirement' | 'builder'

export interface ModuleNavItem {
  href: string
  label: string
  icon: LucideIcon
  badge?: boolean
}

export interface SuiteModule {
  id: ModuleId
  /** Sidebar section header. Empty string = no header (core section). */
  label: string
  /** Route prefixes owned by this module — used by ModuleGate. */
  routePrefixes: string[]
  /** Whether the module can be disabled. Core is always on. */
  optional: boolean
  navItems: ModuleNavItem[]
}

export const MODULES: SuiteModule[] = [
  {
    id: 'core',
    label: '',
    routePrefixes: [],
    optional: false,
    navItems: [
      { href: '/headlines', label: 'Headlines', icon: Flame },
      { href: '/videos', label: 'Videos', icon: Video },
      { href: '/brief', label: 'Daily Brief', icon: Sunrise },
      { href: '/watchlist', label: 'Watchlist', icon: Star },
      { href: '/portfolios', label: 'Portfolios', icon: Briefcase },
      { href: '/compare', label: 'Compare', icon: GitCompareArrows },
      { href: '/research', label: 'Research', icon: Microscope },
      { href: '/agent-config', label: 'AI Agents', icon: Bot },
      { href: '/settings', label: 'Integrations', icon: Settings },
      { href: '/data-sources', label: 'Data Sources', icon: Network },
    ],
  },
  {
    id: 'crypto',
    label: 'Crypto',
    routePrefixes: [
      '/assets', '/news', '/social', '/wallets',
      '/transfer-fees', '/staking', '/staking-discovery', '/coin-discovery',
      '/technical-analysis',
      // De-routed but retained page (T5): unreachable via the next.config
      // redirect, gated here so removing that redirect can't re-expose it
      // outside the entitlement (review defect D-8).
      '/global-adoption',
      // '/reserves' is gone: the page was folded into the Coins tab and the
      // route now redirects to /assets?tab=reserves (next.config.mjs). Leaving
      // the prefix here would be harmless but misleading — nothing owns it.
    ],
    optional: true,
    navItems: [
      // Deliberately no "Reserves" entry. The Reserve Transparency Monitor is
      // a tab inside Coins (/assets?tab=reserves) as of 2026-07-29 — it used to
      // be a standalone page that duplicated that tab, and was the only copy
      // carrying the provenance disclosure and the peg-mechanism fix. One
      // surface now; the shared UI lives in components/analytics/reserves.
      { href: '/assets', label: 'Coins', icon: Database },
      { href: '/news', label: 'News', icon: Newspaper },
      { href: '/social', label: 'Social', icon: MessageSquare },
      { href: '/wallets', label: 'Wallets', icon: Wallet },
      { href: '/transfer-fees', label: 'Transfer Fees', icon: ArrowLeftRight },
      { href: '/staking', label: 'Staking', icon: Coins },
      { href: '/staking-discovery', label: 'Staking Discovery', icon: TrendingUp },
      { href: '/coin-discovery', label: 'Coin Discovery', icon: Search },
      { href: '/technical-analysis', label: 'Technical Analysis', icon: CandlestickChart },
    ],
  },
  {
    id: 'equities',
    label: 'Equities',
    routePrefixes: ['/equities'],
    optional: true,
    navItems: [
      { href: '/equities', label: 'Stock Registry', icon: LineChart },
      { href: '/equities/news', label: 'Market News', icon: Newspaper },
      { href: '/equities/social', label: 'Stock Social', icon: MessageSquare },
      { href: '/equities/technical-analysis', label: 'Technical Analysis', icon: CandlestickChart },
      { href: '/equities/options', label: 'Options Scorer', icon: Sigma },
      { href: '/equities/backtests', label: 'Backtests', icon: FlaskConical },
      { href: '/equities/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    // Bonds/rates, commodities, and fiat — owner spec in docs/ROADMAP.md
    // ("Macro Markets"). Scaffolded 2026-07 with a live overview page; the
    // three per-area toolsets build out commodities → currencies → rates.
    id: 'macro',
    label: 'Macro Markets',
    routePrefixes: ['/macro'],
    optional: true,
    navItems: [
      { href: '/macro', label: 'Macro Overview', icon: Globe },
      { href: '/macro/news', label: 'Macro News', icon: Newspaper },
      { href: '/macro/commodities', label: 'Commodities', icon: Gem },
      { href: '/macro/currencies', label: 'Currencies', icon: Banknote },
      { href: '/macro/rates', label: 'Bonds & Rates', icon: Percent },
      { href: '/macro/technical-analysis', label: 'Macro TA', icon: Activity },
    ],
  },
  {
    // Premium module — sold under its own entitlement (separate fee).
    //
    // Ordered above ETFs & Funds by owner decision (2026-08-15, P3-W2 intake).
    // It previously sat last on the reasoning that it is the upsell and builds
    // on the catalogs below it; the ordering now leads with the tool rather
    // than the reference data it consumes.
    id: 'builder',
    label: 'Portfolio Builder',
    routePrefixes: ['/portfolio-builder'],
    optional: true,
    navItems: [
      { href: '/portfolio-builder', label: 'Portfolio Builder', icon: Compass },
    ],
  },
  {
    id: 'funds',
    label: 'ETFs & Funds',
    routePrefixes: ['/funds'],
    optional: true,
    navItems: [
      { href: '/funds', label: 'Fund Registry', icon: Landmark },
    ],
  },
  {
    // Personal-finance pillar, phase 2 of docs/ROADMAP.md: accounts, manual +
    // CSV-imported transactions, rule-based categorization, monthly budgets
    // vs actuals. All user data in Postgres via /api/user/budget/* — no
    // external providers, so these pages carry no SourceLine.
    id: 'budget',
    label: 'Budget',
    routePrefixes: ['/budget'],
    optional: true,
    navItems: [
      { href: '/budget', label: 'Budget', icon: PiggyBank },
      { href: '/budget/transactions', label: 'Transactions', icon: ReceiptText },
    ],
  },
  {
    // Personal-finance pillar: accumulation projection to a target retirement
    // age, drawdown to a plan-to age, and the loan/credit-card calculators that
    // sat alongside it in the owner's planning spreadsheet. Pure engine in
    // lib/retirement/ — nothing is fetched, so no SourceLine; the IRS
    // contribution limits carry provenance like any other curated table.
    id: 'retirement',
    label: 'Retirement',
    routePrefixes: ['/retirement'],
    optional: true,
    navItems: [
      { href: '/retirement', label: 'Retirement Planner', icon: Goal },
    ],
  },
]

export const OPTIONAL_MODULES = MODULES.filter((m) => m.optional)

export function moduleForPath(pathname: string): SuiteModule | undefined {
  return MODULES.find((m) => m.routePrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
}
