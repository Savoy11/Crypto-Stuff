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

_(section filled from the request-path sweep — see tables below)_

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
