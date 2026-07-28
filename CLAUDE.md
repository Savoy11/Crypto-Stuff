# Finance Now — Multi-Asset Financial Analytics
## Claude Code Project Guide

This file is auto-loaded by Claude Code at session start. It gives instant context so you can make changes without re-exploring the codebase.

---

## What This Is

An institutional-grade financial analytics suite built with Next.js 14 (App Router). It began as a crypto dashboard (risk, reserves, news sentiment, transfer fees, staking) and has grown into an entitlement-gated module suite (see `docs/ROADMAP.md`): the **Crypto** module (original Finance Now), an **Equities** module (`/equities`), and an **ETFs & Funds** module (`/funds`). Modules are declared in `src/lib/modules/registry.ts`; the sidebar renders from that registry, and modules can be toggled in Integrations → Suite Modules. The frontend runs **live-only** against public data providers via its `/live-data/*` route handlers (an optional legacy backend exists for auth/agent features only). Surfaces with no free real-time source show an explicit "not available" notice — there is no mock/demo data path.

**Working directory:** `C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend`

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 App Router |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS with custom CSS variables |
| Data fetching (client) | TanStack React Query v5 |
| Data fetching (server routes) | `fetch` with `next: { revalidate: N }` |
| State management | Zustand stores |
| Charts | Recharts |
| Icons | Lucide React |
| Toasts | react-hot-toast |

---

## Directory Structure

```
frontend/src/
├── app/
│   ├── layout.tsx                  # Root layout — wraps everything in <Providers>
│   ├── providers.tsx               # React Query + Toaster setup
│   ├── (auth)/                     # Login page
│   ├── (dashboard)/                # All main pages (use Sidebar layout)
│   │   ├── layout.tsx              # Dashboard shell with Sidebar
│   │   ├── headlines/page.tsx      # Landing page — cross-module aggregate news feed
│   │   ├── assets/page.tsx         # Coin Registry ("Coins" nav; route kept /assets) — live prices
│   │   ├── risk-scores/page.tsx
│   │   ├── reserves/page.tsx
│   │   ├── alerts/page.tsx
│   │   ├── watchlist/page.tsx
│   │   ├── news/page.tsx           # Per-coin news feed with sentiment
│   │   ├── social/page.tsx
│   │   ├── global-adoption/page.tsx
│   │   ├── transfer-fees/page.tsx  # Transfer Fee Calculator
│   │   ├── staking/page.tsx        # Staking Opportunities
│   │   ├── equities/               # EQUITIES MODULE — registry, [symbol], news, social, TA, backtests
│   │   ├── funds/                  # FUNDS MODULE — ETF/mutual fund registry + [symbol] detail
│   │   ├── backtests/page.tsx
│   │   ├── reports/page.tsx
│   │   └── settings/page.tsx       # Integrations + Suite Modules toggles
│   └── live-data/                  # Server-side API proxy routes (no API keys exposed)
│       ├── markets/route.ts        # CoinGecko price data
│       ├── news/route.ts           # Multi-provider crypto news (RSS + JSON feeds)
│       ├── social/route.ts         # Social sentiment data
│       ├── reserves/route.ts       # Reserve data
│       ├── alerts/route.ts
│       ├── chart/route.ts
│       ├── config/route.ts
│       ├── network-fees/route.ts   # Live BTC fees + all 16-network gas prices
│       ├── staking-rates/route.ts  # Live APR from Lido, Marinade, Jito
│       ├── security-quotes/route.ts # Stock/ETF/fund quotes (FMP→…→Yahoo→reference)
│       ├── security-chart/route.ts  # Price history for any Yahoo-quotable symbol
│       ├── security-ohlcv/route.ts  # Full OHLCV candles for stocks (Yahoo→FMP)
│       ├── market-news/route.ts     # Stock-market RSS news: sentiment, category, ticker tags
│       ├── stock-social/route.ts    # Reddit finance subs + StockTwits sentiment
│       ├── sec-filings/route.ts     # SEC EDGAR filings feed (ticker→CIK→submissions; tabbed 10-K/10-Q/8-K on equity detail)
│       ├── company-facts/route.ts   # SEC EDGAR XBRL fundamentals → financial ratios + annual trend on equity detail
│       ├── company-profile/route.ts # SEC EDGAR registrant metadata (SIC, HQ, incorporation) + Wikipedia summary
│       ├── stock-universe/route.ts  # Stock Registry universe — FMP stock-screener (daily-cached) w/ curated fallback; ?symbol= single lookup
│       ├── stock-outliers/route.ts  # Sector-relative z-score outliers over the universe (cheap/expensive/highYield/high-lowBeta) — backs the Equity Screener agent
│       ├── fund-holdings/route.ts   # Full ETF/fund portfolio: SEC N-PORT direct (keyless, authoritative) → FMP → Yahoo top-10 → catalog
│       ├── fund-holdings-history/route.ts # Quarter-over-quarter holdings diff from N-PORT filings (EDGAR direct; FMP fallback)
│       ├── security-returns/route.ts # Batched trailing 1M/3M/YTD/1Y returns (Yahoo spark) — backs the fund screener Returns tab/filters
│       ├── fx-rates/route.ts        # Daily ECB reference FX (frankfurter.dev, keyless) — Macro currency converter, official tier
│       ├── fx-rates-extended/route.ts # +127 more currencies (community currency-api, keyless) — converter's labeled extended tier
│       └── treasury-yield-curve/route.ts # Official 13-maturity daily par curve (treasury.gov XML, keyless) + spreads/shape
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx             # Renders from module registry (see lib/modules)
│   │   ├── ModuleGate.tsx          # Wraps module pages; locks when module disabled
│   │   ├── TopBar.tsx
│   │   ├── StatusBar.tsx
│   │   └── DataStatusBanner.tsx
│   ├── ui/                         # Generic reusable components
│   ├── charts/                     # Recharts wrappers + CandlestickChart/indicatorRegistry (shared TA engine)
│   ├── markets/                    # Shared equities/funds UI (PriceChartCard, MarketNewsList)
│   ├── assets/
│   ├── analytics/
│   ├── dashboard/
│   └── alerts/
│
├── lib/
│   ├── constants.ts                # App-wide constants, stale times, API URLs
│   ├── modules/
│   │   └── registry.ts             # ← SUITE MODULE REGISTRY — nav + entitlements live here
│   ├── risk/                       # Unified risk framework (pure TS, vitest-tested)
│   │   │                           #   see docs/architecture/risk-framework.md
│   │   ├── engine.ts               # composeRisk() — profile-agnostic scoring
│   │   ├── normalize.ts            # piecewise/linear normalizers, vol, drawdown
│   │   └── profiles/               # equity, optionsTrade, stakingAdapter
│   ├── data/                       # Static/semi-static data files (no API calls)
│   │   ├── transferFees.ts         # 30 exchanges × 22 coins × 18 networks
│   │   ├── stakingProviders.ts     # 55 staking providers with risk profiles
│   │   ├── equityCatalog.ts        # ~70 large-cap stocks, 11 sectors, reference data
│   │   └── fundCatalog.ts          # ~55 ETFs/mutual funds + computeFeeDrag()
│   ├── api/                        # API client functions
│   │   └── live/                   # Live data fetchers (CoinGecko, DefiLlama, marketData.ts, etc.)
│   ├── utils/
│   └── websocket/
│
├── store/                          # Zustand stores
│   ├── useAlertStore.ts
│   ├── useAssetStore.ts
│   ├── useAuthStore.ts
│   ├── useEntitlementStore.ts      # Which suite modules are enabled
│   └── useStreamStore.ts
│
└── types/                          # Shared TypeScript types
```

