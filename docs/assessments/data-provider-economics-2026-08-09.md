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

*(section completed below — see the per-provider table and the futures/licensing notes)*

---

## 4. Cost scenarios

*(completed below after the alternatives research)*

---

## 5. Recommendation

*(completed below)*
