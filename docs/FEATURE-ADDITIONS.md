# Feature Additions — Equities & Funds Build (2026-07-07)

Per the standing instruction ("if you determine there is a feature worth adding
you have permission to add it and provide a document noting the addition"),
this documents everything added beyond the explicitly requested Equities and
ETF/Mutual-Fund modules, and why.

---

## 1. Suite module registry + entitlement system (Phase 0, brought forward)

**What:** `src/lib/modules/registry.ts` defines the module contract from
docs/ROADMAP.md (core / crypto / equities / funds). The sidebar now renders
from this registry in labelled sections, drag-reorder works per section, and
`useEntitlementStore` + `ModuleGate` let modules be switched off — a disabled
module disappears from navigation and its pages show an unlock notice.
A **Suite Modules** panel at the top of Integrations toggles them.

**Why:** The whole "sold together or separately" strategy hangs on modules
being real boundaries, not just folders. Building Equities/Funds *inside* the
module system from day one means they never need retrofitting. Entitlements
are client-side placeholders that become license-driven when auth/billing land
(Phase 6).

## 2. Fee Drag Analyzer (fund detail pages)

**What:** Every fund page projects what its expense ratio costs over 10/20/30
years versus a 0.03% index fund, with adjustable investment amount and gross
return. Pure client-side math (`computeFeeDrag` in `fundCatalog.ts`).

**Why:** Expense-ratio compounding is the single most decision-relevant fact
about a fund and the one every issuer page buries. It turns the Fund Registry
from a quote table into an advice tool — the same educational stance as the
Celsius warning on the Staking page.

## 3. 52-Week Range indicator (equity & fund detail pages)

**What:** A gradient bar showing where the current price sits between the
52-week low and high, computed from the same 1-year history the chart already
fetches (no extra request).

**Why:** Cheap to derive, high information density, standard on institutional
terminals.

## 4. Market news with sentiment tagging (`/live-data/market-news`)

**What:** Multi-feed RSS route (Yahoo Finance per-ticker + Yahoo/MarketWatch/
CNBC general) with keyword sentiment scoring and dedupe, mirroring the crypto
news route's architecture. Surfaced on both detail page types.

**Why:** News-with-sentiment is a core CAEP feature in the crypto module;
the equities module would feel like a different product without it.

## 5. Multi-source quote ladder with honest fallbacks

**What:** `/live-data/security-quotes` tries FMP (if `FMP_API_KEY` is set) →
Yahoo Finance spark (keyless) → Stooq CSV (keyless) → static catalog reference
prices. Reference-sourced numbers are always labelled `ref` in the UI, and
KPIs that need live data say "requires live quotes" instead of faking values.

**Why:** Follows the repo's strict-live convention (`LiveUnavailable`): never
fabricate, always render. Also means the pages work offline and get better
automatically when the user adds a free FMP key.

## 6. Production build fix (pre-existing bug)

**What:** `/technical-analysis` used `useSearchParams()` without a Suspense
boundary, which made `next build` fail (dev mode never surfaces this). Wrapped
the page body in `<Suspense>`.

**Why:** Blocking — a clean production build was needed to validate this work,
and it will block any future deployment (Roadmap Phase 6).

---

# Addendum — Equities parity build (same day, second session)

Requested: news, social, technical analysis, and backtesting sections for the
stock module, mirroring the crypto versions. Discretionary choices made while
delivering that:

## 7. Shared TA engine (refactor, not a feature)

`CandlestickChart.tsx` and `indicatorRegistry.ts` moved from the crypto
technical-analysis folder to `components/charts/` — the module boundary rules
forbid equities pages importing crypto module internals, and the whole TA
engine (60+ indicators, signal aggregation, pattern detection in
`lib/utils/indicators.ts`) was already asset-agnostic. Crypto pages updated to
import from the shared location; zero behavioural change.

## 8. Real strategy backtester instead of curated case studies

The crypto Backtests page is a set of narrative depeg case studies with
simulated scores. For equities, real daily/weekly history is free — so
`/equities/backtests` runs actual rules-based simulations (SMA 10/40
crossover, RSI mean-reversion, MACD momentum) bar-by-bar with no lookahead,
benchmarked against buy & hold, reporting total return, CAGR, max drawdown,
annualized Sharpe, win rate, exposure, and the trade list, with an equity-curve
chart. Prominently labelled educational / no costs modelled.

## 9. Ticker detection + category classification in market news

`/live-data/market-news` now classifies each story (earnings / analyst / macro
/ M&A / dividend / market) and tags catalog tickers via company-name and
cashtag matching (1–2 letter tickers require a `$` prefix to avoid
false positives). Ticker chips on news cards deep-link to stock detail pages.

## 10. StockTwits + Reddit finance social feed

`/live-data/stock-social` aggregates r/stocks, r/investing, r/StockMarket, and
r/wallstreetbets plus StockTwits streams — both keyless. StockTwits authors'
self-declared Bullish/Bearish labels are used where present (higher quality
than keyword scoring); per-symbol sentiment summary bars mirror the crypto
Social page's overview.

## 11. Momentum screener tab on Equity TA

The crypto TA page has a screener; the equity version screens 24 large caps
for RSI(14), price vs SMA50, and the aggregate signal verdict, sorted to
surface overbought/oversold names. Bounded symbol list to keep request
fan-out reasonable.

---

# Addendum — Watchlist & Portfolio accuracy audit

Requested: confirm assets are pulled accurately and labeled correctly in the
Watchlist and Portfolios sections. Findings and fixes:

- **Watchlist didn't persist** despite its own tooltip claiming it did — the
  list lived in React state only. Now saved to localStorage
  (`caep:watchlist:v1`), seeded once on first visit, and an empty list stays
  empty. The dead "New List" button (it set state nothing rendered) was
  removed and the copy now matches actual behavior.
- **Wrong CoinGecko ids in the portfolio coin list** meant two coins could
  never price: USDP used `pax-dollar` (canonical id: `paxos-standard`) and
  SNX used `synthetix-network-token` (canonical id: `havven`). Both fixed —
  worth one live spot-check that USDP/SNX prices now populate.
- **Polygon mislabeled**: the portfolio picker offered only legacy MATIC
  labeled as "Polygon" while the Asset Registry tracks POL. Added POL
  (`polygon-ecosystem-token`) as the primary entry and relabeled the legacy
  token "Polygon (legacy MATIC)" so saved portfolios keep resolving.
- **Ten claimed assets missing from the registry universe** (which is also the
  watchlist's add-list): XRP was mapped for live quotes but had no catalog
  entry; DOGE and the eight DeFi tokens in `assetList.ts` (UNI, AAVE, LINK,
  MKR, SNX, CRV, LDO, GRT) existed in dropdowns/docs but not in the registry.
  All ten added with catalog metadata + live-quote mappings (registry is now
  108 assets).
- **Watchlist truncated the catalog** at `pageSize: 100`, silently hiding
  assets at the end of the list from search. Raised above catalog size.
- **Verified sound**: portfolio localStorage persistence, allocation
  validation (sums to 100%, duplicate detection), P&L math
  (`value = target × price/entry`), backtest date-price plumbing, weighted
  risk scoring, and the live/partial/error source labeling on the prices
  routes. End-to-end browser test confirmed add → reload → persist and that
  all ten added assets are searchable.


---

# Addendum — App-wide accuracy audit (all sections)

Six parallel audits swept every section for the same bug classes found in the
watchlist/portfolio audit. ~30 findings were confirmed and fixed; highlights:

**Wrong data (high severity, fixed)**
- Alerts peg monitor: USDP used the wrong CoinGecko id — a real depeg could
  never fire while the page claimed 9 assets checked.
- Wallets: all six non-Ethereum EVM chains queried Ethereum mainnet, showing
  the wrong chain's balance under a confident chain label. Per-chain RPCs now.
- Asset detail header: an operator-precedence bug rendered negative 24h moves
  green with a "+"; peg-deviation color/value were fed fractions instead of
  bps (always green, 10,000× too small).
- Staking: providers without their own live-rate feed displayed a different
  provider's rate (e.g. Lido's stETH APR on CeFi cards) with a LIVE badge; the
  rates route also marked arithmetic offsets of Lido's rate as "live" for
  Coinbase/Kraken/Binance/Ankr. Keyless providers now use their curated
  estimates; derived rates are labeled estimates.
- News sentiment never counted keywords (non-global regexes) and several stem
  alternatives could never match; Reddit sentiment matched substrings ("ath"
  in *death*, "gain" in *against*), skewing feeds positive. Both rewritten.
- Transfer fees: direct CEX withdrawals double-counted on-chain gas (the
  withdrawal fee already includes it); multi-hop quotes summed gas across two
  independently chosen networks — now prefers a shared network and charges
  gas only on the wallet leg. A missing live price also fell back to the coin's
  default transfer *quantity* as its price.
- Pump-report scans that errored were labeled CLEAN — now "SCAN FAILED".

**Mislabeled/misleading (fixed)**
- Reserve monitor listed all 108 assets (incl. BTC) as stablecoin reserves →
  stablecoins only; vBUSD and AMPL reclassified (not stablecoins).
- Undisclosed placeholder contract addresses (0x000…000N) rendered as real →
  now "not on file".
- Risk-scores description said "lower is safer, 0–10 bands" — actual scale is
  0–100, higher is safer; copy now matches the code thresholds.
- Social feeds stamped generic front-page Reddit posts with whatever asset was
  selected → unsupported assets now get targeted subreddit searches.
- News asset detection covered 14 of ~90 dropdown assets → generic name/
  cashtag detection now covers the full universe (with common-word blocklists;
  same guard added to equities market-news and stock-social for NOW/LOW/CAT/COST).
- Copy corrections: CryptoPanic key requirement, actual news providers
  (also in the OpenAPI spec + MCP tool descriptions), keyword-search behavior,
  staking provider count (now dynamic), "Total TVL" → "Top-20 Chain TVL",
  Binance connector labeled Binance.US (it hits the .us API), OKX/Bybit removed
  from the picker (no server implementation), Kraken XXBT→BTC, DCash CBDC
  marked discontinued, "70+ countries" → 55+, wallet-connect copy, MCP risk
  legend gap, equities "24h" column → "Chg %".
- Equities/funds (self-audit): reference-price backfills are now flagged
  per-symbol so they can't render as live; Yahoo previous-close fallback no
  longer uses a week-old reference; UTILITY_MAP CoinGecko ids corrected
  (pendle, io-net, berachain-bera, axelar, dogs-2; dead aave-v3 removed);
  Polygon Binance tickers updated MATIC→POL; TRC-20 gas estimate corrected.

**Verified clean (not exhaustive)**: dashboard widgets' N/A discipline, peg
math and alert thresholds, reports CSV/PDF consistency, OHLCV units and
resampling, indicator formulas (RSI/MACD/Bollinger/stochastic), backtest
math (both modules), reserve composition sums, transfer-fee min-withdraw and
disabled-leg enforcement, coin catalog scoring weights, api/v1 ↔ spec parity,
watchlist/portfolio fixes from the prior audit.

**Known remaining (documented, not fixed)**: crypto Social's Reddit RSS
carries no scores (JSON migration would restore vote metrics); mock-mode
Alerts filter sidebar isn't wired to the mock feed (live mode unaffected);
CBDC→USDC/USDT regulatory inference is by design; ATR uses SMA smoothing
rather than Wilder's.

---

## Deliberately NOT added yet (candidates for next session)

- **Live fundamentals** (P/E, market cap, dividend yield from a feed) — the
  catalogs carry labelled reference values; a free FMP key upgrades market cap
  via the quote ladder today. A fundamentals route is the natural next step.
- **Equity screener metrics** (YTD %, 52-week % in the registry table) —
  needs one history call per symbol; wants a small server-side cache first.
- **`/api/v1` + MCP tools for equities/funds** — the agent surface should
  cover the new modules (`/api/v1/equities`, `get_stock_quotes`, …). Straight-
  forward, but left out to keep this changeset reviewable.
- **Watchlist/portfolio integration** — cross-module holdings need the
  Phase 0 database work (`instruments` core) from docs/ROADMAP.md; wiring
  equities into the current crypto-shaped watchlist would create the exact
  coupling the module rules forbid.
