# CAEP Task Queue — Phase 1

Prioritized backlog of 14 requested items, restructured into 14 deployable tasks across 4 waves.
Each task below has a ready-to-paste prompt for a remote agent.

**Scheduling rule:** tasks within a wave are safe to run in parallel — they own disjoint file sets.
Do not start a wave until the prior wave's tasks have landed.

**Task IDs are stable.** T1–T12 keep the numbering from the first revision; R1/R2 are the risk-framework
tasks added after. Wave membership changed for T4 and T9 — see Wave 3.

---

## Why this order

Three dependencies drive the sequencing:

1. **Data sources are upstream of every accuracy audit.** Six of the 13 items are "audit page X for
   accuracy." If `/live-data/security-ohlcv` returns bad candles, a TA audit concludes "the TA page is
   wrong" and fixes the wrong layer. T1 runs alone, first.

2. **Three TA/backtest audits share one untested engine.** `lib/utils/indicators.ts` (1,703 lines,
   61 exported functions) and `lib/utils/backtest.ts` (578 lines) are imported by crypto TA, equity TA,
   equity backtests, asset detail, the OHLCV route, and the candlestick chart — with zero test coverage.
   T2 verifies that math once and owns those files; the three page audits then become thin
   wiring/UI checks that can run in parallel without conflicting.

3. **Agent prompts subsume the Research-page agents.** The original items 2 and 3 are the same work at
   two scopes. Merged into T6, with the Research agents as the deepest slice.

4. **The risk framework is a scale decision before it is a code change.** Splitting the decision (R1,
   read-only) from the migration (R2) let R1 run in Wave 0 and correct the plan before any code moved.
   It did exactly that — see the revision note below.

> **Revised after R1 completed (2026-07-19).** R1's specification disproved two premises this queue was
> built on. There is **no polarity inversion**: `lib/utils/risk.ts` and `lib/risk/types.ts` are the same
> 0–100 higher-is-safer scale with identical 80/60/40/20 thresholds. And `/risk-scores` was **never
> rendering N/A** — it has been live since `b5bcab7`/`cf4840b`. Both claims came from a stale memo that
> was never checked against the code. The real defect is narrower and more embarrassing: `overlay.ts`
> nulls `riskScore` on every live asset citing "no free live source," a comment that is now false, so
> ~12 components show N/A while a real composite already exists for those same assets. R2's scope below
> is rewritten accordingly. Full spec: `docs/architecture/risk-scale-spec.md` (branch
> `docs/risk-scale-spec`).

Two items (Global, Risk Case Studies) are keep-or-cut calls rather than build work. They are scoped as
**read-only report tasks** (T5) so they cannot collide with T4's edits to the module registry.

**T4 and T9 moved to Wave 3** because both render or compute risk scores that R2 rewrites. Running them
earlier means redesigning the Coins page's risk badges and re-scoring the staking table twice.

---

## What each wave is for

The program as a whole retires three kinds of debt the app accumulated while growing fast:
**unverified data sources**, **unverified math**, and **contradictory risk semantics**. All three need
to be gone before Phase 2 adds three new asset classes on top of them.

### Wave 0 — Establish ground truth

**Goal:** stop guessing. Neither task ships a feature; both produce knowledge that every later task
depends on.

Six of the 14 tasks are accuracy audits, and an audit is only as good as its assumptions. Today two
assumptions are unverified: which of the 42 live-data routes actually return real data, and what a risk
score is supposed to mean. Until those are settled, a downstream agent that finds a wrong number cannot
tell whether the page, the route, or the scale is at fault — and will confidently fix the wrong layer.

**Why nothing else runs concurrently:** every later task either reads a live-data route or displays a
risk score. Running them alongside Wave 0 means working from assumptions Wave 0 is actively invalidating.

**Exit criteria:** `DATA-AVAILABILITY.md` reflects reality · the smoke script covers all 42 routes and
is re-runnable · the canonical risk scale is specified and you have approved it · a go/no-go on taking
the Risk Scores page live.

### Wave 1 — Make the engines trustworthy, bank the independent wins

**Goal:** verify the two shared engines the app's credibility rests on, while parallel product work
that has no dependencies proceeds alongside.

This wave is two things at once, and it is worth being plain about that rather than inventing a single
theme. **T2 and T6 are engine verification** — 2,281 lines of untested indicator/backtest math, and 9
agents whose prompts have never been systematically evaluated. Both are load-bearing: the math feeds
seven consumers, and the agents are the most-used surface in the app. **T3, T5 and T7 are independent
product work** that would be pure waste to serialize behind anything.

T5 is the odd one out and earns its place by potentially *removing* scope: if Global or Risk Case
Studies should be cut, you want to know that before anyone invests in them.

**Exit criteria:** indicators and backtest engine have test coverage and known-good behavior · every
agent has a written evaluation and revised prompt · Compare and the equity screener are improved ·
keep/cut decisions made on two pages.

### Wave 2 — Fix what users actually see

**Goal:** the expensive corrections. Everything before this was preparation; this is where real defects
get repaired.

The highest-value and highest-risk wave. R2 rewrites risk semantics across ~29 files. T8 corrects a
hand-maintained fee table that renders stale data as confident dollar figures. T10–T12 correct the three
pages sitting on the math T2 just verified.

**This wave will produce regressions if under-reviewed** — but the danger is narrower than first
assessed. R2 does *not* flip polarity app-wide (there was no inversion to flip). The one genuine
inversion is `stakingProviders.ts`, which is 1–10 higher-is-riskier, and it reaches a public API where
`max_risk` is a filter whose meaning inverts — an external consumer would silently receive the
*riskiest* providers with a 200 and plausible data. That endpoint, plus T2's math corrections visibly
shifting three pages, is where review effort belongs.

**Ordering subtlety:** R2 edits `lib/agents/prompts.ts` to correct how agents describe the risk scale.
T6 rewrote that same file in Wave 1. Sequential waves make this safe, but R2 must extend T6's work
rather than overwrite it.

**Exit criteria:** one risk scale across the whole app, direction-asserted in tests · transfer fee data
verified against live exchange schedules with an honest staleness story · three TA/backtest surfaces
cross-checked against an external reference.

