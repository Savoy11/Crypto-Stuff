# T12 — Equity Backtests audit + fine-tune

Scope: `src/app/(dashboard)/equities/backtests/page.tsx`. Audit the page-layer backtest, then
fine-tune. Shared indicator math (`lib/utils/indicators.ts`) and the shared engine
(`lib/utils/backtest.ts`) are out of scope (verified in T2).

> **Key scope finding:** this page does **not** use the shared `backtest.ts` engine — it defined
> its **own inline `runBacktest`**. That inline engine was therefore *not* covered by T2 and is
> fully in scope here. It has been audited (below), extracted to a unit-tested module, and
> extended with transaction costs.

> **T1-class caveat.** A live cross-check needs OHLCV egress (IP-dependent). Correctness is
> verified by static analysis + unit tests; the live value comparison is deferred.

## Audit — the inline engine is correct

- **No lookahead.** The position held during bar `i` is `desired[i-1]` (the signal computed on
  the prior bar) earning `close[i]/close[i-1]-1`. Confirmed by a reconciliation test.
- **Benchmark parity.** Buy & hold compounds every bar return over the **identical window** with
  the **identical starting capital** (both begin at 1 / $100). A test asserts strategy ==
  buy-hold when always-long, and buy-hold return == raw first→last price return.
- **Trade accounting reconciles with the equity curve.** Entry is booked at the executed
  position's price (`close[i-1]` on the bar the strategy goes long) and exit at `close[i]` when
  the signal drops; the round-trip's gross return equals the compounded in-market equity gain
  (tested to 6 dp).
- **Statistics & units correct.** CAGR is null under ~6 months (guarded); max drawdown is
  peak-to-trough on strategy equity; Sharpe is mean/stdev × √barsPerYear with `barsPerYear`
  correctly matched to the candle frequency (1Y→252 daily, 5Y→52 weekly, MAX→12 monthly, which
  matches the `security-ohlcv` intervals `1d`/`1wk`/`1mo`); win rate and exposure guarded.
  `formatPercent(x)` treats `x` as already-a-percent (no double-scale), and the values passed in
  are already `×100` — so displayed percentages are right.
- **Short histories / recent IPOs.** `candles.length < 50 → null → LiveUnavailable("needs at
  least 50 bars")`. No NaN / blank / flat line.
- **Split/dividend adjustment.** The source candles come from `/live-data/security-ohlcv`; the
  split-adjustment correctness of that route is fixed in **T11 (#31)**. This page consumes the
  route output correctly and is not re-fixed here (avoids a duplicate route change across PRs).

## Fine-tune — modelled transaction costs (the one real realism gap)

Before, the only realism gap was that costs were **honestly disclosed but not modellable** — the
UI said "no transaction costs" but gave no way to see their impact, so every result read as an
achievable frictionless return. Added:

- **Extracted** the inline engine to a pure, testable module
  `src/lib/utils/equityBacktest.ts` (`runEquityBacktest`) — behaviour-identical at zero fees.
  **7 unit tests** (no-lookahead reconciliation, benchmark parity, always-flat, fee drag on a
  completed round trip, single-side fee for an unsold position, buy-hold single entry fee, CAGR
  null-guard).
- **Transaction-cost control** (per side: 0 / 0.05% / 0.10% / 0.25%). The strategy is charged
  once per side on every position change (each entry and each exit); buy & hold is charged a
  single entry-side fee (one purchase, held) so the benchmark stays fair.
- **Honest labeling updated**: the header and disclaimer now say costs are optional-and-applied
  while **slippage, dividends, and taxes remain unmodelled**; the trades table notes its P&L is
  **gross** of fees while the headline metrics include the selected fee.

## Observations (reported, not changed)

- **Trade-list P&L is gross of fees** by design (it's the raw price round trip); headline
  metrics and the equity curve are net. Labeled inline.
- **A position still open at the window end pays no exit fee** — it hasn't been sold, only
  force-closed for reporting. Defensible; covered by a dedicated test.
- **Sharpe uses no risk-free rate** (excess return ≈ raw return). Standard simplification for a
  teaching tool; the header defines it plainly.

## Verification
`tsc` clean · `eslint` clean · `vitest` 118 pass (7 new) · `npm run build` green ·
`npm run css:build` run (no new utility classes). Live reference cross-check deferred
(IP-dependent).

## Changes in this PR
- `src/lib/utils/equityBacktest.ts` (new, extracted + fee support) + `__tests__/equityBacktest.test.ts` (new, 7 tests).
- `src/app/(dashboard)/equities/backtests/page.tsx` — use the extracted engine; fee-tier control; updated honesty labeling.
- `docs/assessments/T12-equity-backtests-audit.md` — this report.
