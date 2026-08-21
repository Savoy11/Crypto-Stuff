# Finance Now Task Queue — Phase 1

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

## Wave 4 — Improvement-agent intake (2026-07-30)

Filed from the first `code-auditor` and `opportunity-scout` outputs (PR #61) plus the
review of that PR, after owner approval in session on 2026-07-30. Sources:
`docs/audits/2026-07-30-audit.md` (verified findings — independently re-verified in
source before filing), `docs/PRELIMINARY-FINDINGS-2026-07-30.md` (**leads only** — each
must be verified in source before fixing; they came from stand-in agents and do not meet
the auditor's evidence bar), and `docs/proposals/2026-07-30-proposals.md` (both APPROVED).
Lenses: *Importance / Efficiency / Practicality*.

### Verified defects (from the real audit — fix directly)

- [x] **W4-A1 · `P1` — Always-green "Live" indicator.** `lib/websocket/hooks.ts:19` is the
      only writer of connection status and unconditionally sets `'connected'`; StatusBar and
      Sidebar render it green on every screen and can never report a degraded feed. Drive it
      from React Query's global error/fetching state, or delete the indicator and the
      unreachable `'connecting'/'disconnected'/'error'` branches. A shim that only reports
      success is worse than no indicator. *(High / High / High)*
- [x] **W4-A2 · `P2` — Broken auth re-enable recipe.** `(dashboard)/layout.tsx` documents
      `REQUIRE_AUTH = !LIVE_DATA`, which is permanently `false`; `(auth)/login/page.tsx`
      carries the correct recipe. Delete the wrong one, and revisit the "until the risk
      framework is done" condition — satisfied 2026-07-19. *(Med / High / High)*

### Approved proposals (build work)

- [x] **W4-B1 · `P1` — Fund look-through.** Weighted N-PORT holdings are already fetched in
      full per fund (`/live-data/fund-holdings`) and no screen combines them with portfolio
      weights. Build: true underlying-issuer exposure across held funds + direct positions,
      and pairwise fund-overlap on `/compare`. Feeds Portfolio Builder's concentration check
      its missing input. Coverage must travel per fund (full N-PORT ≠ Yahoo top-10 — never
      blend unlabeled). Grounding: proposal 1, `docs/proposals/2026-07-30-proposals.md`.
      APPROVED 2026-07-30. *(High / High / Good)*
- [x] **W4-B2 · `P2` — Macro Technical Analysis page.** `/macro/technical-analysis`
      parameterised over the 45 macro instruments, reusing the shared TA engine — the
      ROADMAP "What must be built" item 2 that was specified but never built (the 2026-07-21
      SHIPPED note overstates; fix that note as part of this). Respect `quoteBasis` /
      `valueFormat: 'plain'`; screen thin contracts out of any scanner. Grounding: proposal
      2, same file. APPROVED 2026-07-30. *(Med / High / Very good)*

### Leads — verify in source first, then fix (from the stand-in findings)

- [x] **W4-C1 · `P1` — PlanMonitor false all-clear.** `portfolioUtils.ts`: a holding with a
      live price but no entry price is valued at target, so drift can compare the plan
      against itself (`driftPts: 0`, `hold` everywhere, `pricedPct` 100). Mechanism
      confirmed; end-to-end consequence NOT yet verified — verify first. CLAUDE.md's stated
      rule ("no live price → excluded, never valued at cost") was implemented against a
      missing price but not a missing cost basis. Highest-consequence lead: premium module's
      core monitoring feature.
- [x] **W4-C2 · `P2` — `<ModuleGate>` inside JSX on `equities/[symbol]` and
      `funds/[symbol]`.** Hooks run before the gate returns; verify whether queries poll
      while locked, then move the gate to the component boundary per the documented rule.
- [x] **W4-C3 · `P2` — Custom Atom feeds parse to zero articles** on `market-news` and
      `macro-news` (`parseRss` matches `<item>`; Atom uses `<entry>`; the crypto route
      reportedly handles both). Three parser copies, one fixed — consider consolidating.
- [x] **W4-C4 · `P2` — Quote ladder returns on partial success.** A rate-limited provider
      returning 12 of 50 quotes stops the ladder; the other 38 fall to catalog reference
      without Yahoo being asked. Fix is a per-symbol residual pass — explicitly NOT
      `allSettled` over the ladder (see the failure-boundary conventions).
- [x] **W4-C5 · `P2` — Unguarded `new Date(pubDate).toISOString()`** in an RSS path can
      throw on one malformed date and lose the whole feed; a guarded sibling reportedly
      exists ~56 lines later in the same file. Also: `lib/server/pubDate.ts` is wired into
      only 1 of 3 RSS routes, so future-stamped articles can make `isBreaking` trivially
      true on the others.
- [x] **W4-C6 · `P2` — Treasury yield curve year-boundary gap.** The route queries only the
      current calendar year with no `year-1` fallback — reportedly unavailable each January
      until the first business day publishes. (Route logic now lives in
      `lib/server/treasuryCurve.ts` — fix it there; both consumers inherit.)
- [x] **W4-C7 · `P2` — `fundCatalog.ts` has no provenance machinery** while its expense
      ratios are computed on (`computeFeeDrag`, builder fee math, `reviewPlan` fee-creep).
      Apply the transferFees pattern (`*_LAST_VERIFIED`, staleness window, injectable now,
      `<ProvenanceNotice>`).
- [x] **W4-C8 · `P2` — Smaller verified-quickly items, batched:** `?agent=macro-screener`
      deep link runs the crypto agent (`initialMarket` match list); reference market caps
      render without the amber `ref` tag (tag covers price only; providers below FMP return
      `marketCap: null` so this is the normal path); nine divergent `timeAgo`
      implementations, several rendering negative ages; `EQUITY_REFERENCE_AS_OF` has no
      consumers; CLAUDE.md says portfolioBuilder has 55 tests (82 on disk).
- [x] **W4-C9 · `P2` — Untested dollar-figure logic:** `computeNetworkFees()` (declared
      single source of truth for two API layers) and `computeFeeDrag()` have no tests.
      Write them before anything touches either.

### Owner decisions + agent-hygiene follow-ups (from the PR #61 review)

- [x] **W4-D1 · `P1` — DECIDE: affiliate policy contradiction.** Both agent definitions
      declare "no affiliate links in Finance Now" as settled policy; `docs/ROADMAP.md`
      carries the owner-authored "Affiliate links — P2, gated on integrity rules" plan and
      `docs/BUSINESS-CHECKLIST.md` expects affiliate 1099s. One side must yield: either
      strike the ROADMAP/BUSINESS-CHECKLIST sections as superseded, or soften the agents'
      policy line to "not until the integrity rules ship." Until decided, the scout refuses
      that territory and the auditor would flag any implementation.
- [x] **W4-D2 · `P2` — Move the `npm run audit` IP-dependence caveat into
      `.claude/agents/code-auditor.md` itself** (currently only in PR #61's body — a future
      run reads only the agent file). One line: owner-machine only; otherwise skip and
      record why. Also add CLAUDE.md and `docs/agents/code-checker.md`'s do-not-fix registry
      to the auditor's Step-1 reading list, so deliberate decisions aren't filed as defects.
- [x] **W4-D3 · `P2` — Name the four-agent division of labor** in
      `docs/IMPROVEMENT-AGENT-SETUP.md` and CLAUDE.md's agent-charters note: code-checker
      (diff/PR review) vs code-auditor (repo-wide audits); checklist-steward (all status
      ledgers, approval-gated) vs opportunity-scout FILE mode (TASK-QUEUE inserts,
      approval-gated). Both TASK-QUEUE writers must read each other's outputs
      (`docs/audits/rejected-proposals.md` ↔ steward annotations).

### Owner-machine only (do not attempt from a container)

- Staking 4/51 live-coverage root cause (the 6s-abort theory is an unobserved inference) ·
  provider licensing claims · any REAL-vs-FALLBACK re-measurement, including the
  fund-universe payload size recorded as pending in DATA-AVAILABILITY item 11.

---

## Wave 4 — Results (2026-07-30)

Both verified defects, all nine lead batches, both approved proposals, and the D1
decision landed via PR #63 (merged 2026-07-30). **W4-D2 and W4-D3 followed the same
day** at the owner's request, closing the wave: the audit IP-dependence caveat now
lives in `.claude/agents/code-auditor.md` itself (owner-machine only; otherwise skip
and record why), CLAUDE.md and the code-checker's do-not-fix registry are on the
auditor's Step-1 reading list, and the four-agent division of labor is named in
`docs/IMPROVEMENT-AGENT-SETUP.md` and CLAUDE.md's agent-charters note, including the
rule that both TASK-QUEUE writers read each other's outputs before writing.

**Every lead was verified in source before being fixed, and three were wider than
reported.** That was the point of filing them as leads rather than defects:

- **W4-C6** was reported as a 1 January outage. It is also a *silent* fault for the
  following ~5 weeks: with under 30 days in the current year's file, the "month ago"
  comparison collapsed onto the earliest available row — in early January, the same
  row as `latest`, so a 30-day change of exactly zero was presented as fact. An
  outage is visible; this was not.
- **W4-C5** was reported as one unguarded date. It was two routes, and fixing it via
  the shared parser also extended `parsePubDate`'s timezone-less normalisation to
  both, which was the more consequential half.
- **W4-C9** asked only for tests. Writing them surfaced a real display bug: a fund
  cheaper than the 0.03% benchmark (FXAIX at 0.015%) produced negative `feesPaid`,
  which the card clamped to zero while keeping the minus sign — "−$0 (−0.3%)", a
  double negative reading as a cost when it is a saving.

**W4-C1 reproduced exactly as described** and is the most consequential fix in the
wave: with no entry prices, `actualWeightsFromPortfolio` returned the portfolio's own
target weights, so `checkDrift` compared the plan against a copy of itself — zero
drift on every line, `hold` everywhere, and `pricedPct` of 100, which is the value
the coverage disclosure keys on. The premium module's core monitoring feature
reported a clean bill of health having measured nothing. Every pre-existing test in
that block used holdings with entry prices, which is why it survived 86 of them.

**Test coverage went from 454 to 528.** One incidental unblock: `server-only` is a
Next build-time poison pill absent from `node_modules`, so vitest could not resolve
it and all seven `lib/server` modules importing it were untestable. Aliased to a
stub; the bundler check is unaffected.

**Two claims in project docs were corrected rather than quietly rewritten:** the
ROADMAP's "everything from 'What must be built' is now SHIPPED" (the macro TA page
did not exist — W4-B2 built it), and CLAUDE.md's portfolioBuilder test count (55 →
86).

