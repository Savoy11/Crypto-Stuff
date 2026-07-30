# Preliminary findings — 2026-07-30

> **Provenance: this was NOT produced by `code-auditor` or `opportunity-scout`.**
> It came from two general-purpose agents run as stand-ins on 2026-07-30, before the real
> agent definitions were installed in this repo. It does not follow the auditor's evidence
> rule, it is not a dated audit report, and it does **not** live in `docs/audits/` — that
> directory is reserved for real `code-auditor` output so the two are never confused.
>
> Treat everything here as **leads to verify**, not as a baseline. The first real baseline
> is the `code-auditor` run described in `docs/IMPROVEMENT-AGENT-SETUP.md`.
>
> **Neither agent could run anything.** `frontend/node_modules` is absent and installing it
> needs network, so there are no `tsc`, `vitest`, `eslint` or `npm run audit` results behind
> any of this. Every item was reached by reading code. Per `CLAUDE.md`, live-data verdicts
> are IP-dependent and must come from the owner's machine regardless.

---

## Independently verified

These were re-checked directly rather than taken on the agent's word.

### `StatusBar` hardcodes an open market

`src/components/layout/StatusBar.tsx:41` renders `OPEN` in green as a string literal — no
session state, no exchange calendar, no reference to any query. The adjacent `Updated:` value
is a `setInterval` wall clock, not a data timestamp.

At 03:00 on a Sunday the bar reports the market open and ticking while every equity, fund and
macro surface shows Friday's close. This is the same class of fabricated live signal that
de-routed `/global-adoption` under T5.

### Drift monitor can report a confident all-clear

`src/lib/data/portfolioUtils.ts` — verified branch:

```ts
} else if (price != null) {
  // No entry price — show current value = target value (no P&L)
  currentValue = targetVal
}
```

A holding with a live price but **no entry price** is valued at target rather than excluded.
`/portfolios` defaults `entryPrice: null`, so this is the default path, not an edge case.

The reported consequence — weights coming back identical to the plan's targets, `pricedPct`
100, `driftPts: 0`, `action: 'hold'` across every row, and `reviewPlan()` checking the plan's
targets against themselves — follows if `actualWeightsFromPortfolio()` filters on
`currentValue != null`. **The mechanism is confirmed; the end-to-end consequence is not.**
Verify this one first: it is the highest-consequence item in this file, and it sits in the
premium module's core monitoring feature.

`CLAUDE.md` states the rule as "positions with no live price are excluded, never valued at
cost". The rule was implemented against a missing *price* but not a missing *cost basis*.

### Doc drift (counted directly)

| Claim | Stated | Actual |
|---|---|---|
| `/live-data/` route count | 47 | **56** `route.ts` files |
| Framework version | Next.js 14 | **15.5.22** (`package.json`) |
| portfolioBuilder tests | 55 | **82** `it(` blocks |

---

## Reported, not verified

Listed with enough detail to check quickly. Each needs confirming before acting.

- **`<ModuleGate>` inside the JSX on two detail routes** — `equities/[symbol]/page.tsx` and
  `funds/[symbol]/page.tsx`. I confirmed the hooks run before the gate is returned; I did
  **not** confirm the reported 60s polling while locked. `CLAUDE.md` and
  `lib/modules/registry.ts` both state the component-boundary rule; the other 38 pages
  reportedly follow it.
- **`fundCatalog.ts` carries no provenance machinery** — no `*_LAST_VERIFIED`,
  `*_STALE_AFTER_DAYS`, injectable-`now` age helpers or `get…Provenance()`, and no
  `<ProvenanceNotice>` on `/funds`. Reported to matter more than a display-only table because
  the expense ratios are *computed on*: `computeFeeDrag` on fund detail pages, and
  `blendedExpenseRatioPct` / `annualFeeUsd` / `horizonFeeDragUsd` plus `reviewPlan()`'s fee-creep
  dollar figure in `portfolioBuilder.ts`.
- **`EQUITY_REFERENCE_AS_OF` has no consumers**, and the Stock Registry reportedly renders
  reference market caps with no amber `ref` tag — the tag covers price only. Reported to be the
  normal path, not a fallback, since providers below FMP return `marketCap: null`.
- **Custom Atom feeds parse to zero articles** on `market-news` and `macro-news` — `parseRss`
  matches `<item>`, Atom uses `<entry>`. The crypto route's parser reportedly handles both;
  three copies, one fixed. Recorded as count 0 with no error, so the provider shows healthy.
- **Quote ladder returns on partial success** — each fetcher throws only on *zero* quotes, so a
  rate-limited provider returning 12 of 50 stops the ladder and the other 38 fall to catalog
  reference without Yahoo being asked. Note this is **not** the "don't parallelise the ladder"
  anti-pattern — the suggested fix is a per-symbol residual pass, not `allSettled`.
- **Unguarded `new Date(pubDate).toISOString()`** in the RSS path — one malformed `pubDate`
  throws `RangeError` and loses the whole feed. A guarded sibling reportedly exists 56 lines
  later in the same file.
- **`lib/server/pubDate.ts` is imported by only one of three RSS routes**, so the zone-less
  timestamp fix isn't applied to `market-news` or `news`. Reported to make `isBreaking`
  trivially true for future-stamped articles.
- **Treasury yield curve queries only the current calendar year** with no `year - 1` fallback,
  so the curve is reportedly unavailable at the year boundary.
- **Nine divergent `timeAgo` implementations**, several rendering negative ages.

---

## Opportunity-side leads

From the stand-in scout. Same caveat — verify before acting.

- **Three agents have no entry point.** `data-scraper`, `equity-data-scraper` and
  `equity-diligence` appear only in `agent-config`. `equity-diligence` reportedly has a
  complete prompt structurally like `pump-report-investigator`, which already has shipped UI.
- **A documented deep link reaches the wrong agent.** `CLAUDE.md` says `macro-screener` is
  deep-linkable via `/research?agent=macro-screener`; `initialMarket` reportedly only matches
  `macro-research`/`equity-research`, so that URL runs the crypto `research-analyst`.
- **ROADMAP overstates one item as shipped.** The 2026-07-21 note says everything in "What must
  be built" is SHIPPED, but there is no `macro/technical-analysis/` and no TA entry in the macro
  nav, while Crypto and Equities both have one.
- **The `entitlements` table exists and nothing queries it.** `ModuleGate` is client-side over a
  localStorage store defaulting to all-enabled. Fine for local-first dev; load-bearing if
  modules are ever sold separately.
- **`FEE_PROVIDERS` holds only Bitcoin** while `live-data/wallet/eth` reportedly maintains a
  vetted keyless RPC ladder for seven of the same chains. Matters because
  `findTransferPaths()` ranks by `totalFeeUsd`, so a stale gas constant can misorder routes.
- **Full weighted N-PORT holdings are already fetched** and nothing in `src/` computes overlap
  or portfolio look-through.
- **Untested pure logic that produces dollar figures:** `computeNetworkFees()` (the declared
  single source of truth for two API layers) and `computeFeeDrag()`.

### Flagged as needing the owner's machine

The scout's `P0` — that a 6s abort in `staking-rates` is why live coverage sits at 4/51 despite
18 upstreams and a 25-entry DefiLlama map — is a **code-and-timing inference it could not
observe**. Its licensing proposal deliberately fetched no provider's terms, so every licence
claim in it is inference from the endpoint's nature. Both are exactly the IP-dependent territory
`CLAUDE.md` fences off.
