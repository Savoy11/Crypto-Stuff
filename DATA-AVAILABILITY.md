# CAEP — Data Availability Report

_Last generated: 2026-06-29. This document is the authoritative record of **what data
in CAEP is live, what is partially live, and what has no free real-time source**. It
exists so that a full walk-through of the app surfaces exactly what is — and is not —
backed by real data, with no fabricated ("mock") figures presented as real._

## Legend

| Status | Meaning |
|--------|---------|
| 🟢 **Live** | Sourced from a real external provider at request time. |
| 🟡 **Partial** | Some fields live, others are static reference values or labeled estimates. |
| 🔴 **Not available** | No free real-time source. The UI shows an explicit "not available" notice — never fabricated numbers. |

---

## Summary by feature

| Feature / Page | Status | Source | Notes |
|----------------|--------|--------|-------|
| Asset prices, market cap, volume, 24h change | 🟢 Live | CoinGecko (`/live-data/markets`) | Metadata (name, chain, issuer, contract) from static catalog — reference data, not fabricated. |
| Asset OHLCV / price charts | 🟢 Live | Binance (365 daily candles) → CoinGecko fallback (92 coarse candles) | Candle count + source surfaced as provenance. ~70 coins subject to CoinGecko 429 throttling. |
| Network fee — Bitcoin | 🟢 Live | mempool.space | Real sat/vByte. |
| Network fees — all other chains | 🟡 Partial | static gas amount × live token price | Gas amount is a **static estimate**; only the price is live. Labeled `estimate`. Target of fee-feed infrastructure (Phase 3). |
| Transfer withdrawal fees | 🟡 Partial | static table (`transferFees.ts`) | Exchange withdrawal fees hand-maintained; carries a "last verified" date and staleness warning. |
| Staking APR (stETH / mSOL / jitoSOL) | 🟢 Live | Lido, Marinade, Jito APIs | Other providers' rates are reference/estimated. Each opportunity carries a **yieldType** (native / liquid / cefi / restaking / governance / lending); governance-token & lending products are excluded by default so "ETH staking" means ETH staking. |
| Transfer withdrawal fees — confidence | 🟡 Partial | static table (`transferFees.ts`) | Carries source + last-verified date + a **confidence level** (high ≤60d / medium ≤120d / low when stale). When stale, the cheapest-route ranking is degraded with an explicit caveat rather than presented as authoritative. |
| News + sentiment + categories | 🟢 Live | Multi-provider RSS/JSON (NewsAPI, GNews, CryptoPanic, Messari, RSS, Congress) | Keyword search best-efforts by feed type. Sentiment/category are heuristic classifiers (labeled as derived). |
| Reserves / collateralization | 🟢 Live | DefiLlama Stablecoins API (`/live-data/reserves`) | Composition breakdown is **approximate / derived** from chain distribution, not issuer attestation. |
| Alerts | 🟢 Live | Derived from live market thresholds (`/live-data/alerts`) | Generated from live price/peg movement, not a stored backend. |
| Fear & Greed Index | 🟢 Live | alternative.me | |
| Funding rates | 🟢 Live | exchange APIs | Funding + open interest surfaced in the Technical Analysis "Market Structure" panel. |
| TA — Technical Read / S-R / patterns / scanner / backtest | 🟢 Derived | client-side from live OHLCV | Trend/momentum/volatility read, auto support/resistance, pattern invalidation+targets, multi-asset scanner, and the strategy backtester are all computed from the live candle series. Hypothetical backtests carry a not-financial-advice disclaimer. |
| TA — event markers | 🟡 Partial | live news feed | News events plotted on the chart + listed. Token unlocks and CPI/FOMC need a paid calendar feed — explicitly omitted, not faked. |
| TA — liquidation heatmap / open interest depth / exchange flows | 🔴 Not available | — | No free real-time source (Coinglass/Glassnode are paid). Shown as explicit "not available (paid feed)" rows. |
| DeFi TVL | 🟢 Live | DefiLlama | |
| BTC network stats | 🟢 Live | mempool.space / blockchain APIs | |
| Social sentiment | 🟡 Partial | `/live-data/social` | Verify which signals are live vs derived; label accordingly (Phase 2). |
| **Risk scores** | 🔴 Not available | — | Composite risk scoring is a derived analytic with no free real-time source. Returns empty; UI shows "not available". |
| **Peg deviation history** | 🔴 Not available | — | No free historical peg series. Returns empty. |
| **Per-row price sparklines** | 🔴 Not available | — | No free per-asset trend source at list scale; shows "n/a". |
| **Reports (AUM, risk tables)** | 🔴 → being fixed | — | ⚠️ Currently fabricated from static catalog **even in live mode** (the one real mock leak). Being reworked to derive from live market data or show "not available". |
| **Backtests** | 🔴 Not available | — | Requires a backtesting backend; not present. |

