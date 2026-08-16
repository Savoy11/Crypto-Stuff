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

## Executive summary

**93 features inventoried across 7 modules + the cross-cutting agent/API/MCP surface.**

| Module | Features | READY | NEEDS-FIX | OWNER-DECISION | NOT-FOR-ROLLOUT |
|---|---:|---:|---:|---:|---:|
| Core | 14 | 6 | 7 | 1 | — |
| Crypto | 19 | 11 | 5 | 2 | **1** |
| Equities | 19 | 15 | 4 | — | — |
| Macro Markets | 12 | 8 | 3 | 1 | — |
| ETFs & Funds | 12 | 8 | 4 | — | — |
| Budget | 11 | 5 | 6 | — | — |
| Portfolio Builder | 6 | 6 | — | — | — |
| **Total (module tables)** | **93** | **59** | **29** | **4** | **1** |

Cross-cutting adds 16 findings (agents/v1/MCP): 11 NEEDS-FIX, 3 owner decisions,
2 of which are real runtime bugs.

**The eight real bugs** (full list in Appendix C, D-1…D-8): the env-only FMP key on
two fund routes; macro TA's impossible 2Y range; the MCP transfer-routes tool crashing
on the current API shape; the v1 transfer API pricing six coins at $1 with no warning;
`/assets/<garbage>` rendering the USDC page; the permanently dead Risk History tab
showing fabricated-looking zeros; pump-report routes ignoring the enabled toggle; and
the ungated retained `/global-adoption` page one deleted redirect away from returning
outside its entitlement.

**The five owner decisions for Wave 2** (beyond per-feature SHIP/FIX/HIDE/CUT calls):
- **D1 — Rollout posture on entitlements:** localStorage + client-side ModuleGate is
  safe only if the initial rollout ships all modules free. Paid SKUs need DB-backed
  entitlements first (Phase 6 / auth.md Goal B step 4).
- **D2 — Public API exposure:** `/api/v1` has no rate limit and no auth, and fans
  anonymous requests into the owner's keyed provider quota. Ship it, gate it, or
  fence it at deploy.
- **D3 — The ×10 question:** ^TNX-family yield scaling is internally contradictory
  (UI vs agent docs). Needs a configured key on the owner's machine; if the UI is
  wrong, every rates KPI is off by 10×.
- **D4 — Placeholder surfaces:** three never-invocable agents, the orphaned
  video-analyze feature, four orphaned crypto routes, the sourceless term-structure
  card, the permanently-n/a sparkline column: wire, retire, or knowingly ship each.
- **D5 — MCP `run_audit`:** an undocumented tool that shells out, inside an otherwise
  market-data server — decide before any external distribution.

**The one systemic pattern:** behavior is broadly honest (no fabricated values found
on any live surface except D-6), but **the boundaries drift** — copy vs code, docs vs
code, MCP/agent metadata vs API shape, and the house testing rule vs ~14 clusters of
untested user-actionable math (D-24). The cheap structural fix is NT12 (boundary drift
guard); the rest is scoped, enumerated work.

---

## Module: Core (always on)

Ten pages, always-on. The landing page, the two cross-module user-data surfaces
(watchlist, portfolios), the AI surfaces, and the two meta pages (Integrations,
Data Sources). Provenance discipline is good — every core SourceLine id resolves in
the registry, and `/data-sources` is the model page.

| # | Feature | Route | Data path | Reach | Test | Doc | Verdict |
|---|---------|-------|-----------|:-----:|:----:|:---:|---------|
| C1 | Headlines: Top Stories merge (crypto + markets, breaking-first, round-robin), per-module sections following entitlements, watchlist-bias reorder | `/headlines` | `news`, `market-news` | ✅ | ✅ bias tested | ✅ | READY¹ |
| C2 | Videos: channel-feed grid (keyless Atom), whole-of-YouTube search (key + quota guards), scope/order/duration controls, market/channel filters | `/videos` | `videos`, `video-search` | ⚠² | ➖ | ⚠² | **NEEDS-OWNER-DECISION²** |
| C3 | Daily Brief: one-shot AI morning brief grounded in ≤30 portfolio+watchlist symbols, last-brief persistence | `/brief` | POST `/api/agents/research`, `/api/user/*` | ⚠³ | ➖ | ✅ | NEEDS-FIX³ |
| C4 | Watchlist: multi-list CRUD, cross-class search-add, live-price table (reference quotes treated as missing, never shown), partial-price disclosure | `/watchlist` | `/api/user/watchlists`, `portfolio-prices` + `security-quotes` | ⚠⁴ | ➖ | ✅ | READY⁴ |
| C5 | Portfolios: card list, full editor (cross-asset, target alloc, validation), category/allocation charts, holdings table with P&L | `/portfolios` | `/api/user/portfolios`, `portfolio-prices`, `security-quotes` | ✅ | ⚠⁵ | ✅ | **NEEDS-FIX⁵⁶** |
| C6 | Portfolios Analysis tab: per-holding risk, weighted risk, concentration warnings + Est. Annual Income (labeled "ref yields") | `/portfolios` | client-computed | ✅ | ⚠⁵ | ✅ | NEEDS-FIX⁵ |
| C7 | Portfolios Look-through tab: underlying-issuer exposure across held funds | `/portfolios` | `fund-holdings` per fund | ✅ | ✅ lookThrough.test | ✅ | READY |
| C8 | Portfolios Backtest tab: date presets, growth summary, return-by-holding chart (crypto-only history, stated on-page) | `/portfolios` | `portfolio-history` + prices | ✅ | ⚠⁵ | ✅ | NEEDS-FIX⁵ |
| C9 | Compare: 2–6 symbols, growth-of-100 (common window), return/vol/drawdown/Sharpe (0% rf, stated), correlation matrix, fund holdings-overlap, reference fundamentals | `/compare` | `chart` (close-only, pinned), `security-chart`, `fund-holdings` | ✅ | ✅ compareStats + lookThrough | ✅ | READY⁷ |
| C10 | Research: market selector → agent, example prompts, `?agent=`/`?symbol=`/`?task=` deep links, watchlist payload, toolsUsed chips | `/research` | POST `/api/agents/research` (whitelist of 5) | ⚠⁸ | ➖ | ✅ | READY⁸ |
| C11 | AI Agents config: 10 tabs / 11 agents, provider+model+temperature+prompt editing, save/reset | `/agent-config` | `/api/agents/prompts` | ⚠⁹ | ➖ | ✅ | NEEDS-FIX⁹ |
| C12 | Integrations: Suite Module toggles, watchlist-bias panel, agent enable/disable, 11 provider sections (toggle/key/test/status), utilization lines, subreddit manager | `/settings` | `/live-data/config`, `/api/agents/prompts` | ⚠¹⁰ | ➖ | ⚠¹⁰ | NEEDS-FIX¹⁰ |
| C13 | Custom feeds: SSRF-validated URL, auth modes, format + JSON path, terms probe with clause report + acknowledgement, hard-block on prohibited | `/settings` | POST `/live-data/config`, `source-terms` | ⚠¹¹ | ✅ termsProbe/urlSafety | ✅ | NEEDS-FIX¹¹ |
| C14 | Data Sources: verdict-sorted source-terms registry (seeded/"unread" badges + honesty notice), status tiles as filters, module-grouped provider rows | `/data-sources` | `source-terms` GET, static registry | ✅ | ✅ sourceTerms + dataSources tests | ✅ | READY |

**Notes:**

