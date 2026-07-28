# Finance Now Suite — Roadmap & Module Architecture

> Working document. This is the agreed plan for evolving Finance Now from a crypto
> analytics dashboard into a modular financial suite covering asset analysis
> (multiple asset classes), investing, budgeting, and financial planning —
> sellable as one product or as individually licensed modules.

---

## Vision

One application, three kinds of modules, one license system:

| Pillar | Modules | Status |
|--------|---------|--------|
| **Analyze** | Crypto (existing Finance Now), Equities, Commodities, Rates & Treasuries, Bonds | Crypto built; others planned |
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
> Progress (2026-07-21): **Portfolio Builder plans AND portfolios are
> DB-backed** — `builder_plans` (migration 0001) + `portfolios`/`holdings`
> through the instrument layer (global rows, cgId round-trip via
> `instrument_crypto`). `/api/user/*` route namespace (excluded from the
> legacy-backend rewrite), optimistic Zustand store with client-UUID ids,
> one-time localStorage imports, plan→portfolio drift link persisted.
> Wallets / watchlist remain.
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
Superseded by the **Macro Markets module** owner spec below (2026-07-21) —
same asset classes, now framed as one entitlement-gated module with three
areas and a verified free-data story.

### Phase 6 — Productization
- Deploy (Vercel + Neon/Supabase, or VPS Docker Compose; existing K8s/Terraform
  if scale demands).
- Entitlement issuance + billing (Stripe), license keys per module bundle.
- Hardening: 2FA, rate limiting on `/api/v1`, audit logging.
- Extend `/api/v1` + MCP tools to personal data behind per-user API keys.

---


## Macro Markets (module — owner spec, 2026-07-21)

One sidebar section (module id `macro`, one entitlement/SKU) sitting **above
ETFs & Funds**, with three areas that mirror the Crypto and Equities toolsets:

| Area | Coverage | Primary data (verified live 2026-07-21) |
|------|----------|------------------------------------------|
| **Commodities** | Metals, energy, agriculture futures + ETF proxies | Yahoo futures chain (`GC=F`, `CL=F`, `SI=F`, `NG=F`, `HG=F`, grains…) through the existing `security-quotes`/`security-chart`/`security-ohlcv` routes — all three probed working |
| **Bonds & Rates** | Treasury yield curve, bond futures, bond ETFs | Yahoo yield indices (`^IRX ^FVX ^TNX ^TYX`) + futures (`ZB=F`, `ZN=F`) via existing routes; `fiscaldata.treasury.gov` (keyless) for official rates; bond ETFs already in `fundCatalog` |
| **Currencies (fiat)** | Major/EM FX pairs, dollar index | Yahoo FX (`EURUSD=X`, `JPY=X`, `DX-Y.NYB`) intraday via existing routes; `frankfurter.dev` (keyless ECB reference) for daily crosses + conversion |

**Honesty constraint (bonds):** individual corporate/muni bond quotes are
licensed data with no free source. The area is deliberately "Bonds & Rates" —
yield curve, treasury futures, bond ETFs — and must never imply CUSIP-level
quotes. Live-only rules apply as everywhere: no free source → explicit
"not available" notice.

### What mirrors over for free (verified)
The equity plumbing is symbol-agnostic where it matters: quotes, price
charts, OHLCV candles (→ shared TA engine + backtests), and `sec:`-prefixed
instrument keys (→ watchlist/portfolio/compare pricing) all already work for
futures, FX pairs, and yield indices. **No new data routes are required for
the core surfaces.**

### What must be built
1. **Catalogs** (`lib/data/`): `commodityCatalog.ts`, `ratesCatalog.ts`,
   `currencyCatalog.ts` — curated symbol lists with reference metadata,
   same pattern as `equityCatalog`/`fundCatalog`.
2. **Pages** (`app/(dashboard)/macro/…`): per-area registry pages + detail
   pages reusing `components/markets` shells (PriceChartCard etc.); shared
   TA page parameterized over macro symbols; yield-curve view for rates;
   converter widget for FX.
3. **Union extensions** (mechanical): `ProviderMarket`, agent `market`
   /`toolset`, tier categories gain `'macro'`; provider registry rows for
   the new sources so the Integrations page shows utilization like the
   other markets.
4. **News**: macro/commodity RSS feeds added to the existing multi-provider
   news architecture (new feed list, same route pattern).
5. **AI agents** (same defaults system): `macro-research` +
   `macro-screener`, toolset hitting the same `/live-data` routes the UI
   reads (one-source-of-truth rule).
6. **Instruments**: macro entries in `instruments.ts` so portfolios,
   watchlists, Compare, and Portfolio Builder drift can hold them.

### Build order (decided 2026-07-21)
Commodities → Currencies → Bonds & Rates. Commodities first: richest free
data, simplest catalog, most visual appeal. Rates last only because its UX
needs the most careful honest-data framing, not for data availability.