Verified with `npm run type-check`, `npx vitest run` (528 passing), `npx eslint src/`
(no errors), and `npm run build`. `npm run audit` was **not** run — it is
IP-dependent and owner-machine only, per CLAUDE.md; nothing in this wave changed a
provider's reachability, but the REAL/FALLBACK baseline should still be re-measured
on the owner's machine before trusting it.

---

## Phase 2 — Scoped and delivered (2026-08-05)

> **Phase 2 is complete.** Every task that was buildable shipped the same week the
> scope landed: P2-O1 (owner-machine audit), P2-O2 (Trade Risk Scorer), P2-R3
> (macro risk profiles), P2-O4 (futures term structure), and P2-O5's scorer half.
> P2-O3 and P2-O5's chain half are **closed by owner decision**, not left open —
> there is no keyless options-chain source and a keyed one isn't worth its cost
> yet. See the status note under "Scheduling" for the reopen triggers.

Scoped after Phase 1 closed (Waves 0–4 all done), per the original rule that Phase 1 findings
should shape this. They did — in two ways that change the plan as written:

**Item 1 as queued ("Commodities / Fiat / Bonds module") is already shipped.** It became the
Macro Markets module (2026-07-21): registry + detail pages for 19 commodities / 18 FX / 8 rates,
macro news, the yield curve, provider-registry and agent integration, instruments-layer entries,
and (W4-B2) the shared-engine TA page. Do not re-plan it. What survives is the one piece the
precursor note anticipated and nothing delivered: **`lib/risk/profiles/` has no commodity, bond,
or currency profile** — macro instruments carry only coarse class-level `riskTier` placements
(1–10, set in `instruments.ts`), which feed portfolio weighted-risk with less grounding than any
other asset class in the app. That residual is P2-R3 below.

**Item 2 ("Options and futures trading support") is scoped as analytics and education, not
execution.** Routing or assisting orders is the largest regulatory step in the owner backlog
(`docs/ROADMAP.md`, "Linking brokerage accounts") and is explicitly out of scope here. "Support"
means: score a trade you are considering, see a chain, read a term structure — never place,
route, or recommend one. The existing `optionsTrade` risk profile already takes this stance
("it explains risk, it does not recommend trades"); the module inherits it.

### Why this order

The blocking fact, known before any audit: **options chain data is the first surface in this app
where the free tier may genuinely not exist.** Every module so far found a keyless authoritative
source (SEC, treasury.gov, ECB, mempool.space). Options market data is OPRA-licensed and mostly
paid; the keyless candidates are CBOE's delayed-quotes JSON (official but 15-min delayed, with
usage terms to read) and Yahoo's unofficial options endpoint. Which of those actually works, what
fields they carry, and whether their terms permit this use **cannot be established from a
container** (the same IP-dependence rule as `npm run audit`) — so P2-O1 runs first, on the
owner's machine, and everything chain-dependent waits for its verdict.

Two tasks deliberately do NOT wait for it:

- **P2-O2** surfaces the existing `scoreOptionsTrade()` engine with manual leg entry. The engine
  takes user-described legs (side/type/strike/bid/ask, optional OI, delta, IV rank) and needs no
  chain feed at all — the user copies numbers from their broker, which they are looking at
  anyway. 340 tested lines with zero consumers is the cheapest real feature in the backlog, and
  it establishes the module's UI shell whatever O1 concludes.
- **P2-R3** is pure engine work on data the app already has.

