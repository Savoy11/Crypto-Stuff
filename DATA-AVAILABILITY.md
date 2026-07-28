# Finance Now — Data Availability Report

_Last generated: **2026-07-20**, from a full audit of all `/live-data/*` route handlers
executed against a running dev server on the development machine. This document is the
authoritative record of **what data in Finance Now is live, what is partially live, and what has
no free real-time source**. It exists so that a walk-through of the app surfaces exactly
what is — and is not — backed by real data, with no fabricated figures presented as real._

> **Companion doc:** [`DATA-SOURCES.md`](./DATA-SOURCES.md) is the "**where does each surface's data come
> from**" inventory — generated from `frontend/src/lib/data/dataSources.ts` (`npm run data-sources`), the same
> registry that powers the in-app **/data-sources** page and per-page source badges. This file tracks *whether*
> a surface is live; that one tracks *who* provides it.
>
> **Reproduce this report:** `npm run audit` in `frontend/` with the app running.
> The harness (`scripts/test-live-data.mjs`) classifies every route as
> REAL / FALLBACK / UNCONFIGURED / EMPTY / FAIL rather than just pass/fail.
> `npm run smoke` runs the fast CI subset. **Do not hand-edit the statuses below
> without re-running the audit** — that is how this file went stale last time.

> ⚠ **REGENERATION NEEDED (flagged 2026-07-28, audit finding H3).** This report predates
> two shipped changes and is stale in exactly the way its own warning above describes:
>
> 1. **The Macro Markets module was entirely absent** — `/live-data/macro-news`, `fx-rates`,
>    `fx-rates-extended`, and `treasury-yield-curve` (all shipped 2026-07-21) had no rows.
>    Placeholder rows were added 2026-07-28 marked ⬜ **Not measured**; they still need a real
>    audit run to get statuses. The route-count claim was also wrong (**56** route files on
>    disk, not 51 — and not the 57 this warning first claimed); that line is now corrected
>    and statically re-verified.
> 2. **The staking section is wrong** — the 2026-07-24 staking-rates rewrite (PR #37)
>    added DefiLlama Yields plus ~10 native-rate sources; "only 4 of 28 live" no longer
>    holds. `DATA-SOURCES.md` has the current story; the two docs disagree until this one
>    is regenerated.
>
> Statuses are IP-dependent (see CLAUDE.md), so regeneration must happen **on the owner's
> machine**: `npm run audit` with the app running, then update this file from the output.
> Until then, trust per-row statuses here only for surfaces unchanged since 2026-07-20.

## Legend

| Status | Meaning |
|--------|---------|
| 🟢 **Live** | Sourced from a real external provider at request time. |
| 🟡 **Partial** | Some fields live, others are static reference values or labeled estimates. |
| 🔑 **Key-gated** | Needs an API key/paid plan the project does not have. Route reports `configured: false` honestly. |
| 🔴 **Not available** | No free real-time source. The UI shows an explicit "not available" notice — never fabricated numbers. |
| ⬜ **Not measured** | The surface exists in code but has never been through an audit run. **Not a status** — an admission that one is owed. Never leave a row here after a regeneration. |

---

## ⚠️ Environment dependence — read this first

**This report is only valid from a network where these upstreams are reachable.**
Several providers geo-block or bot-block, and the results differ by IP. Verified
**2026-07-20** from the development machine:

| Upstream | Result | Consequence |
|----------|--------|-------------|
| `api.binance.com` | **451** (geo-blocked) | All crypto OHLCV silently served by Binance.US instead |
| `api.binance.us` | 200 | The de-facto crypto candle source |
| `fapi.binance.com` (futures) | **451** | `funding-rates` uses OKX instead |
| `api.okx.com` | 200 | Funding rates + open interest |
| Coinbase / Kraken public | 200 | Unused reachable fallbacks if more are ever needed |
| `min-api.cryptocompare.com` | **401** | Now requires a key; unusable keyless |
| CoinGecko free | 200 (intermittent **429**) | Rate-limited under load; 60 s polling floor |
| Reddit `*.json` (API) | **403** — all subs, all UAs | Unusable server-side without OAuth |
| Reddit `*.rss` (Atom) | 200, then **429** | Works, but ~1 request per window per IP |
| `lunarcrush.com/api3` | **404** | Endpoint gone; also behind Cloudflare |
| `stooq.com` CSV quotes | **404** | Dead — bottom rung of the quote ladder no longer functions |
| `cloudflare-eth.com` | JSON-RPC `-32603` | **Fixed:** ETH wallet route now uses a fallback ladder |
| `polygon-rpc.com` | 403 "tenant disabled" | **Fixed:** same ladder |
| `kobe.mainnet.jito.network/api/v1/apy` | **404** | **Fixed:** switched to `/stake_pool_stats` |
| SEC EDGAR / data.sec.gov | 200 | Keyless and authoritative — filings, XBRL, N-PORT |
| Yahoo Finance spark/chart | 200 | Primary equity quote + OHLCV source |
| StockTwits | 200 | Keyless equity social |
| DefiLlama, mempool.space, alternative.me, Lido, Marinade | 200 | All healthy |

**Key-gating vs geo-blocking are different problems.** A route needing a paid FMP plan
(`stock-universe`, `market-calendar`) is a commercial decision. A route blocked by IP
(`ohlcv`, `funding-rates`, Reddit) cannot be fixed by paying anyone.

---

## 🔴 Silent degradation — routes that return HTTP 200 with non-live data

**This is the most important section.** These routes look healthy to any status-code
check. They are not lying about their data, but a caller that ignores the provenance
field will treat catalog/reference/estimate values as live readings.

| Route | Looks like | Actually is | Provenance field |
|-------|-----------|-------------|------------------|
| `ohlcv` | `source: "binance"` | **Binance.US**, a different venue with its own liquidity and prices | `venue: "binance-us"` (added 2026-07-20) |
| `stock-universe` | 79 stocks, `ok: true` | Curated `equityCatalog.ts` fallback — the real universe is thousands | `source: "catalog"` |
| `stock-outliers` | Sector z-score screener | Screens only those 79 catalog names, so "outlier" means outlier within a hand-picked large-cap set | inherits `stock-universe` |
| `staking-rates` | 28 APRs, `ok: true` | **Only 4 are live** (stETH, rETH, mSOL, jitoSOL); the other 24 are static estimates | `sources: { key: "live" \| "estimate" }` |
| `network-fees` | 18 networks with USD fees | **Only Bitcoin's fee is live.** Every other chain is static gas × live price | per-network `source: "estimate"`, `btcFeeSource` |
| `cbdc-data` | 55 countries | Entirely the static table; the live CBDC news feed did not resolve | `source: "fallback"` |
| `fund-holdings` (SPY) | 5 holdings | Catalog's indicative top holdings. **Expected** — SPY is a unit investment trust and files no N-PORT | `source: "catalog"`, `full: false` |
| `chart` | OHLCV candles | **Synthesised** — `open==high==low==close`; built from a price-only series | `synthetic: true` (added 2026-07-20) |
| `security-quotes` | Live prices | Falls back to catalog reference prices if the whole ladder fails | `source: "reference"`, per-quote `reference: true` |

**The audit harness now fails-loud on all of these** (🟡 FALLBACK), so they cannot pass
silently again. Run `npm run audit:strict` to make them exit non-zero.

---

## Summary by feature

### Crypto — market data
| Feature / Page | Status | Source | Notes |
|----------------|--------|--------|-------|
| Asset prices, market cap, volume, 24h change | 🟢 Live | CoinGecko (`/live-data/markets`) | 78 assets. Metadata from static catalog — reference data, not fabricated. |
| Asset OHLCV / price charts | 🟡 Partial | **Binance.US** → CoinGecko fallback | Binance.com is 451 here, so candles come from the US mirror — different venue, different prices. `venue` field records which. |
| Coin list / search / discovery | 🟢 Live | CoinGecko | 750 coins, 209 discovery candidates. |
| Fear & Greed Index | 🟢 Live | alternative.me | |
| Funding rates + open interest | 🟢 Live | **OKX** (Binance fapi is 451 here) | 10 instruments. |
| DeFi TVL | 🟢 Live | DefiLlama | 50 protocols. |
| BTC network stats | 🟢 Live | mempool.space | Height, hashrate, difficulty, mempool. |
| Reserves / collateralization | 🟢 Live | DefiLlama Stablecoins API | 9 stablecoins. Composition breakdown is **approximate / derived** from chain distribution, not issuer attestation. |
| Risk scores | 🟢 Derived | DefiLlama + CoinGecko + curated disclosures + news | Live-computed composites via `src/lib/risk`. Pillars without data show N/A and drop coverage/confidence. |
| Alerts | 🟢 Live | Derived from live market thresholds | Generated from live price/peg movement, not a stored backend. |
| Network fee — Bitcoin | 🟢 Live | mempool.space | Real sat/vByte. |
| Network fees — all other chains | 🟡 Partial | static gas amount × live token price | Gas amount is a **static estimate**; only the price is live. Labeled `estimate`. |
| Transfer withdrawal fees | 🟡 Partial | static table (`transferFees.ts`) | Hand-maintained, carries `lastVerified` + confidence (high ≤60d / medium ≤120d / low when stale). Stale ⇒ ranking degraded with an explicit caveat. |
| `chart` route | 🟡 Partial | CoinGecko market_chart | **Synthetic OHLC** (zero-range candles) now marked `synthetic: true`. **No consumers in the app** — use `/live-data/ohlcv` for real candles. |

### Crypto — staking, news, social
| Feature / Page | Status | Source | Notes |
|----------------|--------|--------|-------|
| Staking APR — stETH / rETH / mSOL / jitoSOL | 🟢 Live | Lido, Rocket Pool, Marinade, Jito | **jitoSOL was restored 2026-07-20**: the old `/api/v1/apy` endpoint 404s and had silently pinned it to a 7.5% static estimate — ~41% above the real 5.32%. Now reads `/api/v1/stake_pool_stats`. |
| Staking APR — all other providers | 🟡 Partial | static estimates | 24 of 28 rates. Each carries `sources[key] = 'estimate'`. |
| Staking discovery | 🟢 Live | DefiLlama + Yearn + Pendle + Beefy | 95 pools. **Slow: ~18 s.** |
| News + sentiment + categories | 🟢 Live | Multi-provider RSS/JSON | Articles use `headline` (not `title`). Sentiment/category are heuristic classifiers (labeled derived). |
| Social sentiment (crypto) | 🟡 Partial | Reddit **Atom/RSS** feeds | Reddit's JSON API 403s server-side; the `.rss` feeds work but 429 aggressively (~1 request per window per IP), so coverage is partial by nature. |
| Videos | 🟢 Live | RSS | 60 videos. |
| Video search / analyze | 🔑 Key-gated | YouTube Data API | Reports `configured: false`; returns empty rather than fabricating. |

### Crypto — portfolio & wallets
| Feature / Page | Status | Source | Notes |
|----------------|--------|--------|-------|
| Portfolio prices | 🟢 Live | CoinGecko | `source: live \| partial \| error`. |
| Portfolio history | 🟢 Live | CoinGecko history | Requires `ids` + `date`. **Now returns HTTP 400 on missing/invalid params** (previously 200 with `source:'error'`, indistinguishable from a genuine data gap). |
| Wallet — BTC / ETH / SOL / TRON / XRP | 🟢 Live | Public explorers + JSON-RPC | **ETH/EVM fixed 2026-07-20:** was hard-502ing on Ethereum and Polygon because each chain had a single RPC and `cloudflare-eth.com` / `polygon-rpc.com` both broke. Now walks a fallback ladder and reports the serving endpoint in `rpc`. All 7 EVM chains verified. |
| Exchange connections | 🟢 Live | local credential store | Empty until the user configures one. |
| Pump report metrics | 🟢 Live | derived | 20 metrics. `scan`/`investigate`/`chat` are POST-only (405 on GET is correct). |

### Equities module
| Feature / Page | Status | Source | Notes |
|----------------|--------|--------|-------|
| Quotes | 🟢 Live | Yahoo Finance (ladder: FMP → Finnhub → Twelve Data → Tiingo → Alpha Vantage → Yahoo → catalog) | Yahoo serves in practice. **Stooq has been removed from the ladder entirely** (code re-checked 2026-07-28) — it 404s on every variant, so it was deleted from the registry and the quote path rather than left as a dead rung. Catalog reference is the last resort. |
| OHLCV / TA / backtests | 🟢 Live | Yahoo Finance | 124 candles for 6M. |
| Price chart | 🟢 Live | Yahoo | Close-only series by design. **Takes Yahoo range vocab (`6mo`), unlike its sibling `security-ohlcv` (`6M`)** — mismatched vocab returns 400. |
| Trailing returns | 🟢 Live | Yahoo spark | |
| Stock Registry universe | 🟡 Partial | **curated catalog fallback** | FMP `company-screener` is **PAID-only**; without it the registry is 79 hand-maintained names. P/E backfill from SEC XBRL frames only runs on the FMP path. |
| Equity screener / outliers | 🟡 Partial | derived from the above | Screens 66 evaluable names across 7 sectors — inherits the catalog's narrowness. Backs the `equity-screener` agent. |
| Market news | 🟢 Live | Yahoo / MarketWatch / CNBC RSS | |
| Stock social | 🟡 Partial | StockTwits + **Reddit (fixed 2026-07-20)** | Reddit was calling the `.json` API, which **403s 100% of the time server-side** — a permanently dead provider that looked like a quiet feed. Switched to the `.rss` Atom feeds already proven in the crypto route. **Known issue:** signals merge by recency, and StockTwits posts are minutes old vs Reddit's hours/days, so at `limit ≤ 30` StockTwits fills every slot and Reddit is starved (0 at limit 20, 10 at 40, 45 at 80). |
| SEC filings | 🟢 Live | SEC EDGAR | Keyless. |
| Company fundamentals / ratios | 🟢 Live | SEC EDGAR XBRL | AAPL rev $416B, net margin 26.9% — sanity-checked. |
| Company profile | 🟢 Live | SEC EDGAR + Wikipedia | |
| Market calendar | 🔑 Key-gated | FMP | Reports `configured: false`. Earnings calendar needs a free key; economic calendar needs a paid one. |

### ETFs & Funds module
| Feature / Page | Status | Source | Notes |
|----------------|--------|--------|-------|
| Fund universe | 🟢 Live | SEC + providers | 28,977 entries. **Slow: ~11 s, 14 MB payload** — worth pagination. |
| Fund holdings | 🟢 Live | SEC N-PORT (keyless, authoritative) | Verified full books: VOO 511, IVV 507, VTI 1500, QQQ 101, ARKK 46. |
| Fund holdings — UITs | 🟡 Partial | catalog | **SPY, and UITs generally, file no N-PORT**, so they correctly fall back to indicative top holdings. Not a bug. |
| Fund holdings history | 🔑 Key-gated | SEC N-PORT diff → FMP | Works only where an N-PORT series exists; no FMP key configured as fallback. |

### Macro Markets module
Shipped 2026-07-21, **after** this report's last generation — every row below is ⬜ **Not measured**.
The sources are read from code, not from an audit run; nothing here has been observed working from
any machine. Filling these in is the H3 follow-up.

| Feature / Page | Status | Source (per code) | Notes |
|----------------|--------|-------------------|-------|
| Macro news | ⬜ Not measured | 8 keyless RSS feeds (Investing.com ×3, OilPrice, FXStreet, MarketWatch, CNBC ×2) | `macro-news`. Content-first pillar classifier; 14-day staleness cutoff. Several of these are the same publishers that bot-block elsewhere in this report — expect per-feed variance by IP. |
| FX rates — official tier | ⬜ Not measured | ECB daily reference via frankfurter.dev (keyless) | `fx-rates`. 30 currencies. |
| FX rates — extended tier | ⬜ Not measured | community `fawazahmed0/currency-api` (keyless) | `fx-rates-extended`. +127 currencies, hand-verified allowlist. Labeled as community-sourced in the UI, never blended with the ECB tier unattributed. |
| Treasury yield curve | ⬜ Not measured | treasury.gov daily par curve XML (keyless) | `treasury-yield-curve`. 13 maturities + 2s10s/3m10y spreads; 4h revalidate. |
| Commodity / currency / rate quotes | ⬜ Not measured | existing `security-quotes` ladder | No new plumbing — macro instruments price through the equity quote path, so their status tracks the Quotes row above. |
| CUSIP-level bond quotes | 🔴 Not available | — | Licensed data. Intentionally absent and stated on-page; this row needs no measurement. |

### Not available
| Feature | Status | Notes |
|---------|--------|-------|
| TA — liquidation heatmap / OI depth / exchange flows | 🔴 Not available | Coinglass/Glassnode are paid. Shown as explicit "not available (paid feed)" rows. |
| TA — event markers (unlocks, CPI/FOMC) | 🟡 Partial | News events plotted from the live feed; token unlocks and macro prints need a paid calendar — explicitly omitted, not faked. |
| Peg deviation history | 🔴 Not available | No free historical peg series. Returns empty. |
| Per-row price sparklines | 🔴 Not available | No free per-asset trend source at list scale; shows "n/a". |
| Reports (AUM, risk tables) | 🔴 Not available | Explicit "not available" notice. |
| Backtests (crypto) | 🔴 Not available | Requires a backtesting backend; not present. Equity strategy backtests (`/equities/backtests`) DO work off live `security-ohlcv`. |
| `/live-data/tier` | 🔴 **Route does not exist** | The directory is empty and nothing references the path — tier data is client-side (`src/lib/tier.ts`). Listed in older inventories in error. |

---

## Reference data (legitimately static — NOT mock)

Not real-time and not fabricated; stable reference facts that belong in the app as static data:

- **Asset metadata catalog** — id, symbol, name, asset type, blockchain, contract address, issuer, description, website, whitepaper, peg target. (`lib/data/assetCatalog.ts`)
- **News categories** — the fixed taxonomy of category labels. (`lib/data/newsCategories.ts`)
- **Asset launch dates & notable historical events** — chart annotations. (`lib/data/priceHistoryMeta.ts`)
- **Network / address-format reference** — chains, address formats, examples. (`lib/data/transferFees.ts`)
- **Staking provider risk profiles** — qualitative risk dimensions per provider. (`lib/data/stakingProviders.ts`)
- **Equity / fund catalogs** — `equityCatalog.ts` (~79), `fundCatalog.ts` (~55). Legitimate reference data, but note they double as the **fallback** path for `stock-universe` and `fund-holdings`, which is where the silent-degradation risk comes from.

---

## Route conventions audit

Project convention (CLAUDE.md): every `/live-data` route needs `export const dynamic = 'force-dynamic'`,
`next: { revalidate: N }` on each fetch, and `Promise.allSettled` for any multi-fetch.

- ✅ **`force-dynamic`** — all **56** route files comply (`chart` was the sole exception; fixed 2026-07-20).
  Count and compliance re-verified **statically** on 2026-07-28 (`find src/app/live-data -name route.ts`
  vs `grep -l "export const dynamic"`, 56/56). This one line needs no running server, so it is current
  even though the availability statuses above are not.
- ✅ **`revalidate`** — present on every outbound fetch in all routes that fetch.
- ✅ **`Promise.allSettled`** — resolved 2026-07-22. The earlier flag listed 8 routes found by grepping for
  multi-fetch without `allSettled`; reading them showed **7 were already correct and 1 had a real bug that
  `allSettled` would not have fixed**:
  - `markets`, `portfolio-prices`, `cbdc-data` — deliberate **sequential fallback ladders** (try provider A,
    fall back to B, then C), each leg try/caught. `allSettled` would be actively **wrong** here: it fires every
    provider in parallel, burning rate limit on calls the ladder exists to avoid.
  - `company-profile` — `Promise.all([SEC, wiki])` is safe because `fetchWikiSummary` is fail-silent (returns
    `null`). Only the SEC leg can reject, and that *should* fail the route: it is the primary data.
  - `stock-universe` — already has an explicit inner boundary so a SEC hiccup costs the P/E column, not the
    response. `wallet/exchange` and `config` are **not multi-fetch at all** — one exchange / one provider test
    per request, each try/caught.
  - `sec-filings` — **the one genuine bug.** Its archive-page walk is sequential by design (it stops as soon as
    `limit` is satisfied, so parallel fetching would request pages nobody asked for). A non-`ok` response broke
    the loop gracefully, but a *thrown* fetch propagated to the outer handler and **503'd the whole route,
    discarding the filings already collected from `recent`**. Now per-page try/catch: partial results return with
    `hasMore: true`. Verified by fault injection — old code 503 / 0 filings, new code 200 / 11 filings.

  Conclusion: the convention as stated ("`Promise.allSettled` for any multi-fetch") is too blunt. A sequential
  fallback ladder is a multi-fetch that must *not* be parallelised. What every multi-fetch actually needs is a
  **failure boundary that preserves partial results** — sometimes `allSettled`, sometimes try/catch per leg.

---

## Performance outliers

| Route | Latency | Note |
|-------|---------|------|
| `staking-discovery` | ~18 s | 4 upstreams (DefiLlama, Yearn, Pendle, Beefy) |
| `fund-universe` | ~11 s / **14 MB** | 28,977 entries in one payload — needs pagination |
| `staking-rates` | ~6 s | 17 parallel upstreams with a 6 s per-fetch timeout |
| `stock-social` | ~6 s | Reddit RSS fetches frequently hit the 429 path |

---

## Refresh intervals (free tier)

CoinGecko's public API rate-limits to ~30 calls/minute, making **60 seconds the practical
minimum** for free-tier polling without hitting 429.

| Surface | Endpoint | Refresh interval | Stale after |
|---------|----------|-----------------|-------------|
| Technical Analysis — screener prices | `/live-data/markets` | 60 s | 60 s |
| Technical Analysis — chart (1H range) | `/live-data/ohlcv` | on demand | 60 s |
| Technical Analysis — chart (4H / 1M) | `/live-data/ohlcv` | on demand | 5 min |
| Technical Analysis — chart (3M / 6M / 1Y / MAX) | `/live-data/ohlcv` | on demand | 15 min |
| Asset prices / market data | `/live-data/markets` | 30 s | 30 s |
| Network fees | `/live-data/network-fees` | on demand | 5 min |
| Staking APRs | `/live-data/staking-rates` | on demand | 5 min |
| News | `/live-data/news` | on demand | 1 min |

> The chart price display is derived from the last candle's close — it updates whenever
> OHLCV refetches, not on a separate price tick.

---

## Action items tracked from this report

1. ✅ Classify every surface (this document).
2. ✅ Remove all mock generators; relocate legitimate reference data out of `lib/api/mock/`. There is no mock/demo data path.
3. ✅ Reports page confirmed to show "not available" (no live-mode mock leak).
4. ✅ De-duplicate network-fee logic into one source of truth (`lib/data/networkFees.ts`), consumed by both layers. Verified identical at runtime + by the audit's cross-layer checks.
5. ✅ Provenance primitive (`DataBadge`) wired into the transfer-fees page; fees carry `lastVerified` + staleness warning.
6. ✅ Network fee-feed **infrastructure** built (`FeeProvider` + `FEE_PROVIDERS` + BTC reference provider). Live EVM gas providers remain the next step to flip more 🟡 chains to 🟢.
7. ✅ **Audit harness classifies real vs fallback data** (`npm run audit`). Replaces the old pass/fail smoke test, which reported 43/43 green while two routes served static catalogs.
8. ✅ Surface data provenance in-app. Done — a canonical registry (`src/lib/data/dataSources.ts`) now powers the
   **/data-sources** page (in-app catalog), per-page `<SourceLine/>` badges, and the generated
   [`DATA-SOURCES.md`](./DATA-SOURCES.md). `npm run data-sources -- --verify` fails if a route fetches a host the
   registry doesn't name, so the docs/app can't silently drift from the code.
9. ⏳ **Get a paid FMP plan or a different universe source** — `stock-universe` and `stock-outliers` are the largest remaining fallback surface.
10. ✅ ~~**Fix Reddit starvation in `stock-social`**~~ Done 2026-07-22 — `lib/server/socialBlend.ts` allocates the
    response budget round-robin per provider (newest-first within each), then re-sorts by recency for display, so
    the feed still reads chronologically. Unused share flows to other providers, so one active source still fills
    the limit. Measured before → after at `limit=20`: **20/0 → 10/10** StockTwits/Reddit; at `limit=40`: 30/10 →
    20/20. `providers` now lists only sources that actually placed a signal in the response — previously it named
    Reddit at limit=20 while showing zero Reddit posts, which is what hid the starvation. 7 unit tests.
    ⚠ Separately: the `/equities/social` **page** currently never issues its query (stuck on "Fetching social
    signals…" while the app reports Offline/DISCONNECTED). Pre-existing and unrelated — the route and a direct
    fetch from that page both work; tracked separately.
11. ⏳ **Paginate `fund-universe`** — 14 MB in one response.
12. ✅ ~~Bring the 8 bare-`Promise.all` routes onto `Promise.allSettled`.~~ Done 2026-07-22 — 7 were already
    correct (sequential fallback ladders that must not be parallelised, or not multi-fetch at all); the real
    bug was `sec-filings` discarding collected filings when an archive page threw. See the conventions audit above.
13. ⏳ **Regenerate this report** (audit finding H3). Partially addressed 2026-07-28 with the corrections that
    can be made from the code alone — route count (51 → 56, statically re-verified), the Stooq rung (removed
    from the ladder, not merely dead), and a Macro section that exists rather than being silently missing.
    What remains genuinely needs `npm run audit` against a running server **on the owner's machine**: every
    ⬜ Not measured row, the staking counts (PR #37 invalidated "24 of 28 estimates"), and re-confirmation of
    the 🟢/🟡 rows last observed 2026-07-20. Availability is IP-dependent — a datacenter run would write a
    systematically wrong baseline, which is worse than the stale one it replaced.

## Validation

`npm run audit` (in `frontend/`, with the app running) is the full check; `npm run smoke`
is the fast CI subset; `npm run audit:strict` also fails on fallback/empty responses.
`npm run lint` and `npm run type-check` run clean (non-interactive, CI-ready).

_This file is maintained alongside the code. Update it whenever a data source is added,
removed, or changes status — and re-run `npm run audit` rather than editing statuses by hand._