### Status (2026-07-21): all three areas SHIPPED
- **Commodities** — `commodityCatalog.ts` (19 verified contracts, 5 categories,
  `quoteBasis` so grains render ¢/bu not fake dollars), registry + detail pages.
- **Currencies** — `currencyCatalog.ts` (18 pairs + DXY), `/live-data/fx-rates`
  (frankfurter.dev ECB daily reference, keyless), registry + converter + detail.
- **Bonds & Rates** — `ratesCatalog.ts` (4 yield indices + 4 CBOT futures),
  `/live-data/treasury-yield-curve` (treasury.gov official 13-maturity par
  curve + 2s10s/3m10y spreads + shape), curve chart with 1M/YTD lookbacks,
  bond ETF shelf into /funds. CUSIP-honesty note on-page.
- `PriceChartCard` gained `valueFormat: 'usd' | 'plain'` (default unchanged)
  so FX/yields/cents contracts don't get $-mislabeled axes.

- **Macro News** (2026-07-21) — `/macro/news` + `/live-data/macro-news`:
  8 keyless RSS feeds, content-first pillar classifier (off-pillar articles
  dropped), 14-day staleness cutoff, future-pubDate clamp, balanced
  per-pillar merge. Area label renamed "Rates & Bonds" → "Bonds & Rates".

- **Cross-cutting integration** (2026-07-21) — everything from "What must be
  built" is now SHIPPED:
  - `market: 'macro'` across the provider registry (11 built-in rows: 3 data
    sources + 8 news feeds), tier categories (informational rows in the
    TopBar TierSwitch), and Integrations page sections (with custom macro
    news feeds supported); macro-news / fx-rates / fx-rates-extended /
    treasury-yield-curve routes are registry-driven and record utilization.
  - `macro-research` + `macro-screener` agents (toolset `'macro'`: 6 tools —
    search_macro_instruments, get_macro_quote, get_macro_price_history,
    get_yield_curve, get_fx_rates, get_macro_news). Research page has a
    Macro selector; App Assistant sees macro tools via toolset `'all'`.
  - Instruments layer: all 46 macro instruments (19 commodities, 18 FX +
    DXY, 8 rates) are `sec:`-keyed entries in `instruments.ts` with classes
    `commodity`/`currency`/`rate` and `detailPath` slug routing, resolvable
    to DB rows — watchlists, portfolios, and Compare can hold them.

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

## Affiliate links (staking first, then any relevant surface) — `P2`, gated on integrity rules

Revenue idea: earn referral commission on providers Finance Now already sends users to. Start with
the **Staking Opportunities** page, then open it to any surface where an outbound link is
genuinely useful. Applies to **both distributions — the free web version and the desktop
app** (they differ in attribution and in what some affiliate terms allow; see below).

### Non-negotiable integrity rules (decide these before writing any code)

Finance Now *rates* the providers it would be paid by — `computeOverallRisk()` scores 55 staking
providers across 6 risk dimensions. That is a real conflict of interest, and the product's
value dies if scores follow the money.

- [ ] **Affiliate status never influences ranking, scoring, sorting, or filtering.** Enforce it
      structurally: the risk engine must not be able to read the affiliate field.
- [ ] **Coverage bias is disclosed.** Exchanges (Coinbase, Kraken, Binance, OKX, Bybit) run
      referral programs; liquid-staking protocols (Lido, Rocket Pool, Marinade) largely don't —
      so paid links will cluster in CeFi. Default ordering must stay risk-based, never
      "monetizable first".
- [ ] **Warnings are never softened for a paying partner.** Celsius stays as the cautionary
      example; a high risk score stays loud even if that provider pays.
- [ ] **Per-link disclosure in the UI** (FTC requires clear and conspicuous), plus a plain
      "How we make money" page. Mark affiliate rows visibly, not in a footer nobody reads.
- [ ] **Keep the honest URL.** Add an optional `affiliateUrl` beside the existing
      `website` field in `stakingProviders.ts` — never overwrite `website`, so a
      non-affiliate path always exists and links stay auditable.

### Implementation notes

- [ ] Hook: `StakingProvider.website?` already exists (`src/lib/data/stakingProviders.ts`);
      add `affiliateUrl?` + `affiliateProgram?` and render through one shared component so
      disclosure can't be forgotten on a new surface.
- [ ] **Desktop app:** open affiliate links in the system browser (not an embedded webview) —
      cookie-based attribution usually fails in-app, and several programs' terms restrict
      desktop/app placement. Confirm per program before enabling there.
- [ ] **Web:** `rel="sponsored noopener"` on paid links (Google requires `sponsored`).
- [ ] Track click-through per provider so the value is measurable, without shipping
      user-identifying analytics.

### Other surfaces to consider once the pattern exists

