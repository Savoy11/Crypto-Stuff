# Rejected Proposals — standing ledger

Feature and tool proposals that were **considered and declined**, with the reason and the
date. This file exists so a rejected idea is rejected *once*: an agent proposing new work
reads it first, and either finds its idea already settled or knows to argue against a
recorded reason rather than re-raise it blind.

Created 2026-08-15 during **P3-W2**. `CLAUDE.md`, `docs/agents/code-checker.md` and
`.claude/agents/opportunity-scout.md` had referenced this path before it existed
(review Appendix A6) — every "checked against the rejected-proposals ledger" claim made
before this date was therefore checked against nothing.

---

## How to use it

**Before proposing** — read this file. If your idea is here, either drop it or make the
case against the recorded reason explicitly. Citing the prior rejection and saying why it
no longer holds is a legitimate move; silently re-proposing is not.

**When rejecting** — add a row. A rejection with no reason is worse than no record,
because it reads as "someone thought about this" while transmitting nothing.

**Cross-read rule.** The two TASK-QUEUE writers (`checklist-steward`, `opportunity-scout`
in FILE mode) must read each other's outputs before writing — this ledger and the
steward's annotations are the two halves of that. See `docs/IMPROVEMENT-AGENT-SETUP.md`.

**A rejection is not permanent.** Sourcing changes, tiers change, terms change. Where the
reason is contingent, the row names the **reopen trigger** — the specific fact that would
make it worth raising again. A row with no reopen trigger was rejected on principle, not
circumstance.

---

## Ledger

| # | Proposal | Decided | Verdict | Reason | Reopen trigger |
|---|---|---|---|---|---|
| RP-1 | **Options chain browser** — browse live option chains (strikes, bids, IV) on `/equities/options` | 2026-08-05 | **Rejected** | No usable keyless source. The P2-O1 audit found Cboe prohibited by its own terms and Yahoo's options endpoint returning 401; Yahoo was subsequently hard-blocked on terms grounds (2026-08-06). The Trade Risk Scorer therefore takes every option-level figure by hand entry, and its prompts/tool text carry the no-chain-feed rule so an agent asks for a missing bid rather than inventing one. Closed by owner decision; see `docs/assessments/P2-O1-options-data.md` | A licensed or genuinely permissive chain provider becomes available on acceptable terms |
| RP-2 | **Remove the Budget module** (short-list item 14b — "remove the budget tracker and use old retirement planner excel sheet to build retirement planner tab") | 2026-08-17 | **Rejected** | The build half shipped (Retirement module, `lib/retirement/`, 53 tests); the removal half is declined. Three reasons: (1) it contradicts the review's own recommendation, NT1 — approved the same day — which closes all six Budget NEEDS-FIX rows against APIs that already exist; (2) removal is a destructive migration over the user's own imported bank history (7 tables, 15 FKs, 10 indexes) where HIDE would have been reversible; (3) **the planner wants Budget's data** — in the source spreadsheet `Hypotheticals` pulls its bill totals from `Detailed Expense Breakdown` by cell reference, so the tracker is the planner's expense input, not a rival to it. Owner decision, P3-W2 decision session | ~~The planner is rebuilt to take expenses only by hand entry, or Budget is superseded by a different transaction source~~ **REOPEN TRIGGER FIRED — decision REVERSED 2026-08-20.** Owner: *"remove the budget and retirement tools. We will build this out in a completely different tool … the other two need to be explored somewhere else."* That is the second condition — Budget superseded by a different tool. Both modules' pages, routes and libs were removed; the DB **tables and data were retained** (schema kept so no DROP migration can fire by accident; export instructions in `lib/db/schema/budget.ts`). The rejection above was correct for its moment and stays as written — what changed is the premise, not the reasoning |
| RP-3 | **Render canonical Safety Scores on `/staking` provider cards** (tool candidate NT7) | 2026-08-17 | **Rejected** | Owner: *"these scores may represent a recommendation, which is a regulated activity."* The page's copy was corrected instead (D-10) to describe the six-dimension risk profiles without publishing a composite. Note this rejects *adding* a score surface. The fate of the existing ones was settled separately on 2026-08-17 (item 4, Appendix E): **ranking surfaces are cut** (`/risk-scores` leaderboard, the sortable Coins column, coin-discovery's verdict vocabulary, `RiskHeatmap`), **explanatory ones are kept** (per-coin gauge, options scorer, Portfolio Builder) — scoring what the user brought is explanation; ranking a universe is closer to a recommendation | A regulatory review concludes that explanatory risk scoring, distinguished from ranking, is safe to publish |
| RP-4 | **Score-history persistence** (tool candidate NT10) — storage + scheduled capture to make the coin-detail Risk History tab real | 2026-08-18 | **Rejected for now** | Medium-cost infrastructure (persistent storage plus a scheduled capture job) in service of a surface whose case was narrowed the day before: short-list item 4 cut the ranking risk surfaces. On principle NT10 would survive that cut — a score history for a coin the user opened is explanation, not ranking — but judging it mid-cut is the worst available moment. The Risk History tab stays removed from coin detail meanwhile (CR8). Owner decision, P3-W2 decision session | The item 4 removals have landed and the explanatory-vs-ranking line is settled in practice |
| RP-5 | **Exchange API key custody** — linking exchange accounts by `apiKey`/`apiSecret` for a read-only balance view (shipped feature, `/wallets` → Exchange APIs) | 2026-08-18 | **Removed** | Owner raised removing `/wallets` for security and to avoid encouraging day trading. On inspection the risk was concentrated in one part of the page, not the page: `.exchange-credentials.json` held an exchange `apiSecret` **in plaintext at rest** — the highest-value secret the app held, and a different class of asset from a watched address — to power a balance view that public-chain watched addresses already approximate. Removed: the connections UI, `/live-data/wallet/exchange` + `/exchange-connections`, `lib/server/exchangeCredentials.ts`; the wallet store's v2 migration drops persisted connection metadata. Watched addresses and browser connect were KEPT (read-only public data, no secret, and portfolio tracking is not day-trading machinery); the Pump Report tab is the surface the day-trading concern actually points at and is a **separate open decision**. Mode 0600 + gitignore was correct hygiene and still not a reason to hold trade-capable keys | Encrypted-at-rest custody with an explicit key-management design, and a reason the read-only view cannot be served from public chain data |

