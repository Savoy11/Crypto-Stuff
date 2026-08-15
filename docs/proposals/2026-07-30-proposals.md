# Opportunity proposals — 2026-07-30

**Commit:** `14d6d76f5208c12a990d55dd439fb3301d861092` (branch `chore/improvement-agents`) · **Reviewed:** `README.md`, `docs/TASK-QUEUE.md` (incl. Phase 2 + Wave-0 follow-ups), `docs/ROADMAP.md` (Macro Markets spec + owner backlog), `docs/FEATURE-ADDITIONS.md` ("deliberately NOT added yet"), `docs/MARKET-ASSESSMENT.md` headings, `docs/PRELIMINARY-FINDINGS-2026-07-30.md`, `frontend/src/lib/modules/registry.ts`, `frontend/src/app/live-data/fund-holdings/route.ts`, `frontend/src/app/(dashboard)/funds/[symbol]/*`, `frontend/src/app/(dashboard)/equities/technical-analysis/page.tsx`, `frontend/src/app/(dashboard)/macro/` · **Proposals:** 2

> Smoke-test run — scope was deliberately capped at 2 proposals, not a full survey.
> _(Superseded 2026-08-15: the ledger was created during P3-W2.)_
> `docs/audits/rejected-proposals.md` does not exist yet (only `docs/audits/.gitkeep`), and
> `docs/proposals/` did not exist before this file. Nothing was previously rejected, so the
> rejection filter passed vacuously; both items were still checked against `TASK-QUEUE.md`,
> `ROADMAP.md` and the decided policies in `CLAUDE.md`.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

*Lens legend:* **Importance** = impact / business value · **Efficiency** = value ÷ effort ·
**Practicality** = readiness, dependencies, risk. `P0`/`P1`/`P2` is their net.

---

## 1. Fund look-through: what you actually own across your funds · proposed `P1` · target section: `docs/TASK-QUEUE.md` → "Phase 2 — Queued, not yet scoped"

**Status:** APPROVED — owner, 2026-07-30 (in session, both proposals approved together; filed into docs/TASK-QUEUE.md the same day)

**What:** Multiply the weighted holdings we already fetch per fund by a user's portfolio
weights, and surface the result as (a) a true underlying-issuer exposure list, (b) a pairwise
overlap figure between any two funds on `/compare`. One new derived view; no new data source.