> **Status, 2026-08-16 (P3-W2, `wave-2-changes`) — notes sweep.** Fixed: 1 (hint
> copy), 3 (brief 503), 4 (rename UI + store action), 6 (header copy), 9
> (placeholder copy), 10 (both pages now surface the admin-guard denial instead
> of rendering empty; CLAUDE.md's reordering and entitlement claims corrected —
> A3/A4), 11 (WebSocket option removed). Unknown `agentId` on the research route
> now 400s instead of silently running the crypto analyst (note 8's second
> half). Still open: 2 (video-analyze — owner decision NT4), 5 (portfolio math
> tests — D-24), 7 (Compare universe — scope question), 8's panel half (NT6).

1. Watchlist-bias "Strong" only widens the fetch on `/news` and `/equities/news` —
   Headlines and Videos reorder only, while the Settings hint says Strong "pulls extra
   watchlist articles" globally. Copy fix on the hint (or implement augmentation).
2. **`/live-data/video-analyze` is a fully orphaned feature** — GET lists providers,
   POST answers questions about a video with timestamped citations, and **no page or
   component calls it**. CLAUDE.md's feature table sells Videos as "Video search + AI
   analysis"; the analysis half has no UI. Same class as the three placeholder agents:
   Wave 2 decides build-the-trigger-UI vs stop advertising it.
3. The research route returns 503 for **both** missing-key and agent-disabled;
   `/brief` maps any 503 to "needs an Anthropic API key in `.env.local`" — wrong
   instruction for a user who disabled the agent in Settings, and it omits the
   Integrations-UI key path (which `getProviderKey()` prefers). Small fix: distinguish
   the two errors, mention both key paths.
4. List rename is API-possible (PUT accepts full body) with no UI control. Minor.
5. **The app's most important untested money math is here.** `computeHoldings` /
   `computeMetrics` (`lib/data/portfolioUtils.ts`) produce the P&L dollars and
   percentages, and weighted risk — no test file. Est. Annual Income and the whole
   Backtest-tab arithmetic are computed in-component, untested. (Contrast: Compare's
   equivalent stats are tested in `compareStats.test.ts`.) Extraction + vitest is the
   fix; behavior is believed correct but unverified.
6. **False copy in the portfolios PageHeader** (`page.tsx:927-929`): claims Sharpe
   (4% rf) and max drawdown which nothing on the page computes; claims portfolios are
   localStorage-only and "not synced" (false — the store is DB-backed); stale "live
   mode" phrasing. Plus residual "Coin" labels on cross-asset tables, and SourceLine
   renders only in list view — absent from the detail view where P&L displays.
7. Compare's universe is catalog-limited (79 stocks + 118 funds + coin catalog) — a
   non-catalog ticker can't be compared although `security-chart` could serve it.
   Wave 2 scope question, not a defect.
8. `macro-screener` is whitelisted but reachable only via `?agent=` deep link — no
   panel (its equity twin has one on `/equities`). An unknown `agentId` silently falls
   back to the crypto research-analyst instead of erroring. Both minor.
9. Three tab descriptions oversell placeholder agents — `data-scraper` /
   `equity-data-scraper` "runs autonomously…", `equity-diligence` "investigates…" —
   but none has an invocation trigger anywhere (CLAUDE.md confirms). A user can tune
   prompts for agents that never run, with no hint. Copy fix now; trigger-UI-or-retire
   is the standing owner-backlog decision.
10. Two silent-failure deploy footguns: `/live-data/config` GET and
    `/api/agents/prompts` GET are `guardSensitiveRoute`-protected, and on a
    non-localhost deploy without `FN_ADMIN_TOKEN` both pages swallow the denial —
    Integrations renders empty provider sections, agent-config shows "No agents
    configured" with no explanation. Also CLAUDE.md doc drift: claims provider
    **reordering** (no such action exists in UI or API) and claims entitlements
    persist to Postgres (they are localStorage-only — see next).
11. The custom-feed format dropdown offers **"WebSocket stream"** which the fetch path
    does not implement (server logs a warning, feed contributes 0 items, user sees
    nothing). Remove the option or implement it.

**Production flag (owner decision, rollout-gating):** module entitlements live in
localStorage (`useEntitlementStore`) and `<ModuleGate>` is client-side — fine for a
personal tool, **not a paywall**. `docs/architecture/auth.md` Goal B step 4 already
records this as the step with "real security weight." For the initial rollout the
question is explicit: ship all modules free (current state is safe for that) or build
DB-backed entitlements first (Phase 6). Nothing to fix in W1; W2 must decide the
rollout posture.

**Summary:** 14 features — 6 READY, 7 NEEDS-FIX (portfolio math tests + false copy
being the substantive ones), 1 NEEDS-OWNER-DECISION (orphaned video-analyze), plus the
entitlement-posture decision. Nothing NOT-FOR-ROLLOUT.

---

## Module: Crypto

Eleven routed pages plus the de-routed `/global-adoption`, all ModuleGated at the
component boundary (verified per file). The original product: deepest feature set,
best provenance implementations (transfer fees, reserves), best-tested scoring
(risk engine) — and also the module carrying the app's single worst data-honesty
violation (CR9) and a real routing bug (module flag below).