- [ ] **Transfer Fee Calculator** — the highest-intent surface in the app, and
      `docs/MARKET-ASSESSMENT.md` already notes competing fee/bridge comparators are
      affiliate-monetized. Same integrity rules: cheapest route wins, never the paying route.
- [ ] **Coin Registry / Wallets** — exchange and hardware-wallet signups.
- [ ] Equities/Funds modules — brokerage referrals, if the terms allow a research context.

### Legal / compliance

- [ ] FTC disclosure (US) + equivalent rules in other jurisdictions; crypto affiliate
      marketing is restricted or licensed in some (UK FCA financial-promotion rules apply to
      crypto referrals).
- [ ] Keep the informational framing already in the risk register — a paid link next to a risk
      score edges closer to "recommendation"; disclaimers must stay prominent.
- [ ] Review each program's terms for: app/desktop placement, comparison-table rules, and
      whether ranking-with-payment is permitted at all.

## Owner backlog (2026-07-26 brain dump)

Finance Now-side items only. Chronolens items went to that project's own checklist; company-level
items (entity filing, federal regulation research, disclosure docs, "what is sellable")
went to `docs/BUSINESS-CHECKLIST.md`, which is worked separately from both products.

- [x] ~~**Open a working session on the risk framework for the desktop app.**~~ SETTLED —
      R1/R2 (2026-07-19) ratified the single canonical scale (0–100, higher = safer,
      bands 80/60/40/20; see `docs/architecture/risk-scale-spec.md`) and shipped the
      migration. The "3-scale inconsistency" premise came from a stale memo and was
      disproved against the code; the market assessment's Phase 0 blocker is obsolete.
      Do not re-litigate this — new profiles build on the shipped scale.
- [ ] **Desktop update mechanism — and whether updates are monetized.** How does an installed
      copy get new versions (auto-update channel? manual download? signed releases?), and does
      that ride the entitlement system (Phase 6) as paid upgrades, a subscription, or free
      updates with paid modules. Affects installer choice, code signing, and release cadence.
- [ ] **Options / futures tool.** New instrument surface. Macro Markets already prices futures
      contracts through `security-quotes`/`security-chart` (19 commodity contracts, 4 CBOT rate
      futures), so the quote plumbing exists; options chains do not — that needs a provider
      decision (and most options data is paid).
- [ ] **Bond ladder tool + bond affiliate links.** ⚠ Note before building: Portfolio Builder
      **already has** a bond ladder (`bondLadder(horizon)` / `consolidateLadder()` in
      `lib/data/portfolioBuilder.ts`, duration-matched SHY→IEF→BND→TLT). Decide whether this is
      surfacing that engine as a standalone tool or extending it. Affiliate half extends the
      affiliate-links section above — same integrity rules (ladder is chosen by duration match,
      never by who pays).
- [ ] **Linking brokerage accounts / helping power users process trades.** ⚠ **The largest
      regulatory step in the backlog** — routing or assisting orders is execution, not
      information, and touches broker-dealer territory. Scope it deliberately: read-only
      position sync (the safe version, extends the existing wallet/exchange-credential
      pattern) is a different product from anything that places or pre-fills trades. Decide
      which before any provider work.
- [ ] **Fine-tune all screeners.** Stock Registry range screener, coin screener/discovery, fund
      screener, TA screener — consistency of filters, defaults, and result quality across them.
- [ ] **Label every data source on screen, per the house policy.** Finance Now's side of the
      source-labeling item in `docs/BUSINESS-CHECKLIST.md`: the provider registry already
      records which provider served each surface, and the tier dropdown exposes sourcing per
      category — but attribution isn't consistently rendered where a reader sees the number.
      Includes marking *derived* values (risk scores, composites) as Finance Now's own computation,
      never as a provider's figure.
- [ ] **Test and fine-tune all agents and AI-enhanced tools.** 11 agents exist; `data-scraper`,
      `equity-data-scraper` and `equity-diligence` are configurable but have **no invocation
      trigger** — either give them a UI entry point or retire them. Judge output against the
      REAL vs FALLBACK rule: an agent answering vaguely off a fallback route is a data problem,
      not a prompt problem.

## Rough sizing (from prior analysis)

- Foundation + porting Finance Now into the module shell: ~3–4 weeks part-time.
- Budget + Plan modules: ~3–4 weeks.
- First new asset class (equities): ~2–3 weeks; each subsequent class 1–2.
- Bonds: gated by data licensing, sequence last or ship as free-data
  "Rates & Treasuries" first.

## Open decisions (revisit at the phase that needs them)

- Equities data provider (FMP vs Polygon vs Alpha Vantage) — Phase 4.
- Bank sync provider (Plaid vs Teller) if/when CSV import isn't enough.
- Whether the FastAPI backend returns for scoring/backtesting workloads.
- Billing model: per-module licenses vs. tiered bundles — Phase 6.
