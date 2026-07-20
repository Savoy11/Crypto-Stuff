# T5 — Utility triage: Global & Risk Case Studies

_Read-only assessment (Wave 1, T5). Produces a recommendation; **no code changed.**
Both pages were driven at the code level, with data sources traced end to end._

| Page | Route | Verdict | One-line rationale |
|------|-------|---------|--------------------|
| Global | `/global-adoption` | **CUT** (or INVEST — strategic call) | Mislabeled CBDC tracker; stale static data dressed as live via a dead scraper. |
| Risk Case Studies | `/backtests` | **KEEP / INVEST (light)** | Honest, unique model-vs-real-outcomes retrospective; cheap; already self-labeled static. |

Both also require a `CLAUDE.md` doc-inventory fix regardless of the keep/cut decision (see the end).

---

## 1. Global (`/global-adoption`) — recommend **CUT**

### What it actually is
Nav label "Global", page title "Global Crypto Adoption" — but the page is **exclusively a CBDC (central-bank digital currency) tracker**. It contains **zero** crypto-adoption data (no adoption index, on-chain metrics, or exchange/wallet penetration). Contents: a source banner, 6 status stat-tiles (filters), 5 region chips, a live CBDC news panel, and ~55 country cards with editorial notes.

### Data reality (the core problem)
- **Country dataset is static, duplicated, and dressed as live.** The grid reads `/live-data/cbdc-data`. That route's two fetchers are both non-functional: `fetchFromAtlanticCouncil()` scrapes for a `<script>…"countries"…</script>` JSON blob that a data-driven app effectively never exposes (dead code), and `fetchFromIMF()` is an explicit stub that always returns `null`. So the route **always** serves a hardcoded 55-entry `FALLBACK_DATA` array — which is **duplicated verbatim** as a second copy inside the page file.
- **Fabricated freshness.** Every response — including the static fallback — stamps `updatedAt: new Date().toISOString()` (route lines 396/404/414). The banner honestly says "Curated dataset," but the timestamp beside it always reads "just now" on frozen content. This is the exact anti-pattern `DATA-AVAILABILITY.md` forbids (no fabricated figures presented as real).
- **Stale by ~2–3 years.** Notes are pinned to 2023–2024 ("As of 2024, e-CNY…", Mexico "by 2025", Japan "around 2026"); today is 2026-07-20 and nothing in the code path can refresh them. The 6-hour refetch / 1-hour revalidate are theatre over a constant array.
- **Only genuinely live element:** `CbdcNewsPanel`, which is `/live-data/news?limit=100` keyword-filtered to CBDC stories — pure overlap with `/news` and `/headlines`, and it often shows the empty state (CBDC stories are sparse in the crypto feed).

### Unique value
Low. The one asset is the curated CBDC reference dataset itself — but it's stale, unmaintained (duplicated across two files), off-thesis for a crypto product, and the live slice is derivative.

### Recommendation
**CUT** as the default. It mislabels itself, its only live part duplicates stronger pages, and it violates the app's data-integrity doctrine by manufacturing a live timestamp over frozen data.

**Conditional alternative — INVEST** *only if CBDC coverage is a deliberate strategic goal*: (a) delete the dead Atlantic Council/IMF fetchers and relabel honestly as a *curated, dated* reference (single source of truth in `lib/data/`, a real "last reviewed" date, **no fabricated `updatedAt`**); (b) rename it "CBDC Tracker," decoupled from "crypto adoption"; (c) keep the news strip but broaden its source. Absent that commitment, ship-state value doesn't justify keeping it.

Either way, the fabricated `updatedAt` on static data should not remain.