| # | Feature | Route | Data path | Reach | Test | Doc | Verdict |
|---|---------|-------|-----------|:-----:|:----:|:---:|---------|
| CR1 | Coin Registry: sortable/paginated table (null-safe, N/A never fabricated), type/mkt-cap/safety/chain/band screener, table-grid toggle, discovered-coin merge, breadth KPIs | `/assets` | `markets` (tier-driven source), `risk-scores` | ✅ | ✅ applyParams tested | ✅ | READY¹ |
| CR2 | Safety Score column + band pill (enrich-before-filter — the R2 H1 fix) | `/assets` | `risk-scores` (shared query key) | ✅ | ✅ | ✅ | READY |
| CR3 | 30d sparkline column — permanently "n/a" (no free list-scale trend source; labeled) | `/assets` | none | ✅ honest | ➖ | ✅ | NEEDS-OWNER-DECISION² |
| CR4 | Reserve Monitor tab: DefiLlama live supply + snapshot attestation/composition, always-visible ReserveProvenance, stale escalation | `/assets?tab=reserves` | `reserves` | ✅ | ✅ reserves.test | ✅ | READY |
| CR5 | Coin detail: header identity + gauge, market cards, LiveRiskPanel (pillars, confidence, honest empties), per-coin news, embedded TA (9 ids, stated) | `/assets/[id]` | `markets`, `risk-scores`, `news`, `ohlcv` | ✅ | ✅ risk engine | ✅ | READY³ |
| CR6 | Detail on-chain analytics section (price history + 4 analytics panels) | `/assets/[id]` | `chart` + `analyticsBundle` — **hardcoded null** | ⚠⁴ | ➖ | ⚠ | NEEDS-OWNER-DECISION⁴ |
| CR7 | Detail Reserves tab (live view + provenance; L1 "not applicable" state) | `/assets/[id]` | `reserves` | ⚠⁵ | ✅ | ✅ | NEEDS-FIX⁵ |
| CR8 | **Risk History tab** | `/assets/[id]` | `getAssetScores()` — **hardcoded `[]`** | ❌⁶ | ➖ | ⚠ | **NOT-FOR-ROLLOUT⁶** |
| CR9 | Pump Report tab: heuristic metrics + AI investigate + streaming chat (needs Anthropic key) | `/assets/[id]`, `/wallets` | `pump-report/metrics·investigate·chat` | ✅ | ⚠ metrics untested | ✅ | READY |
| CR10 | News: multi-provider feed, 4-layer asset detection, sentiment/category/keyword/bias filters, well-partitioned empty/error/no-provider states | `/news` | `news` (keyless RSS defaults) | ✅ | ✅ bias/feedParse | ✅ | READY |
| CR11 | Social: signal feed + per-asset sentiment bars, custom subreddits | `/social` | `social` | ✅ | ✅ socialBlend | ✅ | READY⁷ |
| CR12 | Wallets: watch any address (11 chains, RPC ladders), browser-wallet connect (address-only, disclosed), read-only exchange APIs (server-side secrets) | `/wallets` | `wallet/*` | ✅ | ➖ passthrough | ✅ | READY |
| CR13 | Transfer Fee Calculator: 22 coins × 30 exchanges × 18 networks, multi-stop route builder, tested path math, live BTC fee + gas sidebar, model ProvenanceNotice + stale degradation | `/transfer-fees` | `network-fees`, `coin-list` | ✅ | ✅ transferFees + networkFees | ✅ | READY⁸ |
| CR14 | Staking: 55-provider cards, live/est APR badges (own-key-only live labeling), category/coin/adjacent-yield filters, provenance | `/staking` | `staking-rates` | ⚠⁹ | ⚠ aprDisplay untested | ✅ | NEEDS-FIX⁹ |
| CR15 | Staking Discovery: live on-chain pools (DefiLlama/Yearn/Pendle/Beefy) with canonical Safety badges, curated directory, defunct toggle (where Celsius actually lives) | `/staking-discovery` | `staking-discovery` | ✅ | ✅ stakingAdapter | ✅ | READY |
| CR16 | Coin Discovery: scored candidates (/10 with reasons + breakdown), dismiss/add flows, search-add, added-coins registry merge | `/coin-discovery` | `coin-discovery`, `coin-search` | ⚠¹⁰ | ⚠¹⁰ | ✅ | NEEDS-FIX¹⁰ |
| CR17 | Crypto TA: chart tab (~80 assets, 11 ranges, 62 indicators, drawing tools), technical read, signal summary, S/R, key levels, market structure (OKX funding/OI + stablecoin supply), multi-timeframe grid, thesis builder (R/R), patterns, scanner (7 setups, bounded concurrency), backtests (tested engine, Sharpe/Sortino) | `/technical-analysis` | `ohlcv`, `funding-rates`, `reserves`, `markets` | ✅ | ⚠¹¹ | ✅ | NEEDS-FIX¹¹ |
| CR18 | Risk Scores leaderboard: stablecoin 5-pillar (fatal-flaw strikethrough) + major-asset composites, per-pillar audit trail, honest N/A, per-source status footer | `/risk-scores` (no nav — by design) | `risk-scores` | ✅ | ✅ best-tested | ✅ | READY |
| CR19 | De-routed `/global-adoption` (redirects to `/headlines`; page + route retained per T5) | redirect | — | ⚠¹² | — | ✅ | NEEDS-FIX¹² |

**Notes:**

> **Status, 2026-08-16 (P3-W2, `wave-2-changes`) — notes sweep.** Fixed: 1 (the
> two Coins-page queries now share one in-flight `/markets` request, and a dead
> upstream throws so the error card renders instead of a full table of N/A
> prices), 3 (unused imports), 5 (dead branch deleted — D-21), 6 (tab hidden —
> D-6), 7 (`/social` now has a distinct error state with retry; the fetcher
> throws instead of swallowing), 8's status bar (D-22), 9's copy (D-10), 10's
> note (D-11), 12 (D-8). Still open: 2 (sparkline column — owner decision), 4
> (analyticsBundle — owner decision), 8's untested reduce + 10's scoring + 11's
> price-target cluster (all D-24).

1. KPI strip issues a second full `markets` fetch (`pageSize:100_000`) — duplicate
   query per visit; and `fetchLiveMarkets` swallows failures into empty quotes, so a
   dead upstream renders a full table of N/A prices rather than the error card.
2. A permanently-"n/a" column in the initial rollout invites "is it broken?" tickets.
   W2: keep (honest placeholder) or drop the column until a source exists.
3. `ScoreBreakdown` imported but unused; `latestRiskScore` destructured and unused.
   Cosmetic.
4. `analyticsBundle` is hardcoded `null` in live mode, so the section *always* renders
   "not available" and its four chart components are unreachable dead UI. Honest, but
   permanently dead weight on the page. W2: cut the section or scope a real source.
5. The dead legacy branch of the Reserves tab still carries **"Verified by
   {attestor}"** copy — the exact language the M5 audit scrubbed from the live
   surfaces. Unreachable today, but it's a regression waiting for whoever revives the
   branch. Delete the dead branch.
6. **The single worst data-honesty violation in the app.** The Risk History tab's API
   returns a hardcoded `[]`, the chart has no empty state, and the tab renders empty
   axes captioned **"Avg: 0.0 / Latest: 0.0"** — fabricated-looking zeros on a
   product whose identity is never fabricating values. The code comment claims the
   chart shows a not-available notice; it does not. Hide the tab (or give it a real
   `LiveUnavailable`) before rollout; making it real is the risk-spec's P6
   (score-history persistence) — Appendix B.
7. Social page has no `isError` branch — a failed fetch renders the generic "no
   signals found" empty state; down and empty are indistinguishable. Small fix.
8. One state gap in an otherwise model page: on a *first-load* fees failure the
   "using static estimates" status bar can't render (it sits inside `{data && …}`),
   so the static fallback is silent. Small fix. The cumulative multi-leg reduce is
   untested (path math beneath it is tested).
9. **The page's copy promises things the page doesn't render:** the header describes
   the six-dimension risk scoring and a 0–100 DerivedNote for scores that never
   appear on `/staking` (they render on `/staking-discovery` and `/api/v1`), and
   claims "Celsius is included as an educational cautionary example" while this page
   unconditionally filters defunct providers — Celsius can never render here. Fix the
   copy, or render the scores (Appendix B candidate — the engine and API already
   serve them).
10. The `DerivedNote` beside the recommendations says "0–100, higher = safer" while
    the cards render **/10** scores — it describes the app's canonical scale, not the
    numbers next to it. And the entire candidate scoring + "Strong Add" threshold
    logic lives untested in the route. Copy fix + test extraction.
11. The TA *indicator* math is heavily tested; the **price-target math is not**:
    `patternProjection` (measured-move targets + invalidation), `detectPatterns`,
    `detectSupportResistance`, `fibRetracement`, `buildTechnicalRead`, scanner
    `detectSetups`, and the thesis builder's `computeRiskReward` have zero test hits
    while emitting dollar levels users trade against. This is the module's test-gap
    cluster.
12. Latent gate gap: the retained page is not in any module's `routePrefixes` and not
    ModuleGate-wrapped — it is unreachable *solely* via the Next redirect. The config
    comment says "delete this entry to re-enable the page," which would re-enable it
    **outside the crypto entitlement gate**. Fix the comment (and ideally wrap the
    page) so the trap can't spring.

**Module flag (real bug):** `buildLiveAssetDetail` falls back
`ASSET_CATALOG.find(...) ?? ASSET_CATALOG[0]` — **`/assets/<any-garbage>` renders the
USDC detail page** instead of the coin-not-found state (which is unreachable in
practice). Wrong data with a 200, the exact failure class this repo's conventions
exist to prevent. Appendix C.

**Orphaned routes (zero page consumers):** `pump-report/scan`, `fear-greed`,
`btc-stats`, `defi-tvl` — all live, maintained, terms-registered, and unused by any
UI. Wire them into a surface (the TA market-structure panel is the natural home for
the last three) or remove them — Appendix B.

