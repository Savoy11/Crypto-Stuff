# T9 — Staking page audit

Scope: `src/app/(dashboard)/staking/page.tsx`, `src/app/live-data/staking-rates/route.ts`,
`src/lib/data/stakingProviders.ts`. Audits (1) APR/APY rate accuracy & provenance and
(2) the six-dimension risk-score content. Wave-3 task; depends on R2 (canonical scale).

> **T1-class caveat up front.** The rate-accuracy half depends on reaching ~17 external
> staking endpoints (Lido, Marinade, Jito, Subscan, Cosmostation, …). That reachability is
> **IP-dependent** and can't be exercised from the remote build sandbox, so live *values*
> could not be confirmed here. This audit does the parts that are verifiable offline
> (labeling honesty, unit handling, risk-score content) and **explicitly flags** what needs
> a run on a normal network. Failure mode is safe: when a live fetch fails the route serves a
> static fallback **labeled `estimate`**, never a fabricated "live" number.

---

## Part 1 — Rate accuracy & provenance

### ✅ What's correct (verified offline)
- **Provenance is honest by construction.** `staking-rates/route.ts` seeds every key as
  `estimate` and only flips to `live` after a successful parse. Derived numbers are kept
  `estimate` even when computed from a live reading — the Lido-derived exchange offsets
  (`ankr_eth`, `coinbase_eth`, `kraken_eth`, `binance_eth`), the Solana `native_sol` average,
  and the `native_matic` offset are all explicitly re-marked `estimate`. This is the right
  call and avoids passing one provider's live number off as another's.
- **UI does not present estimates as live.** `aprDisplay()` shows the green **LIVE** badge
  only when the *provider's own* `liveAprKey` resolved to a `sources[...] === 'live'` value;
  defunct providers show a struck-through **ADVERTISED** tag. Both are honest.
- **Unit handling is defensive.** `normPct()` (raw < 1 → ×100) plus per-source `clamp()`
  ceilings guard against the classic APR-vs-decimal error; inflation-derived chains divide by
  a bonded-ratio constant to approximate real yield.

### ✅ Fix applied — per-row provenance parity
Non-live *estimates* previously carried **no per-row marker** — provenance was disclosed only
in the page footer, so an unlabeled number read as authoritative. The equities module already
tags non-live prices with an amber `ref`. Added the equivalent amber **`est`** marker on every
non-live, non-defunct staking rate (`staking/page.tsx`), so each row now states its provenance
inline (LIVE / est / ADVERTISED).

### ❗ Needs a live run (IP-dependent — circle back on a normal network)
1. **Run the live harness:** `npm run dev`, then `node scripts/test-live-data.mjs` and read
   the `staking-rates` response's `sources` map — count how many keys are actually `live` vs
   `estimate` from your IP. (There is no `npm run audit` script on this branch; the harness is
   `scripts/test-live-data.mjs`.)
2. **Stale fallback values.** The `FALLBACK` table is shown whenever a fetch fails. At least
   one entry is known-stale: **`jito_sol: 7.5`** — T1 measured the real jitoSOL rate at
   **5.32%** (the endpoint `kobe.mainnet.jito.network/api/v1/apy` had moved/404'd). A degraded
   render (server-side, or any dead endpoint) would over-state that yield by ~40%. Once live
   reachability is confirmed, refresh the fallbacks against each provider's current published
   rate — do **not** guess new statics blind, since a wrong static is the same failure in a
   new coat.
3. **Endpoint validity sweep.** Several endpoints are plausibly dead or moved and can only be
   confirmed live: `api.rocketpool.net/api/apr`, `api.binance.org/v1/staking/asset` (Binance
   Chain/BeaconChain was sunset), `js.adapools.org/global.json`, the Subscan `staking_apy`
   POSTs, and the Cosmostation/`*-ia` LCD hosts. AVAX is already, correctly, left on fallback
   (its info endpoint yields no APY). For each, the tell is a provider whose row never shows
   **LIVE** on a good network — that's a moved endpoint to re-point, exactly the jitoSOL
   pattern.

---

## Part 2 — Risk-score content (fully audited offline)

Method: parsed all provider `risks` profiles, recomputed the weighted composite with the
**documented** weights, and checked cross-provider consistency
(`scratchpad/audit-staking-risk.mjs`).

### ✅ Passes
- **47 providers** (not 18 — CLAUDE.md was stale; corrected in this PR). Every provider has a
  complete six-dimension profile with all values in **1–10**. No missing dims, no out-of-range
  values, no fabricated placeholders.
- **Documented weights are applied exactly.** `computeOverallRisk` uses counterparty 0.25,
  custody 0.20, liquidity 0.20, contract 0.15, slashing 0.10, regulatory 0.10 — matching the
  CLAUDE.md spec.
- **Composite ordering is sensible and defensible.** Celsius (defunct) is the clear outlier at
  the top (composite 8.90 → **critical**); CeFi exchanges cluster elevated→moderate; liquid
  protocols and self-custody wallets cluster low. Custody scores cluster correctly by model
  (CeFi ~8, wallets 1–2, liquid 2–3); exchanges that cover slashing all carry slashing 1;
  restaking protocols (EtherFi, Renzo, Kelp, Puffer, Babylon, Lombard) correctly carry the
  highest contract (6–8) and slashing (5–6). No assertion violations.

### ⚠️ Observations (judgment calls — reported, not "fixed")
- **Band-boundary brittleness.** A cluster of near-identical ETH LST/restaking protocols
  straddles the low/moderate line within a ~0.35 composite window: `stader` 2.65 (low),
  `stakewise` 2.85 (moderate), `frax` 2.90 (moderate), `swell` 3.00 (moderate) vs `puffer`
  2.80 / `origin-protocol` 2.80 (low). The *scores* are reasonable; the hard band cut just
  splits statistically-indistinguishable protocols into different labels. Consider surfacing
  the numeric composite alongside the band on these cards so the band edge isn't over-read.
- **`keplr` base `liquidityRisk = 7`** vs other self-custody wallets at 5 (`ledger-live`,
  `trust-wallet`, `exodus`). Defensible if Keplr is treated as Cosmos-only (all 21-day
  unbonding, uniformly illiquid) while the others carry a mix with some liquid options — but
  worth a deliberate confirm, since the multi-asset wallets set base 5 and override per-asset.
- **Model-coverage gap for LP-style "yield" (`uniswap`).** Uniswap scores composite 2.25 →
  **low**, with `slashingRisk 1` (correct — LPs aren't slashed). But the dominant risk of an
  LP position is **impermanent loss**, which the six-dimension *staking* rubric has no axis
  for — it's only partially absorbed into contract/liquidity. The YieldType system already
  flags this yield as not-really-staking; the risk composite doesn't yet reflect that its main
  risk is unmodeled. A `low` badge on a concentrated-LP position is arguably optimistic. Same
  caveat applies to `aave` (lending) and `convex` (LP/governance) more mildly.

None of the Part-2 observations are scoring *errors* that warrant silently rewriting curated
editorial values (the task explicitly says report, don't revert). They're consistency notes
for the next content pass.

---

## Changes in this PR
- `staking/page.tsx` — per-row **`est`** provenance marker on non-live estimated rates.
- `CLAUDE.md` — provider count 18 → 47; representative-names list refreshed; directory comment.
- `docs/assessments/T9-staking-audit.md` — this report.

## Deferred (needs the user's network)
Live `sources`-map classification, fallback-value refresh (starting with `jito_sol`), and the
dead-endpoint sweep — all in Part 1's "needs a live run" list.