**Grounded in:** `frontend/src/app/live-data/fund-holdings/route.ts` already returns the
**full weighted portfolio** — `HoldingRow { symbol, name, weightPct, shares, marketValue }`
plus `sectorWeights` and `assetAllocation`, sourced from SEC N-PORT direct (keyless,
authoritative) before FMP/Yahoo. The only consumers in `src/` are
`app/(dashboard)/funds/[symbol]/FundHoldingsSection.tsx` and `FundHoldingsHistory.tsx` —
both render **one fund in isolation**. `grep -rni "overlap|look-through"` across
`frontend/src` returns zero product matches (only a CSS comment and an unrelated
`secFundamentals.ts` note). So the data is ingested, parsed, weighted and cached, and no
screen answers "how much NVDA do I hold across VOO + QQQ + my direct position?"
Not present in `docs/TASK-QUEUE.md` (Waves 0–3, Follow-ups F1–F4, Phase 2's two items),
not in the `docs/ROADMAP.md` owner backlog (2026-07-26), and not in `FEATURE-ADDITIONS.md`'s
"deliberately NOT added yet" list.

**Who benefits and how:** Anyone holding more than one broad fund — the single most common
real portfolio mistake is believing three funds are diversification when two of them are
70% the same mega-caps. It also gives Portfolio Builder a genuine answer to a question it
currently cannot ask: `portfolioBuilder.ts` measures concentration against the *plan's own
target weights*, i.e. at the fund level, so a plan can look perfectly diversified while its
underlying issuer exposure is concentrated. Look-through is the missing input to that check.

**Cost:** Medium — the maths is a weighted join and is pure TS (testable next to
`portfolioBuilder.ts`); the effort is in UI and in fetch discipline. **No licence, no key,
no recurring cost** on the N-PORT path (SEC EDGAR, keyless, already used). One caveat to
scope deliberately: look-through over an N-fund portfolio is N holdings fetches, and N-PORT
documents are large. Restrict to the funds actually held, reuse the existing route cache,
and show coverage (`holdingsCount`, `asOf`, `source`) per fund rather than silently mixing
a full N-PORT list with a Yahoo top-10 — the two are not the same object, and blending them
without labelling would breach the coverage-travels-with-the-number rule.

**Depends on:** Nothing blocking. Reads `/live-data/fund-holdings` and the existing DB-backed
`/portfolios`. Independent of Phase 2's two queued items.

*Importance:* High — a capability none of the current surfaces provides, on data already paid
for in engineering time. · *Efficiency:* High — the expensive half (N-PORT parsing, weighting,
source ladder) is already built and shipped. · *Practicality:* Good — one honest constraint
(fetch volume + mixed-source coverage) which is a scoping decision, not a risk.

---

## 2. Macro technical-analysis page (close the third-module TA gap) · proposed `P2` · target section: `docs/TASK-QUEUE.md` → "Phase 2 — Queued, not yet scoped"

**Status:** APPROVED — owner, 2026-07-30 (in session, both proposals approved together; filed into docs/TASK-QUEUE.md the same day)

**What:** A `/macro/technical-analysis` page parameterised over the 45 macro instruments,
reusing the shared candlestick/indicator engine, with a nav entry in the macro module.

**Grounded in:** Capability asymmetry, verified in the registry. `lib/modules/registry.ts`
gives the macro module five nav items (`/macro`, `/macro/news`, `/macro/commodities`,
`/macro/currencies`, `/macro/rates`) and **no TA entry**, and
`app/(dashboard)/macro/` contains no `technical-analysis/` directory — while Crypto has
`/technical-analysis` and Equities has `/equities/technical-analysis`. This is not a
deliberate omission: `docs/ROADMAP.md` "What must be built" item 2 explicitly specifies
a *"shared TA page parameterized over macro symbols"*, and the same document's
2026-07-21 status note states everything in that list is SHIPPED. The plumbing is already
there — the ROADMAP records that OHLCV candles "→ shared TA engine + backtests" work for
futures, FX and yield indices with **no new data routes**, and
`app/(dashboard)/equities/technical-analysis/page.tsx` (577 lines) is catalog-driven over
`EQUITY_CATALOG`/`FUND_CATALOG` feeding `/live-data/security-ohlcv` — the exact route the
macro catalogs already price through.

**Who benefits and how:** Macro users, who today can chart a single instrument on a detail
page but cannot run an indicator, pattern scan or screener across the commodity/FX/rates
universe the way crypto and equity users can. It also makes the macro module defensible as
a separately-sold entitlement: a module that is materially thinner than its siblings is
harder to price.

**Cost:** Small-to-medium, and mostly a catalog swap over an existing page. **No licence,
no key, no recurring cost.** Two real details, not incidental: yields and cents-quoted
contracts must render through `PriceChartCard`'s `valueFormat: 'plain'` and the catalogs'
`quoteBasis` (or the page reproduces the "$472 for 472.75¢/bu" mislabel the macro build
already fixed once), and thin/illiquid contracts should be screened out of any scanner
rather than producing confident patterns off sparse candles.

**Depends on:** Nothing. The macro catalogs, `security-ohlcv`, and the shared TA engine
(verified under T2) are all shipped.

*Importance:* Medium — closes a stated-but-unbuilt spec item and a visible module asymmetry;
does not add a new data capability. · *Efficiency:* High — reuses a 577-line page's structure
and an already-tested engine. · *Practicality:* Very good — no new dependency, no new
provider, no policy surface.

---

## Considered and cut

- **A macro screener panel / trigger UI for the three unreachable agents**
  (`data-scraper`, `equity-data-scraper`, `equity-diligence`, plus `macro-screener` having no
  dedicated panel) — **already tracked**, verbatim, in the `docs/ROADMAP.md` owner backlog
  (2026-07-26): *"11 agents exist; … no invocation trigger — either give them a UI entry point
  or retire them."* Raising it as new would be noise; if it needs attention it needs
  re-prioritisation, not a proposal.
- **Live fundamentals / equity screener metrics (YTD %, 52-week %)** — already listed in
  `docs/FEATURE-ADDITIONS.md` "Deliberately NOT added yet", and the screener half is covered by
  the owner backlog's "Fine-tune all screeners".
- **Anything sourced from `docs/PRELIMINARY-FINDINGS-2026-07-30.md`** — that file is explicitly
  flagged as unverified stand-in output. Its two opportunity leads I did re-derive from source
  independently (the look-through gap above; the macro TA gap above); the rest are defects and
  belong to `code-auditor`, not here.
- **Affiliate/monetisation ideas on the staking or fund surfaces** — `docs/ROADMAP.md` has an
  owner-specified affiliate section with non-negotiable integrity rules already decided. Not
  mine to reopen.
- **A live-data coverage proposal** (e.g. why staking live APR coverage is low) — verdicts on
  which sources actually work are IP-dependent and `CLAUDE.md` requires them to come from the
  owner's machine. I cannot ground one from here, so I did not write one.

*One closing defect note, not a proposal:* `docs/ROADMAP.md`'s 2026-07-21 status block states
every item in "What must be built" is SHIPPED, but the macro TA page in item 2 was never built —
a documentation-accuracy issue for `code-auditor`.