### Wave 3 — Build on settled ground

**Goal:** complete the two tasks that were genuinely blocked, now that the foundations under them are
stable.

Small tail wave. T4 redesigns the Coins page on top of finalized risk display; T9 audits the *content*
of staking's risk dimensions on top of a finalized scale. Neither was blocked by difficulty — only by
the fact that doing them earlier meant doing them twice.

**Exit criteria:** Coins page renamed and redesigned · staking rates and risk dimensions verified. At
this point the three debts named above are retired and the app is ready for Phase 2.

---

## Wave 0 — Foundation

T1 and R1 may run together: R1 is read-only and touches nothing T1 edits.

### R1 — Choose the canonical risk scale (read-only)
> Risk framework, part 1 of 2. Blocks: R2, and therefore T4 and T9.

**Owns:** nothing — produces a written specification.

Cheap, decisive, and unblocks the largest cross-cutting change in the queue.

<details><summary>Deployable prompt</summary>

```
Decide the canonical risk-score scale for the CAEP frontend
(C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend). Read CLAUDE.md and
docs/architecture/risk-framework.md first. This is a READ-ONLY design task — produce a written
specification, change no code.

The app currently has at least four incompatible risk conventions coexisting, two of which run
in opposite directions:

1. src/lib/risk/ — the real framework: engine.ts composeRisk(), normalize.ts, and profiles for
   cryptoAsset, stablecoin, equity, optionsTrade, stakingAdapter. ~1,199 lines with ~689 lines
   of vitest coverage. Consumed by only TWO files: the risk-scores page and its live-data route.
2. src/lib/utils/risk.ts — RISK_BAND_CONFIG, a 0-100 scale where HIGHER = SAFER (low risk =
   80-100). Consumed by TWELVE files across components/assets/, components/analytics/,
   components/dashboard/, and components/ui/.
3. src/app/live-data/coin-discovery/route.ts — a 1-10 risk sub-score where higher = less risky.
4. src/lib/data/stakingProviders.ts — computeOverallRisk() over six 1-10 dimensions with
   documented weights.

Additional independent scoring exists in staking-discovery, pump-report/investigate, and
api/v1/staking/opportunities.

The core problem: the best-engineered scheme is the least adopted, and the most-adopted scheme
has inverted polarity relative to the risk-scores page's own copy (which describes 0-10 where
lower = safer). A user comparing a coin's badge to its risk-score page can read the same
underlying risk as both "safe" and "dangerous."

Deliver a specification covering:
- The single canonical scale: range, direction, and band thresholds, with the reasoning. State
  plainly whether higher means safer or riskier — that ambiguity is the root defect.
- How each of the four existing schemes maps onto it, including exact conversion for
  RISK_BAND_CONFIG's twelve consumers.
- Whether lib/risk/ becomes the single engine and the others become thin adapters, or whether
  some surfaces legitimately need their own scoring. Justify either way; do not assume
  consolidation is automatically correct.
- Where per-surface scoring is legitimate (staking's six dimensions are genuinely
  domain-specific), specify how it composes into the canonical scale rather than bypassing it.
- A migration plan naming every file that must change, ordered so the app is never in a state
  where two visible surfaces disagree.

SECOND DELIVERABLE — can the Risk Scores page go live?

The Risk Scores page (/risk-scores) currently renders N/A in live mode via LiveUnavailable, on
the stated grounds that no free data source exists and the app must not fabricate values. That
claim is disputed: a real composite appears feasible from free signals the app ALREADY fetches
— the coin-discovery risk sub-score, reserves collateralization from DefiLlama, and peg
deviation from the alerts route.

Assess this properly and make a recommendation:
- Verify which of those signals are genuinely live and reliable right now. A prior task (T1)
  audited all 42 live-data routes and flagged silently-degrading ones — read its findings
  rather than re-deriving them, and do not build a composite on a route T1 marked unhealthy.
- Determine what a defensible composite would actually measure, and for which asset classes.
  The existing stablecoin profile already does 5-pillar scoring with a fatal-flaw override —
  establish whether this is a gap in coverage or a gap in wiring.
- Be honest about what the available signals cannot support. Recommending a narrower composite
  that is genuinely grounded is a better outcome than a broad one that is partly inferred. If
  the honest answer is that N/A should stay for some or all asset classes, say so and explain
  why — that is a valid result, not a failure.
- If you recommend going live, specify the composition, the inputs, the update cadence, and the
  exact copy explaining provenance to the user. R2 will implement from this spec.

Flag anything requiring a product decision rather than deciding it silently. Methodology changes
must be reflected in the project's Methodology Guide — list what needs updating there.
```
</details>

### T1 — Audit all live data sources
> Original item 4. Blocks: T2, T6, T7, T8, T9, T10, T11.

**Owns:** `src/app/live-data/**`, `src/lib/api/live/providers.ts`, `scripts/smoke.mjs`

There are 42 route handlers under `src/app/live-data/`. This task establishes which are actually
healthy before anything downstream trusts them.

<details><summary>Deployable prompt</summary>

```
Audit every live data source in the CAEP frontend
(C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend). Read CLAUDE.md and
DATA-AVAILABILITY.md first — DATA-AVAILABILITY.md is the authoritative record of what is
Live/Partial/Not-available.

There are 42 route handlers in src/app/live-data/. For each one:
1. Exercise it against a running dev server (npm run dev) and record: HTTP status, response
   shape vs the exported TypeScript interface, latency, and whether it returned real data or
   silently fell through to a fallback/reference path.
2. Verify it follows the project's route conventions from CLAUDE.md: `export const dynamic =
   'force-dynamic'`, `next: { revalidate: N }` on fetches, and Promise.allSettled for any
   multi-fetch (never let one upstream failure crash the route).
3. Flag silent degradation specifically — routes that return 200 with stale, reference, or
   empty data are the dangerous case, because every downstream accuracy audit will
   misattribute the problem to the UI layer.
4. Note geo-blocks and key-gating. Binance.com returns 451 from this location; OHLCV falls
   back to Binance.US. FMP's free tier blocks batch quotes and the company-screener. Reddit
   403s from datacenter IPs without OAuth.

Extend scripts/smoke.mjs into a repeatable health check covering all 42 routes, so this
audit is re-runnable rather than one-shot.

Deliverables: (a) an updated DATA-AVAILABILITY.md reflecting true current state, (b) the
extended smoke script, (c) a written findings list of every broken or silently-degrading
route, ordered by how many UI surfaces depend on it. Fix outright bugs you find in the route
handlers; do NOT redesign provider architecture or touch UI pages.
```
</details>

