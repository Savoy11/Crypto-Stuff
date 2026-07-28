# Canonical Risk Scale — Specification

**Status:** RATIFIED AND IMPLEMENTED — R2 shipped this migration (phases 1–5, 2026-07-19 → 2026-07-24; see `docs/assessments/R2-phase2-verification.md` and `R2-phases-3-5.md`). Recovered onto main 2026-07-28 from the `docs/risk-scale-spec` branch, which was never merged even as every doc referenced this file as the source of truth.
**Date:** 2026-07-19
**Supersedes:** the "Canonical conventions" section of `docs/architecture/risk-framework.md` (which it ratifies and extends, not contradicts)
**Scope:** `frontend/` — every surface that displays, filters, sorts, or serves a risk number

---

## 0. Two corrections to the framing

This spec was commissioned on two premises. Both were checked against the code and
**both are out of date**. Recording them here because they change what the work is.

### 0.1 `lib/risk/` and `lib/utils/risk.ts` do **not** have opposite polarity

The commissioning brief states that `RISK_BAND_CONFIG` "has inverted polarity relative
to the risk-scores page's own copy (which describes 0–10 where lower = safer)." That is
not what either file says.

| | `lib/risk/types.ts` | `lib/utils/risk.ts` |
|---|---|---|
| Range | 0–100 | 0–100 |
| Direction | higher = safer | higher = safer |
| Bands | low ≥80 · moderate ≥60 · elevated ≥40 · high ≥20 · critical <20 | low ≥80 · moderate ≥60 · elevated ≥40 · high ≥20 · critical <20 |
| Vocabulary | `low \| moderate \| elevated \| high \| critical` | `low \| moderate \| elevated \| high \| critical` |

`RISK_BAND_THRESHOLDS` (`lib/risk/types.ts:20-26`) and `getRiskBandFromScore()`
(`lib/utils/risk.ts:56-62`) are numerically identical. The `/risk-scores` page copy
(`page.tsx:197`) reads *"Scores run 0–100 — higher is safer"* and its band detail line
(`:199`) reads *"Low risk (80–100) · Moderate (60–79) · Elevated (40–59) · High (20–39)
· Critical (0–19)"* — agreeing with both.

**Schemes 1 and 2 are already the same scale.** They are two *implementations* of it.
The defect between them is duplication (two threshold tables, two `RiskBand` type
declarations, two colour maps), not contradiction. Duplication is a real problem — it is
how the two drift into contradiction later — but it is a refactor, not a repair, and it
carries none of the user-facing urgency the brief assumed.

The "same risk reads as both safe and dangerous" scenario does not occur via polarity.
A different and real inconsistency does occur; see §0.2 and §3.1.

### 0.2 `/risk-scores` is already live

