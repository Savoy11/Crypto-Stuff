# CAEP — Crypto Asset Evaluation Platform
## Claude Code Project Guide

This file is auto-loaded by Claude Code at session start. It gives instant context so you can make changes without re-exploring the codebase.

---

## What This Is

An institutional-grade financial analytics suite built with Next.js 14 (App Router). It began as a crypto dashboard (risk, reserves, news sentiment, transfer fees, staking) and is evolving into an entitlement-gated module suite (see `docs/ROADMAP.md`): the **Crypto** module (original CAEP), an **Equities** module (`/equities`), and an **ETFs & Funds** module (`/funds`). Modules are declared in `src/lib/modules/registry.ts`; the sidebar renders from that registry, and modules can be toggled in Integrations → Suite Modules. The backend API is a separate service (not in this repo) — the frontend either connects to it or falls back to mock data.

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
│   │   ├── dashboard/page.tsx
│   │   ├── assets/page.tsx         # Asset registry with live prices
│   │   ├── risk-scores/page.tsx
│   │   ├── reserves/page.tsx
│   │   ├── alerts/page.tsx
│   │   ├── watchlist/page.tsx
│   │   ├── news/page.tsx           # Per-coin news feed with sentiment
│   │   ├── social/page.tsx
│   │   ├── global-adoption/page.tsx
│   │   ├── transfer-fees/page.tsx  # Transfer Fee Calculator
│   │   ├── staking/page.tsx        # Staking Opportunities
│   │   ├── equities/               # EQUITIES MODULE — Stock Registry + [symbol] detail
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
│       ├── security-quotes/route.ts # Stock/ETF/fund quotes (FMP→Yahoo→Stooq→reference)
│       ├── security-chart/route.ts  # Price history for any Yahoo-quotable symbol
│       └── market-news/route.ts     # Stock-market RSS news with sentiment
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx             # Renders from module registry (see lib/modules)
│   │   ├── ModuleGate.tsx          # Wraps module pages; locks when module disabled
│   │   ├── TopBar.tsx
│   │   ├── StatusBar.tsx
│   │   └── DataStatusBanner.tsx
│   ├── ui/                         # Generic reusable components
│   ├── charts/                     # Recharts wrappers
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
│   ├── data/                       # Static/semi-static data files (no API calls)
│   │   ├── transferFees.ts         # 25 exchanges × 16 coins × 16 networks
│   │   ├── stakingProviders.ts     # 18 staking providers with risk profiles
│   │   ├── equityCatalog.ts        # ~70 large-cap stocks, 11 sectors, reference data
│   │   └── fundCatalog.ts          # ~55 ETFs/mutual funds + computeFeeDrag()
│   ├── api/                        # API client functions
│   │   ├── live/                   # Live data fetchers (CoinGecko, marketData.ts, etc.)
│   │   └── mock/                   # Mock data for offline/dev mode
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
   - Always use `Promise.allSettled` for multiple external fetches — never let one failure crash the route

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

- **`CoinId`** union — 16 coins: `'btc' | 'eth' | 'usdt' | 'usdc' | 'bnb' | 'sol' | 'dai' | 'xrp' | 'ltc' | 'trx' | 'doge' | 'matic' | 'avax' | 'ada' | 'dot' | 'atom'`
- **`NetworkId`** union — 16 networks: erc20, trc20, bep20, solana, polygon, arbitrum, base, optimism, avalanche, bitcoin, xrpl, litecoin, dogecoin, cardano, polkadot, cosmos
- **`EXCHANGES`** array — 25 exchanges (Binance through Hyperliquid), each with per-coin/per-network `withdrawFee`, `minWithdraw`, `withdrawEnabled`, `depositEnabled`, optional `note`
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
- **`STAKING_PROVIDERS`** array — 18 providers:
  - CeFi: Celsius (defunct, cautionary), Coinbase, Kraken, Binance, OKX, Bybit
  - Wallet: Ledger Live, MetaMask, Phantom, Trust Wallet, Exodus
  - Liquid: Lido, Rocket Pool, Marinade, Jito, Stride, Benqi, Ankr

To add a provider: append to `STAKING_PROVIDERS` following the pattern. Celsius should always be kept — it's used as the educational cautionary example.

### `src/lib/data/equityCatalog.ts` (Equities module)
- **`EQUITY_CATALOG`** — ~70 large-cap US stocks with sector (11 GICS sectors in `SECTOR_INFO`), industry, and approximate reference values (price, market cap, P/E, dividend yield, beta). Reference values are fallbacks — live quotes override price/change.
- Symbols use Yahoo notation (`BRK-B`, not `BRK.B`) so one string works across Yahoo/Stooq/FMP.
- To add a stock: append to `EQUITY_CATALOG`; the registry table, detail route, and quote universe pick it up automatically.