**Delayed data needs a decision before O3, not during it.** The live-only policy ("no mock data
path; surfaces with no free real-time source show an explicit not-available notice") has never
had to classify *delayed* data: a 15-minute-old chain is real, sourced, and honest — but it is
not live, and options prices move fast enough that the difference is material. O1 must end with
an owner decision: either delayed-with-visible-delay-labeling is an accepted category (a new,
explicit convention, rendered on every affected surface), or chains stay not-available until a
paid source is configured. Do not let a route ship that renders delayed quotes without settling
this.

### Scheduling

```
P2-W0 (parallel):  P2-O1 ✅ (owner machine, 2026-08-05) · P2-O2 ✅ · P2-R3 ✅
P2-W1 (after O1):  P2-O3 ⛔ CLOSED 2026-08-05 (owner: Option A) · P2-O4 ✅ SHIPPED 2026-08-05
P2-W2:             P2-O5 scorer half ✅ SHIPPED 2026-08-05 · chain half ⛔ closed with O3
```

Tasks within a wave own disjoint file sets, same rule as Phase 1.

> **Status (2026-08-05):** Wave 0 is **complete**. P2-O2 and P2-R3 shipped the day
> the scope landed; **P2-O1 ran on the owner's machine the same evening** —
> 12/15 probes, full report in `docs/assessments/P2-O1-options-data.md`. Its
> verdicts reshape W1/W2:
>
> > ⚠ **Correction (2026-08-12) — read this before trusting the P2-O4 lines
> > below.** "The v8 chart API already in production" was **Yahoo's**, and Yahoo
> > was removed as a data source on **2026-08-06 — one day after P2-O4 shipped
> > against it** — on terms grounds, hard-blocked at the socket in `pinnedFetch`
> > (see CLAUDE.md, "Source Terms"). So "no new provider, no licensing question"
> > was true when written and is not true now. **P2-O4's code shipped and works;
> > it just has no source.** Nothing reachable quotes a dated contract month, so
> > `/live-data/futures-curve` resolves the months and returns `ok:false` with
> > the reason, which `TermStructureCard` prints. That is the designed
> > degradation, not a regression — front-month prices are unaffected. The task
> > is **not** reopened: it needs a provider that quotes dated contracts, which
> > is a sourcing decision, not build work.
>
> - **P2-O4 futures term structure — GO, unblocked, buildable now.** 9/9 individual
>   contract months resolve through the v8 chart API already in production
>   (64 daily bars; `CLU26.NYM` matches the `CL=F` control exactly, as expected
>   with September the WTI front month). No new provider, no licensing question.
> - **P2-O3 options chains — NO-GO keyless.** Both candidates are out: Yahoo
>   options returns **401 on both hosts** (an auth wall, not a rate limit — while
>   Yahoo *chart* answered 10/10 in the same run), and CBOE's delayed feed, though
>   technically perfect (3,618–32,332 contracts with full greeks, IV and OI,
>   ~15-min delayed, sub-second), is **prohibited by its own terms**: Cboe forbids
>   auto-extraction of delayed quote data, blocks the IPs that try, and routes
>   programmatic use through the paid All Access API. Two independent reasons to
>   refuse it — the standing licensing-first policy (cf. the CUSIP note on
>   `/macro/rates`), and the operational reality that the stated enforcement is
>   IP blocking, i.e. the app's own egress going dark unannounced.
> - **DECIDED 2026-08-05 — Option A, chains stay not-available.** P2-O3 and
>   P2-O5's chain half are **closed, not deferred**. The Trade Risk Scorer serves
>   the use case with hand-entered legs. **Revisitable, with named triggers** (see
>   the assessment): a licensed source becoming worth its cost (Tradier first),
>   live use showing manual entry is the wrong shape, or Yahoo's options endpoint
>   reopening. Adopting a keyed provider later is new work, not rework — a
>   key-gated registry row is additive by design.
> - **The delayed-data convention is unanswered, not decided.** It never had to be
>   answered once Option A was taken. If Option B is ever chosen it must be settled
>   BEFORE any chain route ships: delay rendered in the ProvenanceNotice pattern on
>   every affected surface, and delay metadata through `/api/v1` verbatim.
> - **P2-O4 shipped 2026-08-05** on the GO: `/live-data/futures-curve` +
>   `TermStructureCard` on commodity and rate-futures detail pages, over the same
>   v8 chart API — no new provider. Curve shape is stated as the ETF roll cost it
>   actually is, thin contracts are excluded with the reason on-page, and a curve
>   is refused below 3 resolved months rather than drawn from a partial fetch.
>   (Sourceless since 2026-08-06 — see the correction at the top of this block.)
> - **P2-O5 scorer half shipped 2026-08-05**: `score_options_trade` agent tool,
>   `POST /api/v1/options/score` (+ `GET` for the schema), OpenAPI entry, and the
>   MCP mirror. Additive only — no existing endpoint contract touched. The chain
>   half (`get_options_chain`, `/api/v1/options/chain`) is NOT built and waits on
>   the O3 decision.
> - **IV rank stays manual entry** — no keyless source carries IV history.
>   Persisting a daily snapshot forward is a real option with a 52-week warm-up;
>   flagged, not taken.
>
> Derived riskTier changes from P2-R3 (portfolio weighted-risk shifts for macro
> holders — most visibly long-duration rate instruments moving off the flat tier 2)
> are pinned in `src/lib/risk/__tests__/macroProfiles.test.ts`.

---

### P2-O1 — Options & futures data-source audit (owner machine, read-only)
> Blocks P2-O3, P2-O4. The provider decision the ROADMAP backlog already calls for.

**Owns:** nothing — produces a written verdict in `docs/assessments/P2-O1-options-data.md`.

<details><summary>Deployable prompt</summary>

```
Establish what options and futures data Finance Now can honestly serve. Read CLAUDE.md,
DATA-AVAILABILITY.md, and docs/ROADMAP.md's "Options / futures tool" backlog item first. This is
a READ-ONLY audit — change no code. It MUST run on the owner's machine: data-availability
verdicts are IP-dependent (see .claude/agents/code-auditor.md), and a datacenter-IP result would
be systematically wrong.

OPTIONS CHAINS — test each candidate and record: reachability, auth, delay, fields present
(bid/ask, last, volume, open interest, IV, greeks), symbol coverage (equities, ETFs, indices),
response size, and the usage terms as actually published:
1. CBOE delayed quotes JSON (cdn.cboe.com delayed_quotes endpoints) — official, keyless,
   ~15-min delayed. Read its terms of use carefully and quote the relevant clause in the
   report; "keyless" and "permitted" are different claims, and this project treats licensing
   as first-class (see the CUSIP note on /macro/rates).
2. Yahoo Finance options endpoint — unofficial keyless, same family as the spark/chart/
   quoteSummary endpoints the app already leans on. Record fields and whether OI/IV are
   populated or null.
3. Key-gated tiers the provider registry could add later: Tradier (free account sandbox),
   Finnhub, Polygon, Alpha Vantage premium. For each: which plan actually includes chains, and
   roughly what it costs — a proposal with a hidden monthly bill is a bad proposal.

IV RANK — scoreOptionsTrade() takes an optional ivRank (where today's IV sits in its 52-week
range). That needs IV *history*, which no keyless source provides. Confirm or refute, and if
confirmed say so plainly: ivRank stays manual-entry (or compute-and-persist-going-forward, a
product decision to flag, not make).

FUTURES — the macro module already quotes continuous front-month contracts (GC=F, CL=F, ZN=F…).
Test whether INDIVIDUAL contract months quote keyless through the same Yahoo path (e.g.
CLZ26.NYM, ZCH26.CBT style symbols): fields, history depth, and how many months out. A futures
term-structure view (P2-O4) is buildable only if they do.

VERDICT — end with:
- A GO / NO-GO per surface: chain browser (P2-O3), term structure (P2-O4).
- The delayed-data question, framed for an owner decision: if the best available chain source
  is 15-min delayed, does the live-only policy admit a new explicitly-labeled "delayed"
  category, or do chains stay not-available? Present both honestly; do not pre-decide.
- The recommended provider ladder if GO, in registry terms (built-in rows, key env vars,
  market: 'equities' vs a new market value).
Update DATA-AVAILABILITY.md with what was measured.
```
</details>

### P2-O2 — Trade Risk Scorer: surface the optionsTrade engine
> Independent — needs no chain data. The engine exists, tested, with zero consumers.

**Owns:** new page under `src/app/(dashboard)/equities/options/`, new components under
`src/components/options/`, registry nav entry.

<details><summary>Deployable prompt</summary>

```
Surface Finance Now's existing options-trade risk engine as a page. Read CLAUDE.md,
docs/architecture/risk-framework.md, and src/lib/risk/profiles/optionsTrade.ts first — the
engine is complete and tested; this task is UI only. Do NOT modify the engine; if you believe
a scoring rule is wrong, report it rather than fixing it in place.

Build /equities/options (equities module, inside its ModuleGate — gate at the COMPONENT
boundary per CLAUDE.md's checklist, not inside the JSX):

- Manual leg entry for 1–4 legs: side, type, strike, bid, ask, and the optional fields
  (open interest, volume, signed delta). Plus the trade-level inputs: underlying price,
  days to expiry, and optional ivRank, earningsInDays, exDividendInDays, maxLossUsd
  ('unbounded' must be selectable — naked short exposure is exactly what the definedRisk
  dimension exists to flag), maxProfitUsd.
- Common-structure presets that prefill legs (covered call, cash-secured put, vertical
  spread, iron condor) — prefill only, everything stays editable.
- Render the CompositeRisk output the way the risk-scores page renders composites: overall
  score on the canonical 0–100 higher-is-safer scale with its band, per-dimension bars with
  weights, and the evidence lines. Confidence travels with the score.
- The engine's stance is the page's stance, stated on-page: this explains the risk of a trade
  you describe; it does not recommend trades, and nothing here is investment advice.
- Underlying price can prefill from /live-data/security-quotes (label live vs ref as usual);
  every options-level number is user-entered in this version, and the page says so — "copy
  these from your broker's chain" is the honest framing until P2-O3 lands.
- Persist nothing in v1. No DB, no localStorage — a scorer, not a journal. Note "saved
  trades" as an obvious follow-up for the owner to prioritize, don't build it.

Wire the nav entry in src/lib/modules/registry.ts (equities navItems + the route is already
under /equities so routePrefixes needs nothing). Tailwind runs from a committed prebuilt CSS
file — run `npm run css:build` after adding any new utility class. Add tests for any pure
helper you write (preset → legs mapping is the obvious one).
```
</details>

### P2-R3 — Macro risk profiles on the canonical scale
> Independent. The residual of Phase 2 item 1, anticipated by R1's spec.

**Owns:** `src/lib/risk/profiles/` (new files: commodity, bond/rate, currency), their tests,
`src/lib/data/instruments.ts` riskTier derivation.

<details><summary>Deployable prompt</summary>

```
Add commodity, bond/rate, and currency risk profiles to Finance Now's risk framework. Read
docs/architecture/risk-scale-spec.md, docs/architecture/risk-framework.md, and the existing
profiles in src/lib/risk/profiles/ first. The canonical scale is settled — 0–100, higher =
safer, bands 80/60/40/20. Do not re-litigate it; new profiles compose into it via
composeRisk() like every existing one.

Today macro instruments carry only coarse class-level riskTiers hardcoded in instruments.ts
(futures 5–6, FX 3–4, rates 2). Those feed portfolio weighted-risk with less grounding than
any other asset class. Build real profiles:

- COMMODITY: volatility from live OHLCV (the normalize.ts vol/drawdown helpers exist),
  category character (energy vs precious metals vs agriculture — document the calibration
  anchors in comments like optionsTrade.ts does), and liquidity — the six thin markets the
  macro TA scanner already excludes should score visibly less liquid.
- BOND/RATE: duration is THE primitive (longer = more rate risk), credit quality where it
  applies (treasuries vs the LQD/HYG funds the app links), yield-curve position. The bond
  ladder in portfolioBuilder.ts and the duration-matched funds on /macro/rates carry the
  duration data this can anchor to.
- CURRENCY: major vs EM vs cross (the catalog already classifies), volatility from OHLCV,
  and the standing fact the Portfolio Builder already states — foreign cash has no long-run
  expected return.

Requirements:
- Where a dimension needs live data the server may not have, score what is available and let
  confidence reflect the gap — the framework already does per-dimension confidence; use it
  rather than fabricating a full-confidence number.
- Derive instruments.ts riskTiers FROM the profiles (a pure mapping, tested) instead of
  hardcoding, so the two can never disagree. Keep the 1–10 riskTier shape — portfolio
  weighted-risk consumes it.
- Vitest throughout, matching the existing profile test pattern. Direction-assert: a 30Y
  bond scores riskier than a 13-week bill; heating oil scores less liquid than gold.
- Do NOT build new UI. Where the scores surface (macro detail pages? watchlist?) is a
  separate decision — this task makes the engine able to answer, not the app ask.
```
</details>

### P2-O3 — Options chain browser (only on P2-O1 GO)
> Depends on P2-O1's verdict AND the owner's delayed-data decision.

**Owns:** `src/app/live-data/options-chain/route.ts`, chain UI under
`src/components/options/`, provider-registry rows.

<details><summary>Deployable prompt</summary>

```
Build the options chain browser P2-O1 approved. Read that verdict
(docs/assessments/P2-O1-options-data.md) first and follow its provider ladder exactly — this
task exists only if O1 ended GO, and the delayed-data convention it proposed has been
decided by the owner. If either is missing, stop and say so.

- /live-data/options-chain?symbol=AAPL&expiry=… — provider ladder per O1, registry-driven
  (getEquityProviders-style, utilization recorded), failure boundaries per CLAUDE.md's
  multi-fetch conventions (a ladder, not allSettled).
- Every response carries source, delay characteristics, and asOf. If the decided convention
  is delayed-with-labeling: the delay renders on EVERY surface showing a chain number, in the
  pattern ProvenanceNotice established — always visible, never only-when-stale. A delayed
  quote rendered bare is a policy violation, not a cosmetic gap.
- Chain UI: expiry selector, strike ladder around the money, per-contract bid/ask/volume/OI
  (+ IV and greeks if O1 found them reliably populated — omit columns the source cannot
  fill rather than rendering dashes everywhere).
- The bridge that makes the module coherent: "Score this" on any contract row prefills the
  P2-O2 scorer's legs. ivRank stays manual unless O1 found otherwise — prefilling a number
  the source cannot supply is fabrication.
- Extend the P2-O2 page rather than forking it: chain mode and manual mode are entry paths
  into one scorer.
```
</details>

### P2-O4 — Futures term structure (only on P2-O1 GO)
> Depends on P2-O1 confirming individual contract months quote keyless.

**Owns:** term-structure section on `src/app/(dashboard)/macro/commodities/[slug]/` (and
rates futures detail), any new route it needs.

<details><summary>Deployable prompt</summary>

```
Add a futures term-structure view to the macro commodity detail pages, per P2-O1's verdict on
individual contract months. Read that verdict first; if it was NO-GO, stop.

- Curve of the next N quotable contract months for the liquid contracts, labeled
  contango/backwardation with a one-line plain-language explanation of what that means for
  the ETF proxies the page already links (roll cost is why USO lags spot — this view is
  where that becomes visible).
- Respect quoteBasis — a cents-quoted grain curve renders in ¢/bu.
- The thin markets the TA scanner excludes are excluded here too, stated on-page, same
  reasoning: a gappy curve reads as a real curve.
- Reuse PriceChartCard/Recharts conventions; no new charting stack.
```
</details>

### P2-O5 — Integration: agents, v1 API, MCP (after P2-O3)

**Owns:** `src/lib/agents/tools.ts` + prompts, `src/app/api/v1/`, `mcp-server/`.

<details><summary>Deployable prompt</summary>

```
Extend Finance Now's agent tools, public v1 API, and MCP server with the options surfaces
that shipped in P2-O2/O3. Read CLAUDE.md's AI Agents and Agent API sections first; every
tool reads exactly what the UI reads — one source of truth, no agent-only data paths.

- get_options_chain tool + /api/v1/options/chain (CORS, flat shape, updatedAt + source +
  delay metadata — the delay convention travels into the public API verbatim; an external
  consumer must not be able to mistake delayed for live).
- score_options_trade tool + /api/v1/options/score — wraps scoreOptionsTrade(); the
  no-recommendations stance goes in the tool description and the OpenAPI description.
- equity agents' prompts learn the new tools exist and when to use them; the
  live-only/say-not-available instruction covers the chain being unavailable.
- MCP server: mirror the two tools; update openapi.json; additive only — never mutate
  existing endpoint contracts (the api/v1 stability rule from R2 stands).
```
</details>

### Explicitly deferred, with reasons

- **Options/futures positions as portfolio holdings.** Expiring instruments break the
  portfolio store's assumptions (a holding that ceases to exist, assignment turning an option
  into shares, per-contract multipliers). That is a data-model change to `portfolios` +
  instrument resolution, not a page — scope it only if the owner wants a derivatives journal,
  and as its own task with its own migration.