---

## Wave 1 — Parallel (after T1)

### T2 — Verify the shared TA + backtest math
> Extracted from original items 9, 12, 13. Blocks: T9, T10, T11.

**Owns:** `src/lib/utils/indicators.ts`, `src/lib/utils/backtest.ts`, new tests

The highest-leverage correctness task in the queue: 2,281 lines of untested math with 7 consumers.

<details><summary>Deployable prompt</summary>

```
Verify the correctness of CAEP's shared technical-analysis math in
C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend.

src/lib/utils/indicators.ts (1,703 lines, 61 exported functions) and src/lib/utils/backtest.ts
(578 lines) have zero test coverage, and are imported by seven consumers: the crypto TA page,
the equity TA page, the equity backtests page, asset detail, the security-ohlcv route, the
CandlestickChart component, and indicatorRegistry.ts. Any error here is wrong in all of them
simultaneously.

For every exported indicator: verify the implementation against its standard published
definition. Pay particular attention to the usual sources of error — Wilder's smoothing in
RSI/ATR/ADX (it is not a simple moving average), EMA seeding and warm-up periods, off-by-one
in lookback windows, MACD signal-line derivation, Bollinger Band standard-deviation
population-vs-sample, and how each function handles insufficient data, gaps, and nulls
instead of emitting NaN.

For backtest.ts: verify entry/exit timing (confirm signals cannot execute on the same bar
that generated them — that is lookahead bias), position sizing, the buy-and-hold benchmark,
and every performance statistic (returns, drawdown, Sharpe, win rate).

Write a vitest suite (the project uses vitest — see src/lib/risk/__tests__/ for the existing
pattern) with known-good fixtures for each indicator and each backtest statistic. Fix what is
wrong. Do NOT modify any page component — the three page-level audits are separate tasks that
depend on this one landing first.

Report every behavioral change you make, since three pages will visibly shift.
```
</details>

### T3 — Compare page enhancements
> Original item 1. Independent.

**Owns:** `src/app/(dashboard)/compare/page.tsx` (217 lines)

<details><summary>Deployable prompt</summary>

```
Enhance the Compare page at src/app/(dashboard)/compare/page.tsx in the CAEP frontend
(C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend). Read CLAUDE.md first.

Current state: compares 2-4 stocks/funds via normalized growth-of-100 plus summary stats,
backed by /live-data/security-chart.

Start by driving the page in a browser and writing up what is actually weak about it before
changing anything — report that assessment first.

Then evaluate and implement the strongest of these directions:
- Cross-module comparison (the page is stocks/funds only today; crypto is absent even though
  the app's whole premise is a combined suite)
- Raising the 4-item cap
- Correlation matrix between selected items
- Risk-adjusted stats (Sharpe, max drawdown, beta) beside raw return
- Selectable time ranges and a shared date-window normalization
- Export, and deep-linkable comparison URLs

Follow existing conventions: React Query with the stale-time constants from lib/constants.ts,
Recharts for charts, and the risk framework in src/lib/risk/ for any risk stat rather than a
new implementation. Note that Tailwind runs from a committed prebuilt CSS file — run
`npm run css:build` after adding any new utility class or it silently renders as a no-op.
```
</details>

### T5 — Utility triage: Global + Risk Case Studies (read-only)
> Original items 6 and 10. Produces a recommendation, not code — so it cannot collide with T4.

<details><summary>Deployable prompt</summary>

```
Assess whether two pages in the CAEP frontend
(C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend) earn their place in the product. Read
CLAUDE.md first. This is a READ-ONLY assessment — produce a written recommendation, change no
code.

Page 1 — Global (/global-adoption, 649 lines): currently static country data plus a live CBDC
news feed, flagged Partial in the feature inventory.

Page 2 — Risk Case Studies (/backtests, 419 lines): replays the risk model against historical
stablecoin depeg case studies. Note that CLAUDE.md still lists this route as "Not available,
requires a backtesting backend" — that entry is stale, the page exists and was relabeled from
"Backtests". Flag the doc error.

For each, determine: what a user can actually learn that they cannot get elsewhere in the
app; how much of the content is genuinely live vs static reference data dressed as analysis;
whether the underlying data is current; and how it compares in value to the app's strong
surfaces.

Recommend one of: keep as-is, invest (with specific proposals), cut and delete, or fold into
another page. Justify with what you observed in the running app, not assumptions. If you
recommend cutting or folding, list every file and registry entry that would need to change —
but do not make the change.
```
</details>

### T6 — Agent prompts: examine, test, fine-tune
> Original items 2 + 3 merged (2 is a subset of 3). Depends on T1.

> **Status: unrecorded (checked 2026-07-28, audit L11).** Unlike T5/T8–T12 there
> is no `docs/assessments/T6-*.md`, and no commit is tagged T6 the way `53de5f9`
> is tagged T9. Agent work has clearly happened — the roster grew from the 9
> agents in the prompt below to 11 (macro-research, macro-screener, `013d624`),
> and `53de5f9` corrected a stale provider count inside the assistant prompt —
> but that landed inside broader feature commits, so whether T6 was run as a
> discrete pass cannot be established from the repo. Treat as **not verified
> complete**: re-run or write the assessment before relying on it.

**Owns:** `src/lib/agents/**`, `.agent-prompts.json`

<details><summary>Deployable prompt</summary>