### Module boundary rules (keep these or the suite can't be split later)
1. A module's pages import shared code only from `components/ui`, `components/charts`, `components/markets`, `lib/` core, and its own folders — never another module's internals.
2. Cross-module data flows through `/live-data` or `/api/v1` routes, never direct page imports.
3. New module = new entry in `lib/modules/registry.ts` + pages wrapped in `<ModuleGate module="...">`.

---

## Adding a New Page — Checklist

1. **Create the page:** `src/app/(dashboard)/your-page/page.tsx`
   - Add `'use client'` at top if it uses React hooks
   - Server components are fine for static content

2. **Add to sidebar:** `src/lib/modules/registry.ts` (NOT Sidebar.tsx — it renders from the registry)
   - Import the icon from `lucide-react`
   - Add entry to the owning module's `navItems`: `{ href: '/your-page', label: 'Label', icon: IconName }`
   - If the page belongs to an optional module, also add its route prefix to that module's `routePrefixes` and wrap the page in `<ModuleGate module="...">`

3. **If you need a live data API route:** `src/app/live-data/your-route/route.ts`
   - Always add `export const dynamic = 'force-dynamic'` (prevents static caching)
   - Use `next: { revalidate: N }` on individual `fetch()` calls (N in seconds)
   - Return `NextResponse.json(...)` with a typed interface exported from the route
   - Every multi-fetch needs a **failure boundary that preserves partial results** — never let one upstream
     failure crash the route. `Promise.allSettled` when the fetches are genuinely independent; per-leg
     try/catch when they are a sequential fallback ladder (see the pattern note below — parallelising a
     ladder is a regression, not a fix)

4. **If you need static data:** `src/lib/data/your-data.ts`
   - Export typed interfaces, constants, and helper functions
   - No API calls in this layer — pure data

---

## Live Data Architecture

All external API calls happen in **server-side route handlers** (`/live-data/*`), never from client components. This keeps API keys off the client and lets Next.js cache responses.

```
Client component
  → useQuery('/live-data/foo')         # React Query, runs in browser
    → src/app/live-data/foo/route.ts   # Next.js route handler, runs on server
      → External APIs (CoinGecko, mempool.space, Lido, etc.)
```

### Key external APIs used (no auth keys required):
| API | Used for | Route |
|-----|----------|-------|
| `api.coingecko.com/api/v3/simple/price` | Coin prices (16 coins) | `network-fees`, `staking-rates` |
| `mempool.space/api/v1/fees/recommended` | Live BTC sat/vByte fee | `network-fees` |
| `eth-api.lido.fi/v1/protocol/steth/apr/sma` | Live stETH APR | `staking-rates` |
| `api.marinade.finance/msol/apy/1y` | Live mSOL APY | `staking-rates` |
| `kobe.mainnet.jito.network/api/v1/apy` | Live jitoSOL APY | `staking-rates` |
| Various RSS/JSON feeds | News articles | `news` |

### React Query patterns on the client:
```typescript
const { data } = useQuery({
  queryKey: ['unique-key'],
  queryFn: () => fetch('/live-data/your-route').then(r => r.json()),
  staleTime: 1000 * 60 * 5,       // don't refetch for 5 minutes
  refetchInterval: 1000 * 60 * 10, // background refresh every 10 minutes
})
```

---

## Data Files Reference

### `src/lib/data/transferFees.ts`
Central data file for the Transfer Fee Calculator.

- **`CoinId`** union — 22 coins: btc, eth, usdt, usdc, bnb, sol, dai, xrp, ltc, trx, doge, matic, avax, ada, dot, atom, link, ton, shib, uni, near, arb
- **`NetworkId`** union — 18 networks: erc20, trc20, bep20, solana, polygon, arbitrum, base, optimism, avalanche, bitcoin, xrpl, litecoin, dogecoin, cardano, polkadot, cosmos, ton_network, near_network
- **`EXCHANGES`** array — 30 exchanges (Binance through Hyperliquid), each with per-coin/per-network `withdrawFee`, `minWithdraw`, `withdrawEnabled`, `depositEnabled`, optional `note`. Data is hand-maintained with provenance: `TRANSFER_FEES_LAST_VERIFIED` + `getTransferFeeProvenance()` drive a staleness banner (stale after 120 days).
- **`findTransferPaths()`** — path-finding algorithm: direct routes first, then multi-hop via personal wallet, sorted by totalFeeUsd
- **`PERSONAL_WALLET_ID = 'wallet'`** — the "My Wallet" option in the From/To selectors
- **`EVM_NETWORKS`** — array of all EVM-compatible network IDs (address collision danger)

To add an exchange: append to `EXCHANGES` array following the existing pattern. Tier 1 = major/regulated, Tier 2 = smaller.

### `src/lib/data/stakingProviders.ts`
Central data file for the Staking Opportunities page.