**Summary:** 19 features — 11 READY, 5 NEEDS-FIX, 2 NEEDS-OWNER-DECISION,
**1 NOT-FOR-ROLLOUT** (Risk History tab). Plus one real bug (unknown-id fallback)
and four orphaned routes.

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

> **Status, 2026-08-16 (P3-W2, `wave-2-changes`) — notes sweep.** Fixed: 1
> (price/mkt-cap sort headers now state they order on daily reference values —
> a live-quote sort is structurally impossible while quotes are page-scoped),
> 3 (extracted + 27 tests), 5 (D-15), 8 (D-16), 9 (an engine throw now renders
> a named engine-error instead of the "fill in the trade" placeholder). Still
> open: 2 (acceptable as noted), 4 + 6 (test gaps — D-24), 7 (bounded select —
> S1 decision).

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

**Summary:** 19 features — 15 READY, 4 NEEDS-FIX (XBRL ratio test gap, sentiment-score
test gap, TA copy, calendar copy); one Wave 2 inconsistency question rides on E1's
note. Nothing NOT-FOR-ROLLOUT. The module's honest-degradation story is exemplary; its gap
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

> **Status, 2026-08-16 (P3-W2, `wave-2-changes`) — notes sweep.** All four notes
> were already resolved or classified by earlier passes; recorded here so this
> section reads like the others: 1 ✅ (15 tests, 2026-08-15), 2 ✅ (D-1), 3 open
> (D-24 — holdings-history diff + nport parser tests), 4 deliberate (NT9 is the
> possible future source).

1. **`computeReturns` (`lib/utils/returns.ts:23`) — the 1M/3M/YTD/1Y percentages users
   compare funds on — has zero tests.** YTD prior-year-close boundary and short-series
   null logic unverified. Clear house-rule violation; small fix.
   > ✅ **RESOLVED 2026-08-15 (P3-W2):** 15 tests added covering both flagged
   > cases. Behaviour was correct; one caveat is now pinned rather than
   > implicit — between 200 and 251 closes the 1Y column reports the series
   > start, so a young fund shows a sub-year period under a "1Y" heading. The
   > fallback is deliberate (the alternative hides a young fund's only
   > meaningful return) but it is not a full year.
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

> **Sourcing revisit, 2026-08-15 (P3-W2 item 12) — return screening.** The F4
> decision to keep return screening/sorting OFF was recorded as blocked on "a
> provider that batches trailing returns". That provider was located and tested
> against a live FMP key: `/stable/stock-price-change?symbol=X` returns
> 1D/5D/1M/3M/6M/ytd/1Y/3Y/5Y/10Y/max directly — the exact four windows, with no
> series download and no `computeReturns` step. **Single-symbol works on the
> current plan; the comma-separated batch form is refused ("requires a higher
> plan"), and the whole-market `full-etf-quotes` endpoint needs Ultimate or
> Enterprise.** Whole-universe screening is therefore a purchasing decision, not
> an engineering one, and F4's verdict stands unchanged until that tier is
> bought. Recorded so the question is not re-opened from scratch a third time.
>
> One constraint attaches to any future wiring: FMP reports a **price** change
> while the current Tiingo path computes on **adjusted** closes (total return).
> For SPY that gap is the distribution yield — 1Y price +20.65% vs total return
> ~+22%. The two bases must never share a column unlabelled.

---

## Module: Macro Markets

Eight pages. The keyless backbone (macro news, ECB FX, Treasury curve) is measured
REAL; the quote surface is the one the Yahoo removal hit hardest — every intraday
macro quote rides the keyed `security-quotes` ladder, Tiingo doesn't carry macro
symbols, and the catalogs deliberately hold no reference prices, so no-key renders
dashes. The module's engines are well-tested (treasuryCurve, termStructure,
macroPillar, feedParse/pubDate, macroProfiles); its gaps are copy-vs-state and one
real range bug.

| # | Feature | Route | Data path | Reach | Test | Doc | Verdict |
|---|---------|-------|-----------|:-----:|:----:|:---:|---------|
| M1 | Overview: three area cards with 13-symbol live quote strips, per-kind formatting | `/macro` | `security-quotes` | ⚠¹ | ⚠ | ✅ | NEEDS-FIX¹ |
| M2 | Macro News: 8-feed pillar-classified aggregate (balanced merge, dedupe, 14-day cutoff, Breaking, related-instrument links) | `/macro/news` | `macro-news` (keyless) | ✅ | ✅ pillar/feed/pubDate tested² | ✅ | READY² |
| M3 | Commodities registry: 19 contracts, convention-true prices (¢/bu never "$"), price column deliberately unsortable (units incomparable), honest-label movers | `/macro/commodities` | `security-quotes` | ✅ | ⚠³ | ✅ | READY³ |
| M4 | Commodity detail: quote, chart (¢-aware axes), facts, single-commodity ETF proxies (verified-delisting empty states) | `/macro/commodities/[slug]` | `security-quotes`, `security-chart` | ✅ | ⚠³ | ✅ | READY⁴ |
| M5 | Futures term-structure card | commodity + rate-future details | `futures-curve` | ✅ honest | ✅ engine (21 tests, kept alive) | ✅ | **NEEDS-OWNER-DECISION⁵** |
| M6 | Currencies registry: 18 pairs + DXY, per-pair precision, category chips | `/macro/currencies` | `security-quotes` | ✅ | ⚠³ | ✅ | READY |
| M7 | Two-tier FX converter: 30 ECB + 127 community currencies, optgroup split, per-tier disclosure, swap | `/macro/currencies` | `fx-rates` + `fx-rates-extended` (both keyless) | ⚠⁶ | ⚠⁶ | ✅ | NEEDS-FIX⁶ |
| M8 | Currency detail: rate, chart (plain axes), inverse rate, CurrencyShares proxies | `/macro/currencies/[slug]` | `security-quotes`, `security-chart` | ✅ | ⚠³ | ✅ | READY |
| M9 | Rates: official Treasury par curve chart (latest/1M/year-start overlays), 2s10s/3m10y/shape KPIs, yields+futures table, bond ETF shelf, CUSIP-absence statement | `/macro/rates` | `treasury-yield-curve` (keyless), `security-quotes` | ⚠⁷ | ✅ buildCurveData tested; ⚠ client merge | ✅ | READY⁷ |
| M10 | Rates detail: yield-neutral change coloring, chart, duration-matched funds | `/macro/rates/[slug]` | `security-quotes`, `security-chart` | ✅ | ⚠³ | ✅ | READY |
| M11 | Macro TA chart tab: 45 instruments (thin marked), 6 chart types, shared indicators (volume-derived withheld with named reason), drawing tools | `/macro/technical-analysis` | `security-ohlcv` (keyed) | ⚠⁸ | ✅ indicators | ✅ | **NEEDS-FIX⁸ (bug)** |
| M12 | Macro TA scanner: 29 liquid instruments, RSI-14 / vs-SMA50 / composite (29-of-45 deliberate, stated on-page) | `/macro/technical-analysis` | 29× `security-ohlcv` | ✅ | ⚠ | ✅ | READY⁹ |

**Notes:**

> **Status, 2026-08-16 (P3-W2, `wave-2-changes`) — notes sweep.** Fixed: 1
> (D-12), 4 (the shared no-key copy now says only FMP helps for macro symbols),
> 6's disclosure (D-14), 7's caption (D-13), 8 (D-2, client side). Still open:
> 2 (acceptable), 3 + 6's converter math (D-24), 5 (term structure — NT8), 7's
> ×10 question (owner machine — D3), 9 (operational, owner kept the scanner).

