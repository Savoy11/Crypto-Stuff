# Source terms review — 2026-08-29 probe results

`npm run terms:report -- --seeded` was run on the owner's machine (the first
time the probe has run anywhere it could actually reach these hosts). 55 hosts
probed. This records what came back and what was decided.

**Status:** 1 finding acted on. 1 needs the right document. 1 blocked on an
owner decision. The other 52 stand as seeded.

---

## Acted on

### Reddit — robots.txt disallows us · GATED 2026-08-29

The probe read `reddit.com/robots.txt` first-hand: **disallows `/` for this
app's agent**. The app was reading `reddit.com/r/*/hot.rss` and `search.rss`
from two routes at the time.

This is different in kind from the rest of the report. A terms verdict is an
interpretation of a document that is often unreadable from a datacenter;
robots.txt is a machine-readable instruction we either honour or do not. The
registry's existing condition — *"expect and accept 403s rather than working
around them"* — anticipated refusals, but a 403 is a refusal we might have been
routing around, whereas a robots disallow is one we were not honouring at all.

**Done:** `robotsDisallowed` added to `SourceTermsEntry` as a *dated first-hand
observation, separate from the terms `review` state* — so recording the robots
fact does not launder the unread Data API Terms into a full review. Reddit's
entry stays `seeded` on its terms and now carries a `verified` robots reading.

Enforcement is structural, in `pinnedFetch`, so a future call site inherits the
block rather than needing to remember it; both social routes also gate their
Reddit rung explicitly and degrade to StockTwits. `/live-data/stock-social`
returns a `withheld` entry naming the source and the reason, and the equities
Social page renders it — an absent provider must be explained, or a thinner
feed reads as a quieter market.

**Reversible by credential, not by code:** setting `REDDIT_CLIENT_ID` lifts the
gate, because OAuth moves the request off the anonymous path robots forbids.
That is Reddit's own supported route back in.

---

## Needs the right document

### CoinGecko — the probe read the site ToU, not the API terms

The probe found `coingecko.com/terms` and flagged it hard: *prohibits automated
access*, *prohibits scraping*, *personal / non-commercial use only*, and a
licence granted *"solely for your Personal Use … and not for any commercial
purpose."*

**Read in context, that document governs the WEBSITE.** Its "Personal Use"
definition is about republishing *screenshots of the site* on a non-commercial
blog. CoinGecko publishes **separate API terms** for the Demo/free tier, and
that is the document governing what this app actually does — keyed and keyless
API reads, not site scraping.

So this is neither cleared nor condemned, and the worksheet's own caveat
applies: *"it may mean the document was not the right one."* Given how much of
the app rides on CoinGecko, its API terms are the highest-value single document
left to read.

Mitigation already in place: `/live-data/coin-profile` runs CoinMarketCap
(keyed, licensed) as rung 1, with the keyless CoinGecko rung switchable off via
`FN_ALLOW_KEYLESS_COIN_PROFILES=false`.

### MarketWatch — flagged, but not the host we fetch

The probe reported `marketwatch.com/robots.txt` disallowing `/`. **We do not
fetch that host.** The feed is `feeds.content.dowjones.io/public/rss/mw_topstories`.
No action; recorded so it is not re-raised.

---

## Blocked on an owner decision

**Is Finance Now personal/internal, or commercial?**

Personal / non-commercial clauses were flagged on **CoinGecko (site ToU),
Finnhub, Twelve Data, Tiingo, Binance.US, YouTube, OilPrice and Bitget** — eight
sources whose verdicts all turn on this one answer. Finnhub's is the bluntest:

> "You hereby agree to not redistribute or share access to data or derived
> results from the data obtained from Finnhub with anyone or any 3rd party
> without written approval from Finnhub."

Personal/internal use sits comfortably inside most of these free tiers.
Commercial or publicly-served use breaks several. **Nothing further should be
verified until this is settled**, because the answer changes the verdict rather
than the confidence.

---

## Confirmed as recorded

- **Yahoo** — probe `blocked`; entry already `prohibited` and hard-blocked in
  `pinnedFetch`. The removal decision holds.
- **SEC, Treasury, Frankfurter, Nasdaq Trader, mempool.space** — government or
  openly-published reference data; nothing in the probe contradicts the entries.
- Remaining hosts: no clause matched, or matched clauses consistent with the
  recorded verdict. All still `seeded` — no clause matching, and no absence of
  it, is a reading.
