# CAEP Suite — Roadmap & Module Architecture

> Working document. This is the agreed plan for evolving CAEP from a crypto
> analytics dashboard into a modular financial suite covering asset analysis
> (multiple asset classes), investing, budgeting, and financial planning —
> sellable as one product or as individually licensed modules.

---

## Vision

One application, three kinds of modules, one license system:

| Pillar | Modules | Status |
|--------|---------|--------|
| **Analyze** | Crypto (existing CAEP), Equities, Commodities, Rates & Treasuries, Bonds | Crypto built; others planned |
| **Invest** | Portfolio (holdings, cost basis, P&L), Wallets, Watchlists | UI exists; needs real persistence |
| **Budget & Plan** | Budgeting (accounts, transactions, budgets), Planning (net worth, goals, projections) | New |

Differentiator: the personal-finance modules see live market data from the
analysis modules (crypto portfolio value flows straight into net worth), and
the `/api/v1` + MCP layer turns the whole suite into a personal-finance
assistant surface for AI agents.

**Decisions made (2026-07):**
- **Public product** eventually → multi-tenant architecture from day one.
- **Local-first for now** → no deployment work yet; Postgres runs in Docker
  Compose; everything stays portable to Vercel/Neon or a VPS later.
- **Budget data via manual entry + CSV import** first; bank sync (Plaid/Teller)
  deferred until revenue justifies it.
- **Crypto first, stocks later** → Equities module comes after the
  personal-finance pillars are usable.

---

## Architecture: one app, entitlement-gated modules (Option A)

Keep a single Next.js app. Each module is a sidebar section that only renders
if the user's entitlements include it. Selling separately = issuing license
keys that unlock modules. One deploy, one auth, shared portfolio/watchlist for
free.

A monorepo of separate apps (Option B) is the graduation path if we ever need
separate domains / white-labeling. Option A migrates cleanly to Option B **if
module boundaries stay disciplined** — that discipline is defined below.

### Module contract

Every module is registered in `src/lib/modules/registry.ts`:

```typescript
interface SuiteModule {
  id: ModuleId                    // 'crypto' | 'portfolio' | 'budget' | 'plan' | 'equities' | ...
  label: string
  icon: LucideIcon
  navItems: NavItem[]             // sidebar entries this module contributes
  entitlement: EntitlementId      // which license flag unlocks it ('core' = always on)
  routePrefixes: string[]         // e.g. ['/budget'] — used for route guarding
}
```

Rules that keep boundaries clean (and Option B possible later):

1. A module's pages live under its own route folder(s) and import shared code
   only from `components/ui`, `components/charts`, `lib/` core, and its own
   module folder — never from another module's folder.
2. Cross-module data flows through the database schema or `/api/v1`, never
   through direct imports of another module's internals.
3. The sidebar renders from the registry filtered by the session's
   entitlements; in local dev all entitlements are granted.

### Data model core (the make-or-break decision)

A crypto asset, a stock, and a bond don't share metrics. The schema splits
into a common core plus per-class extensions:

- **`instruments`** (core): `id`, `symbol`, `name`, `asset_class`
  (`crypto | equity | etf | commodity | bond | cash | manual`), `price_source`,
  `currency`. Everything price-quotable is an instrument — including a manual
  "my house" asset with a user-supplied value.
- **Per-class extension tables**: `instrument_crypto` (network info, categories),
  later `instrument_equity` (exchange, sector), `instrument_bond`
  (yield, duration, rating), etc.
- **Personal-finance tables reference `instrument_id`, never asset-class
  specifics.** `holdings`, `transactions`, `watchlist_items`, and net-worth
  snapshots all join through `instruments`. This is what makes Portfolio,
  Budget, and Plan automatically cross-asset when new analysis modules land.

All user-owned tables carry `user_id` (multi-tenant from day one):
`users`, `entitlements`, `portfolios`, `holdings`, `trade_transactions`,
`watchlists`, `finance_accounts`, `finance_transactions`, `budget_categories`,
`budgets`, `recurring_rules`, `goals`, `net_worth_snapshots`.

### Stack

- Persistence added **directly to the Next.js app**: Postgres (Docker Compose
  locally) + Drizzle ORM + Auth.js. One language, one deployable.
- The existing FastAPI backend stays dormant — it can return later as an
  analytics/scoring engine; nothing in this plan blocks that.
- Existing `/live-data/*` routes, `/api/v1`, and the MCP server are unchanged
  by the foundation work and get extended per phase.

---

## Phases

Each phase leaves the app fully working and usable day-to-day.