```
Examine, test, and fine-tune the prompts for all AI agents in the CAEP frontend
(C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend). Read CLAUDE.md's "AI Agents" section
first.

There are 9 agents with defaults in src/lib/agents/prompts.ts (562 lines), running through one
loop in runner.ts, with tools in tools.ts (555 lines):
- shared: app-assistant (toolset 'all')
- crypto: research-analyst, data-scraper, pump-report-investigator, pump-report-chat
- equity: equity-research, equity-screener, equity-data-scraper, equity-diligence

Priority order — the Research page agents (research-analyst, equity-research) get the deepest
treatment, since they are the most-used and were called out specifically. Then app-assistant
and equity-screener. Then the rest.

For each agent: read its system prompt critically, then actually run it against real queries
and evaluate the output. Look for prompts that are vague about output format, that fail to
tell the agent which tools exist or when to use them, that invite fabrication when a tool
returns no data, that omit the live-only constraint (CAEP has no mock data path — an agent
must say "not available" rather than invent a number), and that do not establish the agent's
market scope.

RUN `npm run audit` FIRST, before judging any agent's output. The T1 audit classifies every
live-data route REAL / FALLBACK / UNCONFIGURED / EMPTY / FAIL, and agent tools read those same
routes. An agent giving vague answers because its tool sits on a FALLBACK route is a data
problem, not a prompt problem — do not tune a prompt to compensate for a degraded feed.

Note T1 changed what several agent tools now return: stock-social went from 0 to 45 signals
(Reddit was a permanent no-op), staking rates are corrected (jitoSOL was overstated 41%), and
wallet/eth no longer 502s on Ethereum and Polygon. Any prior impression of these agents predates
those fixes. Known still-degraded: stock-universe and stock-outliers serve a 79-name curated
catalog because FMP's screener is paid-only, so the equity-screener agent finds outliers within
a hand-picked set — judge its prompt against what it can actually see.

Verify each agent's tools actually work — toolsForAgent(toolset) should give each agent only
its market's tools, and every tool should hit a route that returns real data. Note that
web_search is Anthropic-only and that agents on other providers silently lose it; confirm the
prompts do not assume search is present.

Note the three placeholder agents (data-scraper, equity-data-scraper, equity-diligence) are
configured but have no invocation trigger — assess whether their prompts are worth tuning now
or whether they need a trigger UI first, and say so rather than polishing dead code.

Deliverables: revised prompts, a written per-agent evaluation with before/after examples, and
a list of any agent whose problem is structural (tools, wiring, model choice) rather than
prompt-level.
```
</details>

### T7 — Equity Stock Registry screener
> Original item 11. Depends on T1.

> **Status: unrecorded (checked 2026-07-28, audit L11).** No
> `docs/assessments/T7-*.md` and no T7-tagged commit. The registry does now
> carry the screener features this task describes (range filters, sortable
> columns including beta, 50/page pagination, P/E backfilled from SEC XBRL in
> `074d3d3`), so the outcome may have been reached — but by the equities feature
> work, not a recorded T7 pass. Treat as **not verified complete**.

**Owns:** `src/app/(dashboard)/equities/` registry components, `src/app/live-data/stock-universe/route.ts`

<details><summary>Deployable prompt</summary>

```
Fine-tune the screener on the Equity Stock Registry page in the CAEP frontend
(C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend). Read CLAUDE.md first, especially the
Equities module section and the "P/E enrichment" subsection.

The registry is at /equities (src/app/(dashboard)/equities/page.tsx is a thin shell — find the
real component). Universe comes from /live-data/stock-universe: the FMP stock-screener,
daily-cached, with a ~79-entry curated catalog fallback when no FMP key is present. Paginated
50/page, live quotes for the visible page only.

Known constraints to respect, all documented and deliberate:
- P/E is backfilled from SEC XBRL frames because FMP's screener returns none. It is a TRAILING
  P/E and will not match a broker's forward figure. Coverage is ~6,100 symbols, with real gaps
  for foreign private issuers, off-calendar fiscal years, and reorganized registrants (XOM).
- Loss-making companies return null P/E, never a negative — a negative would corrupt the range
  filter. Do not "fix" this.
- The broad universe requires a PAID FMP plan; a free key yields the curated fallback.

Drive the screener and report what is weak before changing it. Then improve: filter behavior
at the edges (nulls, empty results, conflicting ranges), which columns are filterable vs only
sortable, whether filters compose correctly, whether pagination and sorting interact correctly
across the full universe rather than just the visible page, filter state persistence and URL
deep-linking, and how honestly the UI communicates coverage gaps — a blank P/E should be
distinguishable from a genuine zero.

READ THIS BEFORE PLANNING THE WORK — the T1 audit materially changed this task's premise.
FMP's stock-screener is PAID-ONLY, and this project has no paid key. /live-data/stock-universe
therefore serves the 79-name curated catalog in practice, not a market-wide universe. "Screening"
today means filtering a hand-picked list of large caps, which is a different product from
screening the market. /live-data/stock-outliers inherits the same 79 names, so "outlier" means
outlier within that hand-picked set.

Do NOT quietly build features that only make sense on a full universe. Start by reporting what
the screener can honestly be on 79 curated names, and what genuinely requires a paid plan. If
the answer is that the current framing oversells it, say so — an honest 79-name "curated
large-cap screener" is a better product than a market screener that silently isn't one. Check
whether the UI currently communicates this limit to the user; if not, that is a finding.

Verify behavior in BOTH modes anyway (with and without an FMP key), since a key may be added
later. Tailwind runs from a committed prebuilt CSS file — run `npm run css:build` after adding
any new utility class.
```
</details>

---

## Wave 2 — Risk migration + accuracy audits (after T1, T2, R1)

R2 is the broadest change in the queue but does not overlap the audits in this wave — transfer fees and
the TA/backtest surfaces carry no risk scoring. T10–T12 are thin here because T2 already proved the math.

### R2 — Migrate the app to the canonical risk scale
> Risk framework, part 2 of 2. Depends on R1. Blocks: T4, T9.

**Owns:** `src/lib/risk/**`, `src/lib/utils/risk.ts`, `src/components/assets/**`,
`src/components/analytics/**`, `src/components/dashboard/RiskHeatmap.tsx`,
`src/lib/data/stakingProviders.ts`, `src/app/live-data/coin-discovery/route.ts`,
`src/app/live-data/staking-discovery/route.ts`

