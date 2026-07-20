# ⚠️ R2 Phase 2 — LIVE VERIFICATION PENDING (circle back)

**Status: code-complete and build-verified, but NOT confirmed against live data.**
This page exists so the outstanding check is not forgotten.

## What Phase 2 did

Wired the live risk composite (`/live-data/risk-scores`, the 5-pillar model) onto
assets so the ~12 components that showed **N/A** now read a real score:

- NEW `frontend/src/lib/api/live/riskScores.ts` — `fetchRiskScoreIndex()` (fetch +
  index by asset id), `applyRiskComposite()` (join score/band onto an asset,
  unscored stay null), shared query key `['risk-scores']`.
- `hooks/useAssets.ts` — `useRiskScoreIndex()` hook; `useAssetsWithStore()` joins
  the composite onto registry assets.
- `assets/[id]/page.tsx` — the detail asset is enriched, so the gauge (~line 485)
  and the same-page live composite panel now draw from one source (resolves the
  old contradiction of N/A gauge beside a real panel).
- Phase 1 (prerequisite, done here too): deleted the 108 fabricated
  `assetCatalog.ts` risk literals; `overlay.ts` no longer nulls risk and its
  stale "no free live source" comment is corrected.

Verified: `tsc` clean · `eslint` clean · `vitest` 116 pass · `npm run build` green.

## ❗ Why it still needs a live check (the reason to circle back)

R1's spec §8: the acceptance criterion is **"the asset registry, asset detail,
heatmap, and `/risk-scores` all show the SAME number for the same asset."** That
depends on live **DefiLlama / CoinGecko / news** data being reachable from the
running environment, which is **IP-dependent**. This was implemented in a remote
build sandbox where that data could not be reliably reached, so the same-number
check was **not** performed.

**Failure mode is safe, not silent-wrong:** if the composite route returns nothing
(geo-block / rate-limit), `applyRiskComposite` leaves assets `null` → the UI shows
**N/A**, exactly as before Phase 2 — it never fabricates a score. So merging this is
not dangerous; it simply may not yet *show* scores until verified on a good network.

### To verify (on a normal network)
1. `cd frontend && npm run dev`.
2. Open `/risk-scores` — confirm assets are scored (route returns data from this IP).
3. Open `/assets` — the risk column should show real bands/scores, not N/A.
4. Open `/assets/<id>` for a scored asset (e.g. `/assets/usdc`) — the gauge (~485)
   and the live composite panel (~611) must show the **same** number.
5. Confirm the heatmap and any registry filters agree.
If `/risk-scores` itself is empty from your network, that's a data-reachability
problem (T1-class), not a wiring bug — check DefiLlama/CoinGecko/news egress.

## Remaining Phase 2 sub-items (not yet done — finish with the live check)

These were deferred because they can't be meaningfully verified without live data
and/or need a full-component read:

- [ ] `components/analytics/HistoricalScoreChart.tsx` → render `LiveUnavailable`
      (no score time-series source exists; spec §7.4 — do NOT synthesize history).
      Currently uses `useAssetRiskScores` which has no live backend.
- [ ] `components/assets/RiskScoreBadge.tsx` → surface `coverage` (low-coverage
      caveat affordance) per spec 2.4.
- [ ] Component sweep to confirm real scores / honest N/A: `AssetCard`,
      `AssetTable`, `AssetComparison`, `AssetFilters` (verify `riskBand:'all'`
      still passes unscored assets), `RiskHeatmap`, `LiquidityMonitor`,
      `PopoutContent`, `SearchInput`, `analytics/ScoreBreakdown` (re-point at
      `CompositeRisk.dimensions`).
- [ ] `DATA-AVAILABILITY.md` — flip the asset-registry risk column 🔴 → 🟢 Derived
      once the live check passes.

## Later R2 phases (separate work, not part of this)
Phase 3 (staking canonical), Phase 4 (coin-discovery converter), Phase 5 (additive
public API `safetyScore`/`band`/`max_safety` + v1 request logging), Step 5 ("Risk
Score" → "Safety Score" copy rename, approved). See `docs/architecture/risk-scale-spec.md`.