### Phase 0 — Foundation
- Docker Compose service for Postgres; `.env.local` wiring.
- Drizzle ORM + initial multi-tenant schema (tables above) + migrations.
- Auth.js (credentials now; OAuth later) replacing the mock login;
  session-aware `useAuthStore`.
- Module registry + entitlement gating in `Sidebar.tsx` (all-granted in dev).
- Seed `instruments` from the existing coin catalog.

**Done when:** you can register, log in, and the sidebar renders from the
module registry.

### Phase 1 — Invest on real data
- Migrate portfolios / wallets / watchlist pages from localStorage & mocks to
  DB-backed API routes.
- Trade transaction history (buy/sell/transfer) → cost basis, realized and
  unrealized P&L, using existing live price routes.

**Done when:** a portfolio built from recorded trades shows correct live P&L
after a browser wipe.

### Phase 2 — Budget module
- `finance_accounts` (checking, savings, credit card, cash) and manual
  transaction entry.
- CSV import with column mapping + saved import profiles per bank;
  rule-based auto-categorization.
- Monthly budgets vs. actuals; recurring-transaction detection.

**Done when:** a real bank CSV imports, categorizes mostly automatically, and
the month's budget page tells the truth.

### Phase 3 — Plan module
- Net worth: finance accounts + manual assets/liabilities + live crypto
  portfolio value; periodic `net_worth_snapshots` for the trend chart.
- Goals with funding progress.
- Projections: compound growth, retirement/savings what-if scenarios,
  cash-flow forecast from recurring rules.

**Done when:** one page shows total net worth (bank + crypto + manual assets)
with history and a credible 12-month projection.

### Phase 4 — Equities module (first new asset class)
- Data connector (FMP / Polygon / Alpha Vantage — decide at phase start).
- `instrument_equity` extension; quotes, charts, news reuse existing UI shells.
- Portfolio/watchlist/net-worth pick equities up automatically via the
  instrument core — that's the payoff of the Phase 0 design.

### Phase 5 — Commodities, Rates & Treasuries
- Commodities: futures quotes + curated catalog (same pattern as transfer-fee
  data). Rates & Treasuries: FRED (free). Corporate/muni bonds deferred —
  gated by data licensing cost, not engineering.

### Phase 6 — Productization
- Deploy (Vercel + Neon/Supabase, or VPS Docker Compose; existing K8s/Terraform
  if scale demands).
- Entitlement issuance + billing (Stripe), license keys per module bundle.
- Hardening: 2FA, rate limiting on `/api/v1`, audit logging.
- Extend `/api/v1` + MCP tools to personal data behind per-user API keys.

---


## Portfolio Builder (paid module — owner spec, 2026-07-07)

A separately licensed module (own entitlement → own SKU) that builds **highly
diversified portfolios aligned to the user**, not generic model portfolios:

1. **Inputs (questionnaire):** risk tolerance; sector focus/exclusions; time
   horizon to retirement; and when the invested money will actually be used
   (glide path anchors to the *spend date*, not just retirement date);
   crypto comfort level.
2. **Output:** a target allocation across asset classes mapped to concrete
   instruments from the catalogs (broad ETFs first, then sector tilts, bonds
   laddered to the spend date, optional crypto sleeve capped by risk), each
   with a written rationale and a diversification score.
3. **Rebalancing:** every built portfolio carries drift bands (e.g. ±5% abs);
   the app reminds the user when actual weights breach bands and shows the
   exact trades to rebalance.
4. **Ongoing suitability monitoring:** periodic checks that holdings still fit
   the plan (risk drift, fee creep, concentration, aging glide path) with
   plain-language flags.
5. Depends on the cross-asset instrument layer + DB persistence (Phase 0/1);
   reminders need notifications; monetized via the entitlement system (Phase 6).
   Not investment advice — educational tooling with prominent disclaimers.

## Rough sizing (from prior analysis)

- Foundation + porting CAEP into the module shell: ~3–4 weeks part-time.
- Budget + Plan modules: ~3–4 weeks.
- First new asset class (equities): ~2–3 weeks; each subsequent class 1–2.
- Bonds: gated by data licensing, sequence last or ship as free-data
  "Rates & Treasuries" first.

## Open decisions (revisit at the phase that needs them)

- Equities data provider (FMP vs Polygon vs Alpha Vantage) — Phase 4.
- Bank sync provider (Plaid vs Teller) if/when CSV import isn't enough.
- Whether the FastAPI backend returns for scoring/backtesting workloads.
- Billing model: per-module licenses vs. tiered bundles — Phase 6.