<details><summary>Deployable prompt</summary>

```
Migrate the CAEP frontend (C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend) to the single
canonical risk scale specified in the R1 design document. Read that specification, CLAUDE.md,
and docs/architecture/risk-framework.md first, and follow R1's migration order.

Scope, in R1's priority order. Note this is NOT a polarity migration — that premise was wrong.
The scale is already 0-100 higher-is-safer nearly everywhere. The work is wiring, deletion, and
deduplication:

1. THE ACTUAL BUG. src/lib/api/live/overlay.ts (~line 25) nulls riskScore and riskBand on every
   live asset, with a comment claiming risk "has no free live source." That is stale —
   /live-data/risk-scores scores every tracked asset with a CoinGecko id. Remove the nulling and
   wire the real composite through. Roughly twelve components currently render N/A because of
   this. app/(dashboard)/assets/[id]/page.tsx shows both failure modes in a single viewport: an
   N/A gauge around line 485 and a full live composite panel with confidence and evidence around
   line 611. Verify the fix on that page specifically.
2. DELETE THE DEAD LITERALS. src/lib/data/assetCatalog.ts carries 109 hardcoded riskScore values
   (91.2, 62.8, 12.4, ...) that are currently defused only by the overlay nulling you are about
   to remove. Any path bypassing the overlay would resurrect them as apparently-real scores —
   a direct violation of the live-only policy. Delete them as part of step 1, not after.
3. DEDUPLICATE. src/lib/utils/risk.ts RISK_BAND_CONFIG and src/lib/risk/types.ts
   RISK_BAND_THRESHOLDS encode the same thresholds twice, with two RiskBand declarations. Collapse
   to one source of truth per R1's spec. This is refactor debt, not a live bug — do not let it
   crowd out steps 1 and 2.
4. THE ONE REAL INVERSION. src/lib/data/stakingProviders.ts computeOverallRisk() is 1-10 where
   higher = MORE risk, opposite to canonical. Handle per R1's quarantine plan.
5. RENAME user-facing surfaces from "Risk Score" to "Safety Score" — APPROVED by the user
   2026-07-19, resolving R1's question P1. The scale stays 0-100 higher-is-safer; only copy
   changes. Do not invert anything. Apply consistently across components, page copy, agent
   prompts, and the Methodology Guide, since "risk score 95" currently reads as dangerous when
   it means safe.

Requirements:
- Extend the existing vitest suite. The framework has ~689 lines of coverage — do not regress it.
  Add tests BEFORE changing behavior.
- api/v1/staking/opportunities and its openapi.json are a PUBLIC contract consumed by an MCP
  server and external agents. Its max_risk parameter is a filter whose meaning inverts across the
  staking scale flip: a cached "max_risk=4 means conservative" assumption would return the
  RISKIEST providers, with a 200 and plausible data and no error surface. Follow R1's
  additive-only plan — add safetyScore/band/max_safety, never mutate the legacy trio, update the
  MCP server only after deploy. DECIDED by the user 2026-07-19 (R1's question P4): legacy fields
  stay for now and NO deprecation date is set. CAEP has no consumer telemetry, so "nobody uses
  this" is an assumption — add request logging to the v1 routes as part of this task, per R1 §E2,
  so a removal decision can later be made from data rather than guesswork.
- lib/agents/prompts.ts references risk scoring. T6 rewrote that file in Wave 1 — EXTEND its work,
  do not overwrite it. Update only the copy describing the risk scale.
- Do NOT build the composite R1 was asked to evaluate. R1 recommended against it: it would replace
  a 5-pillar model having per-pillar confidence and fatal-flaw overrides with a 3-input blend that
  double-counts (reserves and peg are already weighted 30% and 25%). Risk History stays N/A — no
  score time-series is persisted and no free historical peg series exists to backfill from.

Do NOT redesign the Assets/Coins page layout or re-audit the staking risk dimensions — those are
separate tasks (T4, T9) that depend on this one landing first.

Report every user-visible score or band change, since risk display shifts across the whole app.
```
</details>

### Accuracy audits

### T8 — Transfer Fees audit
> Original item 7. **Likeliest source of real user-visible inaccuracy in the app.**

**Owns:** `src/lib/data/transferFees.ts`, `src/app/(dashboard)/transfer-fees/page.tsx` (882 lines)

<details><summary>Deployable prompt</summary>

```
Run a detailed accuracy and usability audit of the Transfer Fees page in the CAEP frontend
(C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend). Read CLAUDE.md's transferFees.ts
section first.

This is the app's highest-risk surface for stale data: src/lib/data/transferFees.ts is a
hand-maintained table of 25 exchanges x 16 coins x 16 networks, with per-coin/per-network
withdrawFee, minWithdraw, withdrawEnabled, and depositEnabled. Exchange withdrawal fees change
frequently and the table has no automated refresh. Live token prices are layered on top, so a
stale fee renders as a confidently wrong dollar figure.

Accuracy work:
- Spot-check withdrawal fees against each exchange's current published fee schedule.
  Prioritize the tier-1 exchanges and the high-traffic pairs (BTC, ETH, USDT, USDC across
  ERC-20/TRC-20/BEP-20/Solana). Report a per-exchange accuracy rate rather than silently
  patching numbers.
- Verify withdrawEnabled/depositEnabled flags — a delisted or suspended asset shown as
  transferable is worse than a wrong fee.
- Verify findTransferPaths(): direct routes before multi-hop, correct totalFeeUsd summation
  and sort, and correct handling of the PERSONAL_WALLET_ID ('wallet') hop.
- EVM_NETWORKS exists to flag address-collision danger. Confirm that warning actually fires
  where it should — sending to the right address on the wrong EVM chain is the most expensive
  user error this page can prevent.

BOTH SIDES OF THE CALCULATION ARE STATIC — from the T1 audit: /live-data/network-fees serves a
live fee for **Bitcoin only**. The other 17 chains are static gas amounts multiplied by a live
token price, which produces a number that moves (because the price moves) while the gas
component never updates. That is more misleading than an obviously-frozen figure, because
motion reads as freshness. So the exchange withdrawal table AND the on-chain gas side are both
stale; assess the page's total honesty accordingly, not just the exchange table.

Usability work: drive the page and assess selector flow, how clearly staleness is labeled (the
page is flagged Partial and must not present static fees as live), and whether the cheapest
route is legible at a glance.

Deliverables: a corrected data file, an accuracy report per exchange, a recommendation on
whether this table can be sourced live (several exchanges expose fee endpoints) instead of
hand-maintained, and honest staleness labeling in the UI.
```
</details>

