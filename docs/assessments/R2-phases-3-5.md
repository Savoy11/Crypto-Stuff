# R2 Phases 3–5 + rename — shipped / deferred record

Continues `R2-phase2-verification.md`. Canonical scale = **0–100, higher = safer**,
5 bands (low ≥80, moderate ≥60, elevated ≥40, high ≥20, critical <20). Source of
truth: `docs/architecture/risk-scale-spec.md` (branch `origin/docs/risk-scale-spec`).

All changes below are **additive** — no legacy field or scale was mutated in place.
Verified: `tsc` clean · `eslint` clean · `vitest` 118 pass · `npm run build` green
(middleware now registered).

## Phase 3 — Staking onto the canonical scale (internal)

- **3.3 `live-data/staking-discovery/route.ts`** — each `DiscoveredPool` now emits
  `riskCanonical` (0–100) + `band`, computed via the shared, tested
  `scoreStakingProvider()` adapter. Legacy `riskScore` (1–10 higher = riskier) +
  `riskLevel` kept and marked `@deprecated` in the interface. ✅
- **3.4 `lib/data/stakingProviders.ts`** — `computeOverallRisk` and `getRiskLevel`
  marked `@internal`; documented that `medium` is legacy-only (the canonical 5-band
  vocabulary has no `medium`). ✅
- **3.5 `lib/risk/__tests__/profiles.test.ts`** — added two cases covering
  `mergedRisks` asset overrides (ordering preserved + exact linear mapping onto the
  canonical scale; no-override identity). ✅
- **3.1 / 3.2 (staking pages) — N/A, nothing to migrate.** Neither
  `staking/page.tsx` nor `staking-discovery/page.tsx` renders a composite risk
  score/band today — the cards show APR, dimensions copy, and the provider
  description only. There is no legacy-scale number on screen to contradict the
  canonical scale, so no UI edit was required. If a composite score is ever surfaced
  on these pages, use `scoreStakingProvider()` and render 0–100 + band.

## Phase 4 — Coin discovery (internal)

- **4.2 `live-data/coin-discovery/route.ts`** — `scores` now carries `riskCanonical`
  (0–100) + `band`, converted with **`tenPointSafetyToCanonical()`** (a pure
  polarity-PRESERVING rescale). Explicitly **not** `tenPointRiskToSafety` — that
  inverter would turn a 9/10-safe coin into ~11/100 (critical), the migration's worst
  bug. A regression test already pins this (`normalize.test.ts`). Legacy 1–10 `risk`
  kept one release. ✅
- **4.3 (coin-discovery page) — N/A, nothing to migrate.** The card renders
  `scores.overall` (/10) and Market-Cap/Utility bars; the risk sub-score only feeds
  `overall` and is never shown as a standalone number, so there's no legacy risk
  display to convert.
- **4.1 `lib/risk/profiles/coinScreen.ts` (NEW canonical profile) — DEFERRED.**
  The scale migration is satisfied by the boundary conversion in 4.2. A first-class
  `coinScreen` profile (null for absent signals, evidence trail) is a
  scoring-**quality** improvement, not a scale change; wiring the route to a brand-new
  scorer changes scoring behaviour and needs its own verification. Tracked for a
  follow-up. Next release still drops legacy `risk` per 4.4.

## Phase 5 — Public API (`/api/v1/staking/opportunities`)

- **5a (additive, non-breaking) — DONE.** Each opportunity now carries `safetyScore`
  (0–100 higher = safer) + `band` (5-level), via `scoreStakingProvider()`. Legacy
  `riskScore`/`riskLevel`/`max_risk` left byte-identical and marked deprecated in the
  response `note`, the discovery listing, and `openapi.json` (`deprecated: true` on
  the params and schema fields). ✅
  - **Filter naming deviation (deliberate):** the spec drafted the canonical filter
    as `max_safety` "(0–100 floor)". A *floor* named `max_*` re-creates the exact
    inverted-filter footgun §5.3 exists to prevent (an agent reads "max" as a ceiling
    and silently gets the opposite set, with a 200). It is therefore implemented as
    **`min_safety`** (floor: return items scoring ≥ it); the `max_safety` spelling is
    accepted as an **alias** so no drafted client breaks. Both mean the same floor.
- **E2 request logging — DONE.** New `frontend/src/middleware.ts` (matcher
  `/api/v1/:path*`) emits one structured JSON line per v1 request (method, path,
  query, UA, referer, and a `legacyRiskFilter` flag when `max_risk` is used).
  Read-only (`NextResponse.next()`), no bodies/cookies/PII. This is the telemetry
  §5.3 requires *before* any decision to remove the legacy fields.
- **5b (`mcp-server/` adopts canonical fields, version bump) — DEFERRED by design.**
  The spec says ship 5b **only after 5a is deployed**. 5a is not yet deployed, so the
  MCP server is untouched. When 5a is live: update `get_staking_opportunities` /
  `compare_staking_risk` to request + display `safetyScore`/`band`, state the
  direction ("higher = safer") in tool descriptions, and bump the MCP version.
- **5c (breaking removal / `/api/v2` or `?scale=`) — DEFERRED.** Gated on E2
  telemetry showing no legacy traffic, or an explicit product decision (P4). Do not
  remove legacy fields before then.

## Step 5 — "Risk Score" → "Safety Score" copy rename (P1, approved)

Renamed the user-facing label on every surface that shows the canonical 0–100 score:
`risk-scores` leaderboard title + subtitle + footer, asset-detail gauge label +
"not available" text, `AssetTable` column, `AssetComparison` label, `AssetFilters`
range label + aria-labels, `HistoricalScoreChart` title, `backtests` timeline label,
and the `/api/v1` discovery description. Internal identifiers (`CompositeRisk.score`,
`asset.riskScore`, `riskBand`) are unchanged per spec — only presentation copy moved.
Legacy-scale disclaimers that don't sit immediately before a 0–100 number (e.g. the
staking page's "risk scores are editorial assessments", which is on the 1–10 scale)
were intentionally left.

## Still open from Phase 2 (unchanged — see R2-phase2-verification.md)
Live same-number cross-check on a normal network; HistoricalScoreChart →
LiveUnavailable; RiskScoreBadge coverage affordance; component sweep;
`DATA-AVAILABILITY.md` flip.