---

## Reference data (legitimately static — NOT mock)

These are not real-time and not fabricated; they are stable reference facts that belong
in the app as static data:

- **Asset metadata catalog** — id, symbol, name, asset type, blockchain, contract address, issuer, description, website, whitepaper, peg target. (`lib/data/assetCatalog.ts`)
- **News categories** — the fixed taxonomy of news category labels. (`lib/data/newsCategories.ts`)
- **Asset launch dates & notable historical events** — used to annotate charts. (`lib/data/priceHistoryMeta.ts`)
- **Network / address-format reference** — chains, address formats, examples. (`lib/data/transferFees.ts`)
- **Staking provider risk profiles** — qualitative risk dimensions per provider. (`lib/data/stakingProviders.ts`)

---

## Action items tracked from this report

1. ✅ Classify every surface (this document).
2. ✅ Remove all mock generators; relocate legitimate reference data out of `lib/api/mock/` (now `lib/data/assetCatalog.ts`, `newsCategories.ts`, `priceHistoryMeta.ts`). The `lib/api/mock/` directory is deleted and there is no mock/demo data path.
3. ✅ Reports page confirmed to show "not available" (no live-mode mock leak); dead demo branch removed.
4. ✅ De-duplicate network-fee logic into one source of truth (`lib/data/networkFees.ts`), consumed by both `/live-data/network-fees` and `/api/v1/network-fees`. Verified identical at runtime + by the smoke suite.
5. ✅ Provenance primitive (`DataBadge`: live / estimate / not-available) added and wired into the transfer-fees page; transfer fees carry a machine-readable `lastVerified` date + staleness warning.
6. ✅ Network fee-feed **infrastructure** built (`FeeProvider` interface + `FEE_PROVIDERS` registry + BTC reference provider). Live EVM gas providers are the documented next step to flip more 🟡 chains to 🟢.
7. ⏳ Surface this report in-app at `/live-data/availability` so it stays accurate automatically. (Not yet done.)

## Refresh intervals (free tier)

These are the polling cadences in the UI. CoinGecko's public API rate-limits to ~30 calls/minute, making **60 seconds the practical minimum** for free-tier polling without hitting 429 errors.

| Surface | Endpoint | Refresh interval | Stale after |
|---------|----------|-----------------|-------------|
| Technical Analysis — screener prices | `/live-data/markets` | 60 s | 60 s |
| Technical Analysis — chart price (1H range) | `/live-data/ohlcv` | on demand | 60 s |
| Technical Analysis — chart price (4H / 1M range) | `/live-data/ohlcv` | on demand | 5 min |
| Technical Analysis — chart price (3M / 6M / 1Y / MAX) | `/live-data/ohlcv` | on demand | 15 min |
| Asset prices / market data | `/live-data/markets` | 30 s | 30 s |
| Network fees | `/live-data/network-fees` | on demand | 5 min |
| Staking APRs | `/live-data/staking-rates` | on demand | 5 min |
| News | `/live-data/news` | on demand | 1 min |

> The chart price display is derived from the last candle's close — it updates whenever OHLCV refetches, not on a separate price tick.

## Validation

`npm run smoke` (in `frontend/`, with the app running) spot-checks price sanity, fee
bounds, cross-layer consistency, staking ranges, and news. `npm run lint` and
`npm run type-check` run clean (non-interactive, CI-ready).

_This file is maintained alongside the code. Update it whenever a data source is added,
removed, or changes status._