### T10 — Crypto Technical Analysis page audit
> Original item 9, reduced to page-level scope by T2.

**Owns:** `src/app/(dashboard)/technical-analysis/page.tsx` (1,791 lines — largest page in the app)

<details><summary>Deployable prompt</summary>

```
Audit the crypto Technical Analysis page in the CAEP frontend
(C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend), at
src/app/(dashboard)/technical-analysis/page.tsx (1,791 lines). Read CLAUDE.md first.

IMPORTANT SCOPE: the shared indicator and backtest math in src/lib/utils/indicators.ts and
src/lib/utils/backtest.ts has already been verified and tested in a prior task. Do NOT re-audit
or edit those files — they are shared with two equity pages and changes there will conflict.
If you believe you have found a genuine math error, report it rather than fixing it in place.

Audit the page layer only:
- Data wiring: are OHLCV candles fetched, ordered, and time-aligned correctly before reaching
  the indicators? Off-by-one or unsorted candles produce wrong output from correct math.
- Are indicator parameters (periods, sources) passed correctly, and do the UI controls
  actually affect the computation?
- Chart rendering: do overlays align with the price series on the correct axis and time scale?
- Pattern detection and support/resistance: verify these are defensible and not
  over-fitting noise.
- The thesis/risk-reward feature (useThesisStore, computeRiskReward) — verify the arithmetic
  and that it degrades sensibly on incomplete input.
- Insufficient-data handling: short histories, gaps, and thinly-traded coins must not render
  NaN, a blank chart, or a misleading flat line.
- At 1,791 lines this is the largest page in the app — note extraction opportunities, but do
  not undertake a large refactor as part of an accuracy audit.

CRITICAL FOR CROSS-CHECKING — from the T1 audit: /live-data/ohlcv serves candles from
**Binance.US**, not Binance.com, because Binance.com is geo-blocked (451) from this machine. The
route's `source` field still reports "binance" (the TA page switches on that value, so it was
left alone); a new `venue` field carries the truth. These are different venues with genuinely
different prices and volumes. When you cross-check against an external reference, compare
against Binance.US or expect legitimate divergence — do NOT file real venue differences as
indicator bugs.

Verify against a real charting reference (TradingView) for 2-3 coins across several
indicators, and report discrepancies with specifics.
```
</details>

### T11 — Equity Technical Analysis page audit
> Original item 12, reduced to page-level scope by T2.

**Owns:** `src/app/(dashboard)/equities/technical-analysis/page.tsx` (468 lines)

<details><summary>Deployable prompt</summary>

```
Audit the Equity Technical Analysis page for accuracy in the CAEP frontend
(C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend), at
src/app/(dashboard)/equities/technical-analysis/page.tsx (468 lines). Read CLAUDE.md first.

IMPORTANT SCOPE: the shared indicator math in src/lib/utils/indicators.ts has already been
verified and tested in a prior task. Do NOT re-audit or edit that file — it is shared with the
crypto TA page and the equity backtests page. Report suspected math errors rather than fixing
them in place.

Audit the page layer only. Equities differ from crypto in ways that are the likeliest source
of bugs here, since this page shares an engine with a 24/7 market:
- Market hours and session gaps: equities do not trade continuously. Verify that overnight and
  weekend gaps are handled correctly and do not distort indicator warm-up or volatility.
- Holidays and half-days.
- Splits and dividends: verify whether /live-data/security-ohlcv returns adjusted or
  unadjusted candles, and confirm the page's treatment is correct and consistent. An
  unadjusted split will look like a catastrophic price crash to every indicator.
- Verify the OHLCV provider chain (Yahoo -> Tiingo -> FMP) returns consistently-shaped data
  regardless of which provider answers — indicator output must not change based on failover.
- Verify the screener and indicator controls actually affect computation.
- Insufficient-data handling for recently-listed tickers.

Cross-check 2-3 symbols against a real charting reference and report discrepancies with
specifics.
```
</details>

### T12 — Equity Backtests audit + fine-tune
> Original item 13, reduced in scope by T2.

**Owns:** `src/app/(dashboard)/equities/backtests/page.tsx` (385 lines)

<details><summary>Deployable prompt</summary>

```
Audit, test, and fine-tune the Equity Backtests page in the CAEP frontend
(C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend), at
src/app/(dashboard)/equities/backtests/page.tsx (385 lines). Read CLAUDE.md first.

Current state: runs SMA/RSI/MACD strategies against real history from /live-data/security-ohlcv
and compares to buy-and-hold. Imports rsi, sma, macd from src/lib/utils/indicators.ts.

IMPORTANT SCOPE: the indicator math and the core backtest engine (src/lib/utils/backtest.ts)
have already been verified and tested in a prior task, including lookahead-bias checks. Do NOT
edit those files. Report suspected errors there rather than fixing in place.

Audit the page layer:
- Strategy definitions: verify each strategy's entry and exit rules are implemented as
  described in the UI, and that signal-to-execution timing is correct at the page level.
- Verify the buy-and-hold benchmark is computed over an identical date window with identical
  starting capital — a mismatched window silently flatters or maligns every strategy.
- Realism gaps: check whether transaction costs, slippage, and dividends are modeled. If not,
  the results are optimistic and the UI must say so plainly rather than presenting a naive
  backtest as an achievable return.
- Same equity-specific hazards as the TA page: split/dividend adjustment in the source candles,
  session gaps, and short histories for recently-listed tickers.
- Verify displayed statistics match what the engine returns, and that percentages, currency,
  and annualization are formatted with correct units.

Fine-tuning: after correctness is established, improve the page — parameter controls for
strategy inputs, clearer result presentation, and honest labeling of the backtest's
limitations. Tailwind runs from a committed prebuilt CSS file — run `npm run css:build` after
adding any new utility class.
```
</details>