1. The overview's "Live" chips are hardcoded strings, and with zero keys the quote
   route returns `ok:true` with empty quotes — so every strip dashes, **no error
   banner fires**, and the header still says "quotes below are live." The key-gated
   SourceLine badge is the only honest signal. Fix: derive the chip/copy from
   priced-count (the commodities page already does this right with "N priced live").
2. Route-local pieces (sentiment regexes, balanced merge, related-instrument
   detection) are untested; the load-bearing classifiers are. Acceptable.
3. Recurring macro test gap: **all four quote-convention formatters are untested**
   (`formatInstrumentQuote`, `formatCommodityPrice`, `formatFxRate`,
   `formatRatesQuote`) — these are exactly the "corn as $482 overstates ~100×"
   guards the module's honesty rests on. One small test file covers all four.
4. Shared `PriceChartCard` no-key copy says "Add a Tiingo or FMP key" — for macro
   symbols Tiingo can't help; only FMP can. Mildly misleading shared copy.
5. Term structure is **sourceless since 2026-08-06** (route returns `ok:false` +
   reason; card prints it; registry status `unavailable`). Working as designed — but
   the Wave 2 question is explicit: adopt a keyed provider that quotes dated contract
   months, or ship the card stating unavailability indefinitely. The engine is tested
   and kept alive for restoration.
6. Converter works keyless and degrades honestly, but its disclosure claims the
   extended tier is "**cross-checked against ECB where both cover the same
   currency**" — no runtime cross-check exists and none is possible (the extended
   allowlist deliberately excludes every ECB code, so overlap is empty). At best it
   describes the 2026-07-21 hand-verification; as written it reads as an ongoing
   control. Copy fix. Also: the cross-rate/inverse math (a $-figure users act on) is
   computed in-component, untested.
7. The 10-Year KPI subtitle falls back to "**live intraday**" exactly when there is
   no live price — an unpriced dash captioned "live intraday" in a no-key deploy.
   Copy fix. Separately, the ×10 question in the module flag below.
8. **Real bug: the 2Y range button can never work.** The page sends `range=2Y`;
   `security-ohlcv` accepts only `1M/3M/6M/1Y/5Y/MAX` and returns 400 — and the
   failure renders as `LiveUnavailable` blaming post-Yahoo provider coverage,
   misdirecting the user from what is a client/server vocabulary mismatch. Fails on
   every instrument even with valid keys. (Not covered by the do-not-fix "different
   ranges per asset class" entry — that covers which ranges are *offered*, not
   offering one the backend rejects.)
9. Scanner fires 29 keyed OHLCV requests per visit (900s route revalidate softens
   it) — meaningful FMP free-tier budget; noted for Wave 2's operational review.

