# Finance Now — Data Source Inventory

_Auto-generated from `src/lib/data/dataSources.ts` by `npm run data-sources`. **Do not hand-edit** —
change the registry and regenerate. This is the "where does the data come from" companion to
`DATA-AVAILABILITY.md` (which tracks whether each surface is live). The same registry powers the
in-app **/data-sources** page and the per-page provenance badges, so the app and the docs never diverge._

_Last generated: **2026-08-06**_

## Legend

| Status | Meaning |
|--------|---------|
| **Live** | Sourced from a real external provider at request time. |
| **Partial** | Some fields live, others static reference values or labeled estimates. |
| **Key-gated** | Needs an API key / paid plan the project may not have. Route reports this honestly. |
| **Derived** | Computed from other live data, not a single upstream. |
| **Not available** | No free real-time source; the UI shows an explicit "not available" notice. |

Provider tags: `key` = needs an API key · `paid` = needs a paid plan · untagged = keyless.

## Crypto

| Surface | Status | Provider(s) | Cadence | Route |
|---------|--------|-------------|---------|-------|
| Crypto prices, market cap, volume, 24h change | Live | [CoinGecko](https://www.coingecko.com/en/api) `api.coingecko.com`<br>[Binance](https://binance.com) `api.binance.com`<br>[CoinMarketCap](https://coinmarketcap.com/api) `pro-api.coinmarketcap.com` _(paid)_ | 30s client poll · sequential fallback ladder | `/live-data/markets` |
| Crypto OHLCV / candlestick charts | Partial | [Binance](https://binance.com) `api.binance.com`<br>[Binance.US](https://binance.us) `api.binance.us`<br>[CoinGecko](https://www.coingecko.com/en/api) `api.coingecko.com` | on demand · 60s–15m stale by range | `/live-data/ohlcv` |
| Coin list / search / discovery | Live | [CoinGecko](https://www.coingecko.com/en/api) `api.coingecko.com`<br>Binance.US `api.binance.us` | on demand | `/live-data/coin-list` |
| Coin discovery candidates | Live | [CoinGecko](https://www.coingecko.com/en/api) `api.coingecko.com` | on demand | `/live-data/coin-discovery` |
| Fear & Greed Index | Live | [alternative.me](https://alternative.me/crypto/fear-and-greed-index/) `api.alternative.me` | — | `/live-data/fear-greed` |
| Perp funding rates + open interest | Live | [OKX](https://www.okx.com/docs-v5/) `www.okx.com` | — | `/live-data/funding-rates` |
| DeFi TVL | Live | [DefiLlama](https://defillama.com/docs/api) `api.llama.fi` | — | `/live-data/defi-tvl` |
| Bitcoin network stats (height, hashrate, mempool) | Live | [mempool.space](https://mempool.space/docs/api) `mempool.space`<br>blockchain.info `blockchain.info` | — | `/live-data/btc-stats` |
| Stablecoin reserves / collateralization | Live | [DefiLlama](https://defillama.com/docs/api) `stablecoins.llama.fi` | — | `/live-data/reserves` |
| Risk scores | Derived | [DefiLlama](https://defillama.com/docs/api) `stablecoins.llama.fi`<br>[CoinGecko](https://www.coingecko.com/en/api) `api.coingecko.com`<br>Curated disclosures + news | on demand | `/live-data/risk-scores` |
| Alerts (depegs, large moves) | Derived | [CoinGecko](https://www.coingecko.com/en/api) `api.coingecko.com` | — | `/live-data/alerts` |
| Network / gas fees (16 chains) | Partial | mempool.space `mempool.space`<br>[CoinGecko](https://www.coingecko.com/en/api) `api.coingecko.com` | — | `/live-data/network-fees` |
| Staking APR/APY | Partial | [DefiLlama Yields](https://defillama.com/yields) `yields.llama.fi`<br>Lido `eth-api.lido.fi`<br>Rocket Pool `api.rocketpool.net`<br>Marinade `api.marinade.finance`<br>Jito `kobe.mainnet.jito.network`<br>Stride `edge.stride.zone`<br>Cosmostation / Subscan / chain LCDs | 20m client poll · 18 parallel upstreams | `/live-data/staking-rates` |
| Staking / yield discovery | Live | [DefiLlama](https://defillama.com/docs/api) `yields.llama.fi`<br>Yearn `api.yearn.finance`<br>Pendle `api-v2.pendle.finance`<br>Beefy `api.beefy.finance` | on demand · ~18s (4 upstreams) | `/live-data/staking-discovery` |
| Crypto price chart (legacy, internal) | Derived | [CoinGecko](https://www.coingecko.com/en/api) `api.coingecko.com` | — | `/live-data/chart` |
| Crypto news + sentiment | Live | CryptoPanic `cryptopanic.com` _(key)_<br>Messari `data.messari.io` _(key)_<br>GNews / NewsAPI _(key)_<br>RSS feeds | 1m | `/live-data/news` |
| Crypto social sentiment | Partial | Reddit (Atom/RSS) `www.reddit.com`<br>Santiment `api.santiment.net` _(key)_<br>LunarCrush `lunarcrush.com` _(key)_ | — | `/live-data/social` |
| Videos / video search | Key-gated | [YouTube Data API](https://developers.google.com/youtube/v3) `www.googleapis.com` _(key)_<br>YouTube RSS `www.youtube.com` | — | `/live-data/videos` |
| Portfolio prices | Live | [CoinGecko](https://www.coingecko.com/en/api) `api.coingecko.com`<br>[DefiLlama](https://defillama.com/docs/api) `coins.llama.fi` | on demand | `/live-data/portfolio-prices` |
| Portfolio history | Live | [CoinGecko](https://www.coingecko.com/en/api) `api.coingecko.com` | — | `/live-data/portfolio-history` |
| On-chain wallet balances (BTC/ETH/SOL/TRON/XRP + EVM) | Live | Public explorers + JSON-RPC ladders | — | `/live-data/wallet/*` |

- **Crypto prices, market cap, volume, 24h change** — Prices live; coin metadata (name, chain, contract) is static reference data, not fabricated. Reference/fallback data: `lib/data/assetCatalog.ts (metadata)`.
- **Crypto OHLCV / candlestick charts** — Binance.com is 451 (geo-blocked) from many hosts, so candles come from the US mirror — a different venue. Serving venue recorded in the `venue` field.
- **Perp funding rates + open interest** — Binance futures (fapi) is 451 from many hosts; OKX is the working source.
- **Stablecoin reserves / collateralization** — Supply is live; composition breakdown is approximate / derived from chain distribution, not issuer attestation.
- **Risk scores** — Live-computed composites via src/lib/risk. Pillars without data show N/A and drop coverage/confidence.
- **Alerts (depegs, large moves)** — Generated from live price/peg movement thresholds, not a stored backend.
- **Network / gas fees (16 chains)** — Only Bitcoin’s sat/vByte fee is live. Every other chain is a static gas amount × live token price, labeled `estimate` per network. Reference/fallback data: `lib/data/networkFees.ts (gas amounts)`.
- **Staking APR/APY** — Liquid-staking/restaking protocols + native network rates are live (DefiLlama + protocol APIs + chain inflation). CeFi exchange rates are static estimates. Each rate carries sources[key] = "live" | "estimate". Reference/fallback data: `lib/data/stakingProviders.ts (risk profiles, fallback APRs)`.
- **Crypto price chart (legacy, internal)** — Synthesises zero-range OHLC from a price-only series (marked synthetic:true). No app consumers — /live-data/ohlcv provides real candles.
- **Crypto news + sentiment** — Multi-provider RSS/JSON merge. Sentiment/category are heuristic classifiers (labeled derived).
- **Crypto social sentiment** — Reddit’s JSON API 403s server-side; the .rss feeds work but 429 aggressively, so coverage is partial by nature.
- **Videos / video search** — RSS video list works keyless; search/analyze report configured:false without a key rather than fabricating.
- **Portfolio history** — Requires ids + date; returns HTTP 400 on missing/invalid params.
- **On-chain wallet balances (BTC/ETH/SOL/TRON/XRP + EVM)** — Each chain walks a fallback ladder of public RPC/explorer endpoints and reports the serving endpoint in `rpc`.

## Equities

| Surface | Status | Provider(s) | Cadence | Route |
|---------|--------|-------------|---------|-------|
| Stock / ETF / fund quotes | Key-gated | [FMP](https://site.financialmodelingprep.com/developer/docs) `financialmodelingprep.com` _(key)_<br>Finnhub / Twelve Data / Tiingo / Alpha Vantage _(key)_<br>Catalog reference prices | — | `/live-data/security-quotes` |
| Stock OHLCV / TA / backtests | Key-gated | [Tiingo](https://www.tiingo.com/documentation/general/overview) `api.tiingo.com` _(key)_<br>[FMP](https://site.financialmodelingprep.com/developer/docs) `financialmodelingprep.com` _(key)_ | — | `/live-data/security-ohlcv` |
| Trailing returns (1M/3M/YTD/1Y) | Key-gated | [Tiingo](https://www.tiingo.com/documentation/general/overview) `api.tiingo.com` _(key)_ | — | `/live-data/security-returns` |
| Stock market news | Partial | MarketWatch / CNBC RSS | — | `/live-data/market-news` |
| Stock social sentiment | Partial | StockTwits `api.stocktwits.com`<br>Reddit (Atom/RSS) `www.reddit.com` | — | `/live-data/stock-social` |
| SEC filings (10-K/10-Q/8-K) | Live | [SEC EDGAR](https://www.sec.gov/edgar) `data.sec.gov`<br>SEC archives `www.sec.gov` | — | `/live-data/sec-filings` |
| Company fundamentals / ratios | Live | [SEC EDGAR XBRL](https://www.sec.gov/edgar) `data.sec.gov` | — | `/live-data/company-facts` |
| Company profile | Live | [SEC EDGAR](https://www.sec.gov/edgar) `data.sec.gov`<br>Wikipedia `en.wikipedia.org` | — | `/live-data/company-profile` |
| Stock Registry universe | Partial | FMP company-screener `financialmodelingprep.com` _(paid)_<br>Curated catalog<br>[SEC XBRL frames (P/E backfill)](https://www.sec.gov/edgar) `data.sec.gov` | — | `/live-data/stock-universe` |
| Equity screener / outliers | Partial | Derived from stock-universe | — | `/live-data/stock-outliers` |
| Market calendar (earnings / econ) | Key-gated | FMP `financialmodelingprep.com` _(key)_ | — | `/live-data/market-calendar` |
| Trade Risk Scorer (options) | Derived | Finance Now risk engine (lib/risk/profiles/optionsTrade.ts)<br>User-entered option quotes (from their broker chain)<br>[FMP](https://site.financialmodelingprep.com/developer/docs) `financialmodelingprep.com` _(key)_ | on demand | `/api/v1/options/score` |

- **Stock / ETF / fund quotes** — Registry-driven provider ladder (Integrations page). EVERY live rung needs an API key since the keyless one was withdrawn on terms grounds (2026-08-06) — with no key, stocks and funds fall to catalog reference prices behind an amber `ref` tag, and macro instruments (no reference price by design) show a dash. Reference/fallback data: `lib/data/equityCatalog.ts`, `lib/data/fundCatalog.ts`.
- **Stock OHLCV / TA / backtests** — Both rungs are keyed. Without one the route returns source:"none" and the TA, backtest and candlestick surfaces show their no-live-source state rather than synthetic candles.
- **Trailing returns (1M/3M/YTD/1Y)** — One request per symbol now (the batched source was withdrawn), so the route serves up to 60 named symbols and REFUSES whole-universe requests rather than silently truncating. Screening and sorting funds by trailing return is off as a result; the Returns columns are still live for the visible page.
- **Stock market news** — General market wires only. The one free PER-TICKER feed was Yahoo’s and went on terms grounds, so symbol news is now these wires filtered to articles that actually name the company — an empty result is the honest answer when they haven’t covered it.
- **Stock social sentiment** — Reddit 403s from datacenter IPs without OAuth — expect StockTwits-heavy results server-side. Budget allocated round-robin so one active source still fills the limit.
- **Company fundamentals / ratios** — AAPL rev/net-margin sanity-checked against reported figures.
- **Stock Registry universe** — FMP screener is PAID-only; without a key the registry falls back to ~79 curated names. P/E backfilled from SEC XBRL frames on the FMP path only. Reference/fallback data: `lib/data/equityCatalog.ts (~79 names)`.
- **Equity screener / outliers** — Sector z-scores over whatever universe stock-universe returns — inherits its narrowness on the catalog fallback.
- **Market calendar (earnings / econ)** — Earnings needs a free FMP key; economic calendar needs a paid one. Reports configured:false without one.
- **Trade Risk Scorer (options)** — Every option-level figure is entered by the user — Finance Now carries NO options chain, because no source it may use publishes one (Cboe’s terms prohibit auto-extraction; Yahoo’s options endpoint required auth and Yahoo is now blocked outright on terms grounds). See docs/assessments/P2-O1-options-data.md. Only the underlying price is fetched, through the shared quote ladder, which is keyed. The score itself is this app’s computation, not any provider’s figure.

## ETFs & Funds

| Surface | Status | Provider(s) | Cadence | Route |
|---------|--------|-------------|---------|-------|
| Fund universe | Live | [SEC](https://www.sec.gov/edgar) `www.sec.gov`<br>NASDAQ Trader `www.nasdaqtrader.com` | daily-cached · ~11s / 14MB | `/live-data/fund-universe` |
| ETF / fund holdings | Live | [SEC N-PORT](https://www.sec.gov/edgar) `data.sec.gov`<br>FMP `financialmodelingprep.com` _(key)_<br>Catalog | — | `/live-data/fund-holdings` |
| Holdings quarter-over-quarter diff | Partial | [SEC N-PORT](https://www.sec.gov/edgar) `data.sec.gov`<br>FMP `financialmodelingprep.com` _(key)_ | — | `/live-data/fund-holdings-history` |

- **Fund universe** — 28,977 entries in one payload — pagination is a tracked follow-up.
- **ETF / fund holdings** — N-PORT is keyless and authoritative, and holdings are unaffected by the Yahoo removal. Two side panels are: SECTOR WEIGHTS now need an FMP key (N-PORT carries no GICS classification), and the stock/bond/cash ASSET MIX has no source at all — that section no longer renders. UITs (e.g. SPY) file no N-PORT and correctly fall back to indicative top holdings.
- **Holdings quarter-over-quarter diff** — Works where an N-PORT series exists.

## Macro Markets

| Surface | Status | Provider(s) | Cadence | Route |
|---------|--------|-------------|---------|-------|
| FX rates (official tier) | Live | [ECB via Frankfurter](https://frankfurter.dev) `api.frankfurter.dev` | — | `/live-data/fx-rates` |
| FX rates (extended tier, +127) | Live | [currency-api (community)](https://github.com/fawazahmed0/currency-api) `cdn.jsdelivr.net` | — | `/live-data/fx-rates-extended` |
| Treasury par yield curve | Live | [U.S. Treasury](https://home.treasury.gov) `home.treasury.gov` | 4h revalidate | `/live-data/treasury-yield-curve` |
| Macro news (commodities/bonds/FX) | Live | Investing.com / OilPrice / FXStreet / CNBC / Dow Jones RSS | — | `/live-data/macro-news` |
| Futures term structure (forward curve) | Not available | None — no reachable source quotes dated contract months | — | `/live-data/futures-curve` |
| Commodity / FX / rate quotes + charts | Key-gated | [FMP](https://site.financialmodelingprep.com/developer/docs) `financialmodelingprep.com` _(key)_<br>Finnhub / Twelve Data / Alpha Vantage _(key)_ | — | `/live-data/security-quotes · security-chart · security-ohlcv` |

- **FX rates (official tier)** — ECB’s complete published set of ~30 reference currencies.
- **FX rates (extended tier, +127)** — Community-sourced, not ECB — the UI shows a distinct disclosure and never blends the two tiers without attribution.
- **Treasury par yield curve** — Official 13-maturity daily par curve (XML).
- **Macro news (commodities/bonds/FX)** — 8 keyless RSS feeds with a content-first pillar classifier.
- **Futures term structure (forward curve)** — Dated contract months (CLZ26.NYM style) priced through Yahoo’s v8 chart API, verified 9/9 across NYMEX/COMEX/CBOT by the P2-O1 audit (2026-08-05). Yahoo was withdrawn on terms grounds 2026-08-06 and nothing else the app can reach quotes a dated month — FMP/Tiingo/Finnhub/Twelve Data/Alpha Vantage carry continuous front-months at best, exchange settlement files are licensed. The route resolves the contract months and returns ok:false with the reason; the card states it on-page. Front-month prices are unaffected.
- **Commodity / FX / rate quotes + charts** — Futures, FX pairs, and yield indices still price through the equity quote/chart routes (no separate plumbing). ⚠ This is the surface the Yahoo removal hit hardest: symbols like GC=F, EURUSD=X and ^TNX were quoted keylessly and are NOT covered by Tiingo, so coverage now depends on the keyed provider you configure and is expected to be partial. Catalogs carry no reference prices, so anything unpriced renders an honest dash rather than a stale number. The FX converter and Treasury yield curve are keyless and unaffected. Reference/fallback data: `lib/data/commodityCatalog.ts`, `lib/data/currencyCatalog.ts`, `lib/data/ratesCatalog.ts`.

## Shared / Cross-module

| Surface | Status | Provider(s) | Cadence | Route |
|---------|--------|-------------|---------|-------|
| Headlines (cross-module landing feed) | Live | Crypto + equity news feeds (merged client-side) | — | `/live-data/news + /live-data/market-news` |
| Watchlist (cross-module live prices) | Live | [CoinGecko](https://www.coingecko.com/en/api) `api.coingecko.com`<br>Equity quote ladder (FMP → Finnhub → Twelve Data → Tiingo → Alpha Vantage) _(key)_ | — | `/live-data/portfolio-prices + /live-data/security-quotes` |
| Compare (growth-of-100, window stats, correlation) | Derived | [Tiingo](https://www.tiingo.com/documentation/general/overview) `api.tiingo.com` _(key)_<br>[FMP](https://site.financialmodelingprep.com/developer/docs) `financialmodelingprep.com` _(key)_<br>[CoinGecko](https://www.coingecko.com/en/api) `api.coingecko.com`<br>Finance Now computation (alignment, stats, correlation) | — | `/live-data/security-chart + /live-data/chart` |
| AI Daily Brief | Derived | Finance Now AI agent (LLM, BYOK) _(key)_<br>Live-data routes (same feeds the UI reads) | — | `/api/agents/research` |
| Portfolio Builder (allocations, drift, suitability) | Derived | Finance Now engine (lib/data/portfolioBuilder.ts)<br>[CoinGecko](https://www.coingecko.com/en/api) `api.coingecko.com`<br>Equity quote ladder (FMP → Finnhub → Twelve Data → Tiingo → Alpha Vantage) _(key)_ | — | `/live-data/portfolio-prices + /live-data/security-quotes (drift monitoring)` |
| Global adoption / CBDC tracker | Not available | Static table + central-bank sites | — | `/live-data/cbdc-data` |
| Integrations connectivity test | Derived | Every configured provider (crypto + equity + LLM) _(key)_ | — | `/live-data/config` |

- **Watchlist (cross-module live prices)** — Prices split by instrument class: CoinGecko ids price through portfolio-prices, sec:-keyed stocks/funds/macro through the security-quotes ladder. Lists themselves are user data (Postgres), not a provider feed.
- **Compare (growth-of-100, window stats, correlation)** — Price series are provider data (Tiingo or FMP for stocks/funds, CoinGecko closes for crypto); the growth-of-100 normalization, window statistics, and correlation matrix are computed by Finance Now, not published figures. Comparing a stock against a macro instrument may now come back one-sided — the equity leg is keyed and the macro leg often uncovered since the Yahoo removal.
- **AI Daily Brief** — AI-generated text grounded in the user’s holdings and the same /live-data routes the UI reads. This is Finance Now’s own computation — not a publisher’s analysis — and inherits the freshness of whatever feeds the agent’s tools returned.
- **Portfolio Builder (allocations, drift, suitability)** — Allocations, bond ladders, diversification and suitability scores are Finance Now’s own computation (pure engine, vitest-tested) — not provider figures. Live prices enter only for drift-vs-actual monitoring; unpriced positions are excluded, never valued at cost. Reference/fallback data: `lib/data/portfolioBuilder.ts`, `lib/data/fundCatalog.ts`.
- **Global adoption / CBDC tracker** — De-routed (T5): mislabeled tracker on stale static data. /global-adoption redirects to /headlines. Kept for reference only.
- **Integrations connectivity test** — Not a data surface — it pings each provider from the Integrations page to report reachability/utilization.

---

_49 surfaces catalogued. Regenerate with `npm run data-sources`; verify against the route code with `npm run data-sources -- --verify`._