- **`StakingCoinId`** — 9 stakeable coins: eth, sol, ada, dot, atom, matic, avax, bnb, trx
- **`ProviderCategory`** — `'cefi' | 'wallet' | 'liquid'`
- **`RiskProfile`** — 6 dimensions, each 1–10: `custodyRisk`, `counterpartyRisk`, `contractRisk`, `slashingRisk`, `liquidityRisk`, `regulatoryRisk`
- **`computeOverallRisk(risks)`** — weighted composite score (counterparty 25%, custody 20%, liquidity 20%, contract 15%, slashing 10%, regulatory 10%)
- **`getRiskLevel(score)`** — returns `'low' | 'medium' | 'high' | 'critical'`
- **`STAKING_PROVIDERS`** array — 55 providers (count is dynamic; the page reads `STAKING_PROVIDERS.length`). Representative names:
  - CeFi: Celsius (defunct, cautionary), Coinbase, Kraken, Binance, OKX, Bybit, KuCoin, Crypto.com, Bitget, Gate.io, HTX, Robinhood, Nexo, Gemini, Bitfinex, Bitstamp, MEXC, Upbit
  - Wallet: Ledger Live, MetaMask, Phantom, Trust Wallet, Exodus, Keplr, Solflare, Coinbase Wallet, Atomic Wallet, Trezor Suite
  - Liquid/restaking: Lido, Rocket Pool, Marinade, Jito, Stride, Benqi, EtherFi, Frax, Stakewise, Stader, Swell, Renzo, Kelp, Puffer, Bedrock, Sanctum, Babylon, Lombard, Aave, Convex, Ankr, MetaPool, and more

To add a provider: append to `STAKING_PROVIDERS` following the pattern. Celsius should always be kept — it's used as the educational cautionary example.

### `src/lib/data/equityCatalog.ts` (Equities module)
- **`EQUITY_CATALOG`** — ~70 large-cap US stocks with sector (11 GICS sectors in `SECTOR_INFO`), industry, and approximate reference values (price, market cap, P/E, dividend yield, beta). Reference values are fallbacks — live quotes override price/change.
- Symbols use Yahoo notation (`BRK-B`, not `BRK.B`) so one string works across Yahoo and FMP.
- To add a stock: append to `EQUITY_CATALOG`; the registry table, detail route, and quote universe pick it up automatically.

### `src/lib/data/fundCatalog.ts` (Funds module)
- **`FUND_CATALOG`** — ~55 funds (`type: 'etf' | 'mutual'`) with issuer, category (`FUND_CATEGORY_INFO`), expense ratio, AUM, yield, inception, tracked index, and indicative top holdings.
- **`computeFeeDrag(principal, erPct, years, returnPct)`** — expense-ratio cost projection used by the Fee Drag Analyzer on fund detail pages.
- To add a fund: append to `FUND_CATALOG` following the pattern.

### `src/lib/data/portfolioBuilder.ts` (Portfolio Builder module)
Pure engine, no API calls, covered by `__tests__/portfolioBuilder.test.ts` (55 tests).

