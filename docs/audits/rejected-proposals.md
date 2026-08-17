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
| RP-2 | **Remove the Budget module** (short-list item 14b — "remove the budget tracker and use old retirement planner excel sheet to build retirement planner tab") | 2026-08-17 | **Rejected** | The build half shipped (Retirement module, `lib/retirement/`, 53 tests); the removal half is declined. Three reasons: (1) it contradicts the review's own recommendation, NT1 — approved the same day — which closes all six Budget NEEDS-FIX rows against APIs that already exist; (2) removal is a destructive migration over the user's own imported bank history (7 tables, 15 FKs, 10 indexes) where HIDE would have been reversible; (3) **the planner wants Budget's data** — in the source spreadsheet `Hypotheticals` pulls its bill totals from `Detailed Expense Breakdown` by cell reference, so the tracker is the planner's expense input, not a rival to it. Owner decision, P3-W2 decision session | The planner is rebuilt to take expenses only by hand entry, or Budget is superseded by a different transaction source |

---

## Pending — raised in P3-W2, not yet decided

Rows here are **not** rejections. They are proposals the owner has seen and not yet ruled
on; they move up into the ledger with a reason if declined, or out of this file entirely
if approved and queued.

| # | Proposal | Raised | Status |
|---|---|---|---|
| NT2 | Trade ledger — `/api/user/trades` CRUD + tested cost-basis engine + entry UI | 2026-08-12 | Pending |
| NT4 | `video-analyze` trigger UI (ask-about-this-video on `/videos` cards) | 2026-08-12 | Pending |
| NT5 | Invocation UI for the three placeholder agents — **or retire them** (D4) | 2026-08-12 | Pending |
| NT6 | `macro-screener` panel on `/macro` | 2026-08-12 | Pending |
| NT7 | Render canonical Safety scores on `/staking` provider cards | 2026-08-12 | Pending |
| NT8 | Futures term-structure provider (keyed) | 2026-08-12 | Pending — provider eval first |
| NT9 | Fund asset-mix derived from N-PORT position categories | 2026-08-12 | Pending |
| NT10 | Score-history persistence (the only honest path to a real Risk History tab) | 2026-08-12 | Pending |
| NT11 | Wire the orphaned crypto routes (`fear-greed`, `btc-stats`, `defi-tvl`) — or delete them | 2026-08-12 | Pending |

**Approved 2026-08-17** (moved out of pending, now queued work): **NT1** budget
management UI · **NT3** wallets → DB · **NT12** boundary drift guard.

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
  rejected one.
- **De-routed surfaces** (`/global-adoption`, the deleted `/backtests` risk case studies)
  were scoped decisions on existing pages, recorded in
  `docs/assessments/T5-utility-triage.md` and the CLAUDE.md feature table. A cut page is
  not a rejected proposal.