- **Brokerage linkage / order routing.** Owner backlog, flagged there as the largest
  regulatory step. Nothing in Phase 2 touches it.
- **A separate "derivatives" module/entitlement.** P2-O2/O3 land in the equities module
  (the profile was written for it, the chains are on equities/ETFs). If macro options (options
  on futures) ever matter, revisit — don't pre-build an entitlement for a module that may
  never earn one.

---

## Phase 3 — Production-readiness review of all built modules (queued 2026-08-12)

> **Owner directive (2026-08-12), recorded ahead of the initial rollout:** every built
> module gets a feature-level review with three goals — (1) evaluate each feature for
> production readiness, (2) produce the canonical list of what each module actually
> contains, so the project documents can be trued against it, and (3) decide explicitly
> whether new tools need to be added for the initial rollout. Three strictly serial
> waves: the agent builds the resource, then owner + agent review every tool against
> it, then a final gate verifies everything decided actually landed.
>
> (Task IDs here are `P3-W*` — each wave is one task, so wave and task ids coincide.
> Not to be confused with the risk-scale spec's open-question IDs P1–P6, which live in
> that document's §10 table.)

**How this differs from what already exists.** The 2026-06-14 production-readiness
scorecard (`docs/audit/production-readiness-scorecard.md`) is stack-level — auth, infra,
pipelines. The code-auditor charter hunts defects. This phase is neither: it decides,
feature by feature, what the initial rollout ships, what gets fixed first, and what gets
hidden or cut. Defects found along the way are filed the normal way (W1's defect
appendix → normal intake), never fixed inline. The verification rule is inherited from
the scorecard's hardest-won lesson: **verify a claim by following the path a request
takes, not by grepping for the pieces it should contain.** A feature "exists" when a
user can reach it and it does what its on-page copy claims.

**Scope: the seven registry modules + one cross-cutting section.** Modules from
`src/lib/modules/registry.ts`: core, crypto, equities, macro, funds, budget, builder.
Cross-cutting: the 11 AI agents, the public `/api/v1` surface, and the MCP server —
they ship too, and the owner backlog already flags that three agents have no invocation
trigger.

**Known seeds (2026-08-12 code-vs-docs pass) — start from these, don't rediscover
them:**
- Budget: complete CRUD API with no management UI for categorization rules; categories
  read-only in the UI (POST/PATCH/DELETE exist, unreachable); recurring rules
  confirm-only — no edit, deactivate, or dismiss, so "confirm-or-ignore" has no ignore.
- Invest: `trade_transactions` fully schemed, zero consumers — no recorded trades, no
  realized P&L (ROADMAP Phase 1 note, updated 2026-08-12).
- Wallets: still localStorage-only (`fn:wallets`), no `/api/user/wallets` route.
- Macro: futures term structure shipped 2026-08-05, sourceless since the 2026-08-06
  Yahoo removal; macro OHLCV coverage narrowed for the same reason.

**Ground rules for every wave:**
1. Read `docs/agents/code-checker.md`'s do-not-fix registry FIRST. This repo is dense
   with deliberate decisions that read as gaps; flagging one as "not production ready"
   is a false positive that costs owner review time.
2. Data-availability verdicts come from `DATA-AVAILABILITY.md` or an owner-machine run
   — never from a container `npm run audit` (the IP-dependence rule). Wave 2 has the
   owner present; live verification belongs there.
3. New-tool candidates are checked against `docs/audits/rejected-proposals.md` before
   being proposed, and W2 rejections are recorded there with reasons — the standing
   cross-read rule between the two TASK-QUEUE writers applies to everything this phase
   spawns.

### Scheduling

```
P3-W1 (agent, solo)  →  P3-W2 (owner + agent, decisions)  →  P3-W3 (gate)
```

Strictly serial: W2 works from W1's committed doc; W3 verifies W2's recorded decisions.
No wave starts before its predecessor's artifact exists.

### P3-W1 — Feature inventory + readiness assessment (agent, solo)

**Owns:** `docs/assessments/P3-production-review.md` (new — the only file this wave
writes; everything else is read-only).

<details><summary>Deployable prompt</summary>

```
In the Finance Now repo, build the working resource for the production-readiness review
of all built modules: docs/assessments/P3-production-review.md. Read CLAUDE.md first,
then docs/agents/code-checker.md (the do-not-fix registry), DATA-AVAILABILITY.md,
docs/audits/rejected-proposals.md, and the Phase 3 preamble in docs/TASK-QUEUE.md
(scope, seeds, ground rules).

Walk every module in src/lib/modules/registry.ts (core, crypto, equities, macro, funds,
budget, builder) plus a cross-cutting section (11 AI agents, /api/v1, MCP server). For
each module, enumerate every page its routePrefixes own, and every distinct feature on
each page — a page is not a feature (e.g. /assets carries a registry, a screener, and
the reserves tab; a fund detail page carries a chart, fund facts, a fee-drag analyzer,
and holdings).

Record per feature:
- What it does, in one line, and the route + owning files.
- Data sources, keyed/keyless, and the DATA-AVAILABILITY status — copied, not
  re-derived (container data audits are void; the IP-dependence rule).
- Reachability BOTH directions: backend capability with no UI (the budget-rules
  lesson) and UI promises with no backing.
- Whether every user-actionable number it renders comes from pure, tested code (house
  rule), and whether provenance/SourceLine is present where required.
- Documentation status: is the feature in CLAUDE.md's feature inventory,
  DATA-AVAILABILITY.md, ROADMAP? Undocumented features go in the "add to project
  documents" appendix.
- A verdict: READY / NEEDS-FIX (what, scoped) / NEEDS-OWNER-DECISION (the question,
  stated) / NOT-FOR-ROLLOUT (why).
- Where a gap suggests a new tool, a candidate entry — after checking
  docs/audits/rejected-proposals.md so nothing already rejected is re-proposed blind
  (cite the prior rejection if you disagree with it).

Verify by following the path a request takes — walk each feature from route to render:
gate, query, route handler, upstream, render. Parts-inventory verification (the table
exists, the route exists) produced the scorecard's false "fixed" claims; don't repeat
that.

Hard rules: read-only outside the new doc — no fixes, no code changes, no doc edits
elsewhere. Defects go in the doc's defect appendix for normal filing. Start from the
known seeds in the Phase 3 preamble rather than rediscovering them. Date the doc and
record the commit SHA reviewed.

Output shape, built to be walked through with the owner one module per sitting:
per module — a feature table (feature / route / sources / reachable / tested /
documented / verdict) and a short summary with verdict counts. Then three cross-module
appendices: (A) undocumented features to add to project documents, (B) new-tool
candidates with rationale, (C) defects found (file, line, one-line failure mode).
```
</details>

### P3-W2 — Joint review of every tool (owner + agent — not autonomously deployable)

> Depends on P3-W1's doc being committed. This wave is a working session WITH the
> owner, module by module; the agent facilitates and records.

**Owns:** decision annotations inside `docs/assessments/P3-production-review.md`; new
entries in `docs/audits/rejected-proposals.md` for rejected tool candidates.

<details><summary>Deployable prompt</summary>

```
Facilitate the Phase 3 Wave 2 review session in the Finance Now repo. Read CLAUDE.md,
then docs/assessments/P3-production-review.md in full before the owner joins. Work
module by module — one module per sitting is fine; record progress so sittings can
resume.

For each feature row, present the W1 finding and capture ONE owner decision:
- SHIP — ready as-is for the initial rollout.
- FIX-FIRST — scoped; becomes a queued task (normal steward/scout flow: disjoint
  ownership, deployable prompt).
- HIDE — stays in the codebase, gated or de-routed out of the rollout (the T5
  pattern: page retained, route redirected, decision documented).
- CUT — removed; recoverable from git history (the /backtests precedent).

For each new-tool candidate in appendix B: APPROVED (scoped into a queued task) or
REJECTED (recorded in docs/audits/rejected-proposals.md with the reason — the
cross-read rule between TASK-QUEUE writers applies).

Where readiness rides on live data availability, verify DURING this session on the
owner's machine (npm run audit or the specific route) — this is the one wave where the
IP-dependence rule is satisfiable on demand.

Record every decision in the doc, dated. An undecided row gets an explicit OPEN marker
and what unblocks it — nothing is silently skipped. End each sitting by refreshing the
running FIX-FIRST list and approved-tools list at the top of the doc, so W3's entry
conditions are checkable at a glance.
```
</details>

### W3 intake — owner review deck, 2026-08-20 ("Changes to apply to Wave 2 changes")

> 13-slide screenshot deck reviewed with the owner on 2026-08-20. Two decisions were
> taken immediately; the rest is queued work. Slide → item mapping below.

**Decided and executed same day:**

- **Budget + Retirement modules REMOVED** (slide 11) — *"we will build this out in a
  completely different tool … the other two need to be explored somewhere else."*
  Fired RP-2's recorded reopen trigger (ledger annotated). Pages, routes, libs deleted;
  **DB tables and imported bank history retained** with export instructions in
  `lib/db/schema/budget.ts`.
- **Backtesting HIDDEN, not removed** (slide 7) — *"I may revisit back testing."* All
  three surfaces (equities page → redirect, crypto TA tab, portfolios tab); engines,
  panels, tests retained in place with restore instructions at each site.
  **Subproject P3-W2-S1 is SUSPENDED** — do not work it unless the owner reopens.
  ⚠ The owner's parallel-session WIP branch `local-wip-s1` touches these files.

**Queued (not yet built):**

| # | Slide | Item | Notes |
|---|---|---|---|
| W3-1 | 1 | ✅ **DONE 2026-08-20.** Composite score, sub-scores, bands, score-derived prose and `SCORING_CONFIG` all removed; cards and sorts now carry only feed facts — price, 24h/7d growth, volume, liquidity ratio (24h vol ÷ mcap), market cap, ATH distance, category. Liquidity replaces the band filter; default order is market cap (the feed's own). Coins saved with a legacy score render it as inert text | Extends item 5b — the owner cut the score itself, not just the verdict names |
| W3-2 | 2 | ✅ **DONE 2026-08-20.** New min-liquidity screener input (24h vol ÷ mcap %, N/A rows excluded when active — an unknown ratio is not a passing one), plus sortable 24h-% and Liq-% columns; `liquidityRatio` is a null-safe derived sort key in `applyParams` (3 tests) | `/assets` |
| W3-3 | 3 | ✅ **DONE 2026-08-20 — owner chose option B (merge).** One Staking page, two tabs: Providers (curated catalog + the defunct toggle carried over so Celsius stays reachable) and Live Pools (the extracted on-chain discovery panel). `/staking-discovery` → `/staking?tab=pools` content-preserving redirect; nav entry and duplicate directory deleted | Both pages rendered `STAKING_PROVIDERS` with near-identical filters |
| W3-4 | 4, 6 | ✅ **DONE 2026-08-20.** Both scanners gain a search box and a signal filter; crypto additionally gains RSI 14 + vs-SMA-50 columns (computed from candles the scan already fetched — column parity with equities), an RSI sort, and an "All assets" toggle so it doubles as a universe overview instead of unconditionally hiding no-setup rows | One pass over the shared scanner pattern |
| W3-5 | 5 | ✅ **DONE 2026-08-20.** Every screener dimension is now a full range — Price $, Yield %, Beta joined Mkt cap and P/E (the old min-only-yield/max-only-beta halves were arbitrary) — plus a dividend-payers-only toggle. All deep-linkable; all catalog facts, no derived scores | `/equities` |
| W3-6 | 8 | ✅ **DONE 2026-08-20.** Month grid (weeks Sun-first, today ringed, tracked-stock chips per cell, econ-event counts) with prev/next arrows and a Today shortcut; clicking a day expands its full earnings + econ lists below. Route accepts `?month=YYYY-MM`, clamped to ±12 months — FMP serves far dates thinly, and an honest empty month beats an unbounded pager into nothing. `placeholderData` keeps the old grid visible while a month loads | `/equities/calendar` |
| W3-7 | 9 | ✅ **DONE 2026-08-20.** `LiveUnavailable` now renders an "Add a data source in Integrations" link by default (opt-out prop for genuinely sourceless notices); `/data-sources` gains a visible "Add a data source" pointer to Integrations, where the per-section add-custom forms already lived | The notice text named the fix but nothing was clickable |
| W3-8 | 10 | ✅ **DONE 2026-08-20.** `BOND_ETF_SHELF_GROUPS` — seven typed groups with headings using the owner's own vocabulary (incl. "High yield (junk)"); flat export retained for old consumers | The funds all existed — the flat list made the categories unfindable |
| W3-9 | 12 | ✅ **DONE 2026-08-20.** The cog is now a `Link` to `/settings` — it had shipped with no handler at all | Dead control from day one |
| W3-10 | 13 | ✅ **SCOPED 2026-08-20** — four subproject charters drafted below (S3 Transfer Fees, S4 Options Scorer, S5 Portfolio Builder, S6 Fund Registry), each with its current state, build-out scope, and the first decision it carries. **Activation and priority are owner calls** — a charter existing does not start the work | Program structure, modeled on S1/S2 |

### P3-W2-S2 — Trade ledger (subproject of W2, approved 2026-08-18)

> **Owner decision, P3-W2 decision session.** Tool candidate NT2 was approved but
> scoped as a **subproject rather than a queued ticket**, for one reason: it carries a
> product decision that changes numbers users file taxes against.

**Why a subproject, not a ticket.** ROADMAP Phase 1's one unmet "Done when" is a trade
ledger; the `trade_transactions` table and its index are already built, so the DB work is
the small half. The real content is a cost-basis engine, and cost basis is not a detail —
**FIFO and average cost produce different realized P&L for the identical trade history**.

**First decision (make it before writing the engine): FIFO vs average cost.** Whatever is
chosen, the method must be *stated on every surface that prints a realized figure* — an
unlabelled realized P&L is the same class of defect as an undated static table. Consider
whether the method is per-portfolio rather than global; a user with holdings in two
jurisdictions may need both.

**Scope:** `/api/user/trades` CRUD (dynamic segments — must live under `/api/user/`, see
the `next.config.mjs` rewrite note) · a pure cost-basis engine in `lib/` · an entry UI on
`/portfolios`.

**House rules that bind here:** the engine emits dollar figures a user acts on, so it is
**pure + vitest-tested with an injectable `now`**. Wash sales, partial lots, and
same-day round trips are the edge cases worth tests before they are worth code.

**Relationship to existing work:** `computeMetrics` on `/portfolios` currently reports
*unrealized* position value only, and is separately under a FIX-FIRST correction (PB-1,
unpriced holdings must leave the totals). Land PB-1 first — building realized P&L on top
of totals that are being corrected means doing the reconciliation twice.


### Subproject charters from W3-10 (drafted 2026-08-20 — PROPOSED, not active)

> Slide 13 named four modules as future sub-projects. Each charter below is
> S1/S2-shaped: what exists, what the build-out contains, and the first decision
> the subproject must make before code. **None is active until the owner says
> so** — and the first-decision rows are owner decisions, not agent ones.

#### S3 — Transfer Fees — **ACTIVE (owner, 2026-08-20)**

> Owner's brief on activation: concerns are **accuracy** and that **all types
> of transfers and exchanges are considered** — "the idea with this tool is
> that a person can see all costs associated with an exchange or sale of a
> coin." Refresh model chosen: **agent-drafted + owner-approved** diffs.
>
> **Landed on activation day:** (1) `SPOT_TRADING_FEES` — default-tier
> maker/taker for all 30 exchanges (28 seeded, 2 explicitly uncatalogued),
> provenance pinned to LOW confidence while seeded (the sourceTerms lesson,
> enforced by test); (2) `computeSaleCost()` — pure + 7 tests — and an
> "I'm selling first" panel on the calculator: taker fee + withdrawal +
> network = all-in cost of sale, with uncatalogued venues shown as UNKNOWN
> rather than zero; (3) the fee worksheet (`npm run fee-worksheet`) now
> includes a trading-fee verification section.
>
> **Open in S3:** the owner-approved refresh pass itself (worksheet is ready;
> withdrawal table is 445 days past verification); route history; fee alerts;
> spread modelling for zero-commission venues (needs a data-source decision).
>
> **Refresh attempt 1 (2026-08-20):** four agents swept the 16 top exchanges —
> the session's egress proxy hard-blocks every exchange domain, so ZERO rows
> were verified (never-from-memory rule held). Deliverable:
> `docs/audits/fee-refresh-2026-08-20.md` — an 8-item priority re-check queue
> (headline: Bitfinex may be 0/0 since 2025-12, our Hyperliquid rates look like
> a $25M+ tier) and a keyless Bybit API shortcut. **The verification pass now
> runs on the owner's machine via `npm run fee-worksheet`** — the same
> conclusion the IP-dependence rule reaches for data audits.
>
> **Tier-1 live overlay (2026-08-21):** `/live-data/withdraw-fees` fetches the
> exchanges that publish withdrawal fees on public, KEYLESS endpoints —
> **KuCoin and HTX, both confirmed live by the owner probe the same day**
> (48 + 52 parsed rows, 54 overlaying). Bybit was in the first cut but its
> endpoint 403'd on the owner probe — it is in Bybit's authenticated Asset
> API group, so the adapter was removed (keyless only; RP-5 stands) —
> and the calculator overlays them on the static table. Two rules, both
> test-enforced: **overlay-only** (live rows update fees on curated routes,
> never add routes) and **labeled per-row** (`live` tag on overlaid hops; the
> other 27 exchanges keep the staleness banner, now with an explicit
> exception line). Parsers are pure + 14 tests
> (`lib/server/withdrawFeeAdapters.ts`). Availability is IP-dependent and
> unverifiable from the remote environment — **owner verdict via
> `npm run fee-probe`** (prints HTTP status, parsed-row counts, sample fees to
> spot-check against each exchange's withdrawal page).

**State:** the strongest data asset in the app — 30 exchanges × 22 coins × 18
networks, hand-maintained with provenance, path-finding (`findTransferPaths`),
live token prices, v1 API + MCP tool. **The urgent fact: `TRANSFER_FEES_LAST_VERIFIED
= '2025-06-01'` — ~14 months old against a 120-day staleness window.** The
banner is honest, but every fee in the table is from another market era.
**Build-out:** (1) a data-refresh workflow — the scraping agent (`data-scraper`)
now has an invocation path and could draft per-exchange updates for owner
review; (2) route history ("this route was $4 cheaper last week"); (3) fee
alerts; (4) more exchanges/networks.
**First decision:** the refresh model. Hand-verify all 30 exchanges (a real
owner time cost, repeating every ~120 days), agent-drafted + owner-approved
diffs, or narrow the table to the exchanges the owner actually uses and keep
those genuinely fresh. The staleness clock makes this the natural first
subproject.

#### S4 — Options Scorer
**State:** pure tested engine (`optionsTrade.ts`), hand-entry UI (1–4 legs; API
accepts 8), v1 POST endpoint, MCP tool, agent tool. Chain browser REJECTED
(RP-1 — no permissible source; reopen trigger recorded). Scoring-what-you-brought
is the kept side of the item 4 line.
**Build-out:** (1) UI parity with the API — 8 legs, more structure presets;
(2) saved positions (a `user_positions` table — same optimistic pattern as
wallets) so a user can re-score a position as conditions change; (3) what-if
sliders (IV/underlying move) — the engine is pure, so this is cheap; (4) plain-
language explanations per dimension.
**First decision:** whether saved positions join the DB. Everything else is
UI polish; persistence is the one architectural call.
**Constraint carried forward:** no chain feed — hand entry stays; RP-1 stands
unless its reopen trigger fires.

#### S5 — Portfolio Builder
**State:** two modes since item 16 (questionnaire + build-by-allocation), pure
engine, DB-backed plans, drift monitor, suitability review. The premium module.
**Build-out:** (1) plan HISTORY — what did the drift look like over time, when
did rebalances happen (needs snapshot persistence — the honest version of what
NT10 wanted, but for the user's own plan rather than market scores);
(2) rebalance execution notes — printable trade lists; (3) contribution
modeling ("$500/mo into this plan" projections — the engine piece the removed
Retirement module would have fed); (4) taxable-vs-sheltered account awareness
(asset LOCATION, not just allocation).
**First decision:** scope boundary with the departed personal-finance product.
Contribution modeling and account-type awareness edge toward retirement
planning, which the owner moved to a separate tool. The subproject needs an
explicit line: portfolio construction stays, financial planning goes.
**Note:** the owner flagged a legality question on item 16 — surface it here
before building further advice-adjacent features.

#### S6 — Fund Registry
**State:** 126-fund catalog with provenance, live quotes, N-PORT holdings +
history + the NT9 asset mix, TEY on munis, look-through, overlap on Compare.
Return screening DISABLED pending a paid FMP tier (blocked, not rejected).
**Build-out:** (1) fund comparison view (side-by-side facts: fees, yield,
duration/credit for bonds, holdings overlap — Compare has the pieces);
(2) catalog growth with the provenance discipline; (3) a fee-impact screener
(sort/filter by expense ratio × horizon — computed from `computeFeeDrag`,
already pure+tested); (4) IF the enterprise key lands: return columns +
screening restore (the code carries its own restore condition).
**First decision:** none blocking — this is the least decision-heavy of the
four. Its real dependency is the D2/enterprise-key conversation, which is
already parked with the owner's planning session.

**Suggested order, if the owner wants a default:** S3 first (a live staleness
problem is worth more than any new feature), then S4 (small, self-contained),
S5 and S6 behind their respective open conversations (legality note; key).

### P3-W2-S1 — Backtest build-out (subproject of W2, owner-directed 2026-08-15)

> **Owner directive:** raised during the W2 short-list intake. Item 10 of the owner's
> list was "backtests"; on review it is not a fix ticket but a build-out spanning
> **three surfaces and two engines**, so it is scoped as a subproject rather than a
> queued defect. Runs alongside the module walkthrough; does not gate it.

**Why a subproject.** "Backtests" is the most overloaded word on the short list. Four
things answer to it, three of them live:

| Surface | Engine | Standing verdict |
|---|---|---|
| `/equities/backtests` | `lib/utils/equityBacktest.ts` (117 lines, 7 tests) | W1 row E17 **READY** — but carries the live Sharpe defect below |
| Crypto TA → Backtest tab | `lib/utils/backtest.ts` (584 lines, tested) | W1 row CR17 **NEEDS-FIX¹¹** — untested price-target cluster around it |
| Portfolios → Backtest tab | none — computed in-component | W1 row C8 **NEEDS-FIX⁵**, untested; crypto-only history, stated on-page |
| `/backtests` (Risk Case Studies) | — | Deleted 2026-07, redirects to `/headlines`. **Out of scope** unless the owner says otherwise |

**Two engines doing overlapping work is itself the finding.** T12 discovered the equity
page had defined its own inline `runBacktest` instead of using the shared engine; it was
extracted and tested but never unified. Whether they converge is a design decision this
subproject owns.

**Inherited defects (none currently filed in Appendix C — file them or fix them here):**

| # | Where | Failure |
|---|---|---|
| S1-1 | `equities/backtests/page.tsx:26-28` vs `live-data/security-ohlcv/route.ts` | Page declares `barsPerYear` 252/52/12 for 1Y/5Y/MAX; the route stopped resampling at the 2026-08-06 Yahoo removal and now returns **daily bars on all three ranges**. Sharpe is annualized wrong on 2 of 3 ranges *with valid keys*. `git show 0a5b37f~1` confirms the pre-removal route set `interval: '1wk'` / `'1mo'` |
| S1-2 | same file, same lines | Range labels "5 Years (weekly)" / "Max (monthly)" are now false copy — same class as D-12/D-13/D-15 |
| S1-3 | same | Strategies silently changed meaning: SMA 10/40 on the 5Y view was 10 and 40 **weeks**, is now 10 and 40 **days** over five years of dailies. MAX now pulls up to 10,000 daily bars where it once pulled ~40 monthly |
| S1-4 | `equities/backtests/page.tsx:317-321` | Empty state blames a missing Tiingo/FMP key for what may be a valid-key short-history case. The route already distinguishes them (`source:'none'` + `no_provider_configured` vs `fetch_failed`); the page doesn't read the distinction. Same misdirection pattern as M-note-8 |
| S1-5 | `equities/technical-analysis/page.tsx:504` | Spillover from the same commit — still describes "daily/weekly stock candles" |
| S1-6 | Portfolios Backtest tab | Growth summary + return-by-holding math computed in-component, untested (part of D-24) |
| S1-7 | Crypto TA | `patternProjection`, `detectSetups`, `computeRiskReward` untested while emitting dollar levels users trade against (CR-note-11, part of D-24) |

**Why the existing tests didn't catch S1-1:** `equityBacktest.test.ts`'s 7 tests take
`barsPerYear` as a **parameter**, so by construction they cannot detect that the caller's
value no longer matches the data. Nothing regression-tests the page↔route contract. The
guard this wants is exactly Appendix B's **NT12 (boundary drift guard)** shape: pin declared
`barsPerYear` against actual bar spacing in the fetched series.

**Product calls this subproject must make (not fixes — decisions):**
1. **Resample or relabel?** Restore true weekly/monthly resampling server-side in
   `security-ohlcv`, or set every range to daily and relabel. This changes what the 5Y and
   MAX strategies *mean*; it is a product call, not a bug fix.
   → **Owner decision 2026-08-17 (P3-W2 decision session): delegated to this subproject.**
   It was put to the owner directly and deliberately handed back — *"let the subproject
   decide"* — so it is made with the rest of the backtest rework in view rather than in
   isolation. Treat it as **S1's first decision**, not an open question inherited from W2.
2. **Do the two engines converge?** One shared engine across crypto/equities/portfolios, or
   deliberately separate with the reason written down.
3. **Symbol universe.** Backtests are bounded to the 79-name curated catalog while TA charts
   any ticker (W1 E-note-7 flags the inconsistency and allows that the bounded select may be
   deliberate).

**The outstanding validation, carried from T12 — this is the piece that has never been done.**
`docs/assessments/T12-equity-backtests-audit.md` closes with: *"A live cross-check needs OHLCV
egress (IP-dependent). Correctness is verified by static analysis + unit tests; the live value
comparison is deferred."* That deferral still stands. **It can only be discharged on the
owner's machine** (the IP-dependence rule). A build-out that adds metrics without ever
comparing computed output against a known-good source repeats the gap rather than closing it.

**Do not re-audit what T12 already proved** (tested, on `main`): no lookahead — the position
held during bar `i` is `desired[i-1]`; benchmark parity — buy-and-hold compounds over the
identical window from identical starting capital; trade accounting reconciles with the equity
curve to 6dp. Re-deriving these burns the subproject's budget on settled ground.

**Owns:** `lib/utils/equityBacktest.ts`, `lib/utils/backtest.ts`, the three backtest surfaces,
and `live-data/security-ohlcv/route.ts` *if* decision 1 goes the resampling way. **Conflicts
with any task touching `security-ohlcv`** — notably D-2 (macro TA's 2Y range bug), which hits
the same route's range vocabulary. Sequence them or merge them.

**Exit criteria:** every declared bar frequency matches the data it describes, guarded by a
test · the three surfaces' copy states what they actually compute · the engine-convergence
decision is recorded either way · portfolios + crypto price-target math is pure and tested ·
the T12 live cross-check is discharged on the owner's machine and dated.

### P3-W2 item 14 — Budget removal: NOT actioned, awaiting an explicit call

> **Status, 2026-08-15.** Item 14 of the owner's short list reads "remove the
> budget tracker and use old retirement planner excel sheet to build retirement
> planner tab". **The build half shipped** (Retirement module, `lib/retirement/`,
> 53 tests). **The removal half has deliberately not been actioned** and needs a
> direct decision, for three reasons recorded here so the question is not lost:

1. **The W1 review recommends the opposite.** Appendix B candidate NT1 is
   "Budget management UI", which closes all six Budget NEEDS-FIX rows against
   APIs that already exist. Cutting the module means rejecting NT1, which per
   the Phase 3 ground rules must be recorded in
   `docs/audits/rejected-proposals.md` with a reason.
2. **The data is the user's own and the deletion is irreversible.** Removal
   means a destructive migration dropping 7 tables / 15 FKs / 10 indexes,
   including `finance_transactions` — imported bank history behind an
   import-hash unique index. **HIDE is available and cheaper**: de-route the
   module (the `/global-adoption` T5 precedent), keep the tables, decide later.
   A CUT cannot be undone from git; a HIDE can.
3. **The retirement planner wants the budget data.** In the source spreadsheet,
   `Hypotheticals` pulls its bill totals from `Detailed Expense Breakdown` by
   cell reference — the tracker is the planner's expense input, not a rival to
   it. Today `/retirement` takes `monthlyExpenses` as a single hand-entered
   number; wiring it to the Budget module's actuals is the obvious next step,
   and impossible if Budget is gone.

**What is needed:** SHIP (keep Budget as-is), FIX-FIRST (build NT1's management
UI), HIDE (de-route, keep the data), or CUT (delete, with the data loss
accepted in writing). Nothing else in Phase 3 is blocked on this.

### P3-W3 — Final rollout gate

> Depends on P3-W2 complete: every feature row carries a decision, every OPEN marker
> resolved or explicitly accepted by the owner.

**Owns:** the final-verdict section of `docs/assessments/P3-production-review.md`;
feature-inventory rows in CLAUDE.md, `DATA-AVAILABILITY.md`, and `docs/ROADMAP.md` that
W2 decisions require.

<details><summary>Deployable prompt</summary>

```
Run the Phase 3 rollout gate for the Finance Now repo. Read CLAUDE.md, then
docs/assessments/P3-production-review.md — the decisions recorded in it are the spec
for this wave. Entry conditions: every W2 FIX-FIRST task is closed or has been
explicitly re-decided by the owner; every approved new tool is shipped or explicitly
deferred (deferral recorded, dated).

Then verify, in source, request-path style (never parts-inventory):
1. Every FIX-FIRST item actually landed — follow the request through gate, route,
   upstream, render; do not trust the task's own completion claim.
2. Every SHIP feature is documented: a row in CLAUDE.md's feature inventory, a
   DATA-AVAILABILITY.md row, ROADMAP annotation where applicable. Appendix A
   (undocumented features) must be empty or each remaining entry explicitly deferred
   by the owner.
3. Every HIDE/CUT decision is enforced and verified BY URL, not by nav absence — a
   hidden module must lock on direct navigation (the ModuleGate lesson), a cut page
   must actually redirect.
4. The initial-rollout feature list, per module, is written out as the final section:
   what ships, what is hidden, what was cut, accepted exceptions, each dated.

Close with a dated go/no-go verdict pinned to a commit SHA. This document becomes the
rollout's reference: anything shipping that isn't on the list, or on the list but not
shipping, is a defect against this gate.
```
</details>

---

## Maintenance — dependency majors held for verification (2026-08-11)

Queue-clearing pass on 2026-08-11 merged every Dependabot PR that was **CI-green and current
with `main`** (#78, #55, #46, #53) plus the type-stub and test-tooling majors (#48, #51, #56).
The six below were **deliberately not merged**: each changes runtime or build behaviour, each
was ~48 commits behind `main`, and **none had a CI run recent enough to mean anything** — a
green result from 2026-07-30 does not describe today's `main`.

They merge cleanly. That is not the same as building, which is the whole reason they are here
rather than on `main`.

**Do not batch these.** One PR at a time: rebase onto current `main`, let CI run, read the
result, then merge or close. Landing several at once makes a red build ambiguous about which
bump caused it.

| PR | Bump | Why it is held |
|---|---|---|
| #54 | TypeScript 5.9.3 → **7.0.2** (frontend) | Compiler major (native port). `package.json` declares `^5.4.0`; strict mode is on repo-wide, so new inference can surface errors anywhere. Expect real work, not a version-string edit. |
| #47 | TypeScript 5.9.3 → **7.0.2** (`mcp-server/`) | Same major, separate package. Pair it with #54 so the two TS versions do not drift. |
| #52 | recharts 2.15.4 → **3.10.1** (frontend) | Breaking API changes, and **~11 files** import it. Charts render without throwing when props go stale, so this needs looking at the pages, not just a green `tsc`. |
| #50 | date-fns 3.6.0 → **4.4.0** (frontend) | **~11 files.** v4's timezone handling changed; date bugs are silent and land in user-visible figures. |
| #45 | node 22-alpine → **26-alpine** (frontend Docker) | Two LTS jumps. Affects the built image and both CD workflows, not local dev — verify against staging before production. |
| #59 | redis 5.3.1 → **8.1.0** (backend) | Client major on a runtime dependency. Dependabot moved the target from 8.0.1 to 8.1.0 during its rebase; the branch name still says `redis-8.0.1`. |

### What CI said once these were rebased

Rebasing them onto current `main` produced the signal that was missing, and it split the group:

- **#54 (TypeScript 7, frontend) — red.** The one bump that would have broken the build. It is
  the reason this section exists.
- **#47 (TypeScript 7, `mcp-server`) — green.** It passes because that package is small. Merging
  it alone would leave the two packages on different major TypeScript versions, which is exactly
  the drift noted above — **land it with #54 or not at all.**
- **#59 (redis 8.1.0) — green.** Worth remembering that a green run on a runtime client major
  mostly proves it imports, not that it behaves.
- **#45, #50, #52** — still unrebased, still unverified.

### Resolved — merged 2026-08-11

- **#57** structlog 24.4.0 → 26.1.0 — green after rebase, merged.
- **#58** pytest-asyncio 0.23.8 → 1.4.0 — green after rebase, merged.

Both took **two** rebase cycles, and the reason generalises: every Poetry PR rewrites
`backend/poetry.lock`'s `content-hash`, so any two of them conflict by construction and only one
can merge per cycle. Expect to serialise them — rebase, merge, rebase the next. Hand-resolving
the lock is not the shortcut it looks like; a hand-edited `content-hash` stops matching
`pyproject.toml`.

**Closed in the same pass**, superseded rather than deferred — reasons recorded on each PR:
#38 (its `macro-news` route and `macroPillar.ts` already on `main`), #21 (149 behind; only
long-rewritten docs remained), #39 (175-line checklist under the retired CAEP name).

### Unrelated finding: `main` shows a permanent red X

Pushing to `main` triggers `cd-staging.yml`, which fails its preflight with
`Missing repository secret(s): AWS_ACCOUNT_ID` — every time, on every push, since the
provisionable AWS deploy path landed. Nothing is wrong with the code; the deploy path has
simply never been provisioned (runbook: `docs/deployment/aws-provisioning.md`).

Worth fixing or muting, because it costs the signal: `ci.yml` runs on `pull_request` only
(`push` is scoped to `develop`), so **`main` has no post-merge test/lint/build run at all** —
the sole green signal in this repo is a PR's own pre-merge CI. A red X on `main` that everyone
learns to ignore, sitting next to no real `main` verification, is how a genuine breakage gets
missed.