- **`buildPortfolio(inputs)`** — questionnaire → `BuiltPortfolio`. The glide path anchors to `yearsToFirstUse` (the spend date), **not** retirement; risk tolerance shifts it ±15pts but can never extend a horizon.
- **Sleeve appetite + style.** Appetite decides *how much* (`commodityComfort` / `currencyComfort`, `SleeveAppetite = none|small|moderate`); **style decides *what kind*** (`cryptoStyle` / `commodityStyle` / `currencyStyle` / `bondStyle`) because risk varies as much inside an asset class as between them. Style tables (`CRYPTO_STYLES`, `COMMODITY_STYLES`, `CURRENCY_STYLES`, `BOND_STYLES`) each carry a `label`, a plain-language risk `note` shown in the UI at the point of choice, and (except bonds) an instrument `mix`. Bonds have style but no appetite — they're always held; `applyBondStyle()` rewrites the duration ladder for credit posture (treasury swaps BND→IEF; corporate/high-yield scale the ladder and append LQD/HYG). Higher-risk styles emit explicit notes (high-yield behaves like equity in a crisis; commodity currencies fall *with* equities; silver is ~2× gold's volatility). **All style fields are optional and every default reproduces pre-style behaviour**, so saved plans replay unchanged.
- **Sleeve legs use `MIN_SLEEVE_LEG_PCT` (2%), not the bond ladder's `MIN_RUNG_PCT` (1%)** — a sleeve leg is a distinct position to buy and rebalance, not a duration slice. When a sleeve is too small to carry its style's legs it collapses to the largest one **and says so in a note**, rather than silently ignoring the user's choice. Both fields are **optional (`?`) on purpose** — plans saved before they existed replay through `reviewPlan()`'s aged rebuild and must rebuild identically, so absent === `'none'`. Commodities: GLDM alone at small, GLDM+PDBC (K-1-free basket) at moderate; **deliberately not scaled by risk tolerance** — gold is a diversifier, and an aggressive investor may rationally want none. Currency: FXE at small, FXE+FXY at moderate, and **always** emits a warn note that foreign cash has no long-run expected return and that VXUS already carries unhedged FX exposure.
- **Each sleeve is funded from its own side of the growth/defensive split** so opting in never changes how much risk the plan takes: commodities come out of equity (they're growth-side, and are counted in `GROWTH_CLASSES` for risk-drift), currency comes out of the bond residual (it moves like cash). Verified by test: growth/defensive totals are unchanged with sleeves on.
- **`bondLadder(horizon)` / `consolidateLadder(rungs, sleevePct)`** — duration matched to the spend date (SHY → IEF → BND → TLT). `consolidateLadder` drops rungs worth under `MIN_RUNG_PCT` (1%) and re-spreads them, so a thin sleeve becomes one real position instead of several unbuyable slivers.
- **Sector exclusions remove tilts only.** A broad-market core still holds the excluded companies at index weight, and the engine says so in a note — the catalog carries no screened fund, so a true screen is not deliverable. Do not "fix" this by silently dropping the core.
- **`fees`** — blended expense ratio, annual dollar cost, and compounded drag vs a 3bps benchmark. There is deliberately **no** fee warning at build time: every reachable instrument is a cheap index fund, so the blend tops out near 0.13% and any threshold would be dead code.
- **`diversificationScore`** — Gini–Simpson diversity (1 − Σwᵢ²) over the class mix, worth 90 points, plus up to 10 graded points for international equity reaching 20% of the plan. Replaced (2026-07-21) a count-based formula that pinned every reasonable multi-class plan at exactly 100. Realistic range is ~48–75; the ceiling is unreachable by an actual plan, on purpose — don't "fix" a plan not scoring 100.
- **`checkDrift(plan, weights, valueUsd)`** — target vs actual with per-holding buy/sell dollar trades, turnover, and off-plan positions. Drift exactly on the band is `hold`; only a breach trades.
- **`reviewPlan(saved, actual?, now?)`** — suitability monitoring: ageing glide path, risk drift, fee creep, concentration, off-plan holdings, overdue review. Checks needing real holdings are skipped rather than guessed when `actual` is absent. `now` is injectable so time-dependent behaviour is testable. **Fee creep is checked here**, against what the user actually holds (which can include 0.49–0.87% funds), not at build time.
- **Concentration is measured against the plan's own target**, not an absolute weight — a 55% total-market core is 3,500 companies held on purpose, and flagging it would train users to ignore the warning.
- **`actualWeightsFromPortfolio(portfolio, prices)`** — bridges a `/portfolios` portfolio into symbol→weight. Positions with no live price are **excluded, never valued at cost**; `pricedPct` reports coverage so the UI can disclose it.
- UI: `src/components/portfolio-builder/PlanMonitor.tsx` (expandable per saved plan) supports both a linked portfolio and manual weight entry.
- **Plans persist to Postgres** (`builder_plans` table — jsonb snapshot of engine output, deliberately not normalized) via `/api/user/builder-plans` (+ `/[id]` PATCH/DELETE). Ownership via `getCurrentUserId()` (local-user mode while the auth wall is off). The page one-time-imports legacy `BUILDER_STORAGE_KEY` localStorage plans (timestamps preserved, key renamed `*:imported` so it can't run twice). `builder_plans.linked_portfolio_id` persists which portfolio the drift monitor compares against (auto-selected on load; portfolios are DB-backed with UUID ids).
- **⚠ New API routes with dynamic segments MUST live under `/api/user/`** — the `next.config.mjs` rewrite proxies other `/api/*` paths to the legacy backend, and dynamic routes lose to rewrites (see comment in next.config.mjs).

### Quote plumbing for both modules (`src/lib/api/live/marketData.ts`)
**All four equity data surfaces are registry-driven** (same provider system as crypto — `src/lib/api/live/providers.ts`, configured on the Integrations page, persisted to `.provider-config.json`; providers carry `market: 'crypto' | 'equities'` so the two sides never cross). Every surface records per-provider utilization, supports toggling/reordering built-ins, and accepts user-added custom feeds (SSRF-validated, auth via header/query/bearer, tolerant JSON field extraction in `src/lib/server/customFeeds.ts`):

- **Quotes** (`fetchSecurityQuotes` → `getEquityQuoteProviders()`): custom `json-quote` feeds first, then FMP → Finnhub → Twelve Data → Tiingo → Alpha Vantage (key-gated) → Yahoo spark → catalog reference prices. `{symbol}` (per-symbol) or `{symbols}` (batch) placeholders. **Stooq used to be the last live rung and is gone** — it 404s on every variant (confirmed in the 2026-07-19 audit) and has been removed from the registry and the quote path; catalog reference is the real last resort. The only remnant is the legacy `'stooq'` value in `PRICE_SOURCES` (db/schema/instruments.ts), which is inert. Don't re-add it as a fallback.
- **News** (`/live-data/market-news` → `getEquityProviders('news')`): built-ins Yahoo Finance News / MarketWatch / CNBC plus custom `rss`/`atom`/`json-news` feeds, all active sources merged in parallel.
- **Social** (`/live-data/stock-social` → `getEquityProviders('social')`): built-ins Reddit Finance / StockTwits plus custom `json-social` feeds. (Reddit 403s from datacenter IPs without OAuth — expect StockTwits-only in server/CI environments.)
- **OHLCV / TA / backtests** (`/live-data/security-ohlcv` → `getEquityOhlcvProviders()`): custom `json-ohlcv` feeds first, then Yahoo Finance → Tiingo → FMP.

UI labels non-live prices with a small amber `ref` tag; KPIs needing live data show "requires live quotes" instead of fabricated values.

The **TopBar data-tier dropdown** (`TierSwitch` / `src/lib/tier.ts`) breaks sourcing down per category. Categories carry a `market: 'crypto' | 'equities'` field: crypto rows respond to the free/paid/custom toggle as before; equity rows are `informational: true` — they reflect the live registry (enabled providers per category, scoped by market) rather than the toggle, since equity sourcing is managed entirely on the Integrations page. Multi-select option lists are market-scoped so crypto selectors never pull in equity providers that share a `category` id.

---

## Environment Variables

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000   # Optional legacy backend (auth/agent only)
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws   # WebSocket (optional)
# Paid-tier provider keys (CoinGecko Pro, CryptoPanic, etc.) live in .env.local
FMP_API_KEY=...                             # Optional — settable in the Integrations UI. Uses FMP's /stable API (legacy /api/v3 is retired → 403). FREE tier: single-symbol quote/profile/history + earnings calendar. PAID only: batch quotes, company-screener, constituent lists, economic calendar. So a free key powers per-stock data & detail-page ticker resolution, but the broad Stock Registry universe needs a paid plan.
# Other equity quote providers (all optional; also settable in the Integrations UI):
# FINNHUB_API_KEY, TWELVE_DATA_API_KEY, TIINGO_API_KEY, ALPHA_VANTAGE_API_KEY
FN_ADMIN_TOKEN=...                        # (legacy CAEP_ADMIN_TOKEN still honored) Optional — sensitive endpoints (AI agents, provider config, exchange creds) require this token when the app is served from a non-localhost host; without it they are localhost-only (see src/lib/server/apiGuard.ts)
```

**Server-side secret stores** (gitignored, written at repo `frontend/` root):
`.provider-config.json` (provider API keys), `.agent-prompts.json` (agent overrides),
`.exchange-credentials.json` (exchange API keys — never sent to the browser; the client
references connections by id via `/live-data/wallet/exchange-connections`).

Finance Now runs **live-only**. `LIVE_DATA` is hardcoded `true` in `lib/constants.ts` — there is **no** `NEXT_PUBLIC_USE_MOCK` / `NEXT_PUBLIC_LIVE_DATA` toggle and **no mock data path**. All market data comes from the `/live-data/*` route handlers; surfaces with no free real-time source show an explicit "not available" notice rather than fabricated values. See `DATA-AVAILABILITY.md`.

---

## Testing the Live Data Layer

```bash
npm run smoke   # quick subset (CI)
npm run audit   # full audit; also audit:strict and audit:json
```

Both run `scripts/test-live-data.mjs` (the old `scripts/smoke.mjs` was folded into it —
`smoke` is now just `--quick`). Run `npm run audit` before trusting any route, and read its
**REAL vs FALLBACK** classification rather than the HTTP status: a 200 carrying fallback data
is the failure mode that misdirects debugging to the UI layer. An earlier harness reported
43/43 PASS while several routes were quietly serving static catalogs.

This matters when judging AI agent output too — agent tools read the same `/live-data/*` routes
the UI does, so an agent giving vague answers off a FALLBACK route is a data problem, not a
prompt problem. Don't tune a prompt to compensate for a degraded feed.

**⚠ Data-availability results are IP-dependent — audits MUST run on the owner's machine.**
Binance.com is geo-blocked here (451), and Reddit and LunarCrush block datacenter IPs, so a
cloud or CI run produces a systematically wrong baseline of "which sources work." Code reading,
design, and spec work are fine remotely; "which data sources actually work" is not.

---

## Stale Time Constants (from `src/lib/constants.ts`)

```typescript
STALE_TIME_SHORT  = 30_000   // 30s  — prices, volatile data
STALE_TIME_MEDIUM = 60_000   // 1m   — news, social
STALE_TIME_LONG   = 300_000  // 5m   — fees, staking rates
GC_TIME           = 600_000  // 10m  — query cache retention
```

---

## Styling Conventions

Tailwind with custom CSS variables defined in `globals.css`:
- `bg-bg-card`, `bg-bg-elevated`, `bg-sidebar-gradient` — surface colors
- `text-text-primary`, `text-text-secondary`, `text-text-muted` — text hierarchy
- `border-border`, `border-border-hover` — border colors
- `text-accent-blue`, `bg-accent-blue` — primary accent (#3b82f6)
- `w-sidebar` — sidebar width constant

Risk/status color convention used across the app:
- **Emerald** (`emerald-400`) — low risk, positive, safe
- **Amber** (`amber-400`) — medium risk, warning
- **Orange** (`orange-400`) — high risk
- **Red** (`red-400/500`) — critical risk, danger, defunct

---

## Feature Inventory (what exists)

> **Data-status source of truth:** `DATA-AVAILABILITY.md` (repo root) is the authoritative,
> regularly-regenerated record of what is 🟢 Live / 🟡 Partial / 🔴 Not available. Consult it,
> not this table, when in doubt. Finance Now is live-only — there is **no mock/demo data path**;
> "Mock" labels in older docs are obsolete.

| Feature | Route | Status | Source / Notes |
|---------|-------|--------|----------------|
| Headlines | `/headlines` | 🟢 Live | **Landing page** (`/` and post-login redirect here). Client-side merge of `/live-data/news` (crypto) + `/live-data/market-news` (equities) into a cross-module "Top Stories" strip plus a section per enabled module. Sections follow the entitlement store, so the feed reflects the user's bundle. Funds has no general feed of its own and shares the Markets section. Replaced the old `/dashboard` page; its `components/dashboard/*` widgets are retained but no longer routed (except `RiskHeatmap`, still used by `PopoutContent`). |
| Coins (Coin Registry) | `/assets` | 🟢 Live | Nav label "Coins"; route path kept as `/assets` to preserve deep links. Market-breadth KPIs, asset-type chips + inline screener, sortable/paginated table (Stock-Registry-standard layout), canonical Safety Score column, Reserve Monitor tab. Live prices; metadata from static `assetCatalog.ts` (reference data, not mock) |
| Coin Detail | `/assets/[id]` | 🟢 Live | Price, OHLCV chart, per-coin news |
| Risk Scores | `/risk-scores` | 🟢 Derived | Live composites from `/live-data/risk-scores`: stablecoin 5-pillar (fatal-flaw override) + major-asset market profiles via `src/lib/risk` |
| Reserves | `/reserves` | 🟢 Live | DefiLlama stablecoin supply + collateralization (`/live-data/reserves`) |
| Alerts | TopBar bell | 🟢 Live | `/live-data/alerts` — stablecoin depegs + major-asset 24h moves; surfaced in the TopBar bell (no standalone page) |
| Watchlist | `/watchlist` | 🟢 Live | Cross-module: coins, stocks, ETFs & funds, and macro instruments in named lists with live prices. **DB-backed** via `/api/user/watchlists` (+`/[id]` PUT/DELETE) through `useWatchlistStore` (optimistic, client-UUID ids, one-time localStorage import that MERGES even into a non-empty account — see store comment). Feed bias (`lib/watchlist/bias.ts`) and the Daily Brief read the store, not localStorage |
| News | `/news` | 🟢 Live | Multi-provider RSS/JSON; sentiment + asset detection |
| Social | `/social` | 🟡 Partial | `/live-data/social` — verify which signals are live vs derived |
| Global | `/global-adoption` | ⚪ De-routed | Access removed (T5) pending a post-production rework — a mislabeled CBDC tracker on stale/duplicated static data with a fabricated live timestamp. Page + `/live-data/cbdc-data` route retained; `/global-adoption` redirects to `/headlines`. See `docs/assessments/T5-utility-triage.md`. |
| Transfer Fee Calc | `/transfer-fees` | 🟡 Partial | Static fee table (`transferFees.ts`) + live token prices; staleness-labeled |
| Staking | `/staking` | 🟡 Partial | Live stETH/mSOL/jitoSOL APR; other providers reference/estimated |
| Staking Discovery | `/staking-discovery` | 🟢 Live | `/live-data/staking-discovery` |
| Coin Discovery | `/coin-discovery` | 🟢 Live | Scored candidate coins from live market data |
| Technical Analysis | `/technical-analysis` | 🟢 Derived | Trend/S-R/patterns/backtest computed client-side from live OHLCV |
| Portfolios | `/portfolios` | 🟢 Live | Live prices + history (`/live-data/portfolio-*`). **DB-backed** via `/api/user/portfolios` (+`/[id]` PUT/DELETE): store keeps its sync Zustand interface via optimistic mutations + client-UUID ids; consumers call `hydratePortfolios()` on mount; one-time localStorage import. Holdings resolve through the instrument layer (`lib/server/instrumentResolve.ts` — global rows, cgId round-trips via `instrument_crypto.coingecko_id`) |
| Wallets | `/wallets` | 🟢 Live | On-chain balances (`/live-data/wallet/*`) |
| Research / Agent Config | `/research`, `/agent-config` | — | Crypto + equity research agents; AI Agents tab configures all agents (see "AI Agents" section) |
| Risk Case Studies | `/backtests` | ⚪ Removed | Deleted (2026-07) — static educational replay of 3 depeg events with no clear user value; `/backtests` redirects to `/headlines`. Recoverable from git history if ever wanted. (Equities Strategy Backtests at `/equities/backtests` are unrelated and remain.) |
| Daily Brief | `/brief` | 🟢 Live | AI morning brief grounded in holdings (needs ANTHROPIC_API_KEY) |
| Compare | `/compare` | 🟢 Live | 2–6 stocks/funds/coins, date-aligned growth-of-100 + window stats + correlation (`security-chart`, `chart`) |
| Portfolio Builder | `/portfolio-builder` | 🟢 Derived | PREMIUM module (own entitlement): questionnaire → diversified allocation with bond ladder, sector tilts/exclusions, fee summary, drift-vs-actual rebalancing and suitability monitoring. Engine is pure TS in `lib/data/portfolioBuilder.ts` (vitest-tested); see below |
| Settings | `/settings` (→ Integrations) | — | API keys, data tier, integrations + Suite Modules toggles |

### Equities module (`/equities`)
| Feature | Route | Status | Source / Notes |
|---------|-------|--------|----------------|
| Stock Registry | `/equities` | 🟢 Live | Universe from `/live-data/stock-universe` (FMP stock-screener, daily-cached, all active common stocks + sectors) with `equityCatalog.ts` curated fallback when no FMP key. Paginated (50/page), live quotes for the visible page only, range screener, sortable columns incl. beta. Detail pages resolve non-catalog tickers via FMP profile lookup. **P/E is backfilled from SEC XBRL** — see below. |

#### P/E enrichment (`src/lib/server/secFundamentals.ts`)
FMP's `company-screener` returns **no P/E at all**, so on a paid plan every non-curated name would have a blank P/E column and be invisible to the registry's min/max P/E filter. `enrichPeRatios()` in the stock-universe route backfills it from the SEC's XBRL **frames** API (`data.sec.gov/api/xbrl/frames/...`) — bulk diluted EPS across all filers, with basic EPS as a gap-filler, keyed ticker→CIK via `edgar.ts`'s `fetchTickerCikMap()`. Free and keyless. Measured coverage: **~6,100 symbols**.

Caveats, all deliberate:
- It is a **trailing** P/E (last complete fiscal year's EPS ÷ reference price), so it won't match a broker's forward/TTM figure exactly.
- Loss-making companies return `null`, not a negative multiple — a negative P/E would corrupt the range filter (INTC is a live example).
- Coverage gaps: foreign private issuers (20-F), off-calendar fiscal years, and **recently reorganized registrants whose ticker now maps to a new holding-co CIK with no XBRL history** (XOM is a live example).
- Runs only on the FMP path — the 79-entry curated catalog already carries hand-written P/E, so enriching it would gain one row for three multi-MB fetches.
- Frame years derive from the clock (`recentAnnualFrames()`), so this does not go stale each January.
| Equity Detail | `/equities/[symbol]` | 🟢 Live | Live chart/news + reference stats, 52-wk range, key stats |
| Market News | `/equities/news` | 🟢 Live | RSS multi-feed; category/sentiment/ticker filters |
| Stock Social | `/equities/social` | 🟡 Partial | Reddit + StockTwits (keyless) sentiment |
| Equity TA | `/equities/technical-analysis` | 🟢 Derived | Shared candlestick engine, 18 indicators, patterns, screener |
| Strategy Backtests | `/equities/backtests` | 🟢 Derived | `security-ohlcv` real history; SMA/RSI/MACD vs buy-and-hold |
| Market Calendar | `/equities/calendar` | 🟡 Partial | FMP calendars (free key); earnings + US economic events |

### Macro Markets module (`/macro`) — bonds/rates, commodities, fiat
One module (`macro` entitlement), three areas. Owner spec + status: `docs/ROADMAP.md` ("Macro Markets"). **Zero new quote plumbing** — futures, FX pairs, and yield indices all price through the existing `security-quotes`/`security-chart`/`security-ohlcv` routes (verified). Catalogs carry **no reference prices** (futures/FX quotes stale in hours; unpriced = honest dash).

| Feature | Route | Status | Source / Notes |
|---------|-------|--------|----------------|
| Macro Overview | `/macro` | 🟢 Live | Landing page; live quote strips per area |
| Macro News | `/macro/news` | 🟢 Live | `/live-data/macro-news` — 8 keyless RSS feeds (Investing.com commodities/bonds/forex, OilPrice, FXStreet, MarketWatch, CNBC ×2). **Content-first pillar classifier** (strong-currency terms → commodities → bonds → weak-currency; general-feed articles matching no pillar are dropped). 14-day staleness cutoff; future `pubDate`s clamped (Investing.com omits TZ); balanced merge guarantees each pillar ≤¼ of slots so slow bonds feeds aren't crowded out; detected instruments link to macro detail pages |
| Commodities | `/macro/commodities`, `/[slug]` | 🟢 Live | `commodityCatalog.ts` — 19 verified front-month contracts, 5 categories. `quoteBasis: 'usd'\|'cents'` renders each market's convention (472.75¢/bu, never "$472"). Detail: chart + facts + ETF proxies → /funds. **`etfProxies` are genuine single-commodity exposure**, not the broad-basket DBC these used to point to. Deep, multi-issuer lineups for the liquid metals/energy markets (gold: GLD/IAU/GLDM/SGOL/AAAU/BAR/OUNZ; silver: SLV/SIVR/PSLV; WTI: USO/OILK/USL; nat gas: UNG/UNL) — each variant genuinely differs (expense ratio, K-1 vs 1099 tax form, front-month vs laddered roll, physical-redemption feature), all added to `fundCatalog.ts` and verified both quotable AND actively trading (5-day history, not just a cached price) before inclusion. Copper/grain/platinum/palladium get one verified proxy each (CPER/CORN/WEAT/SOYB/CANE/PPLT/PALL) — genuinely thinner markets, not an under-researched gap; broad-basket funds (DBB, COPX-style miner ETFs) are deliberately excluded even as a single option since that's the exact overstated-specificity problem this fix corrected. Heating oil, coffee, cocoa, cotton, live cattle, and lean hogs are **deliberately empty** — their single-commodity ETFs/ETNs (UHN, JO, NIB, BAL, COW) were confirmed delisted (last trade 2019–2023) 2026-07-21; don't backfill with a basket fund to avoid a blank list |
| Currencies | `/macro/currencies`, `/[slug]` | 🟢 Live | `currencyCatalog.ts` — 18 pairs + DXY, per-pair `precision`. **`etfProxies`** (new `FundCategoryId: 'currency'` in `fundCatalog.ts`): the 6 USD majors get their CurrencyShares trust (FXE/FXB/FXY/FXF/FXC/FXA — holds currency deposits, direct exposure); Dollar Index gets UUP/UDN/USDU (long/short/alt-index). Deliberately empty for every EM pair and every cross — EM single-currency funds (FXM/BZF/CYB/ICN/SZR) confirmed delisted, crosses have never had a dedicated fund (only vs-USD trusts exist), NZD/KRW never had one. **Converter is two-tier**: 30 ECB currencies (`/live-data/fx-rates`, frankfurter.dev — verified to be ECB's *complete* published set, not a subset) plus 127 more via `/live-data/fx-rates-extended` (community `fawazahmed0/currency-api`, keyless, hand-verified allowlist excluding crypto tickers/precious-metal ounce codes/IMF SDR/defunct pre-euro currencies from that feed's ~340 raw codes). Grouped by `<optgroup>` in the UI; any conversion touching an extended-tier currency shows a distinct disclosure (community-sourced, not ECB) instead of the "official" ECB copy — the two tiers are never blended without attribution |
| Bonds & Rates | `/macro/rates`, `/[slug]` | 🟢 Live | `ratesCatalog.ts` — 4 CBOE yield indices + 4 CBOT futures. Curve chart from `/live-data/treasury-yield-curve` = **official** treasury.gov 13-maturity daily par curve (keyless XML, regex-parsed, 4h revalidate) + 2s10s/3m10y spreads + shape. Overview-page bond ETF shelf → /funds. **CUSIP-level bond quotes are licensed data — intentionally absent, stated on-page.** Detail pages carry a per-instrument **"Duration-Matched Funds"** section (`etfProxies`, distinct from the commodity/currency "ETF Proxies" naming since nobody buys "the 10-year yield" directly — the match is by maturity band, not asset identity): 13-week yield → SGOV/BIL (0-3mo bills); 5-year yield + 5yr future → IEI (3-7Y, added to fill the SHY↔IEF duration gap); 10-year yield + 10yr future → IEF; 30-year yield + 30yr future → TLT; 2yr future → SHY. General credit/inflation/aggregate funds (LQD/HYG/TIP/BND/AGG) stay overview-only since they don't map to a specific curve point |

`PriceChartCard` takes `valueFormat: 'usd' | 'plain'` (default `'usd'`, existing pages unchanged) — use `'plain'` for FX, yields, and cents-quoted contracts so axes aren't $-mislabeled. **Cross-cutting integration shipped 2026-07-21**: `market: 'macro'` exists across the provider registry (11 built-in rows; macro routes are registry-driven with utilization), tier categories, Integrations sections, and agents (`macro-research`/`macro-screener`, toolset `'macro'`); all 46 macro instruments are `sec:`-keyed entries in `instruments.ts` (classes `commodity`/`currency`/`rate`, `detailPath` slug routing) so watchlists/portfolios/Compare can hold them.

### ETFs & Funds module (`/funds`)
| Feature | Route | Status | Source / Notes |
|---------|-------|--------|----------------|
| Fund Registry | `/funds` | 🟢 Live | `fundCatalog.ts` + live quotes; ~55 ETFs/mutual funds |
| Fund Detail | `/funds/[symbol]` | 🟢 Live | Live chart/news + fund facts; Fee Drag Analyzer, top holdings |

---

## AI Agents (`src/lib/agents/`)

All agents run through one loop (`runner.ts`, Anthropic + OpenAI-compatible). Defaults live in `prompts.ts` (`AGENT_DEFAULTS`); per-agent overrides (provider/model/temperature/systemPrompt/**enabled**) persist to `.agent-prompts.json`. Each agent has a `market: 'crypto' | 'equities' | 'macro'` (undefined = shared) and a `toolset: 'crypto' | 'equities' | 'macro' | 'all'`.

**Agents (11):** `app-assistant` (shared, toolset `all`), crypto `research-analyst` / `data-scraper` / `pump-report-investigator` / `pump-report-chat`, equity `equity-research` / `equity-screener` / `equity-data-scraper` / `equity-diligence`, and macro `macro-research` / `macro-screener` (6 macro tools: search_macro_instruments, get_macro_quote, get_macro_price_history, get_yield_curve, get_fx_rates, get_macro_news).

**Tools (`tools.ts`):** tagged by market; `toolsForAgent(toolset)` gives an agent only its market's tools. Crypto tools hit `/api/v1/*` + `/live-data/ohlcv`; equity tools (`get_stock_quote/financials/profile/filings/news/social/price_history`) hit the equity `/live-data/*` routes. Every tool reads exactly what the UI reads — one source of truth. The Anthropic runner also adds the server-side **`web_search`** tool (max_uses via `opts.webSearchMaxUses`, default 5 / research 8), and handles the `pause_turn` stop reason it produces; web search is **Anthropic-only** (agents switched to another provider keep data tools but lose search).

**Invocation:** `app-assistant` (Assistant chat → `/api/agents/chat`), `research-analyst` / `equity-research` / `macro-research` (Research page Crypto/Equities/Macro selector → `/api/agents/research`), and `equity-screener` (Stock Registry "AI Outlier Scan" panel → `/api/agents/research`, whitelisted; calls `get_stock_outliers` then drills in) have run triggers. `macro-screener` is whitelisted on the research route (deep-linkable via `?agent=macro-screener`) but has no dedicated panel yet. `data-scraper` / `equity-data-scraper` / `equity-diligence` are configurable-but-not-yet-invoked placeholders (need a trigger UI). `pump-report-*` run via their own `/live-data/pump-report/*` routes (separate loop, own web_search).

**LLM keys** resolve via `getProviderKey(provider)` — UI-saved key (Integrations → AI Providers, the `llm`-category providers in `providers.ts`) first, then the env var. The pump-report routes resolve the Anthropic key the same way.

**Control surfaces:** the **AI Agents tab** (`/agent-config`) edits model/temperature/prompt per agent (tabs grouped shared/crypto/equity); **Integrations** (`/settings`) holds the AI Providers key section and per-agent enable toggles. The **Research page** (`/research`) has a Crypto/Equities selector and accepts `?symbol=` / `?agent=equity-research` deep links; stock detail pages have an **Analyze with AI** button → `/research?symbol=…`. Disabled agents throw `AgentDisabledError` (503) from the run routes.

## News Feed Architecture (`src/app/live-data/news/route.ts`)

The news route has a multi-layer asset detection system:
1. **Direct mention** — regex patterns for coin names/tickers (e.g. "bitcoin", "BTC")
2. **Issuer match** — "Circle" → USDC, "Tether" → USDT
3. **Regulatory inference** — "MiCA" → USDC+USDT, "GENIUS Act" → USDC+USDT+PYUSD, "DeFi regulation" → DAI+FRAX
4. **Category fallback** — "stablecoin" with no match → general stablecoins; "crypto/blockchain" → general

Asset filter is applied server-side so only relevant articles are returned when a coin filter is active. Articles tagged `'general'` always pass through.

---

## Agent API Layer (`/api/v1/`)

A separate, agent-optimised REST API lives at `/api/v1/`. It is distinct from `/live-data/*` (which is internal to the UI) — the v1 API is designed for programmatic consumption by AI agents, external scripts, and other services.

### Key differences from `/live-data/*`
- All routes include `Access-Control-Allow-Origin: *` CORS headers
- Responses are flat and descriptive (no UI-specific shape)
- Proper HTTP 400 errors with human-readable messages for bad params
- Every response includes `updatedAt` and `source` metadata
- OpenAPI 3.0 spec available at `GET /api/v1/openapi.json`

### Available endpoints
| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/` | Discovery — lists all endpoints and supported coins/networks |
| `GET /api/v1/prices?coins=btc,eth` | Live USD prices |
| `GET /api/v1/exchanges?tier=1` | All supported exchanges with ids, coins, networks |
| `GET /api/v1/network-fees` | Gas fees for all 16 networks (BTC live, rest estimated) |
| `GET /api/v1/transfer/routes?from=binance&to=coinbase&coin=usdt&amount=1000` | Transfer route finder |
| `GET /api/v1/staking/opportunities?coin=eth&category=liquid&max_risk=5` | Staking options with risk scores |
| `GET /api/v1/news?coin=btc&sentiment=negative&limit=10` | News with sentiment/category tagging |
| `GET /api/v1/openapi.json` | Full OpenAPI 3.0 spec |

### CORS helper
All v1 routes import from `src/app/api/_cors.ts`:
```typescript
import { CORS, options } from '../../_cors'
export { options as OPTIONS }   // handles preflight
// ...
return NextResponse.json(data, { headers: CORS })
```

---

## MCP Server (`mcp-server/`)

A standalone Node.js MCP server at `Crypto-Stuff/mcp-server/` that exposes Finance Now tools to Claude and any MCP-compatible AI agent. It calls the `/api/v1/` endpoints — Finance Now frontend must be running.

### Tools exposed
| Tool | Description |
|------|-------------|
| `get_coin_prices` | Live prices for one or more coins |
| `list_exchanges` | All supported exchanges with coin/network support |
| `find_transfer_routes` | Cheapest route between two exchanges for a coin |
| `get_network_fees` | Gas fees for all 16 networks |
| `get_staking_opportunities` | Staking options filtered by coin, category, max risk |
| `compare_staking_risk` | Side-by-side risk comparison of staking providers |
| `get_crypto_news` | Recent news with sentiment, category, and coin tags |

### Setup (build once)
```bash
cd mcp-server
npm install
npm run build
```

### Add to Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "finance-now": {
      "command": "node",
      "args": ["C:/Users/marcu/OneDrive/Desktop/Crypto-Stuff/mcp-server/dist/index.js"],
      "env": { "FN_BASE_URL": "http://localhost:3000" }
    }
  }
}
```
Claude Desktop config lives at `%APPDATA%\Claude\claude_desktop_config.json` on Windows.

### Add to Claude Code (project-level MCP)
```bash
# Run from any directory — adds Finance Now MCP to this project's .claude/settings.json
claude mcp add finance-now node C:/Users/marcu/OneDrive/Desktop/Crypto-Stuff/mcp-server/dist/index.js
```

### Environment variable
`FN_BASE_URL` — base URL of running Finance Now instance (default: `http://localhost:3000`; legacy `CAEP_BASE_URL` still honored)

---

## Common Patterns

### Resilient multi-fetch — pick the boundary that matches the shape

**Independent fetches** (all results wanted, order irrelevant) → `Promise.allSettled`:
```typescript
const [res1, res2] = await Promise.allSettled([fetch(url1), fetch(url2)])
if (res1.status === 'fulfilled' && res1.value.ok) { /* use it */ }
// always fall through to static defaults if fetch fails
```

**Sequential fallback ladder** (try A, else B, else C — `markets`, `portfolio-prices`, `cbdc-data`) → per-leg
try/catch, returning on first success. **Do not "upgrade" these to `allSettled`**: it fires every provider in
parallel, burning rate limit on exactly the calls the ladder exists to avoid. The 2026-07-22 pass found 7 of 8
routes flagged for "missing allSettled" were already correct for this reason.

**Sequential accumulate-until-satisfied** (walk pages until you have enough — `sec-filings` archives) → try/catch
*inside* the loop, `break` on failure and report the range as incomplete. The bug this fixed: a thrown page fetch
propagated out and 503'd the route, throwing away filings already collected.

### Adding a coin to the transfer fee calculator
1. Add to `CoinId` union type in `transferFees.ts`
2. Add entry to `COIN_INFO` record
3. Add `GAS_AMOUNTS` entry in `network-fees/route.ts` if it has its own network
4. Add per-exchange network entries in `EXCHANGES` array for each exchange that supports it
5. Update coin selector grid columns in `transfer-fees/page.tsx` if needed

### Adding an exchange to the transfer fee calculator
1. Append to `EXCHANGES` array in `transferFees.ts`
2. Include all coin/network combinations that exchange supports
3. Use `tier: 1` for top-25 by volume, `tier: 2` for smaller exchanges
4. Note: Hyperliquid (DEX) is already included as a special case with Arbitrum-only withdrawal
