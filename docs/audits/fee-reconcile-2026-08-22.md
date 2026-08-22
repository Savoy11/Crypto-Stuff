# Fee reconcile — 2026-08-22 (owner machine)

First machine verification of the withdrawal-fee table since it was compiled on
2025-06-01. Run with `npm run fee-reconcile`, which reads each exchange's own
public API and diffs it against the stored table.

## Result

| | |
|---|---|
| Curated rows | 543 |
| Reconciled against a live reading | **115** (21.2%) |
| Confirmed (table already correct) | 15 |
| Corrected | **90 applied**, 2 held |
| Reported suspended (state, not a schedule) | 8 |
| No live source — still the worksheet job | 428 |

## Was it our bug or genuine staleness?

**Staleness.** An 80% mismatch rate demanded that question before any edit. The
answer is in the distribution: every one of the seven exchanges showed a *mix*
of increases and decreases, with factors clustered in 0.1x–8x. A units or
chain-mapping bug produces the opposite signature — one exchange uniformly off
by a constant like 1e6 or 1e8. That signature is absent.

The direction of drift is coherent with the wider picture: most fees fell
(network costs collapsed — Ethereum now trades sub-gwei), while a few rose
(ATOM, POL on ERC-20, and several exchanges' flat ERC-20 token fees, which lag
actual gas badly in the other direction).

## What was NOT applied, and why

**Two rows proposing a fee of exactly zero** — Bitfinex DOT (0.1 -> 0) and
Bitget USDC/BEP-20 (1 -> 0). A zero renders as **"Free"** in the UI, which is
the single most consequential value to get wrong, and a parser returning 0 is
indistinguishable from a field that was absent and defaulted. Bitfinex is the
specific concern: its fee map is a `[deposit, withdrawal]` array, so an
unsupported currency could plausibly read as `[0, 0]`. These need a spot-check
against each exchange's own fee page before they go in.

XT.com USDC/BEP-20 (1 -> 0.001) WAS applied: it is non-zero, so it does not
render as "Free", and it is what the API reports.

## Eleven rows are marked dynamic, not fixed

The first run reported **0 dynamic** because detection only checked our own
notes. But readings like `0.45360565`, `1.177832` and `20.899661` are not posted
fee schedules — they are computed, almost certainly USD-denominated fees
converted to coin units at the moment of the read, and they will be different
tomorrow. Freezing one into a static table pretends a moving number is fixed.

Those eleven rows now carry a note saying the exchange quotes the fee
dynamically and that the stored value is a dated reading. The reconcile script
now detects this by shape (six or more significant figures) as well as by note,
so future runs categorise them correctly instead of proposing them as edits.

## The date did not move

`TRANSFER_FEES_LAST_VERIFIED` remains **2025-06-01**. It means "the whole table
was verified on this day", and 115 of 543 rows is not that. The 428 uncovered
rows — which include the highest-traffic venues, Binance, Coinbase, Kraken, OKX
and Bybit, none of which expose a keyless fee endpoint — remain the
`npm run fee-worksheet` job, and only finishing them can move the date.

Note also that all seven reconciled exchanges are live-overlay sources, so the
app already showed their live values at runtime. These corrections improve the
**fallback** layer used when the live fetch fails — worth doing, and a smaller
win than the row count suggests.
