# P3 Production Review — Feature Inventory & Readiness (Wave 1)

_Dated **2026-08-12**, reviewed at commit **`852f260`** (main). This is the Wave 1
working resource for the Phase 3 production-readiness review
(docs/TASK-QUEUE.md, "Phase 3"). It is built to be walked through with the owner in
Wave 2, one module per sitting: every feature of every built module, what backs it,
whether it is reachable, tested, and documented, and a readiness verdict._

**Method.** Every feature was verified by following the path a request takes — page →
query → route handler → upstream → render — never by parts inventory (the
production-readiness scorecard's JWT-revocation lesson). Data-availability statuses are
**copied from `DATA-AVAILABILITY.md`** (last owner-machine measurement 2026-07-29, tree
`54fbf0c`, with the 2026-08-06 Yahoo-removal prediction block layered on top) — a
container cannot measure availability (IP-dependence rule), so rows that need a fresh
measurement say so and defer to Wave 2, where the owner is present.

**Inputs read:** CLAUDE.md, `DATA-AVAILABILITY.md`, `docs/agents/code-checker.md`
(do-not-fix registry — its entries are honored throughout and not re-flagged),
`docs/TASK-QUEUE.md` Phase 3 preamble + known seeds, `src/lib/modules/registry.ts`,
the vitest inventory (44 test files), and the page/route/store source for each feature
below. `docs/audits/rejected-proposals.md` — required reading per the ground rules —
**does not exist** (see Appendix C).

## Verdict legend

| Verdict | Meaning |
|---|---|
| **READY** | Works end-to-end, degrades honestly, documented. Ship as-is. |
| **NEEDS-FIX** | Works or mostly works, but has a scoped defect/gap that should land before rollout. The fix is stated. |
| **NEEDS-OWNER-DECISION** | Not a code problem — a product/scope/sourcing question only the owner can answer. The question is stated. |
| **NOT-FOR-ROLLOUT** | Should not ship in the initial rollout as-is (hide, gate, or cut — Wave 2 decides which). |

Column key: **Reach** = every backend capability has a UI and every UI promise has
backing (✅, or ⚠ see notes) · **Test** = user-actionable numbers come from pure,
vitest-covered code (✅ / ➖ none rendered / ⚠ gap) · **Doc** = present in CLAUDE.md
feature inventory / DATA-AVAILABILITY / ROADMAP as applicable.

---

## Module: Core (always on)

_(section filled from the request-path sweep — see tables below)_

---

## Module: Crypto

_(section filled from the request-path sweep — see tables below)_

---

## Module: Equities

Eight pages under `/equities`. The no-key story is consistent everywhere
(post-2026-08-06): quotes fall to catalog reference behind the amber `ref` tag,
chart/OHLCV surfaces render `LiveUnavailable` naming the terms withdrawal and the key
fix, calendar/universe render `configured:false` setup cards. **No fabricated values
found on any page. SourceLine present on all pages** (ids verified in
`dataSources.ts`).

| # | Feature | Route | Data path | Reach | Test | Doc | Verdict |
|---|---------|-------|-----------|:-----:|:----:|:---:|---------|
| E1 | Stock Registry: sortable/paginated universe (FMP screener; 79-name curated fallback), visible-page live quotes, dual `ref` tags (price + mkt cap) | `/equities` | `stock-universe`, `security-quotes` | ✅ | ✅ P/E backfill tested | ✅ | READY¹ |
| E2 | Screener: range filters + 11 sector chips + search, deep-linkable URL state | `/equities` | client-side | ✅ | ➖ | ✅ | READY¹ |
| E3 | AI Outlier Scan panel (equity-screener agent) | `/equities` | `/api/agents/research` → `get_stock_outliers` | ✅ | ➖ | ✅ | READY |
| E4 | Detail header: quote, `ref` tag, non-catalog ticker resolution (FMP profile), Analyze-with-AI deep link | `/equities/[symbol]` | `security-quotes`, `stock-universe?symbol=` | ✅ | ➖ | ✅ | READY |
| E5 | Price History chart (6 ranges) + 52-week range bar | `/equities/[symbol]` | `security-chart` (keyed) | ✅ | ➖ | ✅ | READY² |
| E6 | Financial Ratios & Metrics: 4 groups × 5 rows from SEC XBRL + client-side valuation multiples; YoY chips; annual revenue/earnings chart | `/equities/[symbol]` | `company-facts` (keyless) | ✅ | ⚠³ | ✅ | **NEEDS-FIX³** |
| E7 | Company profile card (EDGAR registrant + Wikipedia) + EDGAR statement quick-links | `/equities/[symbol]` | `company-profile` (keyless) | ✅ | ➖ | ✅ | READY |
| E8 | SEC filings feed: 10-K/10-Q/8-K tabs, 8-K item labels, archive pager to the 1990s | `/equities/[symbol]` | `sec-filings` (keyless) | ✅ | ➖ | ✅ | READY |
| E9 | Sector peers table (top-8 by mkt cap, live quotes; curated catalog only) | `/equities/[symbol]` | `security-quotes` | ✅ | ➖ | ✅ | READY |
| E10 | Per-ticker news (general wires filtered to articles naming the company — deliberate, post-Yahoo) | `/equities/[symbol]`, `/equities/news` | `market-news` | ✅ | ➖ | ✅ | READY |
| E11 | Market News page: 50-article feed, category/sentiment/Breaking tags, symbol + keyword filters, watchlist bias (tested) | `/equities/news` | `market-news` (keyless) | ✅ | ✅ bias/feedParse/pubDate | ✅ | READY |
| E12 | Stock Social: Reddit + StockTwits feed with per-provider attribution | `/equities/social` | `stock-social` (keyless) | ✅ | ✅ socialBlend | ✅ | READY⁴ |
| E13 | Sentiment Overview: per-symbol −100..+100 score + pos/neg split, method disclosed on-page | `/equities/social` | computed in `stock-social/route.ts:226` | ✅ | ⚠⁴ | ✅ | NEEDS-FIX⁴ |
| E14 | Equity TA: universe combobox (free-text passthrough), candlestick chart, 6 ranges, shared indicator registry + drawing tools | `/equities/technical-analysis` | `security-ohlcv` (keyed) | ✅ | ✅ indicators ×3 + ohlcvAdjust | ⚠⁵ | NEEDS-FIX⁵ |
| E15 | TA Signal Summary + pattern detection (top 5, confidence %) | `/equities/technical-analysis` | `computeSignalSummary` / `detectPatterns` | ✅ | ⚠⁶ | ✅ | READY⁶ |
| E16 | TA Screener tab: 24 fixed large-caps, RSI(14) / vs SMA50 / composite | `/equities/technical-analysis` | 24× `security-ohlcv` | ✅ | ⚠⁶ | ✅ | READY⁶ |
| E17 | Strategy Backtests: 3 strategies on real history, fee tiers (0–25bps/side), full metrics, growth-of-$100 curve, round-trips table | `/equities/backtests` | `security-ohlcv` (keyed) | ✅ | ✅ equityBacktest (incl. fees) | ⚠⁷ | READY⁷ |
| E18 | Market Calendar: 14-day earnings (free FMP key) + US economic events (paid FMP tier) | `/equities/calendar` | `market-calendar` | ⚠⁸ | ➖ | ✅ | NEEDS-FIX⁸ |
| E19 | Trade Risk Scorer: 1–4 legs, presets, manual IV rank (pinned), 5-dimension composite score with evidence; quote prefill is the one live number | `/equities/options` | pure `optionsTrade.ts` + `security-quotes` prefill | ✅ | ✅ profiles + presets | ✅ | READY⁹ |

**Notes:**
1. One behavioral inconsistency for Wave 2: sorting the registry by price orders on the
   *reference* price while the cell displays the live quote
   (`EquitiesClient.tsx:106`) — ordering and display can disagree.
2. With no key, the 52-week bar silently hides (returns null) rather than rendering its
   own empty state — the chart above it explains, so acceptable; noted for completeness.
3. **Every XBRL-derived ratio** (margins, ROE, ROA, current ratio, D/E, FCF, YoY
   growth) is computed inline in `company-facts/route.ts:206-229`, and the four
   valuation multiples client-side in `FinancialRatios.tsx:52-55` — none of it is in a
   tested pure module. This is the largest single block of untested user-actionable
   numbers in the app. Fix: extract to `lib/` + vitest (the `secFundamentals.ts`
   pattern, which is tested, sits right next to it).
4. The sentiment *score* (a number users act on) is untested — `socialBlend.test.ts`
   covers provider blending only. Small extraction + test.
5. Copy defect: the page subtitle still says **"18 indicators"**; the shared registry
   renders ~63 (the 18 predates the shared-engine migration; the code comment documents
   the migration, the subtitle wasn't updated). CLAUDE.md's feature inventory carries
   the same stale "18 indicators" — Appendix A.
6. Signal-summary vote weighting and pattern detection have degenerate-input tests
   only; underlying indicator math is heavily tested. Correctness-of-aggregation test
   is a nice-to-have, not a blocker.
7. Backtests' symbol select is the 79-name curated catalog while TA charts any ticker —
   an inconsistency worth a Wave 2 decision (bounded select may be deliberate). Fee
   tiers are undocumented in CLAUDE.md — Appendix A.
8. On a **free** FMP key the economic-events panel is permanently "No notable events
   returned" — the econ calendar is a paid endpoint (402), which the route swallows via
   `allSettled` and the page copy ("free API key required") misattributes. Fix: state
   the paid gate in the panel's empty state.
9. `scoreOptionsTrade` is wrapped in a catch that returns null, so an engine throw
   degrades silently to "fill in the trade" copy — masks a real-bug class; low
   severity, Appendix C.

**Summary:** 19 features — 14 READY, 4 NEEDS-FIX (XBRL ratio test gap, sentiment-score
test gap, TA copy, calendar copy), 1 with a Wave 2 inconsistency question (E1 note).
Nothing NOT-FOR-ROLLOUT. The module's honest-degradation story is exemplary; its gap
pattern is *test coverage on derived numbers*, not behavior.

---

## Module: ETFs & Funds

Two pages. Registry universe is keyless (NASDAQ directory + SEC company_tickers);
holdings are keyless and authoritative (SEC N-PORT). The Returns surface is the app's
model citizen for degrading honestly (screening/sorting deliberately OFF post-Yahoo
rather than screening a page and pretending it screened the universe).

| # | Feature | Route | Data path | Reach | Test | Doc | Verdict |
|---|---------|-------|-----------|:-----:|:----:|:---:|---------|
| F1 | Fund Registry: ~30k-row universe (every US-listed ETF + SEC mutual-fund classes + 118 curated), compact hydration, per-directory outage banners | `/funds` | `fund-universe` (keyless) | ✅ | ➖ | ✅ | READY |
| F2 | Screener sidebar: type/style/issuer/industry/risk/strategy + expense/AUM/age/price/yield ranges, deep-linkable URL | `/funds` | client-side | ✅ | ➖ | ✅ | READY |
| F3 | Sortable table: page-scoped live quotes with `ref` tags, expense color bands, LEV/INV badges, trading-restriction clock | `/funds` | `security-quotes` | ✅ | ➖ | ✅ | READY |
| F4 | Returns tab: trailing 1M/3M/YTD/1Y, visible page only; screening/sorting on returns deliberately OFF with an explanatory panel | `/funds` | `security-returns` (Tiingo, keyed, cap 60; `?universe=` refused) | ✅ | ⚠¹ | ✅ | **NEEDS-FIX¹** |
| F5 | Fund detail header: quote + `ref`, badges, non-catalog resolution, trading-restriction banner | `/funds/[symbol]` | `security-quotes`, `fund-universe?symbol=` | ✅ | ➖ | ✅ | READY |
| F6 | Price chart + 52-week bar | `/funds/[symbol]` | `security-chart` (keyed) | ✅ | ➖ | ✅ | READY |
| F7 | Fund Facts (11 rows, hover explainers) + always-visible ProvenanceNotice (stale >120d) | `/funds/[symbol]` | `fundCatalog.ts` | ✅ | ✅ catalog provenance tested | ✅ | READY |
| F8 | Fee Drag Analyzer: projections vs 3bps benchmark, negative drag rendered as a saving | `/funds/[symbol]` | pure `computeFeeDrag` | ✅ | ✅ fundCatalog.test | ✅ | READY |
| F9 | Underlying Investments: full portfolio (N-PORT → FMP → catalog), source pills, KPI strip, equity cross-links | `/funds/[symbol]` | `fund-holdings` | ⚠² | ➖ | ✅ | NEEDS-FIX² |
| F10 | Sector weights (FMP leg only) | `/funds/[symbol]` | `fund-holdings` FMP leg | ⚠² | ➖ | ✅ | NEEDS-FIX² |
| F11 | Holdings Change History: quarter-vs-quarter N-PORT diff — NEW/EXIT/ADD/TRIM, period pickers, est. turnover | `/funds/[symbol]` | `fund-holdings-history` (EDGAR → FMP) | ⚠² | ⚠³ | ✅ | NEEDS-FIX²³ |
| F12 | Fund news (symbol mode for ETFs, general for mutual funds — commented rationale) | `/funds/[symbol]` | `market-news` | ✅ | ➖ | ✅ | READY |

**Notes:**
1. **`computeReturns` (`lib/utils/returns.ts:23`) — the 1M/3M/YTD/1Y percentages users
   compare funds on — has zero tests.** YTD prior-year-close boundary and short-series
   null logic unverified. Clear house-rule violation; small fix.
2. **Real bug: `fund-holdings/route.ts:31` and `fund-holdings-history/route.ts:18`
   read `process.env.FMP_API_KEY` at module scope instead of `getProviderKey('fmp')`.**
   Everywhere else in the app a key saved in the Integrations UI wins over env; on
   these two routes a UI-saved FMP key silently does nothing — no FMP holdings
   fallback, no sector weights — while quotes/universe/calendar accept the same key.
   The history route's key-missing copy even instructs `.env.local`, confirming
   env-only. Fix: resolve via `getProviderKey` like every other consumer.
3. Holdings-history diff math (deltaPct, NEW/EXIT/ADD/TRIM classification,
   `turnoverPct = Σ|Δ|/2`) and the `nport.ts` parser are untested — figures users act
   on. Extraction + vitest.
4. The Asset Allocation donut never renders — `assetAllocation` is always `[]` since
   the only source was withdrawn on terms grounds; documented as deliberate at both
   ends and invisible to users. Fine for rollout as-is; N-PORT per-position categories
   are a possible future derived source (Appendix B).

**Summary:** 12 features — 8 READY, 4 NEEDS-FIX (one real bug — the env-only FMP key;
two test gaps; both scoped). Nothing NOT-FOR-ROLLOUT.

---

## Module: Macro Markets

_(section filled from the request-path sweep — see tables below)_

---

## Module: ETFs & Funds

_(section filled from the request-path sweep — see tables below)_

---

## Module: Budget

Two pages (`/budget`, `/budget/transactions`), 12 API routes under
`/api/user/budget/*`, pure logic in `lib/budget/` (csv 197 / categorize 77 /
recurring 113 lines; 3 test files). No external providers — no SourceLine by design
(stated in the page code and the registry). All user data, ownership-scoped via
`budgetGuard()`.

**The module's shape:** the backend is complete — full CRUD on every table — and the
UI reaches roughly half of it. Every gap below is UI work against APIs that already
exist; no schema change, no migration.

| # | Feature | Route | Data path | Reach | Test | Doc | Verdict |
|---|---------|-------|-----------|:-----:|:----:|:---:|---------|
| B1 | Accounts: create, list with live balance (opening anchor + transaction sum), delete with confirm | `/budget/transactions` | `accounts` GET/POST, `accounts/[id]` DELETE | ⚠¹ | ⚠² | ✅ | NEEDS-FIX¹² |
| B2 | Manual transaction entry (signed amount, date, account, category or "Auto (rules)") | `/budget/transactions` | `transactions` POST | ✅ | ➖ | ✅ | READY |
| B3 | Transaction list: filter by account/month, inline recategorize, delete | `/budget/transactions` | `transactions` GET, `transactions/[id]` PATCH/DELETE | ✅ | ➖ | ✅ | READY |
| B4 | CSV import: parse → column mapping UI → idempotent bulk insert (import-hash unique index) | `/budget/transactions` | `lib/budget/csv.ts` client-side + `transactions` POST (bulk) | ✅ | ✅ csv.test | ✅ | READY |
| B5 | Saved import profiles, auto-matched by header signature | `/budget/transactions` | `import-profiles` GET/POST | ⚠³ | ➖ | ✅ | NEEDS-FIX³ |
| B6 | Rule-based auto-categorization (first match wins, server-side on insert; contains/starts_with/regex/exact, account + amount-range narrowing, priority, enabled) | server-side | `lib/budget/categorize.ts`, applied in `transactions` POST | ⚠⁴ | ✅ categorize.test | ⚠⁴ | **NEEDS-FIX⁴ (headline)** |
| B7 | Categories: seeded default set, two-level tree, kind (expense/income/transfer) | both pages | `categories` GET (seeding idempotent) | ⚠⁵ | ➖ | ✅ | NEEDS-FIX⁵ |
| B8 | Monthly budgets vs actuals: per-category target editing, progress bars, over/under, unbudgeted ≠ $0 | `/budget` | `budgets` GET/PUT | ✅ | ⚠⁶ | ✅ | READY⁶ |
| B9 | Month KPIs: income / spending / net, uncategorized-spend callout | `/budget` | derived from `budgets` GET actuals | ✅ | ⚠⁶ | ✅ | READY⁶ |
| B10 | Recurring detection: cadence inference over last 400 transactions, surfaced as suggestions | `/budget` | `recurring` GET (fresh detection each load) | ✅ | ✅ recurring.test | ✅ | READY |
| B11 | Recurring rules: confirm a suggestion → stored rule | `/budget` | `recurring` POST | ⚠⁷ | ➖ | ⚠⁷ | NEEDS-FIX⁷ |

**Notes (all verified in source 2026-08-12):**
1. **Accounts can be renamed/archived only via curl.** `accounts/[id]` PATCH accepts
   `name`, `institution`, `openingBalance`, `archived` — the UI offers create and
   delete only. The schema's `archived` flag is honored on read (the panel filters
   `!a.archived`) but nothing in the app can set it, so the soft-delete path the
   schema designed is unreachable; the only UI affordance is hard delete, which takes
   the account's transactions with it (cascade).
2. Account balance and the month's income/spend/uncategorized totals are computed in
   `lib/server/budgetPersistence.ts` and in the page component respectively — neither
   is in a tested pure module. These are dollar figures users act on; house rule says
   pure + vitest. Small extraction, low risk, but a real gap.
3. Import profiles have no rename/delete anywhere — no `import-profiles/[id]` route
   exists (the one budget table without full CRUD), and no UI. A mis-saved mapping for
   a bank is permanent until fixed in SQL.
4. **The biggest gap in the module: categorization rules have no UI at all.** `rules`
   GET/POST and `rules/[id]` PATCH/DELETE are fully implemented and ownership-scoped;
   no client file references them. Both pages' copy advertises "rule-based
   categorization," and the engine genuinely runs on insert — but a user cannot
   create, view, edit, prioritize, disable, or delete a single rule from the app.
   CLAUDE.md/ROADMAP describe the feature with no mention that it is API-only.
5. Categories are read-only in the UI (GET only) over a full-CRUD API. The schema's
   `parentId` tree, `color`, `icon`, and `sortOrder` are consumed nowhere in the UI.
6. See note 2 — the arithmetic is simple and correct on read, but untested.
7. **"Confirm-or-ignore" has no ignore.** A suggestion the user doesn't want
   reappears on every page load forever — there is no dismiss path in UI *or* API
   (dismissal needs somewhere to persist; today the only way to silence a suggestion
   is to confirm it and then deactivate via curl, since `recurring/[id]`
   PATCH/DELETE also have no UI). Confirmed rules render as plain text — no edit,
   deactivate, or delete controls.

**Summary:** 11 features — 5 READY, 6 NEEDS-FIX, 0 decisions, 0 not-for-rollout.
The engine and persistence layers are production-grade; the management UI is the
unfinished half. One coordinated "budget management UI" task (rules manager, category
editor, account edit/archive, recurring controls + suggestion dismiss, import-profile
delete) would move every ⚠ to ✅ without touching the schema.

---

## Module: Portfolio Builder (premium — own entitlement)

One page (`/portfolio-builder`), engine in `lib/data/portfolioBuilder.ts` (pure,
**86 tests** — the best-covered user-actionable math in the app), persistence via
`/api/user/builder-plans` (+`/[id]` PATCH/DELETE), drift/suitability UI in
`components/portfolio-builder/PlanMonitor.tsx`.

| # | Feature | Route | Data path | Reach | Test | Doc | Verdict |
|---|---------|-------|-----------|:-----:|:----:|:---:|---------|
| PB1 | Questionnaire → built portfolio: glide path anchored to spend date, sleeve appetite+style system, bond ladder, sector tilts/exclusions, per-holding rationale | `/portfolio-builder` | pure engine, no fetch | ✅ | ✅ portfolioBuilder.test (86) | ✅ | READY |
| PB2 | Fee summary: blended ER, annual $ cost, compounded drag vs 3bps | same page | engine `fees` + `fundCatalog` ERs (provenance-dated, stale after 120d) | ✅ | ✅ | ✅ | READY |
| PB3 | Diversification score (Gini–Simpson; ceiling unreachable by design — do-not-fix) | same page | engine | ✅ | ✅ | ✅ | READY |
| PB4 | Saved plans: DB-backed CRUD, one-time legacy localStorage import (`*:imported` rename guard) | same page | `builder-plans` GET/POST/PATCH/DELETE | ✅ | ➖ | ✅ | READY |
| PB5 | Drift monitor: linked portfolio (auto-selected, persisted `linked_portfolio_id`) or manual weights → per-holding buy/sell trades, turnover, off-plan positions | PlanMonitor | `builder-plans/[id]` PATCH + live prices via `fetchInstrumentPrices` (CoinGecko-backed portfolio-prices path) | ✅ | ✅ checkDrift tests | ✅ | READY¹ |
| PB6 | Suitability review: ageing glide path, risk drift, fee creep (vs actual holdings), concentration (vs plan target), overdue review | PlanMonitor | engine `reviewPlan(saved, actual, now)` — injectable clock | ✅ | ✅ | ✅ | READY |

**Notes:**
1. Drift pricing rides the CoinGecko free tier; positions with no live price are
   excluded (never valued at cost) and `pricedPct` disclosure renders. The 2026-07-29
   audit showed CoinGecko burst rate-limiting on the free tier — with no key, drift
   coverage can be partial under load. Degrades honestly; a `COINGECKO_API_KEY` is the
   operational fix. Not a blocker.

**Summary:** 6 features — 6 READY. This module is the readiness benchmark for the
suite: pure tested engine, DB persistence with legacy import, honest degradation, and
documentation that matches the code. The one wrinkle is operational (free-tier rate
limits), not code.

---

## Cross-cutting: AI agents, /api/v1, MCP server

_(section filled from the request-path sweep — see tables below)_

---

## Appendix A — Undocumented features to add to project documents

_(consolidated after the per-module sweep)_

## Appendix B — New-tool candidates

_(consolidated after the per-module sweep; each checked against the rejected-proposals
record — see Appendix C on that file's absence)_

## Appendix C — Defects found (for normal filing, NOT fixed in this review)

_(consolidated after the per-module sweep)_
