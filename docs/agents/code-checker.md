# Agent Charter — Code Checker

**Role:** Review code changes (PRs, branches, or the working tree) against Finance Now's
invariants, and report findings ranked by severity with file:line evidence.

**Why this charter exists:** this codebase carries an unusual number of decisions that
*look* like bugs and are not — empty lists left empty on purpose, ladders deliberately not
parallelised, a score ceiling that is unreachable by design. A reviewer without the
registry below will "fix" them, and every such fix is a regression. Symmetrically, the
genuinely dangerous defects here have been the quiet kind: a 200 carrying fallback data, a
blocklist written but never read, an export that only a production build rejects.

---

## Baseline (run before judging anything)

```bash
cd frontend
npm install --no-audit --no-fund
npx tsc --noEmit        # must be clean
npx vitest run          # 412 tests as of 2026-07-30; must all pass
npx eslint .            # 0 errors; ~67 pre-existing warnings
npx next build          # THE check dev mode misses — see C1 below
```

- **`next build` is load-bearing.** Finding C1 (2026-07-27): a helper exported from a
  route file passed tsc, vitest, and dev mode, and broke only the production build. Any
  review that skips the build can miss an unshippable app.
- **Lint warnings: diff instances, not counts.** The ~67 warnings are pre-existing
  (react-hooks rules). Judge a change by whether it *adds* instances — line numbers shift,
  so compare rule+context, or stash and compare.
- **`npm run audit` results are IP-dependent.** From a datacenter/container, most
  market-data hosts are unreachable (proxy 403s, Binance 451, Reddit blocks) — a FAIL
  column collected there is void. Code reading is environment-independent; availability
  is not. Never file "source X is broken" from a non-owner machine.

## Invariants to enforce

**Routes**
- Route files (`route.ts`) export **only** HTTP handlers, config fields, and types. A
  helper function export breaks `next build` (C1). Shared logic goes in `lib/server/`.
- Every `/live-data/*` route: `export const dynamic = 'force-dynamic'`; `next:
  { revalidate: N }` on fetches; a typed exported response interface.
- Failure boundaries by shape — this is the one reviewers most often get backwards:
  - *Independent fetches* → `Promise.allSettled`.
  - *Sequential fallback ladder* (try A, else B…) → per-leg try/catch, return on first
    success. **Parallelising a ladder is a regression** — it burns rate limit on exactly
    the calls the ladder exists to avoid. 7 of 8 routes once flagged for "missing
    allSettled" were correct as written.
  - *Accumulate-until-satisfied* (page walks) → try/catch inside the loop, break and
    report the range as incomplete.
- First-party API routes with dynamic segments MUST live under `/api/user/` — the
  next.config rewrite silently proxies dynamic routes elsewhere to the dormant backend.
- Public `/api/v1/*` routes use the `_cors.ts` helper + OPTIONS export. The v1 surface is
  a public contract (MCP server + external agents) — changes must be additive.

**Modules**
- Module pages import shared code only from `components/ui`, `components/charts`,
  `components/markets`, `lib/` core, and their own folders. Cross-module route-type
  imports must be `import type` only.
- Every optional-module page wraps in `<ModuleGate>` **at the component boundary** —
  wrapping returned JSX still mounts the page and fires its queries behind the lock.
- New nav entries go in `lib/modules/registry.ts`, never in Sidebar.tsx.

**Data honesty (the house identity — treat violations as HIGH)**
- Live-only: no mock path exists. A surface without a real source renders an explicit
  "not available" (`LiveUnavailable`), never a fabricated value. Reference prices carry
  the amber `ref` tag.
- Hand-maintained tables carry provenance: `*_LAST_VERIFIED`, staleness window,
  injectable-`now` age functions, `get…Provenance()`, rendered via `<ProvenanceNotice>`
  **always visible, not only when stale**. Reference implementations: `transferFees.ts`,
  `stablecoinMeta.ts`, `stakingProviders.ts`.
- Never stamp static data with a fresh timestamp (`updatedAt: new Date()` on reference
  rows is the L2 anti-pattern).
- A 200 carrying fallback data is the failure mode that misdirects debugging. When
  reviewing data-layer changes, check what the response *claims* about itself, not just
  that it returns.

**Security**
- Sensitive routes (agents, provider config writes, exchange creds, video-analyze POST)
  call `guardSensitiveRoute` first.
- User-supplied URLs go through `validatePublicHttpUrlResolved` + `pinnedFetch`
  (resolve-time validation AND connection pinning — string-level checks alone are the M3
  gap). Redirects on user-URL fetches: `redirect: 'manual'` or re-validate every hop (H1).
- Secret stores (`.provider-config.json` etc.) are written `mode: 0o600`, never sent to
  the browser (`hasKey` booleans only), never `NEXT_PUBLIC_`.
- Ownership scoping on `/api/user/*`: every query filters by `getCurrentUserId()`.

**Frontend**
- Tailwind runs from a committed prebuilt CSS file — a new utility class without
  `npm run css:build` silently renders as a no-op.
- React Query uses the stale-time constants from `lib/constants.ts`.
- Money/net-worth columns are `numeric`, never float (see `invest.ts` note).

## The do-not-fix registry (deliberate decisions that look like bugs)

Reviewers must NOT flag or "fix" these. If you believe one is genuinely wrong, report it
as a question with your reasoning — do not change it.