### `src/lib/data/fundCatalog.ts` (Funds module)
- **`FUND_CATALOG`** — ~55 funds (`type: 'etf' | 'mutual'`) with issuer, category (`FUND_CATEGORY_INFO`), expense ratio, AUM, yield, inception, tracked index, and indicative top holdings.
- **`computeFeeDrag(principal, erPct, years, returnPct)`** — expense-ratio cost projection used by the Fee Drag Analyzer on fund detail pages.
- To add a fund: append to `FUND_CATALOG` following the pattern.

### Quote plumbing for both modules (`src/lib/api/live/marketData.ts`)
Source ladder: FMP (needs `FMP_API_KEY`) → Yahoo spark (keyless) → Stooq CSV (keyless) → catalog reference prices. UI labels non-live prices with a small amber `ref` tag; KPIs needing live data show "requires live quotes" instead of fabricated values.

---

## Environment Variables

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000    # Backend API (optional — falls back to mock)
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws   # WebSocket (optional)
NEXT_PUBLIC_USE_MOCK=true                   # Force mock data
NEXT_PUBLIC_LIVE_DATA=true                  # Enable live CoinGecko prices (default: true)
FMP_API_KEY=...                             # Optional — upgrades equities/funds quotes (adds market cap, proper change %)
```

The app runs fully without a backend. Set `NEXT_PUBLIC_USE_MOCK=true` or just don't set `NEXT_PUBLIC_API_URL` and all data comes from mock files in `src/lib/api/mock/`.

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

| Feature | Route | Data source | Notes |
|---------|-------|-------------|-------|
| Dashboard | `/dashboard` | CoinGecko + mock | Overview metrics |
| Asset Registry | `/assets` | CoinGecko live + mock catalog | 25+ assets |
| Risk Scores | `/risk-scores` | Mock (derived metrics) | Scoring N/A without backend |
| Reserves | `/reserves` | Mock | Reserve composition charts |
| Alerts | `/alerts` | Mock | Alert management |
| Watchlist | `/watchlist` | Mock | User watchlist |
| News | `/news` | RSS/JSON multi-provider | Per-coin filtering, sentiment, asset detection |
| Social | `/social` | Mock | Social sentiment |
| Global Adoption | `/global-adoption` | Static | Country-level adoption map |
| Transfer Fee Calc | `/transfer-fees` | `transferFees.ts` + live gas | 25 exchanges, 16 coins, 16 networks |
| Staking | `/staking` | `stakingProviders.ts` + live APR | 18 providers, risk scoring, Celsius warning |
| Backtests | `/backtests` | Mock | Strategy backtesting |
| Reports | `/reports` | Mock | Report generation |
| Stock Registry | `/equities` | `equityCatalog.ts` + live quotes | ~70 stocks, 11 sectors, sortable, breadth KPIs |
| Equity Detail | `/equities/[symbol]` | Live chart/news + reference stats | Chart, 52-wk range, key stats, news |
| Fund Registry | `/funds` | `fundCatalog.ts` + live quotes | ~55 ETFs/mutual funds, expense-ratio color coding |
| Fund Detail | `/funds/[symbol]` | Live chart/news + fund facts | Fee Drag Analyzer, top holdings, 52-wk range |
| Settings | `/settings` (→ Integrations) | — | Integration configuration + Suite Modules toggles |

---

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

A standalone Node.js MCP server at `Crypto-Stuff/mcp-server/` that exposes CAEP tools to Claude and any MCP-compatible AI agent. It calls the `/api/v1/` endpoints — CAEP frontend must be running.

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
    "caep": {
      "command": "node",
      "args": ["C:/Users/marcu/OneDrive/Desktop/Crypto-Stuff/mcp-server/dist/index.js"],
      "env": { "CAEP_BASE_URL": "http://localhost:3000" }
    }
  }
}
```
Claude Desktop config lives at `%APPDATA%\Claude\claude_desktop_config.json` on Windows.

### Add to Claude Code (project-level MCP)
```bash
# Run from any directory — adds CAEP MCP to this project's .claude/settings.json
claude mcp add caep node C:/Users/marcu/OneDrive/Desktop/Crypto-Stuff/mcp-server/dist/index.js
```

### Environment variable
`CAEP_BASE_URL` — base URL of running CAEP instance (default: `http://localhost:3000`)

---

## Common Patterns

### Resilient multi-fetch (use this for all live-data routes)
```typescript
const [res1, res2] = await Promise.allSettled([fetch(url1), fetch(url2)])
if (res1.status === 'fulfilled' && res1.value.ok) { /* use it */ }
// always fall through to static defaults if fetch fails
```

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