**Module flag (owner question, needs a live key on the owner's machine):**
**^TNX/^IRX/^FVX/^TYX scaling is internally contradictory.** The UI renders the raw
quote as the yield (`price.toFixed(2) + '%'`) while the agent prompts/tools document
the same quote ladder as yield×10 ("^TNX 42.5 = 4.25%"), and no ÷10 normalization
exists in `marketData.ts`. One of the two is wrong depending on provider convention —
either every rates KPI is off by 10× or the agent instructions are. Cannot be settled
from a container; verify in Wave 2 with a configured key.

**Summary:** 12 features — 8 READY, 3 NEEDS-FIX (one real bug: the 2Y range; two
copy-vs-state), 1 NEEDS-OWNER-DECISION (term-structure sourcing), plus the ×10
verification question. Nothing NOT-FOR-ROLLOUT.

---

## Cross-cutting: AI agents, /api/v1, MCP server

### AI agents (11)

Six agents are runnable end-to-end (app-assistant, research-analyst, equity-research,
equity-screener, macro-research, pump-report ×2 via their own routes); key resolution
(UI key wins over env) and disabled-agent 503s verified end-to-end on the runner
routes. All agent-run routes are `guardSensitiveRoute`-protected.

> **Status, 2026-08-16 (P3-W2, `wave-2-changes`).** X1 ✅ (system prompt
> refreshed to the suite-era app), X3 ✅ (D-7). X4 and X5's panel remain open
> decisions (NT5, NT6); X5's deep link is now stated in the agent-config copy,
> and an unknown `agentId` 400s instead of silently running the crypto analyst.

| # | Feature | Verdict | Finding |
|---|---------|---------|---------|
| X1 | app-assistant (AssistantWidget, all 26 tools, web_search) | **NEEDS-FIX** | Its system prompt describes the **pre-suite app**: 25 exchanges / 16 coins / 16 networks (actual 30/22/18), ~70 stocks (79), ~55 funds (118), Compare 2–4 (2–6), and names Dashboard/Reserves/Global Adoption as live pages (de-routed/folded). The flagship assistant misinforms users about the product it fronts. Fix: refresh `prompts.ts` defaults (T6 extended, not overwritten). |
| X2 | research-analyst / equity-research / equity-screener / macro-research | READY | Whitelisted, invocable, honest 503s naming the fix surface. |
| X3 | pump-report-investigator / pump-report-chat | NEEDS-FIX | Their routes **ignore the per-agent `enabled` toggle** — a "disabled" pump agent still runs (exposure bounded by localhost/token guard, but the Integrations toggle is a lie for these two). Also return 500 instead of 503 on missing key. |
| X4 | data-scraper / equity-data-scraper / equity-diligence | **NEEDS-OWNER-DECISION** | Confirmed unreachable: no invocation path exists. Configurable and toggleable, described in `/agent-config` as "runs autonomously…". Standing owner-backlog decision: give them a trigger UI or retire them. |
| X5 | macro-screener | NEEDS-FIX (small) | Whitelisted and functional but reachable only via `?agent=` deep link — its equity twin has a panel. Add the panel or note the deep link in UI. |

### Public /api/v1 (12 endpoints + OpenAPI spec)

Same-source-as-UI verified on quotes/network-fees/staking/news. Error hygiene is
notably good (502 on upstream failure, never fake-empty; options/score returns all
validation errors; staking carries `referenceData` provenance). **Request logging
exists** (`middleware.ts` — one JSON line per v1 request incl. a `legacyRiskFilter`
flag), so the risk-spec's E2 precondition for any future deprecation decision is
satisfied. No v1 route touches user data (grep-clean of `db`/`getCurrentUserId`) —
today's surface is market-data-only, as Phase 6 assumes.

> **Status, 2026-08-16 (P3-W2, `wave-2-changes`).** V1 ✅ (D-4), V2 ✅ (D-19),
> V3 ✅ (D-20, counts now derived), V4 ✅ (`/securities/history` reports
> `source`), V6 ✅ (fallback constants dated `2026-07-22` per git history, and
> both fallback responses carry `fallbackPricesAsOf`). V5 remains the open
> rollout-gating owner decision.

| # | Finding | Verdict |
|---|---------|---------|
| V1 | **`/transfer/routes` drifted from the shared fee module**: its local `STATIC_GAS` lacks `ton_network`/`near_network` (those routes silently vanish), and its price map covers 16 of the 22 accepted coins — LINK/TON/SHIB/UNI/NEAR/ARB fall through to `?? 1`, so `amountUsd`/`feePercent` are computed at **$1/coin with no fallback warning**. The UI path passes the full maps; v1 ≠ UI here despite the shared engine. | **NEEDS-FIX (correctness bug in a public API)** |
| V2 | Staking `source` string claims live feeds it doesn't fetch ("Rocket Pool … Stride"; only Lido/Marinade/Jito are), and ETH rates *derived from Lido* for Coinbase/Kraken/Binance emit `aprSource: 'live'` — mislabeled derivation on a public contract. | NEEDS-FIX |
| V3 | Discovery route (`GET /api/v1/`) omits `POST /options/score` from its endpoint list and says 16 coins/16 networks vs the 22/18 actually served (openapi.json itself is complete; `/network-fees` description also says "16"). | NEEDS-FIX (small) |
| V4 | `/securities/history` returns no `source` field — the one v1 endpoint whose provider is undisclosed. | NEEDS-FIX (small) |
| V5 | **No rate limiting, no auth, CORS `*`** — `securities/quotes` fans each anonymous request into the keyed provider ladder (25 symbols/request), so a public deploy lets third parties burn the owner's provider quotas. Known Phase 6 gap (ROADMAP), now load-bearing given production intent. | **NEEDS-OWNER-DECISION (rollout-gating)** |
| V6 | Fallback price constants in `/prices` and `/transfer/routes` (BTC 95000…) are always disclosed via `source: 'fallback'` but undated — unlike every provenance-stamped catalog. | NEEDS-FIX (small) |

### MCP server (13 tools)

> **Status, 2026-08-16 (P3-W2, `wave-2-changes`).** P1 ✅ (D-3), P2 ✅
> (safetyScore/band surfaced, min_safety filter added, legacy labelled
> deprecated), P3 ✅ (counts no longer hand-typed), P4 ✅ (post-rebrand
> self-description, README created, `zod` declared). P5 remains the open D5
> decision — the README warns against external distribution until it is made.

| # | Finding | Verdict |
|---|---------|---------|
| P1 | **`find_transfer_routes` is broken at runtime**: it formats `hop.feeUsd` / `route.estimatedTimeMin` / `warning.level` — fields the v1 response does not serve (actual: `exchangeFee`/`networkFee`/`totalFeeUsd`, `estimatedTime`, `severity`; the OpenAPI spec explicitly warns about `severity` vs `level`). TypeError on virtually any successful route lookup. | **NEEDS-FIX (broken tool)** |
| P2 | Both staking tools describe and render **only the legacy 1–10 risk scale**; the canonical `safetyScore`/`band` (the additive fields R2 shipped) are never surfaced. The MCP layer is the exact consumer the additive migration was for. | NEEDS-FIX |
| P3 | `get_network_fees` says "all 16 supported networks" and enumerates 16; the endpoint serves 18 (TON, NEAR missing). | NEEDS-FIX (small) |
| P4 | Server self-describes as "Crypto Asset Evaluation Platform — transfer fees, staking…" (pre-rebrand, pre-suite — ignores securities/macro/options tools). CLAUDE.md's MCP table lists 12 tools; there are 13. No README in `mcp-server/` though `index.ts` points to one. `zod` used but undeclared (transitive). | NEEDS-FIX (small) |
| P5 | **`run_audit` is an undocumented 13th tool** that shells out (`npx tsc`, `shell: true`), probes live-data routes, and walks the frontend source tree — a local dev/maintenance tool inside an otherwise market-data server. Needs an explicit decision before any external distribution. | NEEDS-OWNER-DECISION |

**Summary:** the cross-cutting surface is where drift concentrates — every layer
(agent prompts, discovery metadata, MCP descriptions/formatters) lags the app it
fronts, because nothing regression-tests the boundary. Two real bugs (V1, P1), one
production gate (V5), two owner decisions (X4, P5). A cheap standing guard worth
considering in Wave 2: a vitest that diffs the discovery/MCP counts against the
catalogs' actual exports, so counts can't drift silently again.

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

## Appendix D — Owner short-list intake (P3-W2, 2026-08-15) — open items

The owner brought an 18-item short list into the Wave 2 sitting before the module
walkthrough began. Each item was cross-checked against this document, the task queue,
ROADMAP and the code. **Only one (item 9, the options scorer) was already covered
here** — the review's blind spots were nav/IA, which it never discusses, and three
surfaces it marked READY that carry defects it did not find.

**Landed during the intake** (commits on `claude/finance-wave-two-62esqa`): Compare
partial-coverage disclosure + MAX-range fix (item 3) · fundamentals empty state, EPS
basis labelling, ratio-math extraction with 27 tests (item 8) · CAGR, Sortino and a
keyless SEC fundamentals table on Compare (item 2) · coin-type sort and filter on Coin
Discovery (item 5, sort half) · Portfolio Builder promoted above Fund Registry (item 15)
· `computeReturns` tests closing F-note-1 (item 12) · the Retirement module (item 14,
build half) · the rejections ledger and this document's repairs (item 18, scaffolding).

**Three defects the intake found that this review did not.** All were on rows marked
READY, which is the pattern worth noting for W3: `/equities/backtests` annualizes Sharpe
at 52/12 bars-per-year against data that is daily on every range since the Yahoo removal
(E17 READY → see P3-W2-S1); Compare's unavailable notice fires only when *every* series
is empty, so a stock silently vanished from a mixed comparison (C9 READY); and 47 of 108
catalog coins can never receive a Safety Score, recorded nowhere (CR2 and CR5 both READY).

### Open — revisit these during the module walkthrough

| Item | What | Why it is still open | Where it lands |
|---|---|---|---|
| 1 | Consolidate AI Agents / Integrations / Data Sources under a Settings group | Needs a nested-nav primitive `ModuleNavItem` does not have; the same primitive items 6/7 need. Build once, after the scanner architecture settles. Any route move needs redirects — `SourceLine.tsx:68` links `/data-sources` from every provenance badge in the app | Core module walkthrough (C11, C12, C14) |
| 4 | Remove Safety Score placeholders — *"risk scores may be too close to a regulated recommendation"* | **Parked pending regulatory review.** Reaches 17 modules and 13 components. In tension with items 9 and 16, which keep the options scorer and the risk-based builder — both risk scoring on the same canonical scale. The defensible line, if one is wanted: scoring what the user brought you is explanation; ranking a universe to surface winners is closer to a recommendation. `BUSINESS-CHECKLIST.md:40-43` already carries this as open regulatory research | Crypto walkthrough (CR2, CR3, CR5, CR8, CR16, CR18) + D2 |
| 5b | Retire the "Strong Add / Consider / Monitor / Too Speculative" vocabulary (~15 strings) | Held with item 4 — same advice-framing question. The sort half shipped | Crypto walkthrough (CR16, D-11) |
| 6, 7 | Promote every scanner out of its TA page into a per-section nav entry | **Owner still deciding** whether equities gets one combined scanner or several, and whether a "scanner" merges technical setups, the registry's fundamental screener and the AI Outlier Scan. That answer generalizes to the other sections. Note the maturity gap: crypto has 7 setup detectors, 3 timeframes and auto-refresh; equities has 24 hardcoded large-caps | Crypto (CR17), Equities (E14-E16), Macro (M11, M12) |
| 11, 13 | Corporate, high-yield, international and municipal bond coverage | Confirmed gap, not yet built. Today the catalog carries LQD and HYG only — no international (BNDX/IAGG/BWX/EMB/VWOB), no muni (MUB/VTEB/TFI), no muni row in `BOND_ETF_SHELF`, no muni tier in `RateCreditQuality`, and no tax-equivalent-yield concept, which is the whole point of holding munis | Funds (F1, F7) + Macro (M9) |
| 12b | Restore return screening on the fund registry | **Settled as a purchasing decision, not an engineering one** — see the sourcing revisit in the Funds section. FMP's `/stable/stock-price-change` is the right endpoint; batching is paid-gated | Funds (F4) |
| 14b | Remove the Budget module | **Awaiting an explicit call** — contradicts NT1, destroys imported bank history irreversibly where HIDE would not, and the new planner wants Budget's actuals as its expense input. Full reasoning in the TASK-QUEUE entry | Budget walkthrough (B1-B11) + NT1 |
| 16 | Portfolio Builder: user-set percentages per industry / sector / market cap, with sub-division inside each asset class | Owner confirmed **setting**, not reporting, and additive — the risk-based builder stays. This is a second engine, not an edit: `BuilderInputs` has no target-weight field and every weight is derived. Owner also flagged a legality question of his own | Portfolio Builder walkthrough (PB1-PB6) |
| 18b | Make this document a maintained, protected reference | Scaffolding done. Still needs: a narrow carve-out in `checklist-steward.md:27` (which currently forbids maintaining assessments), and a decision on what "protected" means — CODEOWNERS, branch protection, or a doc-vs-code CI guard | Process, W3 entry conditions |
| 2b | Beta vs a benchmark on Compare | Asked for in T3, never delivered; still absent. Needs a benchmark-series fetch and a choice of benchmark | Core walkthrough (C9) |

> **Note for W3.** Items 4, 6/7 and 14b are decisions, not builds — none can be closed by
> an agent. Item 1 is blocked on 6/7 by shared plumbing. Everything else in this table is
> scoped and buildable once the decision above it is made.

## Appendix A — Documentation corrections (features undocumented or misdocumented)

Project documents claiming something the code contradicts, or missing something the
code ships. Each is a doc edit, not a code change.

| # | Document | Correction |
|---|---|---|
| A1 | CLAUDE.md (Videos row) | Advertises "Video search + AI analysis" — the analysis half (`video-analyze`) has no UI (C2). Either drop the claim or build the trigger (NT4) |
| A2 | CLAUDE.md (equity TA row) + `/equities/technical-analysis` subtitle | "18 indicators" — the shared registry ships ~62; both copies predate the shared-engine migration |
| A3 | CLAUDE.md (marketData section) | Claims built-in provider "reordering" — no such action exists in UI or `/live-data/config` — ✅ **RESOLVED 2026-08-16:** corrected |
| A4 | CLAUDE.md (module registry / entitlements) | Implies entitlements persist like other user data — they are localStorage-only (`useEntitlementStore`); no `/api/user/entitlements` route exists. Load-bearing for the rollout-posture decision (D1) — ✅ **RESOLVED 2026-08-16:** CLAUDE.md now states localStorage-only and flags the Phase 6 question |
| A5 | CLAUDE.md (MCP table) | Lists 12 tools; the server ships 13 — `run_audit` is undocumented (and needs decision D5) |
| A6 | CLAUDE.md + `docs/agents/*` charters | Reference `docs/audits/rejected-proposals.md`, which **does not exist**. Create the scaffold (it is Wave 2's rejection ledger) or fix the references — ✅ **RESOLVED 2026-08-15 (P3-W2):** scaffold created; every reference now resolves |
| A7 | `mcp-server/` | No README, though `index.ts:11` points to one; server metadata still self-describes as pre-rebrand "Crypto Asset Evaluation Platform" ignoring the securities/macro/options tools — ✅ **RESOLVED 2026-08-16:** README created (points at CLAUDE.md as canonical), self-description post-rebrand, `zod` declared |
| A8 | CLAUDE.md (equities backtests row) | Fee tiers (0–25bps/side) and the tested fee math are undocumented — ✅ **RESOLVED 2026-08-16:** row updated |
| A9 | DATA-AVAILABILITY.md | Standing: owner-machine re-run owed since the Yahoo removal (its own header says so); the macro-quote check (its action item 18) remains the highest-value gap |

## Appendix B — New-tool candidates

> **Ids are `NT*` (new tool), not `B*`.** Renumbered 2026-08-15: the Budget
> module's feature rows are also B1–B11, so "B1" resolved to two different
> things — a READY/NEEDS-FIX feature row and a proposed tool. Cross-references
> elsewhere in this document have been updated.

Checked against the rejected-proposals ledger **by intent only — the file does not
exist** (A6); no candidate below is knowingly re-proposing a rejected idea.

> **Annotation, 2026-08-15 (P3-W2).** The ledger now exists and carries the one
> adjacent decided item (RP-1, the options chain browser). The W1 statement above
> stands as written — it records what was true at review time — but a candidate
> below can now be checked properly rather than by intent. The one
adjacent decided item: an options *chain browser* is closed by owner decision
(2026-08-05) with named reopen triggers — nothing here touches it.

| # | Candidate | Rationale | Effort shape |
|---|---|---|---|
| NT1 | **Budget management UI** — rules manager, category editor, account rename/archive, recurring edit/deactivate + suggestion dismiss, import-profile delete | Closes all 6 Budget NEEDS-FIX; every API already exists (one new route: `import-profiles/[id]`, plus a dismiss persistence choice) | UI-only, medium |
| NT2 | **Trade ledger** — `/api/user/trades` CRUD + pure tested cost-basis engine (FIFO vs avg decision) + entry UI | ROADMAP Phase 1's unmet "Done when"; `trade_transactions` table + index already built | Medium; enables realized P&L |
| NT3 | Wallets → DB (`/api/user/wallets`) | Last localStorage holdout of Phase 1; portfolios/watchlists are the template | Small, mechanical |
| NT4 | video-analyze trigger UI (ask-about-this-video on `/videos` cards) | The orphaned feature (C2) — route is complete, incl. quota guards | Small UI |
| NT5 | Invocation UI for `data-scraper` / `equity-data-scraper` / `equity-diligence` — **or retire them** | Standing owner-backlog item, confirmed still unreachable (X4) | Decision first |
| NT6 | macro-screener panel on `/macro` (mirror of the equity OutlierScanPanel) | Whitelisted agent, deep-link-only today (X5) | Small UI |
| NT7 | Render canonical Safety scores on `/staking` provider cards | The page's own copy already describes them; engine + API + discovery page already serve them (CR14) | Small UI |
| NT8 | Futures term-structure provider (keyed) | Reopens M5 from P2-O1's GO design; engine tested and kept alive; sourcing decision, not build work | Provider eval first |
| NT9 | Fund asset-mix derived from N-PORT position categories | Would revive the dead allocation donut (F-note-4) from data already fetched | Medium server |
| NT10 | Score-history persistence (risk-spec P6) | The only honest path to making the Risk History tab real (CR8) | Medium; needs storage + scheduled capture |
| NT11 | Wire orphaned crypto routes (`fear-greed`, `btc-stats`, `defi-tvl`) into the TA market-structure panel (or delete them) | Four maintained, terms-registered routes with zero consumers | Small either way |
| NT12 | **Boundary drift guard** — vitest diffing v1 discovery counts, MCP tool descriptions/counts, and agent-prompt catalog claims against the catalogs' actual exports | The cross-cutting section shows every unguarded boundary drifted (16 vs 18 networks, 12 vs 13 tools, pre-suite prompts, broken MCP formatter). Cheap standing prevention | Small test |

## Appendix C — Defects found (for normal filing, NOT fixed in this review)

**Real bugs (wrong behavior a user or consumer can hit):**

> **Status, 2026-08-16 (P3-W2, branch `wave-2-changes`): D-1 through D-8 all
> fixed.** D-2 was fixed client-side only (the 2Y button removed) — the range
> vocabulary of `security-ohlcv` itself belongs to subproject P3-W2-S1, which
> may reintroduce 2Y with real data. D-6 took the review's prescribed HIDE: the
> Risk History tab is removed from the coin detail page until NT10
> (score-history persistence) makes it real; the chart component is retained.
> D-8 wrapped the retained page in `ModuleGate` AND added `/global-adoption` to
> the crypto module's `routePrefixes`, so deleting the redirect now re-enables
> the page inside the entitlement, not around it.

| # | Where | Failure |
|---|---|---|
| D-1 | `fund-holdings/route.ts:31`, `fund-holdings-history/route.ts:18` | FMP key read from env at module scope, not `getProviderKey('fmp')` — an Integrations-UI key silently does nothing on exactly these two routes (F-note-2) |
| D-2 | `macro/technical-analysis/page.tsx:112` vs `security-ohlcv/route.ts:25` | 2Y range button sends vocabulary the route rejects → 400 on every instrument, rendered as a provider-coverage message (M-note-8) |
| D-3 | `mcp-server/src/index.ts:158` | `find_transfer_routes` formats `feeUsd`/`estimatedTimeMin`/`warning.level` — fields the v1 response does not serve → TypeError on virtually any successful lookup (P1) |
| D-4 | `api/v1/transfer/routes/route.ts:24-41,109-121` | Local `STATIC_GAS` lacks ton/near networks (routes silently vanish); 6 of 22 accepted coins priced at `?? 1` → `$1/coin` amounts with no fallback warning (V1) |
| D-5 | `lib/api/live/overlay.ts:71` | Unknown coin id falls back to `ASSET_CATALOG[0]` — `/assets/<garbage>` renders the USDC page; not-found state unreachable (crypto module flag) |
| D-6 | `lib/api/risk-scores.ts:14` + `HistoricalScoreChart` | Risk History tab: hardcoded `[]`, no empty state, renders "Avg: 0.0 / Latest: 0.0" — fabricated-looking zeros (CR8, NOT-FOR-ROLLOUT) |
| D-7 | `live-data/pump-report/investigate·chat` | Ignore the per-agent `enabled` toggle (disabled agent still runs) and return 500 instead of 503 on missing key (X3) |
| D-8 | `(dashboard)/global-adoption/page.tsx` | Retained page is neither in `routePrefixes` nor ModuleGate-wrapped — deleting the redirect (as the config comment invites) re-enables it outside the entitlement gate (CR19) |

**Wrong or misleading copy/states (the app claiming what the code doesn't do):**

> **Status, 2026-08-16 (P3-W2, branch `wave-2-changes`): D-9 through D-22 fixed,
> except D-23** (needs an owner-machine repro — IP-dependence rule). Notes on the
> non-obvious ones: D-19 added a third `aprSource` value `'derived'` for the
> Lido-anchored exchange estimates (additive; OpenAPI updated). D-20's discovery
> counts are now **derived from the catalogs** rather than re-typed — the
> mini-NT12 fix — and the app-assistant system prompt was refreshed to the
> suite-era app (X1). The MCP staking tools now surface the canonical
> `safetyScore`/`band` (P2), the server self-description is post-rebrand (P4),
> and `run_audit` is documented in CLAUDE.md's MCP table with its D5 decision
> flagged (A5). D-10 removed /staking's DerivedNote for scores the page never
> renders — rendering them is NT7, still open. D-17's brief banner now shows the
> server's own 503 message, which already distinguishes missing-key from
> agent-disabled.

| # | Where | Claim vs reality |
|---|---|---|
| D-9 | `portfolios/page.tsx:927-929` | Claims Sharpe (4% rf) + max drawdown (computed nowhere on the page); claims localStorage-only persistence (store is DB-backed); stale "live mode"; residual "Coin" labels; SourceLine absent from detail view where P&L renders (C-note-6) |
| D-10 | `staking/page.tsx:541-545` | Describes six-dimension scores + 0–100 DerivedNote never rendered on the page; claims Celsius included while defunct providers are unconditionally filtered (CR14) |
| D-11 | `coin-discovery/page.tsx:476` | DerivedNote "0–100, higher = safer" beside /10 scores (CR16) |
| D-12 | `macro/page.tsx` | Hardcoded "Live" chips + "quotes below are live" while a no-key deploy renders all dashes with no banner (`ok:true`, empty quotes) (M-note-1) |
| D-13 | `macro/rates/RatesClient.tsx:92-94` | 10Y KPI captioned "live intraday" exactly when unpriced (M-note-7) |
| D-14 | `CurrenciesClient.tsx:128` | Converter claims extended tier is "cross-checked against ECB where both cover the same currency" — overlap is empty by construction (M-note-6) |
| D-15 | `equities/technical-analysis/page.tsx:503` + CLAUDE.md | "18 indicators" vs ~62 (E-note-5 / A2) |
| D-16 | `equities/calendar/page.tsx:45-47` | "free API key required" while the economic calendar is a paid FMP endpoint whose 402 is swallowed (E-note-8) |
| D-17 | `agent-config/page.tsx:372-379` | Placeholder agents described as "runs autonomously…" with no invocation path (X4); brief's 503 banner conflates missing-key with agent-disabled and omits the UI key path (C-note-3) |
| D-18 | `settings/page.tsx:914` | Custom-feed format offers "WebSocket stream" the fetch path doesn't implement (C-note-11) |
| D-19 | `api/v1/staking/opportunities/route.ts:39-44,170` | `aprSource: 'live'` on Lido-derived rates; `source` string names live feeds that aren't fetched (V2) |
| D-20 | v1 discovery + MCP metadata | 16 coins/16 networks vs 22/18 served; discovery omits `/options/score`; MCP `get_network_fees` enumerates 16; staking MCP tools legacy-scale-only; app-assistant system prompt describes the pre-suite app; options tool says 1-4 legs vs 8 accepted (V3, P2-P4, X1) |
| D-21 | `assets/[id]/page.tsx:1169` | Dead legacy branch still carries "Verified by {attestor}" — the exact M5-scrubbed language (CR-note-5) |
| D-22 | `transfer-fees/page.tsx:708-716` | First-load fees failure hides the "using static estimates" bar (inside `{data && …}`) (CR-note-8) |
| D-23 | `equities/social` page | Carried from DATA-AVAILABILITY item 10: page reported stuck on "Fetching social signals…" while route + direct fetch work — pre-existing, needs owner-machine repro |

**Untested user-actionable numbers (one grouped item — the recurring house-rule gap):**

| # | Cluster |
|---|---|
| D-24 | `portfolioUtils.ts` P&L/weighted risk; Est. Annual Income + backtest-tab math (in-component); XBRL ratios (`company-facts` route) + client multiples; `computeReturns` (fund Returns columns); `fund-holdings-history` diff/turnover + `nport.ts`; FX converter cross-rate/inverse; all four macro quote formatters; rates-page curve merge; TA price-target cluster (`patternProjection`, `detectPatterns`, `detectSupportResistance`, `fibRetracement`, `buildTechnicalRead`, `detectSetups`, `computeRiskReward`); coin-discovery scoring/thresholds; `aprDisplay`/`resolveLiveAprKey`; stock-social `sentimentScore`; budget balance/actuals aggregation |

**Cleanups (cosmetic):** unused `ScoreBreakdown` import + unused `latestRiskScore`
(coin detail); duplicate markets fetch for `/assets` KPIs (CR-note-1); `zod`
undeclared in `mcp-server/package.json` (transitive); stale "Yahoo FX series" comment
in macro TA; `security-quotes?universe=` and `market-news?watchlistOnly=1` params with
zero consumers.

> ✅ **All five cleaned up, 2026-08-16 (P3-W2).** The two dead params were
> removed, not documented — a param with zero consumers on a keyed quote ladder
> is an invitation, not a feature.