### Clean-removal checklist (if CUT)
1. `frontend/src/lib/modules/registry.ts` — remove nav item (line 93 `{ href: '/global-adoption', label: 'Global', icon: Globe }`); remove `'/global-adoption'` from the crypto module `routePrefixes` (line 84); remove the now-unused `Globe` import (line 9 — used only at line 93).
2. `frontend/src/app/(dashboard)/global-adoption/page.tsx` — delete file + directory. All helpers (`FALLBACK_DATA`, `StatusBadge`, `CountryCard`, `CbdcNewsPanel`, `CBDC_KEYWORDS`, `filterCbdcNews`) are inline and used nowhere else.
3. `frontend/src/app/live-data/cbdc-data/route.ts` — delete (only this page + the smoke test reference it).
4. `frontend/scripts/test-live-data.mjs` — remove the `/live-data/cbdc-data` smoke-test entry (~lines 113–114).
5. `CLAUDE.md` — remove the "Global Adoption | `/global-adoption` | 🟡 Partial" feature-inventory row.
- **Do NOT touch** `live-data/news/route.ts` (shared by `/news` + `/headlines`); no `src/lib/data/*` module backs this page; no `ModuleGate` wrapper to unwind.

---

## 2. Risk Case Studies (`/backtests`) — recommend **KEEP / INVEST (light)**

### What it actually is
A self-contained single-file page (419 lines; imports only `lucide-react` + `clsx` — no data file, no route, no `src/lib/risk/` import). It renders 3 hardcoded depeg case studies from an inline `EVENTS` array:
1. **UST / LUNA** (May 2022) — verdict `caught`, −99.7%
2. **USDC / SVB** (Mar 2023) — verdict `partial`, −13%, recovered
3. **BUSD** regulatory wind-down (Feb 2023) — verdict `partial`, −0.3%

Each carries a canned score timeline, signal chips, summary, and key lesson, rendered with an SVG sparkline and a pre/peak/delta score row.

### Data reality
- Events are **real and correctly dated**; narrative details (Anchor 20% APY, Circle's $3.3B at SVB, NYDFS/Paxos) are factually accurate.
- **It does NOT run the risk model** — `composeRisk()` etc. is never invoked; scores are hand-authored constants. The page **openly says so** in an amber banner ("Simulated scores — not live data… not the result of running the live pipeline against historical data"). So it's an honest static educational replay, not fake-live (contrast with Global).
- The flagship "View full analysis" CTA is permanently `disabled` with a "Coming soon" badge; a roadmap note promises a live engine + 3 more events (FRAX/USDD/MIM), none implemented.

### Unique value
Genuine. It's the only surface tying the risk framework to real historical outcomes — including openly conceding the model's SVB counterparty blind spot. That's a credibility/trust asset a live dashboard can't provide, and it's cheap (one static file, no API cost).

### Recommendation
**KEEP.** Optionally **INVEST (light)**, in priority order:
1. **Run `src/lib/risk/` on the reconstructed inputs** instead of hardcoding `finalScore`/`preDepegScore` — turns "a number we wrote" into "what the shipped model outputs," and doubles as a regression test of the model against known outcomes. *(Note: this depends on the risk framework being settled — i.e. after R2 — to avoid rework.)*
2. **Wire or delete the disabled "View full analysis" CTA** — a permanent "Coming soon" button on the primary card is worse than none.
3. **Add 1–2 promised events**, ideally including one honest `missed` verdict so the scorecard isn't all caught/partial.

Fallback if unfunded: **FOLD** into `/risk-scores` as a "Historical validation" tab (same module → no registry/entitlement churn). **Do not CUT** — the content is complete, honest, and unique.

_(For completeness, a hypothetical CUT touches only: the page file, `registry.ts` line 100 nav item + line 86 `/backtests` route prefix, and the `CLAUDE.md` fix below. No shared data/components; `priceHistoryMeta.ts`/`PriceHistoryChart.tsx` are unrelated.)_

---

## 3. Required `CLAUDE.md` doc fix (independent of keep/cut)

`CLAUDE.md` line 318 is **stale/wrong** — it still calls the page "Backtests" and marks it not-available:
```
| Backtests | `/backtests` | 🔴 Not available | Requires a backtesting backend; not present |
```
The page exists, is fully built, and is nav-labeled "Risk Case Studies". Replace with, e.g.:
```
| Risk Case Studies | `/backtests` | 🟡 Static | Educational replay of 3 real depeg events (UST, USDC-SVB, BUSD) with reconstructed risk-model scores. Self-labeled "simulated — not live data." No live pipeline. |
```
(Leave line 342's separate `/equities/backtests` row untouched.)

If Global is kept, its `CLAUDE.md` row should also be corrected to reflect that the country data is static/curated (not "Partial"-live) and mislabeled vs. "crypto adoption."