---

## Raised in P3-W2 — decided without being rejected

**As of 2026-08-18 nothing is pending.** The P3-W2 decision session ruled on every tool
candidate. Rows here landed somewhere other than approval or rejection, and are kept
visible so nobody re-raises them as fresh ideas.

| # | Proposal | Raised | Status |
|---|---|---|---|
| NT6 | `macro-screener` panel on `/macro` | 2026-08-12 | **Superseded 2026-08-18** — folded into the per-section scanner work (short-list item 6/7). Approved capability, different roof; not a rejection |
| NT8 | Futures term-structure provider (keyed) | 2026-08-12 | **Deferred 2026-08-18** — sourcing decision, folded into the enterprise-key conversation with 12b and D2 |


**Approved 2026-08-17–18** (moved out of pending, now queued work): **NT9** fund asset-mix
from N-PORT · **NT2** trade ledger (as a subproject; FIFO-vs-average is its first
decision) · **NT1** budget
management UI · **NT3** wallets → DB · **NT12** boundary drift guard · **NT4**
video-analyze trigger UI · **NT5** invocation UI for the three placeholder
agents · **NT11** wire three orphaned crypto routes into TA market structure.

**Rejected:** NT7 on 2026-08-17 (RP-3) · NT10 on 2026-08-18 (RP-4).

**Removed on 2026-08-18:** exchange API key custody (RP-5) — which also **supersedes NT3's
scope**: wallets → DB now covers watched addresses and browser connections only.

---

## Notes on entries that are **not** rejections

Three things that look like rejections and are not — recorded here because each has been
mistaken for one:

- **The do-not-fix registry** (`docs/agents/code-checker.md`) lists *deliberate
  implementation decisions* that read as gaps — the Portfolio Builder's unreachable
  diversification ceiling, sector exclusions removing tilts only, the absent build-time fee
  warning. Those are decided behaviours, not declined proposals. Do not merge the two
  lists: one says "this code is correct as written", the other says "this idea was
  considered and declined."
- **Fund return screening** (`FundsClient.tsx:230-245`) is *disabled pending a provider*,
  with the restore condition written into the code. That is a blocked feature, not a
  rejected one. Reaffirmed 2026-08-17 (short-list item 12b): FMP's
  `/stable/stock-price-change` is the right endpoint, batching is paid-gated, so the
  unblocker is a purchasing decision — folded into the same enterprise-key conversation
  as review item D2.
- **De-routed surfaces** (`/global-adoption`, the deleted `/backtests` risk case studies)
  were scoped decisions on existing pages, recorded in
  `docs/assessments/T5-utility-triage.md` and the CLAUDE.md feature table. A cut page is
  not a rejected proposal.
