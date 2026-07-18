import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Database,
  Star,
  Newspaper,
  MessageSquare,
  Globe,
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
} from 'lucide-react'

// ─── Suite module registry ────────────────────────────────────────────────────
// CAEP is organised as a suite of entitlement-gated modules (see docs/ROADMAP.md).
// Each module contributes a section of sidebar navigation and owns a set of
// route prefixes. The sidebar renders from this registry filtered by the
// user's entitlements; in local dev every module is enabled by default.
//
// Rules that keep module boundaries clean:
//  1. A module's pages import shared code only from components/ui,
//     components/charts, lib/ core, and its own folders — never from another
//     module's internals.
//  2. Cross-module data flows through /live-data or /api/v1 routes, never
//     through direct imports of another module's page code.

export type ModuleId = 'core' | 'crypto' | 'equities' | 'funds' | 'builder'

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
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/brief', label: 'Daily Brief', icon: Sunrise },
      { href: '/watchlist', label: 'Watchlist', icon: Star },
      { href: '/portfolios', label: 'Portfolios', icon: Briefcase },
      { href: '/compare', label: 'Compare', icon: GitCompareArrows },
      { href: '/research', label: 'Research', icon: Microscope },
      { href: '/agent-config', label: 'AI Agents', icon: Bot },
      { href: '/settings', label: 'Integrations', icon: Settings },
    ],
  },
  {
    id: 'crypto',
    label: 'Crypto',
    routePrefixes: [
      '/assets', '/news', '/social', '/global-adoption', '/wallets',
      '/transfer-fees', '/staking', '/staking-discovery', '/coin-discovery',
      '/technical-analysis', '/backtests', '/risk-scores', '/reserves',
    ],
    optional: true,
    navItems: [
      { href: '/assets', label: 'Assets', icon: Database },
      { href: '/news', label: 'News', icon: Newspaper },
      { href: '/social', label: 'Social', icon: MessageSquare },
      { href: '/global-adoption', label: 'Global', icon: Globe },
      { href: '/wallets', label: 'Wallets', icon: Wallet },
      { href: '/transfer-fees', label: 'Transfer Fees', icon: ArrowLeftRight },
      { href: '/staking', label: 'Staking', icon: Coins },
      { href: '/staking-discovery', label: 'Staking Discovery', icon: TrendingUp },
      { href: '/coin-discovery', label: 'Coin Discovery', icon: Search },
      { href: '/technical-analysis', label: 'Technical Analysis', icon: CandlestickChart },
      { href: '/backtests', label: 'Risk Case Studies', icon: FlaskConical },
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
      { href: '/equities/backtests', label: 'Backtests', icon: FlaskConical },
      { href: '/equities/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    // Premium module — sold under its own entitlement (separate fee).
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
]

export const OPTIONAL_MODULES = MODULES.filter((m) => m.optional)

export function moduleForPath(pathname: string): SuiteModule | undefined {
  return MODULES.find((m) => m.routePrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
}
