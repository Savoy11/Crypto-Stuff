# T8 — Transfer Fees audit

Scope: `src/lib/data/transferFees.ts` (1,950 lines) + `src/app/(dashboard)/transfer-fees/page.tsx`.
Flagged as *the app's highest-risk surface for stale data*: a hand-maintained fee table with no
automated refresh, layered under live token prices so a stale fee renders as a confidently wrong
dollar figure.

> **T1-class caveat.** Per-exchange fee spot-checks against each venue's *current published
> schedule* require live external lookups (and, for most venues, an API key) — IP/credential-
> dependent, so the live accuracy pass is deferred. Everything below (path-finding logic,
> table integrity, internal plausibility, honesty labeling) is verified offline.

## Logic & integrity — verified correct (8 new tests)

`src/lib/data/__tests__/transferFees.test.ts` locks in:

- **`findTransferPaths()`** — direct routes are always built first and multi-hop only when no
  direct path exists; results sort **viable-first, then cheapest**; exactly one path is flagged
  recommended (the cheapest viable); a **direct path's total = the exchange fee only** (on-chain
  gas is shown for context but not double-counted — a real prior bug, per the code comment); a
  **wallet destination yields direct routes only** (never a spurious multi-hop); same-source/dest
  and unknown-exchange both return `[]`.
- **EVM address-collision warning** — `EVM_NETWORKS` is asserted to equal *exactly* the set of
  `0x`-address networks in `NETWORKS` (7: erc20, bep20, polygon, arbitrum, base, optimism,
  avalanche). The warning fires on every `0x`-network route. This is the single most expensive
  user error the page prevents (right address, wrong EVM chain → usually unrecoverable), so its
  trigger set is now regression-guarded.
- **Table integrity** — all 543 `(exchange, coin, network)` entries reference a valid network,
  carry finite non-negative `withdrawFee`/`minWithdraw`, and have no duplicate network within a
  coin; exchange ids are unique; every coin key is a known `CoinId`.

## Accuracy (offline plausibility) — table is realistic but past its freshness window

An offline scan (rough reference prices) found **no unit errors, no absurd fees, and no dead
entries** (no stablecoin withdrawal > $50, nothing > $100, no entry with both withdraw+deposit
disabled). High-traffic pairs match well-known real-world values:

| Pair | n | min–max | median | reality check |
|---|---|---|---|---|
| BTC / bitcoin | 29 | 0–0.001 | 0.0005 | ✓ typical CEX BTC fee |
| ETH / erc20 | 29 | 0–0.01 | 0.0035 | ✓ |
| USDT / erc20 | 27 | 1–10 | 5 | ✓ (erc20 is the expensive one) |
| USDT / trc20 | 26 | 1–2 | 1 | ✓ (trc20 ≈ 1 USDT) |
| USDC / solana | 12 | 0–1 | 1 | ✓ |
| SOL / solana | 15 | 0.008–0.02 | 0.01 | ✓ |

Zero-fee entries all belong to Gemini / Coinbase, which really do offer free withdrawals on some
assets — consistent, not errors.

**However:** `TRANSFER_FEES_LAST_VERIFIED = '2025-06-01'` → **~415 days old**, well past the
table's own `STALE_AFTER_DAYS = 120`. So the table is internally sound but formally stale, and I
did **not** re-verify individual fees against live schedules (deferred). The last-verified date
was deliberately **left unchanged** — bumping it without a live re-check would be a false claim.

## Honesty labeling — already strong; two tightenings applied

The page already surfaces provenance well: `getTransferFeeProvenance()` drives a staleness banner
("⚠ Withdrawal fees may be out of date … verified X days ago. Network gas is live; withdrawal
fees are static estimates — always confirm on the exchange"), and the T1 "motion reads as
freshness" hazard is addressed in copy ("EVM gas is estimated from current price × typical gas
units. Other networks use static estimates"). The BTC-live-vs-rest split is shown in the fee
status bar. Two fixes for full honesty:

- **Top data badge** said `status="live" (CoinGecko + mempool.space)` — overstated, since only
  BTC gas is truly live. Changed to `status="estimate"` with source **"BTC live · other gas
  estimated"** so nothing at a glance reads static fees as live.
- **Header count** said "25 exchanges and 16 networks" — actually **30 exchanges and 18
  networks**. Corrected (and the stale `16 coins × 16 networks` line in CLAUDE.md → `22 coins ×
  18 networks`).

## Recommendation — this table can be sourced live for the tier-1 venues

Several exchanges expose authoritative withdrawal-fee config (fee, min, withdraw/deposit-enabled,
per coin+network) that would eliminate staleness for the highest-traffic venues:
- **Binance** `GET /sapi/v1/capital/config/getall` (keyed) — returns `networkList` with
  `withdrawFee`, `withdrawMin`, `withdrawEnable`, `depositEnable`. The single best source.
- **OKX** `/api/v5/asset/currencies`, **Bybit** `/v5/asset/coin/query-info`, **KuCoin**
  `/api/v3/currencies`, **Gate.io** `/wallet/withdraw_status`, **HTX/MEXC/Bitget** currency-config
  endpoints — all expose per-network withdrawal fees.

Suggested shape: a `/live-data/transfer-fees` route that fetches Binance `getall` (plus a few
tier-1 venues) server-side using keys from the existing provider config, caches daily, and
**falls back to this static table** when a venue is unkeyed or unreachable — mirroring the
existing live/estimate provenance model. Start with Binance (covers the most pairs) and expand.
The static table stays as the fallback and for venues without a public/keyed endpoint.

## Changes in this PR
- `src/lib/data/__tests__/transferFees.test.ts` (new, 8 tests — logic + integrity + EVM guard).
- `src/app/(dashboard)/transfer-fees/page.tsx` — data-badge `live → estimate`; header count fix.
- `CLAUDE.md` — corrected transfer-fee dimensions + provenance note.
- `docs/assessments/T8-transfer-fees-audit.md` — this report.

## Deferred (needs live/keyed access)
Per-exchange fee spot-check against current published schedules; and, if approved, the
`/live-data/transfer-fees` live-sourcing route above.