---

## Wave 3 — Risk-dependent work (after R2)

Both tasks render or compute risk scores that R2 rewrites. They own disjoint files and run in parallel.

### T4 — Coins rename + Assets layout
> Original item 5. Owns the module registry. Depends on R2.

**Owns:** `src/lib/modules/registry.ts`, `src/app/(dashboard)/assets/**`

<details><summary>Deployable prompt</summary>

```
In the CAEP frontend (C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend), rename the
crypto "Assets" page to "Coins" and redesign its layout. Read CLAUDE.md first.

Rename: the nav entry is in src/lib/modules/registry.ts (line ~90, the crypto module's
navItems) — the sidebar renders from that registry, not from Sidebar.tsx. Change the label to
"Coins" and update the page's own heading plus any user-facing copy referring to "assets" in
the crypto context. Keep the /assets route path and the /assets/[id] detail route as-is
unless you find a low-risk way to move them with redirects; report the tradeoff rather than
breaking existing deep links, and note that other surfaces link into /assets/[id].

Layout: src/app/(dashboard)/assets/page.tsx is an 8-line shell — find the real component it
renders. Drive the current page in a browser, write up what is weak about the layout, then
redesign. It is a registry of coins with live prices and metadata from the static catalog;
compare it against the Stock Registry (/equities) and Fund Registry (/funds), which are the
more evolved equivalents in the same app, and bring it up to that standard.

The risk-score display in components/assets/ (AssetTable, AssetCard, AssetFilters,
AssetComparison, RiskScoreBadge) was migrated to a new canonical risk scale in a prior task.
Use that scale as-is — do not reintroduce the old RISK_BAND_CONFIG helpers or invent new
banding for the redesigned layout.

Tailwind runs from a committed prebuilt CSS file — run `npm run css:build` after adding any
new utility class or it silently renders as a no-op.
```
</details>

### T9 — Staking page audit
> Original item 8. Depends on R2.

**Owns:** `src/app/(dashboard)/staking/page.tsx` (559 lines), staking rate data

<details><summary>Deployable prompt</summary>

```
Audit the Staking page for accuracy in the CAEP frontend
(C:\Users\marcu\OneDrive\Desktop\Crypto-Stuff\frontend). Read CLAUDE.md's stakingProviders.ts
section first.

Current state: live APR for stETH (Lido), mSOL (Marinade), and jitoSOL (Jito) via
/live-data/staking-rates; the other 15 of 18 providers carry reference/estimated rates. Page
is flagged Partial.

Rate accuracy — START FROM THE T1 AUDIT'S FINDINGS, which already did part of this:
- T1 measured that only **4 of 28 APRs are live**; the rest are static estimates. It also found
  and fixed a real one: jitoSOL was silently pinned to a 7.5% static estimate while the docs
  advertised it as live, because Jito's /api/v1/apy endpoint now 404s. The real rate was 5.32% —
  the app was overstating a yield figure by 41%. Assume more of this pattern exists; a provider
  marked "live" whose endpoint has quietly moved is the exact failure to hunt for.
- Run `npm run audit` (the consolidated harness T1 built) and read its REAL/FALLBACK
  classification for staking-rates before doing anything else.
- Verify the live APR feeds return current, correctly-scaled values (APR vs APY is a common unit
  error) and that the UI does not present estimated providers as live. Every rate must be labeled
  by provenance.
- Spot-check the estimated rates against each provider's current published rate and report how
  far they have drifted.
- Check whether any provider's status has materially changed — defunct, paused, jurisdiction
  restricted. Keep Celsius: it is deliberately retained as the cautionary example.
- Assess whether more of these 15 providers could be sourced live and recommend which.

Risk-score accuracy:
- src/lib/data/stakingProviders.ts was migrated to the app's canonical risk scale in a prior
  task. Do NOT re-scale it or change computeOverallRisk()'s output convention — that decision
  is settled. If you believe the migration is wrong, report it rather than reverting it.
- Within that scale, audit the CONTENT of the six-dimension RiskProfile scores (custodyRisk,
  counterpartyRisk, contractRisk, slashingRisk, liquidityRisk, regulatoryRisk): are the
  per-provider values defensible, and are they consistently scored relative to each other? The
  characteristic failure of a hand-scored table is that entries scored at different times drift
  into incomparability — a provider rated 4 in one dimension should mean the same thing across
  all 18 rows.
- Verify the documented weights are applied as specified (counterparty 25%, custody 20%,
  liquidity 20%, contract 15%, slashing 10%, regulatory 10%) and that the resulting bands are
  sensible.

Tailwind runs from a committed prebuilt CSS file — run `npm run css:build` after adding any new
utility class.
```
</details>

---

## Wave 0 — Results (completed 2026-07-19/20)

Both tasks landed. Wave 0 did its job: it corrected the plan before any code moved.

**R1** produced `docs/architecture/risk-scale-spec.md` (branch `docs/risk-scale-spec`) and disproved two
premises — see the revision note near the top. R2's scope shrank accordingly.

**T1** audited all live-data routes from the user's own network. Headline: **the pre-existing harness
reported 43/43 PASS while multiple routes were serving static catalogs** — exactly the misattribution
risk the wave existed to eliminate. The consolidated harness now classifies every route
REAL / FALLBACK / UNCONFIGURED / EMPTY / FAIL. Current state: **60 REAL, 8 FALLBACK, 3 UNCONFIGURED,
1 EMPTY, 0 FAIL**.

Harness consolidation: `scripts/smoke.mjs` was deleted and folded into `scripts/test-live-data.mjs`.
`npm run smoke` is now the 13-test quick subset; `npm run audit` is the full 72-check run, with
`audit:strict` and `audit:json`. Note the old smoke check for network fees was **silently broken** —
it counted envelope keys and reported "5 networks" as a pass when both layers carry 18.

