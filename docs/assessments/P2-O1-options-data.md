# P2-O1 — Options & futures data-source audit

**Measured 2026-08-05 on the owner's machine** (`node frontend/scripts/audit-options-data.mjs`),
which is the only place these verdicts are valid — datacenter IPs are blocked, rate-limited
and geo-fenced differently, and a container run of this same script returns 0/15 including
the `CL=F` control the app serves in production daily.

**Result: 12/15 probes returned data.** Two clean verdicts, one of which is a GO, and one
policy question that the measurements sharpen rather than settle.

---

## 1. Options chains

### CBOE delayed quotes — works perfectly, and cannot be used

Technically this is the best result the audit could have produced. All three symbol classes
returned HTTP 200 with the complete field set, sub-second:

| Symbol | Class | Contracts | Fields |
|---|---|---|---|
| AAPL | equity | 3,618 | bid, ask, last, volume, open interest, **iv, delta, gamma, theta, vega** |
| SPY | ETF | 14,364 | same — nothing missing |
| ^SPX | index | 32,332 | same — nothing missing |

Timestamps were ~15 minutes delayed, exactly as documented. Full greeks and IV mean this
one source could populate a chain browser end-to-end *and* fill `scoreOptionsTrade()`'s
optional `delta` input, which the P2-O2 scorer currently asks the user to copy by hand.

