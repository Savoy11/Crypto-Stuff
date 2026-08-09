# Data-provider economics — commercial Yahoo alternatives, BYOK vs bundled data

**Researched 2026-08-09 from a remote session.** Pricing and terms below were assembled by
web research (official pricing/terms page text where indexed, 2026-dated third-party pricing
trackers where not); the provider hosts themselves were unreachable from this environment's
egress gateway, so — same rule as every data audit in this repo — **exact dollar figures and
terms clauses must be re-confirmed from the owner's machine before any purchase decision.**
Items resting on weaker evidence are marked UNVERIFIED inline.

**The question.** Yahoo Finance was removed 2026-08-06 on terms grounds (#75), leaving every
rung of the equity/fund/macro quote–chart–OHLCV ladder keyed. Two ways to staff that ladder
going forward:

- **A. BYOK (status quo)** — each user brings their own provider keys via the Integrations page.
- **B. Bundled data** — Finance Now buys commercially licensed data and serves it to all
  users, priced into the module subscription (ROADMAP Phase 6, Stripe).

This assessment prices both, states what each is legally standing on, and recommends.

---

## 1. What actually needs a provider (needs inventory)

Only the key-gated surfaces are in scope — everything already keyless is unaffected by this
decision and stays free under either model:

| Already keyless (no cost either way) | Source |
|---|---|
| Fundamentals, filings, XBRL P/E backfill | SEC EDGAR |
| Fund holdings + quarter-over-quarter diffs | SEC N-PORT |
| Treasury yield curve + spreads | treasury.gov |
| FX reference rates (30 ECB + 127 extended) | frankfurter.dev / community API |
| All news (crypto, equities, macro), social | publisher RSS, Reddit/StockTwits |
| All of crypto | CoinGecko, DefiLlama, mempool.space, … |

The key-gated surfaces, i.e. what a provider decision is actually buying:

| Surface | Data type | Routes | Cache window |
|---|---|---|---|
| Stock/ETF/fund quotes | delayed or EOD quotes, prev close, market cap | `security-quotes` | 60 s |
| Price charts | daily close history | `security-chart` | 300 s |
| TA / backtests / candles | full OHLCV | `security-ohlcv` | 300–3600 s |
| Trailing returns columns | 1M/3M/YTD/1Y closes | `security-returns` | 900 s |
| Stock Registry universe | screener across all US common stocks | `stock-universe` | daily |
| Fund sector weights | ETF sector allocation | fund detail | — |
| Macro instrument quotes | futures front-months, FX pairs, yield indices | same ladder | 60 s |

Three standing gaps that predate this assessment and constrain it:

1. **Dated futures contracts (GC=F-style) have no reachable source at any of the retail
   API vendors** — the research below re-confirmed it across all nine providers checked.
   Term structure stays dark short of exchange-licensed feeds (Databento/CME — priced below).
2. **Real-time is not the bar.** Every consuming surface tolerates 15-min-delayed or EOD
   data; caches are 60 s+. This matters because *delayed* display licensing is dramatically
   cheaper than real-time exchange fees.
3. **Quotes are served through a shared server-side cache**, so upstream volume scales with
   *unique symbols viewed per cache window per deployment*, not with user count. One
   licensed key covers an entire hosted deployment; cost is a flat monthly fee, not per-user.

### Volume model used below

Worst-case hosted deployment (all caches cold, no overlap between users):
~50 registry symbols + ~45 macro instruments + watchlist/portfolio symbols ≈ **100–200 unique
symbols per 60 s window** at peak → ceiling ≈ **150–300k quote calls/day**, plus OHLCV at
5–60 min windows (small) and one universe screen/day. A single mid-tier plan
(FMP Starter 300 calls/min, Twelve Data Grow, Tiingo Power 100k/day) covers this **capacity**
comfortably. Capacity is not the problem anywhere below — **license class is.**

---

## 2. The incumbent ladder — what the current five actually permit

Verified 2026-08-09 (method caveat above). The finding that reframes the whole question:

> **None of the five free tiers permits commercial use.** Every one is explicitly
> personal / internal-use only. And no standard *paid* personal tier covers displaying
> data to end users of a commercial app either — that is a separate license class at
> every vendor.

| Provider | Free tier | Free = commercial OK? | Personal paid | Cheapest **end-user display** license |
|---|---|---|---|---|
| FMP | 250 calls/day, EOD sandbox | **No** — ToS: no Commercial Use; personal plans are individual-only | Starter $22 / Premium $59 / Ultimate $149 per mo | Build/Enterprise + "Data Display and Licensing Agreement" — **price unpublished, contact sales** |
| Finnhub | 60 calls/min | **No** — "Personal Use (Terms apply)" | Modular bundles from ~$50/mo, realistic stack $150–200/mo (third-party figures) | **Contact sales** (all-in-one enterprise ≈ $3.5k/mo, third-party figure) |
| Twelve Data | 8 credits/min, 800/day | **No** — "Internal Use" license | Grow $29 / Pro $99 / Ultra $329 per mo | **Venture $499/mo** ($414 annual-billed) — the only published self-serve display price in the set; Enterprise $1,099/mo adds redistribution scope |
| Tiingo | 1,000 req/day, 500 symbols/mo | **No** — individual license | Power $30/mo (still non-commercial) | **Commercial $50/mo / $499/yr** — covers building a commercial product; raw redistribution needs a negotiated add-on. Whether end-user quote display falls inside the $50 plan **needs a direct answer from Tiingo support before relying on it** |
| Alpha Vantage | 25 req/day | **No** — personal; realtime/delayed US data sold on-site is explicitly personal-non-commercial (Nasdaq-licensed entitlement) | $49.99–$249.99/mo | **Contact sales** |

Recent movement worth knowing: Alpha Vantage's free tier has collapsed in stages
(500→100→25 req/day); Tiingo Power roughly tripled ($10→$30/mo); FMP retired legacy
`/api/v3` for new keys (already recorded in CLAUDE.md); Twelve Data quietly repriced
Pro/Ultra upward ($79→$99, $229→$329, timing UNVERIFIED).

### What this means for BYOK's legal posture

BYOK does not become "commercial use" merely because Finance Now is a paid product — the
question is *whose use the data serves*. Two configurations, opposite conclusions:

- **Self-hosted / desktop install (each user runs their own instance, their own key, data
  shown only to themselves):** this is the personal use the free tiers describe. The user's
  key, the user's screen, no redistribution. This is the posture BYOK was built for and it
  remains sound.
- **Finance Now-operated hosted deployment holding users' keys server-side:** each key still
  only feeds its owner's screens, which is a defensible reading of "personal use" — but the
  operator is now a commercial service intermediating provider access, and several ToS
  (FMP's "may not be used on behalf of a company… or any other third party") can be read
  against it. Gray, not clean. A paid Finance Now tier that *instructs* users to lean on
  free personal keys is the worst version of this posture.

---

## 3. The alternatives field

Landscape notes first: **Polygon.io rebranded to Massive (massive.com) on 2025-10-30** —
same company and APIs, polygon.io redirects. IEX Cloud's 2024 shutdown had no sequel in
2025–26. **No official Yahoo Finance API exists in 2026** — nothing has changed since the
2017 deprecation, so the terms-based removal (#75) has no "just pay Yahoo" exit.

| Provider | Self-serve price range | Commercial end-user display on a self-serve plan? | Fit notes |
|---|---|---|---|
| **Massive** (ex-Polygon) | $29–199/mo per asset class (stocks, options, indices, currencies, futures) | **No.** Individual terms prohibit any business use and "application intended for use by end users other than yourself" — even the delayed tiers. Business: contact sales; ~$2k/mo equities, $999/mo **per exchange** futures (third-party figures, UNVERIFIED) | Best-in-class API and the only retail vendor with real CME futures — but the display license is a $2k+/mo conversation |
| **EODHD** | Free 20 calls/day; All-In-One **$99.99/mo** (100k calls/day) | **No.** All standard plans personal-use; commercial track **from €399/mo**, which then *includes* redistribution rights | Broadest single-key match to this app: stocks, 20k ETFs, 20k US mutual funds, 600+ indices, 1,100 FX pairs, fundamentals, news. No exchange futures (its "commodities" API is ~23 FRED series) |
| **Marketstack** | Free 100 req/mo; Basic $9.99 / Professional $49.99 (100k req/mo) / Business $149.99 (500k req/mo) | **Yes — paid plans include commercial use.** The cheapest legally-clean display option found. (Full clause text UNVERIFIED — read the Service Agreement before relying on it) | EOD + intraday equities/ETFs/indices, ~170k tickers. No FX, no futures, no mutual-fund NAV depth, no options. "Real-time" is loose — treat as EOD/near-intraday |
| **Intrinio** | Cboe One Delayed: **$3,000/yr flat**; US equities packages from ~$250/mo; most products contact-sales | **Yes — display licensing is the product.** Cboe One Delayed is explicitly licensed for display platforms, no per-user fees (launched Aug 2025) | The professional answer for delayed US equity quotes with bid/ask. Equities/ETFs/options/fundamentals; not a futures/FX/mutual-fund shop |
| **Databento** | $125 trial credit; usage-based historical; Standard $179/mo; CME live from $32.65/mo (non-pro passthrough) | **Yes for equities** — US Equities Mini is a derived feed with zero exchange license fees and **redistribution/display permitted on any plan**. **No for futures** — CME has no free-delayed regime; display licensing is a CME conversation | Real-time equities with clean redistribution, but it's a raw feed (more integration than a REST quote API). The realistic futures source if term structure ever becomes a must-have |
| **Alpaca** | Free (IEX real-time, delayed SIP); Algo Trader Plus $99/mo | **No.** Personal, non-business use; commercial display = Broker API partnership | US equities/ETFs/options/crypto only |
| **marketdata.app** | $12–250/mo | **No — disqualifying.** All plans exclusively for certified non-professional individuals | Broad coverage (incl. mutual funds) for personal tooling only |
| **Nasdaq Data Link** | QDL namespace free sets remain; platform tilted premium | n/a | Not worth adding in 2026. Treasury/rates: stay on treasury.gov direct (already keyless) |
| **Finazon** | Individual from ~$4/mo | **No** — commercial from ~$2,000/mo + exchange fees | Marketplace entrant; nothing here at this budget |

### The structural fact that shapes everything

For US equities, **15-minute-delayed data is nearly free at the exchange level**: UTP
(Nasdaq tape) charges nothing for delayed data on controlled products, and CTA (NYSE tapes)
permits delayed distribution at no charge past 15 minutes — no per-user fees, no pro/non-pro
classification, just vendor paperwork and a visible "prices delayed 15 minutes" legend.
**The binding constraint is never the exchange — it's each API vendor's own license terms**,
which is why the same delayed data is personal-only at Massive/$29 and display-licensed at
Intrinio/$250-a-month-equivalent. Futures are the exception: CME has no free-delayed regime
at all, so even delayed CME display carries exchange licensing — which independently
confirms this repo's standing "term structure has no source, say so honestly" posture as
the economically correct one, not just the honest one.

Every consuming surface in this app tolerates delayed/EOD data (60 s+ caches, `ref`-tag
convention already in place), so the cheap regime is fully usable.

---

## 4. Cost scenarios

All scenarios assume the volume model in §1 (shared server cache; cost is flat per
deployment, ~zero marginal per user). Annualized figures rounded.

### A. BYOK, as today — $0/mo to the operator

- **User cost:** $0 on free tiers (personal use, legally sound when the user's key feeds
  only the user's own screens) up to $22–99/mo if a user buys a personal plan for better
  rate limits.
- **Real costs:** activation friction (zero-key install shows `ref` prices, dark macro
  quotes) and the §2 gray zone once Finance Now itself is a *paid, hosted* product
  intermediating free personal keys.
- **Where it is unambiguously right:** desktop / self-hosted distribution (ROADMAP owner
  backlog) — each install is the personal use the free tiers describe. BYOK should never
  be removed from the product for this reason alone.

### B. Bundled data — operator-licensed stacks, cheapest legally-clean first

| Stack | Monthly | Annual | Covers | Still missing |
|---|---|---|---|---|
| **B1. Budget:** Marketstack Professional + Tiingo Commercial | ~$100 (→ ~$200 if volume forces Marketstack Business) | ~$1.2–2.4k | Delayed/EOD stock+ETF+index quotes, charts, OHLCV, returns (Marketstack); mutual-fund NAVs, 30 yr history, FX, IEX intraday (Tiingo) | Futures; fund sector weights; FMP universe screener; **Tiingo's display-scope answer pending** |
| **B2. Quality:** Intrinio Cboe One Delayed + Tiingo Commercial | ~$300 | ~$3.6k | True 15-min-delayed quotes with bid/ask, licensed for display as the product's design center; Tiingo as B1 | Futures; sector weights; screener |
| **B3. One-vendor breadth:** EODHD commercial | from €399 (≈$435) | ≈$5.2k | Stocks, ETFs, **mutual funds**, indices, FX, fundamentals, news — one key, redistribution rights included | Futures; universe screener quality vs FMP unverified |
| **B4. Twelve Data Venture** | $499 ($414 annual-billed) | ~$5–6k | Display-licensed quotes/history across stocks/ETF/FX/commodity spot; the only incumbent-ladder vendor with a published display price | Futures (spot pairs only); mutual-fund holdings |
| **Futures add-on** (any stack) | Massive Business ~$999/mo **per CME-group exchange** (≈$4k/mo for CME+CBOT+NYMEX+COMEX) or Databento + negotiated CME display licensing | $12–48k+ | Dated contracts, term structure | — |

**Break-even against Phase 6 subscription revenue:** at an illustrative $10/user/mo module
price, B1 is covered by **~10–20 subscribers**, B2 by ~30, B3/B4 by ~45–50. The futures
add-on is covered by no plausible subscriber count and should be declined regardless of
stack.

**Migration cost is small by design:** bundled keys are just operator-provided keys in the
existing registry ladder (`providers.ts` already resolves UI key → env var), Marketstack /
EODHD / Intrinio would each be a new fetcher in `marketData.ts` plus `sourceTerms.ts` +
`dataSources.ts` entries (the suite fails until the registry entry exists — by design).
No architectural change; the BYOK plumbing *is* the bundled plumbing with different key
ownership.

---

## 5. Recommendation

**Hybrid, phased by deployment model — not a binary choice.** BYOK and bundled data are
not competitors; they are the same registry ladder with different key ownership, and each
is the clean answer for a different distribution of the product.

1. **Keep BYOK as the permanent architecture and the desktop/self-hosted default.** It is
   $0, legally sound for personal use, and the degraded zero-key state is already honestly
   labeled. Do not remove it in any future.

2. **Now, for ~$50/mo, fix the weakest legal posture:** the operator-run hosted deployment
   (AWS staging → production) currently runs on free personal-tier keys held by the
   operator. Buy **Tiingo Commercial ($50/mo / $499/yr)** for the operator deployment and
   **email Tiingo support the specific question** — "does the commercial plan cover
   displaying quotes/NAVs to end users of our web app, distinct from raw redistribution?"
   Their answer decides whether B1's second leg is $50/mo or needs renegotiation, and it
   is the single cheapest piece of information in this whole decision.

3. **When Stripe billing ships (Phase 6) and a hosted deployment has paying users, add
   stack B1 (~$100–200/mo)** — Marketstack for display-licensed quotes/OHLCV, Tiingo for
   NAVs/history/FX — as the bundled baseline every subscriber gets with zero setup.
   Break-even ~10–20 subscribers. Keep BYOK as the documented *upgrade* path: a user's own
   FMP key still unlocks the paid-FMP surfaces (batch quotes, universe screener, fund
   sector weights) exactly as today. Step up to B2 (Intrinio, ~$300/mo) only if quote
   quality (bid/ask, true delayed feed) becomes a competitive complaint.

4. **Decline futures data at every stack level.** $12k+/yr per exchange to light up term
   structure and macro front-months is not justified by any module's value; the ETF-proxy
   + honest-dash posture stands. Re-evaluate only if a futures-specific paid module is
   ever specced (owner backlog's options/futures tool would trigger that conversation,
   with Databento as the likely vendor).

5. **Never build the bundled tier on providers whose self-serve plans are personal-only**
   (Massive, Alpaca, marketdata.app, Finazon, and the incumbent ladder's free tiers).
   The pattern in §3 is consistent: the vendors that *want* app-display customers publish
   the license (Marketstack, Intrinio, Databento); the ones that don't, fence it behind
   sales calls an order of magnitude above this app's budget.

**Before any purchase:** re-verify the quoted prices and the specific license clauses from
the owner's machine (every provider page was egress-blocked from this session), and record
the outcome as `sourceTerms.ts` verdicts — a bundled provider's contract conditions belong
in `decision.reason` exactly like every other conditional verdict in the registry.