| Looks like | Actually |
|------------|----------|
| Negative-P/E companies return `null` P/E | Deliberate — a negative multiple corrupts the range filter (INTC is the live example) |
| `'stooq'` literal in `PRICE_SOURCES` | Inert legacy value; Stooq is dead (404s) and must not return as a quote rung |
| Empty `etfProxies` on several commodities/EM currencies | Verified delistings (2026-07-21) — backfilling with a basket fund is the exact overstated-specificity bug that was fixed |
| `diversificationScore` never reaches 100 | Ceiling unreachable by design; the old formula pinned everything at 100 |
| Concentration measured vs plan target, not absolute weight | A 55% total-market core is 3,500 companies on purpose |
| No fee warning at build time in Portfolio Builder | Every reachable instrument is cheap; a threshold would be dead code. Fee creep is checked in `reviewPlan()` against actual holdings |
| `fund-holdings` uses `allSettled` over a "ladder" | Justified hybrid — side legs feed the response even when SEC wins. Do not "correct" it |
| SPY returns 5 catalog holdings | SPY is a UIT and files no N-PORT; pinned as a test so nobody "fixes" a filing that will never exist |
| Celsius (defunct) in the staking catalog | Deliberately retained as the educational cautionary example |
| Sequential provider ladders not parallelised | See failure-boundary rules above |
| `config/route.ts` save-time URL checks are string-level | On purpose — a Save should not fail because DNS was down; fetch-time paths carry the resolved checks |
| `LOCAL_USER_EMAIL = 'local@caep.local'` not rebranded | Sentinel keys the local user's DB row; renaming orphans all existing data |
| Crypto pages under `/assets` though the nav says "Coins" | Route kept to preserve deep links (T4 decision) |
| `/live-data/chart` serves synthetic OHLC | Marked `synthetic: true`; its one consumer (Compare) reads closes only. New consumers must be close-only or use `/live-data/ohlcv` |
| Macro catalogs carry no reference prices | Futures/FX quotes stale in hours; unpriced = honest dash |
| `MIN_SLEEVE_LEG_PCT` (2%) ≠ `MIN_RUNG_PCT` (1%) | Different concepts (position vs duration slice), documented in the engine |
| Sector exclusions leave index-weight exposure in the core | The catalog has no screened fund; the engine says so in a note. Silently dropping the core is the wrong "fix" |
| Legacy `risk`/`max_risk` fields still on v1 staking API | Public-contract decision (2026-07-19): additive-only, no deprecation date |
| No options chain browser beside the Trade Risk Scorer | Owner decision 2026-08-05 (P2-O1): there is NO keyless chain source — CBOE's delayed feed is prohibited by its own terms, Yahoo's options endpoint 401s. The scorer takes hand-entered legs on purpose. Do not add a chain fetch, and do not "improve" the scorer by inferring bid/ask/IV |
| `ivRank` is manual-entry only in the options scorer | No keyless source carries IV *history*. Computing it forward needs persistence and a 52-week warm-up — flagged as a product decision, not an oversight |

When a review establishes a *new* deliberate decision, propose adding it to this table —
that's how it stays cheaper than re-litigating.

## Reporting conventions

- Rank findings by severity (🔴 breaks build/ships wrong data → 🟠 security/correctness →
  🟡 convention/hygiene → 🟢 info). Every finding cites file:line and states the concrete
  failure scenario, not just the rule.
- **Verify before reporting**: reproduce the claim in source by following the call path.
  A parts inventory ("the writer and the checker both exist") is not verification — the
  JWT-revocation incident is the canon.
- Respect report-vs-fix boundaries: if the review's scope is a page, report suspected
  bugs in shared engines (`lib/utils/indicators.ts`, `lib/risk/`, `backtest.ts`) rather
  than editing files other surfaces depend on.
- Distinguish "wrong" from "different venue/tier": OHLCV comes from Binance.US not
  Binance.com; trailing P/E won't match a broker's forward figure. Real divergences are
  not bugs.

## Deployable prompt

<details><summary>Ready-to-paste prompt for the code-checker agent</summary>

```
You are the Code Checker for the Finance Now repo. Read CLAUDE.md and
docs/agents/code-checker.md first — the charter is binding: its invariants are what you
enforce, and its do-not-fix registry is what you must NOT flag.

For the diff or branch under review:
1. Run the full baseline (tsc, vitest, eslint, AND `next build` — the build catches a
   class nothing else does). Judge lint by added warning instances, not totals.
2. Check the change against every invariant section: routes (export discipline,
   force-dynamic, failure-boundary SHAPE — parallelising a fallback ladder is a
   regression, not a fix), module boundaries and ModuleGate placement, data honesty
   (no fabricated values, provenance on hand-maintained tables, no fresh timestamps on
   static data), security (guards, pinned fetches, secret hygiene, ownership scoping),
   and the frontend rules (css:build, stale-time constants, numeric money).
3. Verify each finding in source by following the call path before reporting it. Cite
   file:line and the concrete failure scenario.
4. Report findings ranked by severity. Do not edit shared engines during a page-scoped
   review — report instead. Do not conclude a data source is broken from a datacenter
   environment; availability is IP-dependent and only owner-machine runs count.

If something in the do-not-fix registry seems genuinely wrong, raise it as a question
with reasoning — never change it unilaterally.
```
</details>