**It fails on terms, and the terms are not ambiguous.** Cboe's delayed-quote pages carry
this notice, consistently across every symbol and product page checked
([CBOE](https://www.cboe.com/delayed_quotes/CBOE/quote_table/),
[OPTIONS](https://www.cboe.com/delayed_quotes/options/),
[VIX](https://www.cboe.com/delayed_quotes/vix/),
[futures](https://www.cboe.com/delayed_quotes/futures/future_quotes/)): downloading delayed
quote-table data **"by using auto-extraction programs/queries and/or software" is strictly
prohibited**, Cboe **blocks the IP addresses** of parties who attempt it, the data is the
property of Cboe LiveVol or its providers, and access by any means other than **manual
ticker-symbol entry** is prohibited. Programmatic and redistribution use is routed through
the licensed, paid [Cboe All Access API](https://datashop.cboe.com/cboe-all-access-api);
external redistributors of even *delayed* data must sign a Data Agreement (hence licensed
resellers like [Intrinio's delayed Cboe One feed](https://intrinio.com/financial-market-data/cboe-one-delayed)).

The `cdn.cboe.com/api/global/delayed_quotes/options/*.json` endpoint the probe hit is the
backing API for exactly those quote-table pages. A server-side route polling it is the
prohibited pattern, described almost word for word.

**Two independent reasons this is a NO-GO, not a judgement call:**

1. **Policy.** This project treats licensing as first-class — CUSIP-level bond quotes are
   deliberately absent from `/macro/rates` and say so on-page; News Charts is EOD-only to
   avoid exchange licensing. Shipping a source whose terms prohibit this exact access
   pattern would contradict a standing decision, not extend it.
2. **Operational.** The stated enforcement is IP blocking. For a server-side route that
   means the app's own egress going dark without warning — and the failure would land on
   whichever surface happened to be rendering, not on a provider row someone is watching.

*(If Cboe data is genuinely wanted later, the All Access API is the honest path: a keyed
provider-registry row, priced and configured deliberately. That is a product/spend decision,
not an audit finding.)*

### Yahoo options — closed

All three probes returned **HTTP 401**, on both `query1` and `query2`, for AAPL and SPY
alike. An auth wall, not a rate limit or a transient error: the keyless Yahoo options path
is shut, consistent with the cookie/crumb tightening Yahoo has been applying across its
v-APIs. This was the candidate that would have inherited the app's existing (already
accepted) Yahoo posture. It is not available to inherit it.

Note the contrast that makes this a clean finding rather than a network artifact: Yahoo's
**v8 chart** API answered 10/10 in the same run from the same machine. Yahoo is reachable;
Yahoo *options* is gated.

### Consequence: there is no keyless options-chain source

The two keyless candidates are exhausted — one blocked by terms, one by authentication.
Chains are therefore **not deliverable without a key**, which turns P2-O3 from a build
task into a spend decision. See "The decision" below.

---

## 2. Futures term structure — **GO**

All 9 individual-contract-month probes passed. `CL` (NYMEX), `GC` (COMEX), `ZC` and `ZN`
(CBOT) all resolve at specific months (U26 and Z26) through the **same Yahoo v8 chart API
the app already uses in production** for continuous front-months — 64 daily bars back to
2026-05-05, no errors.

The curve shape is visible and sane in the measured data:

| Contract | Sep 2026 (U26) | Dec 2026 (Z26) | Shape |
|---|---|---|---|
| WTI crude | 76.11 | 72.42 | **backwardation** |
| Gold | 4,177.7 | 4,223.6 | **contango** |

**Consistency check:** `CLU26.NYM` returned exactly 76.11, identical to the `CL=F`
continuous control. That is the expected result, not a bug — September is the WTI front
month in early August, so the continuous series is tracking U26. It confirms the
individual-month symbols resolve to the same underlying series the app already charts.

**No new provider, no new licensing question, no new plumbing** — P2-O4 is unblocked and
buildable now.

---

## 3. IV rank

`scoreOptionsTrade()` takes an optional `ivRank` (where today's IV sits in its 52-week
range). That needs IV **history**, which none of the probed sources provide — CBOE's
delayed feed carries current IV per contract (and is out on terms anyway), and Yahoo
options is closed. **Confirmed: ivRank stays manual entry.**

The alternative — compute IV rank going forward by persisting a daily IV snapshot — is a
real option but a product decision with a storage cost and a 52-week warm-up before the
number means anything. Flagged, not taken.

---

## 4. Key-gated tiers (not probed — no keys to probe with)

If chains become a priority, these are the candidates, in the order worth evaluating.
Plan inclusions change; **verify current pricing before committing**:

| Provider | Chains on | Notes |
|---|---|---|
| **Tradier** | Free developer sandbox (delayed); production needs a brokerage account | Cleanest fit: documented API, explicit delayed tier, no scraping question |
| Polygon | Paid options plan | Well-documented; real-time available at higher cost |
| Finnhub | Paid tiers | |
| Alpha Vantage | Premium | Already an env var in the registry for equity quotes |

Any of these would enter as a **key-gated provider-registry row** reporting
`configured: false` when absent — the pattern FMP already follows — so the app degrades
honestly rather than silently.

---

## The decision this audit exists to surface

The measurements changed its shape. The original framing assumed a working free delayed
source and asked whether "delayed" is an acceptable data category. There is no working free
source, so the question is now:

- **Option A — chains stay not-available.** Consistent with the standing live-only stance
  ("no free real-time source → explicit not-available notice", as `/macro/rates` already
  does for CUSIP-level bond quotes). P2-O3 is closed rather than deferred; P2-O5's chain
  half goes with it. Zero cost, zero new licensing surface. The P2-O2 scorer continues to
  serve the actual use case — score a trade you are considering — with hand-entered legs.
- **Option B — add a keyed provider (Tradier first).** Chains become a key-gated surface
  like FMP's broad universe: present when configured, honestly absent otherwise. This
  *also* requires settling the delayed-data convention, since Tradier's free tier is
  delayed: every surface showing a delayed number renders the delay in the
  `ProvenanceNotice` pattern (always visible, never only-when-stale), and the delay
  metadata travels through `/api/v1` verbatim so external consumers cannot mistake delayed
  for live.

**Recommendation: Option A for now.** The scorer already delivers the module's value
without a chain, P2-O4 delivers real new capability with no dependency at all, and Option B
can be adopted later without rework — a keyed row is additive to the provider registry by
design. Nothing about choosing A forecloses B.

### DECIDED — Option A, owner, 2026-08-05

**Options chains stay not-available.** P2-O3 and the chain half of P2-O5 are closed, not
deferred with a date. The Trade Risk Scorer (`/equities/options`) continues to serve the use
case with hand-entered legs, and its copy already tells the user to copy those numbers from
their broker's chain.

**This is revisitable, and the trigger is named.** The owner's framing was "revisit after
testing" — so this is a decision made on the current evidence, not a permanent position.
Reopen it if any of these change:

1. **A licensed source becomes worth its cost.** Tradier is the first candidate: a documented
   API with an explicit delayed tier, no scraping question, and a free developer sandbox to
   evaluate before committing. Re-run the plan comparison in §4 — pricing moves.
2. **Live use shows the manual-entry scorer is the wrong shape.** If entering four legs by
   hand is what stops people using it, that is evidence a chain browser earns its cost. If
   people use it happily against their broker's screen, that is evidence it doesn't.
3. **Yahoo's options endpoint reopens.** It returned 401 on both hosts here; if a later probe
   shows it answering keyless, the calculus changes — though it would then need judging
   against the app's existing Yahoo posture, not a new stricter rule.

What choosing A does **not** do: it doesn't reject options as a product area (the scorer
shipped, and is wired into the agents, the v1 API and MCP), and it doesn't foreclose B — a
keyed provider row is additive to the registry by design, so adopting one later is new work,
not rework.

**If B is ever taken, the delayed-data convention must be settled first**, before any route
ships: every surface showing a delayed number renders the delay in the `ProvenanceNotice`
pattern (always visible, never only-when-stale), and the delay metadata travels through
`/api/v1` verbatim so external consumers cannot mistake delayed for live. That question is
unanswered because it never had to be answered — not because it was decided.

---

## Verdicts

| Surface | Verdict | Basis |
|---|---|---|
| **P2-O3** options chain browser | **CLOSED** — Option A, owner, 2026-08-05 (revisitable, triggers above) | CBOE prohibited by terms; Yahoo options 401 on both hosts. No keyless path exists, and a keyed one isn't worth its cost yet. |
| **P2-O4** futures term structure | **GO** | 9/9 contract months via the v8 chart API already in production; control consistency verified; curve shapes sane. |
| **P2-O5** integration | **Scorer half SHIPPED**; chain half closed with O3 | `score_options_trade` + `/api/v1/options/score` + MCP mirror shipped 2026-08-05. `get_options_chain` and `/api/v1/options/chain` are not built. |
| IV rank source | **None keyless** | Stays manual entry; forward-persistence is a separate product decision. |

`DATA-AVAILABILITY.md` updated in the same change.
