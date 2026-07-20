# T11 — Equity Technical Analysis page audit

Scope: `src/app/(dashboard)/equities/technical-analysis/page.tsx` (468 lines) and its data
source `src/app/live-data/security-ohlcv/route.ts` (explicitly in scope — the split/dividend
and provider-consistency questions are about that route). **Shared engine out of scope**
(`lib/utils/indicators.ts` — verified in T2; suspected math errors are reported, not edited).

> **T1-class caveat.** The live cross-check against a charting reference needs OHLCV egress
> (Yahoo/Tiingo/FMP), which is IP-dependent and unavailable in the build sandbox. The
> data-shape and adjustment logic below are verified by static analysis + a unit test; the
> live value comparison is deferred to a normal network.

## 🔴 Fixed — split/dividend adjustment was inconsistent across providers (the headline bug)

The spec's exact warning — *"an unadjusted split will look like a catastrophic price crash to
every indicator"* and *"indicator output must not change based on which provider answers"* —
was live in the route:

| Provider | Before | Problem |
|---|---|---|
| Yahoo (`fetchYahooOhlcv`) | read `indicators.quote[].close` | **split-adjusted but not dividend-adjusted**; `adjclose` ignored |
| Tiingo (`fetchTiingoOhlcv`) | read `row.close` (raw) | **NOT split-adjusted** — `adjClose`/`adjOpen`… ignored → split cliff |
| FMP (`fetchFmpOhlcv`) | read `row.close` (raw) | raw close → split cliff |

Because the ladder is Yahoo → Tiingo → FMP, most users hit Yahoo (no cliff), but **any Tiingo/
FMP failover — or a reordered/keyed setup — produced a catastrophic cliff** on split stocks
(NVDA 10:1, AAPL 4:1, TSLA, AMZN, GOOGL — all in the catalog/screener), and the same symbol
gave **different indicator output depending on which provider answered**.

**Fix (all three now on a consistent split+dividend-adjusted basis):**
- New pure helper `src/lib/utils/ohlcvAdjust.ts` → `adjustCandles(candles, adjCloses)`:
  rescales each bar's OHLC by `adjClose/close`, sets `close = adjClose`, and **passes a bar
  through unchanged** when the adjusted close is missing/non-finite or `close <= 0` (never NaN,
  no divide-by-zero). Covered by 5 unit tests (split-cliff removal, high/low ordering
  preserved, safe passthrough, factor-1 no-op).
- **Yahoo** now carries the `adjclose` array through `adjustCandles` → fully split+dividend
  adjusted (was split-only). Falls back to the raw (split-adjusted) bar if `adjclose` is absent
  → no regression.
- **Tiingo** now uses its `adjOpen/adjHigh/adjLow/adjClose/adjVolume` fields (with `?? raw`
  fallback).
- **FMP** applies the `adjClose` factor when present (with raw fallback).

Verified: `tsc` clean · `eslint` clean · `vitest` (5 new / suite green) · `npm run build` green.

## Verified correct (page layer)

- **Session/weekend/holiday gaps do NOT distort indicators.** The engine is index-based — each
  candle is one period regardless of calendar gap — so overnight/weekend/holiday gaps in a
  daily series don't affect SMA/RSI/MACD warm-up or values. This is the right behaviour for a
  24/7 engine reused on a session-based market; no calendar-time math is (incorrectly) done.
- **Insufficient-data / recent IPOs handled.** Signal summary and pattern detection gate at
  `candles.length >= 30`; below that the sidebar shows "Needs at least 30 candles" and the
  screener returns nulls / "No data". The chart renders for any `candles.length > 0` and shows
  `LiveUnavailable` at zero — no NaN, blank canvas, or misleading flat line.
- **Provider-failover shape consistency.** All four fetchers (custom, Yahoo, Tiingo, FMP)
  normalise to the same `OhlcvCandle` shape and sort ascending by `time`, so indicator output
  no longer depends on which provider answers (adjustment now consistent too, per the fix).
- **Every indicator control affects computation.** All **18** page indicators
  (`ema/sma 20/50/200`, `bb`, `keltner`, `donchian`, `vwap`, `psar`, `ichimoku`, `rsi`, `macd`,
  `stoch`, `stochrsi`, `cci`, `williamsr`) have matching `INDICATOR_RENDER` functions — zero
  silent no-op toggles. Range and chart-type selectors are wired into the query key / render.
- **Screener** gates each of 24 symbols at `>= 30` candles, derives RSI/SMA50/signal from the
  same engine, and degrades to "No data" per row on short/failed history.

## Observations (reported, not changed)

- **VWAP on daily candles is semantically loose.** VWAP is an intraday (session-reset)
  indicator; over a multi-month daily series it becomes a cumulative volume-weighted average
  from the range start, not a meaningful "VWAP". This is shared-registry behaviour (also on the
  crypto page) — reported per the report-don't-edit rule. Consider hiding VWAP for daily+
  equity ranges in a future pass.
- **Volume is left unadjusted across splits.** `adjustCandles` rescales price only; a split
  still steps volume (e.g. ×4 more shares post-split). Price is what makes indicators read a
  crash, so this is the right priority; volume-based indicators (VWAP, volume panel) see a step
  at the split date. Minor; documented.

## Deferred (needs a normal network / a key)

- Live cross-check of 2–3 symbols (incl. a recent-split name like NVDA) against a charting
  reference to confirm the adjusted series matches.
- **FMP `adjClose` confirmation.** Whether `/stable/historical-price-eod/full` carries
  `adjClose` varies by plan; if a split stock still shows a cliff on the FMP path, switch to
  `/stable/historical-price-eod/dividend-adjusted`. Needs an FMP key to verify.

## Changes in this PR
- `src/lib/utils/ohlcvAdjust.ts` (new) + `__tests__/ohlcvAdjust.test.ts` (new, 5 tests).
- `src/app/live-data/security-ohlcv/route.ts` — Yahoo/Tiingo/FMP adjusted-basis fix.
- `docs/assessments/T11-equity-ta-audit.md` — this report.