The brief states the page "currently renders N/A in live mode via `LiveUnavailable`."
It does not. `LiveUnavailable` is imported by eight files; `risk-scores/page.tsx` is not
one of them. Commit `b5bcab7` ("Activate composite Risk Scores — live 5-pillar engine,
no backend needed") and `cf4840b` ("Wire asset detail pages to the live risk engine")
shipped it. `DATA-AVAILABILITY.md:40` records risk scores as 🟢 Derived.

The page today computes, per request, from `Promise.allSettled` over three sources:

- **Stablecoins** — 5 pillars (Reserve 30 / Peg 25 / Structure 20 / Adoption 15 / News 10)
  with multiplicative fatal-flaw slashing, from DefiLlama `stablecoins?includePrices=true`,
  curated attestation metadata, and the CAEP news pipeline.
- **Majors** — 5 pillars (Volatility 30 / Liquidity 25 / Scale 25 / Trend 10 / News 10)
  from one batched CoinGecko `/coins/markets` call with `sparkline=true`.

So **deliverable 2 is not a build question, it is a wiring question.** The composite the
brief proposes building already exists and is better-sourced than the proposal
(it uses reserves *and* peg *and* structure *and* adoption *and* news, versus the
proposed coin-discovery-subscore + reserves + peg). What remains unbuilt is the delivery
of that score to the twelve components that still render `N/A`. See §7.

---

## 1. The canonical scale

> **CAEP risk scores are 0–100 integers-with-decimals where HIGHER = SAFER.**
> A score of 95 means low risk. A score of 5 means critical risk.
> There is no other scale in the product's user-facing or public-API surface.

### 1.1 Bands

| Band | Range | Meaning | Colour token |
|---|---|---|---|
| `low` | 80–100 | Low risk | emerald `#10b981` |
| `moderate` | 60–79.99 | Moderate risk | blue `#3b82f6` |
| `elevated` | 40–59.99 | Elevated risk | amber `#f59e0b` |
| `high` | 20–39.99 | High risk | orange `#f97316` |
| `critical` | 0–19.99 | Critical risk | red `#ef4444` |

Band vocabulary is exactly these five strings. `medium` is **not** a band (it exists only
in the legacy staking `getRiskLevel()` and must be retired — see §4.4).

### 1.2 Reasoning — why higher = safer

This is the decision the brief correctly identifies as the root ambiguity, so it is
stated with its justification rather than asserted.

**Arguments for higher = safer (chosen):**

1. **Incumbency, by a wide margin.** Both the engine (`lib/risk/`, ~1,199 lines,
   ~689 lines of vitest) and the display layer (`lib/utils/risk.ts`, 12 consumers)
   already use it. So does the `/risk-scores` page, the asset-detail composite panel,
   the equity/options/staking profiles, and `docs/architecture/risk-framework.md`. The
   only dissenters are two crypto-specific surfaces (§4.3, §4.4). Choosing
   higher-is-riskier would invert the *entire* codebase to accommodate the minority.
2. **It matches the grading metaphor.** 0–100 with 80+ as "good" is a school grade. Users
   read a 95 as good without instruction. A 0–100 scale where 95 is catastrophic fights
   the reader's prior on every glance.
3. **Colour convention already encodes it.** CLAUDE.md's app-wide convention is
   emerald = safe → red = danger, and the existing gradient runs emerald at the top of
   the numeric range. Inverting polarity would require inverting every colour ramp or
   accepting red-at-100.
4. **Sorting is intuitive.** `sort desc` = "best first" on a leaderboard, which is what
   `/live-data/risk-scores/route.ts:263-264` already does.

**Argument against (acknowledged):** the *name* "risk score" implies more = more risk.
A 95 "risk score" that means low risk is a naming inconsistency, and it is the likely
origin of the confusion this spec was commissioned to resolve.

**Resolution.** Keep the polarity; fix the naming. Every user-facing label and every
public-API field description must say **"Safety Score"** or carry an explicit
"higher = safer" qualifier adjacent to the number. Internally the type stays
`CompositeRisk.score`; externally the word "risk" must never appear immediately before a
0–100 number without a direction qualifier. This is cheap, it removes the actual
ambiguity, and it does not require touching 1,199 lines of tested engine.

> **PRODUCT DECISION REQUIRED (P1):** approve the user-facing rename to "Safety Score"
> (or an alternative — "Quality Score", "CAEP Score"). This spec's migration plan assumes
> approval. If rejected, every surface must instead carry an inline "higher = safer"
> caption, which is more chrome for the same outcome.

### 1.3 Null is a first-class value

`score: null` means **no data**, and is displayed as `N/A` or `—`. It is never coerced
to 0, never to 50, never omitted from a list silently. `composeRisk()` already enforces
this: null dimensions are excluded and remaining weights renormalize
(`engine.ts:74-103`), driving `coverage` down rather than the score. When *no* dimension
has data, it throws rather than returning a number — and both callers catch and omit the
asset (`route.ts:232`, `:260`) rather than fabricating. This behaviour is correct and is
canon. It is also what makes CAEP's live-only rule work at the scoring layer.

### 1.4 Every score carries provenance

A canonical score is not a bare number. The canonical *shape* is `CompositeRisk`
(`lib/risk/types.ts:87-101`): `score`, `band`, `confidence` (0–1), `coverage` (0–1),
per-dimension breakdown with `evidence[]`, `warnings[]`, and `profileId` +
`profileVersion`. Any surface that renders only the number, discarding coverage and
confidence, is presenting a stronger claim than the data supports. **The number and its
coverage must travel together.**

---

## 2. Which scheme is the engine

**`lib/risk/` is the single scoring engine. Everything else becomes an adapter.**

Justification, since the brief correctly asks not to assume consolidation:

- It is the only scheme with a **versioned profile** concept (`profileVersion`), which is
  what makes stored scores comparable across recipe changes. Without it, a weight tweak
  silently rewrites history.
- It is the only scheme that separates **score from confidence from coverage**. The
  1–10 schemes emit a bare number, so a fully-guessed score and a fully-evidenced score
  are indistinguishable downstream — which is precisely the failure mode a live-only
  product cannot afford.
- It is the only scheme with **evidence**, and therefore the only one that can satisfy
  the "research tool, not advice" framing that the product's positioning depends on.
- It is the only one that is **tested** (~689 lines of vitest across four suites,
  including a test asserting the staking adapter preserves legacy provider ordering
  exactly).
- It is **pure TypeScript with no React/Next/API imports**, so it lifts into a shared
  package when the suite splits (`risk-framework.md` §Canonical conventions #6).
- The adapter pattern is already proven in-repo: `profiles/stakingAdapter.ts` wraps the
  six-dimension staking model with identical weights and passes an ordering-preservation
  test. It cost 71 lines.

**Where per-surface scoring stays legitimate.** Consolidation of the *scale* is not
consolidation of the *dimensions*. Three surfaces keep their own dimension sets:

| Surface | Keeps its own dimensions because | Composes via |
|---|---|---|
| Staking providers | Custody/counterparty/slashing are genuinely domain-specific and editorially curated — no market-data equivalent exists | `stakingAdapter.ts` (exists) |
| Coin discovery | Screens *unlisted candidate* coins with no catalog entry, no attestation metadata, and no news coverage — a different input set from a tracked major | new `coinScreen` profile (§4.3) |
| Pump report | LLM-generated forensic judgement, not a metric composite | stays separate, relabelled (§4.5) |

What is **not** legitimate is any of them emitting a *different scale*. The dimension
catalog is per-asset-class; the scale, bands, vocabulary, and output shape are universal.
This is the Bloomberg MAC3 / MSCI BarraOne architecture already cited in
`risk-framework.md` — one engine, per-asset-class factor catalogs.

---

## 3. The four schemes, mapped

### 3.0 Summary

| # | Scheme | Range | Direction | Verdict |
|---|---|---|---|---|
| 1 | `lib/risk/` | 0–100 | higher = safer | **Canonical.** Becomes the only engine. |
| 2 | `lib/utils/risk.ts` `RISK_BAND_CONFIG` | 0–100 | higher = safer | **Already canonical-compatible.** Becomes a presentation-only re-export. No numeric conversion needed. |
| 3 | `coin-discovery` `risk` sub-score | 1–10 | higher = safer | Linear rescale + reframe as a profile. |
| 4 | `stakingProviders.computeOverallRisk()` | 1–10 | higher = **riskier** | **Polarity inversion.** Adapter exists; public API blocks retirement. |

### 3.1 Scheme 2 — the twelve consumers, and the actual bug

**The conversion for `RISK_BAND_CONFIG`'s twelve consumers is the identity function.**
Same range, same direction, same thresholds. No arithmetic is required, and any migration
that "converts" these values will corrupt them.

What the twelve consumers actually need is not a conversion but a **data source**. Today:

```
lib/data/assetCatalog.ts   →  riskScore: 91.2, 62.8, 74.5, …   (hardcoded, static)
        ↓
lib/api/live/overlay.ts:25 →  riskScore: null                   (nulled on the live path)
        ↓
12 components              →  render "N/A"
```

`nulledAsset()` (`overlay.ts:14-29`) explicitly nulls `riskScore` and `riskBand` — with a
correct comment: *"everything that has no free live source — derived risk/reserve/peg
metrics — is nulled out so the UI renders 'N/A' instead of fabricated numbers."*
`hooks/useAssets.ts:96` does the same for discovery-added coins.

That comment is now **factually stale**. There *is* a free live source: it is
`/live-data/risk-scores`, and it already scores every asset in `ASSET_LIST` that has a
CoinGecko id (`route.ts:63-65`) plus every monitored stablecoin. The null is no longer
honest caution — it is a missing wire.

**This is the real user-visible inconsistency, and it is on a single page.**
`app/(dashboard)/assets/[id]/page.tsx` renders, in one scroll:

- **line 485-489** — a risk gauge and `RiskScoreBadge` fed from `asset.riskScore`, which
  is always `null` → displays `N/A`;
- **line 611+** — `LiveCompositeRiskPanel`, fetching `/live-data/risk-scores` → displays
  a real composite with band, confidence, coverage, and per-pillar evidence.

Same asset, same viewport, two different answers about whether a risk score exists. That
is a more embarrassing defect than a polarity flip and it is entirely a plumbing fix.

Separately: the hardcoded `riskScore` values in `assetCatalog.ts` (91.2, 62.8, 74.5,
55.1, 12.4, …) are **fabricated values sitting in the repo**, currently defused only by
`overlay.ts` nulling them. Any future code path that reads the catalog without going
through the overlay resurrects them as apparently-real scores. They must be deleted, not
merely bypassed. This is a live-only-policy violation waiting to happen.

### 3.2 Scheme 3 — coin discovery (1–10, higher = safer)

`app/live-data/coin-discovery/route.ts:28` — `risk: number // 1–10 (higher = less risky)`.
Built by `scoreRisk()` (`:85-111`) as additive ±deltas over liquidity ratio, ATH drawdown,
24h volatility, and market-cap floor, clamped to `[1, 10]`, then folded into an `overall`
with market-cap and utility sub-scores via `SCORING_CONFIG.weights` (`:206-209`).

**Conversion to canonical:**

```
canonical = (raw − 1) / 9 × 100        // 1 → 0, 10 → 100
```

Direction is preserved (both higher-is-safer), so this is a pure rescale. Note this is
*not* `tenPointRiskToSafety` — that function also inverts. Applying the staking converter
here would flip coin discovery's polarity and is the single most likely migration bug.
A distinct `tenPointSafetyToCanonical()` helper must be added to `normalize.ts` so the two
can never be confused at a call site.

Longer term the three sub-scores (market cap, utility, risk) should become a real
`coinScreen` profile with weights declared in a `RiskProfileSpec` and `null` for
un-scoreable inputs, rather than additive deltas that silently treat "no signal" as
"neutral signal". Deferred to Phase 4 — it is a scoring-quality improvement, not a scale
fix, and it changes displayed numbers.

### 3.3 Scheme 4 — staking providers (1–10, higher = riskier)

The only genuine polarity inversion in the codebase.

`computeOverallRisk()` (`stakingProviders.ts:92-101`) weights six 1–10 higher-is-riskier
dimensions: counterparty 25%, custody 20%, liquidity 20%, contract 15%, slashing 10%,
regulatory 10%. `getRiskLevel()` (`:108-113`) bands them `low ≤3 · medium ≤5.5 ·
high ≤7.5 · critical` — a **four**-level vocabulary using `medium`, which is not a
canonical band.

**Conversion to canonical** (already implemented, `normalize.ts:44-46`):

```
canonical = clamp(((10 − raw) / 9) × 100, 0, 100)      // 1 → 100, 10 → 0
```

`profiles/stakingAdapter.ts` already wraps the whole model with identical weights and is
test-verified to preserve provider ordering exactly (the conversion is linear, so
ordering is invariant). **The adapter is done; nothing consumes it.**

Band mapping under conversion — note it is *not* clean, which is a finding:

| Legacy (1–10, riskier) | Converted (0–100, safer) | Legacy label | Canonical band |
|---|---|---|---|
| 1.0 | 100.0 | low | low |
| 3.0 | 77.8 | low | **moderate** ← boundary disagreement |
| 5.5 | 50.0 | medium | elevated |
| 7.5 | 27.8 | high | high |
| 10.0 | 0.0 | critical | critical |

A provider at legacy 3.0 is labelled `low` today and `moderate` after conversion. The
label boundaries were set independently on the two scales and do not correspond. **Some
staking providers will visibly change band** during migration even though their
underlying ratings and their relative ordering are untouched.

> **PRODUCT DECISION REQUIRED (P2):** accept the band shifts (recommended — canonical
> bands win, and a one-time shift is the cost of having one vocabulary), or re-anchor the
> canonical thresholds to preserve staking's current labels (not recommended — it would
> move the bands for every other asset class to accommodate one editorial model).

### 3.4 Not in the brief's list, but in scope

| Surface | Scheme | Note |
|---|---|---|
| `live-data/staking-discovery/route.ts:107` | **Not independent** — imports `computeOverallRisk` + `getRiskLevel` | Migrates automatically with scheme 4. The brief lists it as independent scoring; it is not. |
| `live-data/pump-report/investigate/route.ts:31-32` | LLM-emitted `riskScore` 0.0–10.0, higher = riskier, `overallRisk: clean\|suspicious\|flagged\|critical` | Genuinely independent, and genuinely different in kind (§4.5). |
| `types/asset.ts:2` | Duplicate `RiskBand` union, structurally identical to `lib/risk/types.ts:17` | Two declarations of one type. Collapse. |
| `backend/app/scoring/` | 0–100 higher = safer, bands 80/65/50/30 | Per `risk-framework.md:17`. Backend is optional/legacy (auth+agent only). **Its band thresholds disagree with the frontend's** (65/50/30 vs 60/40/20). Out of scope for this spec but must not be reactivated without adopting canonical bands. |

---

## 4. Target architecture

```
                       lib/risk/            ← the engine (canonical, 0–100 higher=safer)
                       ├── types.ts         ← RiskBand + RISK_BAND_THRESHOLDS (sole declaration)
                       ├── engine.ts        ← composeRisk()
                       ├── normalize.ts     ← converters incl. the two 10-pt helpers
                       ├── presentation.ts  ← NEW: colours, labels, Tailwind classes
                       └── profiles/
                           ├── stablecoin.ts      (live)
                           ├── cryptoAsset.ts     (live)
                           ├── stakingAdapter.ts  (built, unconsumed)
                           ├── equity.ts          (built, unconsumed)
                           ├── optionsTrade.ts    (built, unconsumed)
                           ├── coinScreen.ts      ← NEW (Phase 4)
                           ├── fund.ts            ← planned
                           ├── bond.ts            ← planned (§6)
                           └── commodity.ts       ← planned (§6)
                                  ↓
      ┌───────────────────────────┼───────────────────────────┐
      ↓                           ↓                           ↓
lib/utils/risk.ts          /live-data/risk-scores      /api/v1/risk/*  (planned)
(thin re-export,           (composites, live)          + MCP tools
 12 consumers                     ↓
 unchanged)               asset overlay + 12 components
```

### 4.1 `lib/utils/risk.ts` becomes presentation-only

Move the colour/label/Tailwind maps into `lib/risk/presentation.ts`. Keep
`lib/utils/risk.ts` as a re-export shim so the twelve consumers need no edit in the
scale-unification phases. Delete the duplicate `getRiskBandFromScore()` in favour of
`bandForScore()` from `engine.ts` — one threshold table, not two.

`getPegDeviationColorClass()` (`utils/risk.ts:135-141`) is unrelated to the band system
(it thresholds basis points) and moves to a formatting module.

### 4.2 `types/asset.ts` re-exports `RiskBand` from `lib/risk/types.ts`

One declaration. Structurally identical today, so this is a no-op at the type level and
prevents the two from drifting.

### 4.3 Coin discovery becomes a profile

`COIN_SCREEN_RISK_PROFILE` with declared weights, emitting `CompositeRisk`. The route
keeps its 1–10 `risk` field in the response **for one release** alongside a new
`riskCanonical`, then drops it. The page reads the canonical field.

### 4.4 Staking consumes the adapter; `medium` is retired

`computeOverallRisk()` and `getRiskLevel()` stay as internal editorial-model helpers (the
1–10 dimension ratings in `STAKING_PROVIDERS` are the source data and are not changing),
but nothing user-facing calls them directly. `scoreStakingProvider()` is the only public
path. The `medium` label disappears from the UI; `elevated` takes its place.

The **public API is the constraint here** — see §5.3.

### 4.5 Pump report is relabelled, not converted

The pump-report score is an LLM's forensic judgement about fraud allegations, wash
trading, and collapse risk. It is not a metric composite, has no coverage/confidence, and
is not comparable to a volatility-and-liquidity composite. Forcing it onto the canonical
scale would imply a comparability that does not exist.

**Recommendation:** keep it separate and rename its field to `suspicionScore` with its
own `clean | suspicious | flagged | critical` vocabulary, explicitly documented as *not*
a CAEP risk/safety score. It must never be rendered in a `RiskScoreBadge` or compared
against a composite.

> **PRODUCT DECISION REQUIRED (P3):** confirm that pump-report stays outside the canonical
> scale. The alternative — making it a fatal-flaw *input* to the crypto-asset profile
> (an LLM-driven multiplicative slash, mirroring `applyFatalFlaws`) — is defensible and
> arguably more useful, but it makes an LLM judgement load-bearing on a headline number.
> This spec recommends against it for v1.

---

## 5. Migration plan

Ordering constraint: **no two visible surfaces may disagree at any commit.** The plan
achieves this by exploiting the fact (§0.1) that schemes 1 and 2 are *already* the same
scale — so the whole display layer can be unified with zero numeric change before any
value is touched.

### Phase 0 — Non-breaking foundations (no rendered value changes)

| # | File | Change |
|---|---|---|
| 0.1 | `frontend/src/lib/risk/presentation.ts` | **NEW.** Move `RISK_BAND_CONFIG`, `getRiskColor/BgColor/Label/BorderColor`, `getRiskTailwindClasses`, `getScoreColor` here verbatim. |
| 0.2 | `frontend/src/lib/utils/risk.ts` | Re-export from `presentation.ts`. Delete local `getRiskBandFromScore` → re-export `bandForScore`. Twelve consumers untouched. |
| 0.3 | `frontend/src/types/asset.ts` | `export type { RiskBand } from '@/lib/risk/types'`. |
| 0.4 | `frontend/src/lib/risk/normalize.ts` | Add `tenPointSafetyToCanonical()` (rescale, no inversion) beside `tenPointRiskToSafety()` (rescale + inversion). Add doc comments that name which scheme each serves. |
| 0.5 | `frontend/src/lib/risk/__tests__/normalize.test.ts` | Assert the two converters are distinct and correct at 1 / 5.5 / 10. |
| 0.6 | `frontend/src/lib/utils/__tests__/` | **NEW.** Guard test: `bandForScore` and the presentation band config agree at every boundary. Prevents future drift. |

*Verify:* `npm run type-check`, `npm run lint`, `npx vitest run`. Zero visual diff.

### Phase 1 — Delete the fabricated catalog scores

| # | File | Change |
|---|---|---|
| 1.1 | `frontend/src/lib/data/assetCatalog.ts` | Delete every hardcoded `riskScore:` / `riskBand:` literal. |
| 1.2 | `frontend/src/lib/api/live/overlay.ts` | Drop the now-redundant nulling of `riskScore`/`riskBand`; update the stale comment. |

Surfaces still show `N/A` (unchanged behaviour) but the fabrication hazard is gone.
Do this **before** Phase 2 so no path can accidentally surface a static value.

### Phase 2 — Wire the live composite to the twelve consumers

This is the phase that fixes the real defect (§3.1).

| # | File | Change |
|---|---|---|
| 2.1 | `frontend/src/lib/api/live/riskScores.ts` | **NEW.** Client helper: fetch `/live-data/risk-scores`, index by `assetId`, expose `{ score, band, confidence, coverage }`. Shared query key `['risk-scores']` so it dedupes with the two existing callers. |
| 2.2 | `frontend/src/hooks/useAssets.ts` | Join composite scores onto assets. Unscored assets keep `null`. |
| 2.3 | `frontend/src/app/(dashboard)/assets/[id]/page.tsx` | Gauge (`:485-489`) reads the composite — resolving the same-page contradiction. |
| 2.4 | `frontend/src/components/assets/RiskScoreBadge.tsx` | Accept + surface `coverage`; low-coverage scores render with a caveat affordance. |
| 2.5 | `AssetCard.tsx`, `AssetTable.tsx`, `AssetComparison.tsx` | Render real scores; keep `N/A` for unscored. |
| 2.6 | `AssetFilters.tsx` | Band filter now returns rows. Verify `riskBand: 'all'` still passes unscored assets. |
| 2.7 | `components/dashboard/RiskHeatmap.tsx`, `LiquidityMonitor.tsx` | Same. |
| 2.8 | `components/ui/PopoutContent.tsx`, `SearchInput.tsx` | Same. |
| 2.9 | `components/analytics/ScoreBreakdown.tsx` | Re-point at `CompositeRisk.dimensions` (real pillars replace whatever shape it assumes). |
| 2.10 | `components/analytics/HistoricalScoreChart.tsx` | **No time-series source exists.** Must show `LiveUnavailable`, matching the `PegStabilityChart` precedent. See §7.4 — do not synthesize history. |
| 2.11 | `DATA-AVAILABILITY.md` | Asset-registry risk column 🔴 → 🟢 Derived. |

*Verify:* asset registry, asset detail, heatmap, and `/risk-scores` all show the **same
number for the same asset**. That cross-check is the acceptance criterion for this phase.

### Phase 3 — Staking onto the canonical scale (internal surfaces only)

| # | File | Change |
|---|---|---|
| 3.1 | `frontend/src/app/(dashboard)/staking/page.tsx` | Consume `scoreStakingProvider()`; render 0–100 + canonical band. |
| 3.2 | `frontend/src/app/(dashboard)/staking-discovery/page.tsx` | Same. |
| 3.3 | `frontend/src/app/live-data/staking-discovery/route.ts` | Emit `riskCanonical` + `band` alongside legacy `riskScore`/`riskLevel`. |
| 3.4 | `frontend/src/lib/data/stakingProviders.ts` | Mark `computeOverallRisk`/`getRiskLevel` `@internal`; document that `medium` is legacy-only. |
| 3.5 | `frontend/src/lib/risk/__tests__/profiles.test.ts` | Extend the existing ordering-preservation test to cover `mergedRisks` asset overrides. |

`/live-data/*` is internal, so 3.3 is additive and safe. **`/api/v1/` is untouched in this
phase** — that is §5.3.

*Verify:* provider ordering identical before/after; band shifts limited to the boundary
cases in §3.3's table.

### Phase 4 — Coin discovery

| # | File | Change |
|---|---|---|
| 4.1 | `frontend/src/lib/risk/profiles/coinScreen.ts` | **NEW.** Profile + scorers; null for absent signals. |
| 4.2 | `frontend/src/app/live-data/coin-discovery/route.ts` | Emit `riskCanonical` via `tenPointSafetyToCanonical()` (**not** `tenPointRiskToSafety` — see §3.2). Keep `risk` one release. |
| 4.3 | `frontend/src/app/(dashboard)/coin-discovery/page.tsx` | Read canonical; keep the 1–10 sub-score visible as evidence if useful. |
| 4.4 | — | Next release: drop legacy `risk`. |

### Phase 5 — Public API (breaking; gated — see §5.3)

### Phase 6 — Pump report relabel

| # | File | Change |
|---|---|---|
| 6.1 | `frontend/src/app/live-data/pump-report/investigate/route.ts` | `riskScore` → `suspicionScore`; prompt updated (`:72-73`). |
| 6.2 | `frontend/src/components/pump-report/PumpReportTab.tsx` | Field rename; ensure no `RiskScoreBadge` reuse. |

### 5.3 ⚠️ `/api/v1/staking/opportunities` is a PUBLIC CONTRACT — changing it is BREAKING

**This is the highest-risk item in the plan and it must not be bundled with a UI phase.**

`GET /api/v1/staking/opportunities` serves `riskScore` on the **1–10 higher-is-riskier**
scale with a **four-level `low|medium|high|critical`** vocabulary. It is consumed by:

- **`mcp-server/`** — `get_staking_opportunities` and `compare_staking_risk`. The
  `max_risk` parameter is `z.number().min(1).max(10)` (`index.ts:188`) and is described to
  the model as *"Maximum acceptable risk score (1–10). E.g. 4 = only low-risk options."*
  `compare_staking_risk` prints *"Risk scores: 1 = lowest risk, 10 = highest risk"*
  (`:374`) and formats `${riskScore.toFixed(1)}/10` (`:234`, `:364`).
- **`GET /api/v1/openapi.json`** — the published contract. `:266` documents
  *"Composite risk score 1–10 (10 = highest risk)"*; `:99` documents `max_risk` as
  *"Maximum composite risk score (1–10)"*; `:95` describes the 6-dimension composite.
- **Any external agent or script** that has read that spec. CAEP cannot enumerate these.

**Why a naive change is dangerous, not merely breaking.** `max_risk` is a *filter with
inverted meaning across the polarity flip*. An agent that has cached "max_risk=4 means
conservative" and hits a canonical-scale endpoint that reads 4 as a 0–100 safety floor
would receive **the riskiest providers instead of the safest** — and would receive them
silently, with a 200 response and plausible-looking data. There is no error surface. This
is the single worst failure mode in this entire migration, and it argues against ever
mutating the existing field in place.

**Mandated approach — additive, versioned, never mutate:**

1. **Phase 5a (additive, non-breaking).** Add `safetyScore` (0–100 higher = safer),
   `band` (5-level canonical), and `max_safety` (0–100 floor) to the *existing* endpoint.
   Leave `riskScore`, `riskLevel`, and `max_risk` byte-identical. Update `openapi.json`
   to document both, marking the legacy trio `deprecated: true` with a migration note.
2. **Phase 5b.** Update `mcp-server/` to request and display the canonical fields. Bump
   the MCP server version. Tool descriptions must state the direction explicitly. Ship
   this only after 5a is deployed.
3. **Phase 5c (breaking, deferred).** Introduce `/api/v2/` or a
   `?scale=canonical|legacy` negotiation. **Do not remove the legacy fields** until there
   is either a deprecation window with telemetry showing no legacy traffic, or an explicit
   product decision to break unknown consumers.

> **PRODUCT DECISION REQUIRED (P4):** approve the additive-forever posture for
> `/api/v1/staking/opportunities` (recommended), or set a hard deprecation date. CAEP has
> no consumer telemetry on `/api/v1/`, so "no one is using it" is an assumption, not a
> fact. Adding request logging to `/api/v1/*` should precede any removal decision.

**Cross-phase invariant:** at no point may `/api/v1` and the staking UI be mid-migration
in a way that lets an agent and a human read the same provider and disagree about
direction. Phase 3 changes the UI to 0–100; Phase 5a adds 0–100 to the API. Running
Phase 3 before Phase 5a is acceptable **only** because the API's legacy field remains
correct on its own documented scale and is explicitly labelled. If that labelling is not
airtight, 5a must precede 3.

---

## 6. Extension to commodities, bonds, and futures

The scale extends by adding **profiles**, never by adding conventions. The contract a new
asset class must satisfy:

1. Dimensions are 0–100 higher = safer, weights sum to 1, declared in a versioned
   `RiskProfileSpec`.
2. Un-scoreable dimensions emit `null` — never a neutral default. Neutral defaults are how
   a data gap becomes a fabricated claim.
3. Every dimension emits `evidence[]`.
4. Domain primitives are **normalized into** dimensions; they are never displayed as the
   score.

### 6.1 Bonds — the case the brief flags

Bonds have established primitives (duration, credit quality, convexity) with their own
units and directions. The temptation is to surface them raw, creating a fifth convention.
**They map to canonical dimensions instead:**

| Dimension | Weight (draft) | Primitive → normalization |
|---|---|---|
| Credit | 35% | Rating (AAA→D) via `piecewise()` anchors on an ordinal ladder; AAA→~95, BBB−→~55, CCC→~15. Issuer type (sovereign/agency/corp/HY) shifts anchors. |
| Interest-rate | 25% | Modified duration, inverted: short duration → safer. `piecewise([[0,100],[3,80],[7,55],[15,25],[30,5]])`. |
| Liquidity | 20% | Issue size, bid/ask, days-since-trade. Same shape as the equity profile's liquidity dimension. |
| Convexity | 10% | **Signed, and the sign matters.** Positive convexity → safer; negative (callable/MBS) → penalty. This is a genuinely bond-specific dimension with no equity analogue. |
| Structure | 10% | Seniority, covenants, call/sink features, currency mismatch. Mirrors the stablecoin profile's `structure` pillar. |

Two structural notes:

- **Duration is a sensitivity, not a risk.** It only becomes risk in combination with rate
  volatility. v1 treats duration as a standalone proxy (defensible for a research tool)
  but the dimension must be documented as such, and evidence must carry raw duration so a
  user can see the primitive. A later version should scale it by realized rate vol.
- **Default risk is fatal-flaw shaped.** `applyFatalFlaws()` already exists
  (`profiles/stablecoin.ts:263`) and is exactly the right mechanism: a bond in default or
  at CCC− should be slashed multiplicatively, not averaged. This is precedent, not new
  machinery — the same argument as "a collapsing reserve cannot be averaged away by good
  sentiment."

### 6.2 Commodities

| Dimension | Weight (draft) | Inputs |
|---|---|---|
| Volatility | 30% | Annualized from daily closes — `annualizedVolatility()` already exists |
| Liquidity | 25% | Futures volume + open interest |
| Storage/carry | 15% | Contango/backwardation; storage cost drag |
| Concentration | 15% | Geographic/producer concentration |
| Cyclicality | 15% | Drawdown depth/frequency — `maxDrawdown()` exists |

### 6.3 Futures

Futures are **positions, not assets** — closer in kind to `optionsTrade` than to `equity`.
Their dominant risk is leverage/margin, which is a property of the position, not the
underlying.

| Dimension | Weight (draft) | Inputs |
|---|---|---|
| Leverage | 30% | Notional ÷ margin; distance to maintenance margin |
| Liquidity | 25% | Contract volume, OI, spread — worst-case at roll |
| Roll | 15% | Roll yield drag, calendar spread stability |
| Underlying volatility | 20% | Annualized vol of the underlying |
| Expiry | 10% | Days to expiry; physical-delivery flag |

**Composition rule:** a futures position score must not be presented as the underlying
commodity's score. Same underlying, different `profileId` — and `profileId` must be
visible wherever two scores could be confused. This is the same discipline that keeps a
staking-provider score from being read as an ETH score.

### 6.4 Cross-asset comparability — the limit of the scale

A canonical 75 on a bond and a canonical 75 on a crypto asset mean *"75th-percentile-ish
safe within its own profile's calibration"*, **not** "equally risky." The profiles have
different dimensions, different anchors, and different underlying distributions.

> **PRODUCT DECISION REQUIRED (P5):** decide whether cross-asset-class comparison is a
> supported product claim. If **yes**, profiles need a joint calibration pass against real
> distributions (already on `risk-framework.md`'s roadmap as item 6) and that is
> substantial work. If **no** — recommended for v1 — the UI must never rank mixed asset
> classes in one sorted list without a visible profile label, and the methodology copy
> must state the limit plainly. The current `/risk-scores` page already does this
> correctly by using **two separate tables** for stablecoins and majors rather than one
> merged leaderboard. That pattern should be treated as binding precedent.

---

## 7. Deliverable 2 — Can the Risk Scores page go live?

**It already is.** See §0.2. Reframing the question to what is actually open:

### 7.1 What the live composite measures today

| Asset class | Profile | Pillars | Sources | Verdict |
|---|---|---|---|---|
| Stablecoins | `stablecoin` v-current | Reserve 30 / Peg 25 / Structure 20 / Adoption 15 / News 10, + fatal-flaw slashing | DefiLlama stablecoins API, curated attestation + structure metadata, CoinGecko 7d sparkline, CAEP news pipeline | **Defensible.** Best-grounded surface in the app. |
| Majors (non-pegged w/ CG id) | `cryptoAsset` v-current | Volatility 30 / Liquidity 25 / Scale 25 / Trend 10 / News 10 | One batched CoinGecko `/coins/markets` call (`sparkline=true`, `price_change_percentage=24h,30d`) | **Defensible, with a stated limit** — see §7.3. |
| Everything else | — | — | — | Correctly absent. |

The brief asks whether the stablecoin 5-pillar model is "a gap in coverage or a gap in
wiring." **It is a gap in wiring, and the wiring gap is `overlay.ts`, not the engine.**
The engine is built, tested, live, and already covers more assets than the page
advertises — `MAJOR_IDS` is *every* tracked non-stablecoin with a CoinGecko id
(`route.ts:63-65`), not a curated subset.

### 7.2 The proposed composite would be a downgrade

The brief proposes composing coin-discovery's risk sub-score + DefiLlama reserves + peg
deviation from the alerts route. Against what ships today:

- **Reserves** — already in, as the highest-weighted stablecoin pillar (30%), sourced from
  the same DefiLlama endpoint, and combined with curated collateralization ratios and
  attestation *age*, which the proposal omits. A reserve figure without attestation
  freshness overstates its own reliability.
- **Peg deviation** — already in at 25%, computed from spot plus the 7d sparkline, which
  is strictly more informative than the alerts route's threshold crossings (a boolean-ish
  signal derived from the same underlying prices).
- **Coin-discovery risk sub-score** — its inputs (liquidity ratio, ATH drawdown, 24h
  volatility, market cap) are *already* covered by the majors profile's Volatility /
  Liquidity / Scale pillars, computed from a 7-day hourly sparkline rather than a single
  24h delta. Folding in the discovery sub-score would double-count those factors at lower
  resolution.

Adopting the proposal would mean replacing a 5-pillar model with per-pillar confidence,
coverage, evidence, versioning, and fatal-flaw overrides with a 3-input blend that has
none of those. **Recommendation: do not build it.**

### 7.3 What the available signals honestly cannot support

Recording these explicitly, since "a narrower composite that is genuinely grounded beats a
broad one that is partly inferred."

1. **Decentralization / wallet concentration.** Needs paid indexers. Correctly absent —
   no pillar approximates it, and the page says so (`page.tsx:201`). **Keep it absent.**
2. **Smart-contract / audit risk for majors.** No free structured audit feed. Absent.
3. **Reserve composition detail.** DefiLlama's breakdown is derived from chain
   distribution, not issuer attestation (`DATA-AVAILABILITY.md:30`). The Reserve pillar
   handles this by leaning on curated attestation metadata at reduced confidence — the
   right call, and it must stay labelled that way.
4. **Peg deviation *history*.** No free historical peg series
   (`DATA-AVAILABILITY.md:41`). The 7d sparkline is the ceiling. This directly bounds
   §7.4.
5. **Counterparty risk for majors.** Not meaningfully measurable from market data.
6. **Volatility resolution.** The majors Volatility pillar derives from CoinGecko's 7-day
   sparkline. Seven days is a **short window for an annualized volatility figure** — it is
   sensitive to a single event and will read as regime-shifted after any sharp move. This
   is the weakest link in an otherwise defensible profile. It is *disclosed* via evidence,
   which is the minimum bar, but a 30–90 day window from `/live-data/ohlcv` would be
   materially better and is available. **Recommended follow-up, not a blocker.**

### 7.4 Risk History must stay N/A

`components/analytics/HistoricalScoreChart.tsx` is one of the twelve consumers and the
asset-detail page has a **Risk History** tab (`page.tsx:66,73`). There is no stored score
time-series: `/live-data/risk-scores` computes on request and persists nothing, and there
is no free historical peg or reserve series to backfill from (§7.3.4).

**Any risk-history chart today would be fabricated.** It must render `LiveUnavailable`,
following the `PegStabilityChart` precedent. This is the one place in this spec where the
honest answer is "N/A stays," and it stays for a reason that no amount of wiring fixes.

The forward path is to persist daily composite snapshots — which is real work (a store,
a scheduled job, a retention policy) and reopens the versioning question, since scores
computed under different `profileVersion`s are not comparable on one axis. Out of scope.

> **PRODUCT DECISION REQUIRED (P6):** whether to invest in score-history persistence.
> Until then Risk History shows `LiveUnavailable` and the tab should arguably be hidden
> rather than shown-and-empty.

### 7.5 Recommended user-facing copy

The existing `/risk-scores` copy (`page.tsx:197-202`) is already strong — it names every
source, states the direction, explains the fatal-flaw override, and declares what is *not*
scored. It needs only the §1.2 naming fix. For the newly-wired surfaces (Phase 2):

**Badge tooltip / hover:**
> Safety Score 0–100 — higher is safer. Composed live from market and reserve data.
> Coverage {n}% · Confidence {n}%. Analytics, not investment advice.

**Low coverage (<60%) inline caveat:**
> Partial data — {n}% of this profile's weight had a live source. Missing pillars are
> excluded rather than estimated.

**Unscored asset:**
> Not scored — no verified market-data mapping for this asset. No score is shown rather
> than an estimated one.

**Cadence:** unchanged. `/live-data/risk-scores` uses `revalidate: 900` on CoinGecko and
`300` on DefiLlama; the page polls at `STALE_TIME_LONG` with a 10-minute
`refetchInterval`. Phase 2 consumers must share the `['risk-scores']` query key so the
registry, detail page, and heatmap dedupe onto one request rather than tripling
CoinGecko load.

---

## 8. Geo-blocking caveat — what needs verifying from the user's network

This spec was written in a cloud environment whose egress IP differs from the user's.
Known-blocked-here sources include Binance (451), Reddit (403 server-side), and
LunarCrush (Cloudflare). **No source below was judged dead from a failed request here.**
Requires verification from the user's actual network:

| Source | Used by | Verify |
|---|---|---|
| `stablecoins.llama.fi/stablecoins?includePrices=true` | Reserve, Adoption, Peg pillars | Reachable; `peggedAssets[].circulating.peggedUSD`, `pegMechanism`, `chains` populated for all `MONITORED_STABLECOINS` |
| CoinGecko `/coins/markets` (batched, `sparkline=true`) | All 5 majors pillars + stablecoin Peg | Not 429 at the batch size in `route.ts:91-98`; `sparkline_in_7d.price` and `price_change_percentage_30d_in_currency` non-empty |
| `/live-data/news` (self-fetch) | News pillar, both profiles | Returns articles with `relatedAssets` populated — a self-fetch inside a route handler is deployment-sensitive |
| `/live-data/ohlcv` | §7.3.6 volatility improvement | Whether Binance.US fallback yields enough history for a 30–90d window |

A parallel route-health audit from the user's network should confirm these before Phase 2
ships. If the CoinGecko batch is throttled in practice, Phase 2 increases its visibility
(more surfaces showing gaps) even though it adds no new requests.

---

## 9. Methodology Guide updates

The Methodology Guide (Google Doc, per project memory) must be updated when methodology
changes. This spec triggers:

1. **Canonical scale statement** — 0–100, higher = safer, five bands with thresholds, and
   the §1.2 reasoning. Replaces any 1–10 or "lower = safer" language.
2. **Naming** — "Safety Score" (pending P1), with the direction stated wherever a number
   appears.
3. **Coverage & confidence** — that scores carry both, that missing data lowers confidence
   rather than the score, and what a low-coverage score does and does not claim.
4. **Fatal-flaw overrides** — the multiplicative-slash mechanism and its rationale.
5. **Per-profile methodology** — pillars, weights, and sources for stablecoin and
   cryptoAsset as shipped; staking's six dimensions and their conversion; the §3.3 band-
   boundary shift, flagged as a one-time visible change.
6. **What is deliberately not scored** — decentralization, audit risk, peg history,
   counterparty risk for majors (§7.3), with reasons.
7. **Cross-asset comparability limit** (§6.4, pending P5).
8. **Bond/commodity/futures profiles** (§6) — as *planned*, marked draft, not shipped.
9. **Public API scale note** — that `/api/v1/staking/opportunities` serves a legacy 1–10
   inverted scale during the deprecation window, and which field is canonical.

Also update in-repo:
- `docs/architecture/risk-framework.md` — cross-reference this spec; correct the §Why
  table, which lists three inconsistent systems and misses coin-discovery and pump-report.
- `DATA-AVAILABILITY.md` — asset-registry risk status after Phase 2.
- `CLAUDE.md` — `stakingProviders.ts` section, once `computeOverallRisk` is internal-only.

---

## 10. Open questions

| # | Question | Owner | Blocking |
|---|---|---|---|
| P1 | Rename user-facing "Risk Score" → "Safety Score"? | Product | Phase 2 copy |
| P2 | Accept staking band shifts at conversion boundaries (§3.3)? | Product | Phase 3 |
| P3 | Confirm pump-report stays outside the canonical scale (§4.5)? | Product | Phase 6 |
| P4 | Additive-forever vs hard deprecation for `/api/v1` (§5.3)? | Product + API | Phase 5c |
| P5 | Is cross-asset-class comparison a supported claim (§6.4)? | Product | Bond profile |
| P6 | Invest in score-history persistence (§7.4)? | Product | Risk History tab |
| E1 | Widen majors volatility from 7d sparkline to 30–90d OHLCV (§7.3.6)? | Eng | — |
| E2 | Add `/api/v1/*` request logging before any deprecation decision (§5.3)? | Eng | P4 |
| E3 | Reconcile backend `scoring/` bands (80/65/50/30) if it is ever reactivated (§3.4)? | Eng | — |

---

## 11. Summary

- The canonical scale is **0–100, higher = safer**, bands 80/60/40/20, vocabulary
  `low | moderate | elevated | high | critical`. This ratifies what `lib/risk/` and
  `lib/utils/risk.ts` **already both implement**.
- `lib/risk/` is the single engine; everything else is a thin adapter. Per-surface
  *dimensions* remain legitimate (staking, coin screening); per-surface *scales* do not.
- The brief's central premise — inverted polarity between schemes 1 and 2 — **does not
  hold**. The real defect is that twelve components render `N/A` because `overlay.ts`
  nulls `riskScore`, while a live composite for those same assets already exists. The
  asset detail page shows both answers in one viewport.
- `/risk-scores` **is already live** and better-sourced than the composite the brief
  proposes building. Deliverable 2's answer is: it shipped; wire it up; and Risk History
  must stay `N/A` because no score time-series exists.
- The only genuinely breaking change is `/api/v1/staking/opportunities`, where the
  polarity flip on the `max_risk` *filter* would silently invert results for MCP agents.
  It is quarantined into an additive phase and must never be mutated in place.