Six bugs fixed: `wallet/eth` hard-502'd on Ethereum and Polygon (single RPC per chain, both failing);
`staking-rates` had jitoSOL pinned to a 7.5% static estimate while advertised live (real rate 5.32% —
a **41% overstatement of a yield figure**); `stock-social`'s Reddit integration was a permanent no-op
(the `.json` API 403s server-side from every IP) and now returns 45 signals via `.rss`; `chart` was
missing `force-dynamic` and fabricated OHLC; `ohlcv` mislabeled Binance.US as Binance; and
`portfolio-history` returned 200 on bad params.

Corrections to assumptions this queue carried: **Stooq is dead** (404 on all variants — that rung of
the equity quote ladder no longer functions), **Reddit `.rss` 429s** at roughly one request per window
per IP so both social routes are inherently partial, **`/live-data/tier` does not exist** (it was listed
in error — tier data is client-side), and **`fund-holdings` is healthy** — SPY returns 5 catalog
holdings because it is a unit investment trust that files no N-PORT, now pinned as a test so nobody
"fixes" a filing that will never exist.

---

## Follow-ups from Wave 0

T1 deliberately scoped these out as exceeding an audit's blast radius. All are independent; F1 and F3
can run any time, F2 needs a product decision first.

> **Status check 2026-07-30 — all four verified in source, three are closed.** This section had
> gone stale in the familiar direction: work happened, the queue never heard about it. Per-item
> annotations below; only F3 needed new code (done the same day).

### F1 — `Promise.allSettled` convention on 8 routes
> **Status: ✅ resolved (2026-07-22), by correcting the premise rather than the routes.** The
> review pass found **7 of the 8 are sequential fallback ladders that are correct as written** —
> parallelising a ladder with `allSettled` fires every provider at once and burns rate limit on
> exactly the calls the ladder exists to avoid. The convention docs (CLAUDE.md "Resilient
> multi-fetch") now describe both shapes so the next audit doesn't re-flag them. The one genuine
> bug was `sec-filings` (a thrown archive page discarded already-collected filings and 503'd the
> route), fixed in `23654fc` with the accumulate-until-satisfied pattern.

Eight multi-fetch routes don't follow the stated convention: `markets`, `company-profile`, `sec-filings`,
`stock-universe`, `portfolio-prices`, `cbdc-data`, `wallet/exchange`, `config`. Most are internally
try/caught so they degrade rather than 500, but they diverge from the documented pattern. This changes
failure semantics on 8 routes — do it as its own task with its own verification, not folded into
something else.

### F2 — `stock-social` recency starvation
> **Status: ✅ fixed (`f47cc41`).** The blend decision was made: fair-share round-robin per
> provider (`lib/server/socialBlend.ts`, unit-tested), each provider contributing newest-first
> within its quota, unused quota flowing to active providers, result re-sorted by recency for
> display. Reddit can no longer be starved to zero at any limit, and `contributed` reports which
> providers actually placed items so attribution stays honest.

Reddit now works but is starved by recency sorting: StockTwits posts are minutes old, Reddit's are
hours old, so at `limit ≤ 30` Reddit gets **zero** slots (0 at 20, 10 at 40, 45 at 80). Fixing this is
a product decision about how to blend real-time chat against forum discussion — decide the blend before
writing code.

### F3 — `fund-universe` performance
> **Status: ✅ fixed (2026-07-30).** The payload, not the latency, was the durable problem — the
> 11 s is first-fetch only (both upstream directories cache 24 h). The 14 MB came from shape:
> every uncurated fund (~30k rows) serialized as a full 18-field entry with 14 fields always
> null. The full-universe response now carries discovered funds as compact `{ symbol, name }`
> lists per type, hydrated client-side in `FundsClient`; the catalog's 118 rich entries and the
> `?symbol=` single-lookup path (which detail pages use) are unchanged. Client-side screening
> still sees the whole universe, which server-side pagination would have broken.

11 seconds and a 14 MB payload. Needs pagination or server-side filtering.

### F4 — delete the dead `chart` route
> **Status: ⛔ overtaken — deletion is off the table.** The Compare page's crypto leg now
> consumes `/live-data/chart` (`compare/page.tsx`), reading **close prices only** — a safe use of
> a price-only series, and exactly what T3's cross-module comparison needed. The route's own
> header comment was the stale artifact still claiming "no consumers" (fixed 2026-07-30; it now
> names the consumer and constrains new ones to close-only reads). The `synthetic: true` marker
> stays as the guard against OHLC-shaped misuse.

`/live-data/chart` has **zero consumers** and fabricates OHLC (`open == high == low == close`) that is
indistinguishable from real candles once it leaves the route. T1 added a `synthetic: true` marker as a
stopgap. Fold this into T5's cut list — the safest fix for a dead route that manufactures plausible
data is deletion.

---

## Phase 2 — Queued, not yet scoped

Deliberately not broken down until Phase 1 lands, since Phase 1 findings will shape both.

1. **Commodities / Fiat / Bonds module.** New entry in `src/lib/modules/registry.ts` + pages wrapped in
   `<ModuleGate>`, per the module boundary rules in CLAUDE.md. Should reuse the shared TA engine that
   T2 will have tested, and the provider registry that T1 will have mapped.
2. **Options and futures trading support.** Note that `src/lib/risk/profiles/` already contains an
   `optionsTrade` profile — there is an existing foundation here worth reviewing before designing new
   work. Options add genuinely new primitives the app has never modeled (Greeks, implied volatility,
   expiries, chains), so this is the larger of the two.

**Precursor resolved in Phase 1:** the risk-scale reconciliation is now R1 + R2 rather than a deferred
item. This matters for Phase 2 — both new asset classes bring their own risk characteristics, and
`lib/risk/profiles/` is where they land. Adding commodity, bond, and futures profiles on top of four
contradictory scales would have compounded the problem; on a canonical scale they are additive.

Bonds in particular have well-established risk primitives (duration, credit quality, convexity) that
should compose into the canonical scale rather than becoming a fifth convention. R1's specification
should be written with that extension in mind.
