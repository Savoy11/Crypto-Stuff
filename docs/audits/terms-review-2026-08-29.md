# Source terms review — 2026-08-29 probe results

`npm run terms:report -- --seeded` was run on the owner's machine (the first
time the probe has run anywhere it could actually reach these hosts). 55 hosts
probed. This records what came back and what was decided.

**Status:** 2 findings acted on — Reddit gated, CoinGecko read and verified.
1 blocked on an owner decision. The other 52 stand as seeded.

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

## Resolved after the probe

### CoinGecko — READ AND VERIFIED 2026-08-29 (API Terms, Scope of Use)

The owner read `coingecko.com/en/api_terms`. It **inverts** the alarm the probe
raised off the site ToU.

> **4.1.6** — "You are entitled to charge for your services and products that
> incorporate or integrates our CoinGecko API. However, you are not permitted to
> sell, rent, lease, sub-license, re-distribute or syndicate access to the
> CoinGecko API or part thereof."

Commercial use of a product *built on* the API is expressly permitted. What is
barred is reselling API **access**, which this app does not do. The site ToU's
"Personal Use / not for any commercial purpose" clause governs republishing
*site content* (screenshots) and never described API use — the probe read the
wrong document, exactly as this worksheet warned it might. **CoinGecko is
therefore out of the personal-vs-commercial question below.**

Attribution is **prescriptive**, and the app did not meet it:

> **4.4** — "you shall duly attribute ownership of the CoinGecko API to
> CoinGecko by displaying prominently the message **"Powered by CoinGecko"** in
> a legible font … no smaller than font size 10."

"Source: CoinGecko" is not that message. `SourceProvider.attribution` now
carries the verbatim string, its link and its 10px floor; `SourceLine` renders
it at 11px, and a test parses the rendered class and fails if it ever drops
below the licensed floor. A coverage audit found 13 registry entries reading
CoinGecko: 12 already sat under a page rendering `SourceLine`, and the **alerts
bell** did not — a dropdown is a surface, and it was showing CoinGecko-derived
data with no provenance above it. Fixed.

Entry flipped to `review: 'verified'`, `termsUrl` repointed from the site ToU to
the API Terms, six conditions recorded from the clauses.

**Scope of Use was read in full; the rest of the document was not** — recorded
in the finding, because the seeded/verified discipline applies to how much of a
document was read, not merely whether it was opened.

## Checked, no action

### MarketWatch — flagged, but not the host we fetch

The probe reported `marketwatch.com/robots.txt` disallowing `/`. **We do not
fetch that host.** The feed is `feeds.content.dowjones.io/public/rss/mw_topstories`.
No action; recorded so it is not re-raised.

---

## Blocked on an owner decision

**Is Finance Now personal/internal, or commercial?**

Personal / non-commercial clauses were flagged on **Finnhub, Twelve Data,
Tiingo, Binance.US, YouTube, OilPrice and Bitget** — seven sources whose
verdicts all turn on this one answer. (CoinGecko was in this list until its API
Terms were read; the lesson generalises — **check whether each of these
publishes separate API terms before treating its site ToU as the verdict.**) Finnhub's is the bluntest:

> "You hereby agree to not redistribute or share access to data or derived
> results from the data obtained from Finnhub with anyone or any 3rd party
> without written approval from Finnhub."

Personal/internal use sits comfortably inside most of these free tiers.
Commercial or publicly-served use breaks several. **Nothing further should be
verified until this is settled**, because the answer changes the verdict rather
than the confidence.

---

## Which of the seven have SEPARATE API terms (checked 2026-08-30)

CoinGecko's lesson was that a provider's **site ToU** and its **API terms** can
reach opposite conclusions, and the probe reads whichever it finds first. So
before any of the remaining seven is judged on the personal/non-commercial
question, the operative document has to be identified. This is that check.

**Method and its limit:** every one of these hosts is blocked from the build
environment, so none of these documents was read here. What follows establishes
*which document to read* and flags where the probe demonstrably read the wrong
one. Nothing below is a verdict, and no entry should be flipped to `verified` on
this section alone.

| Source | Operative document | Status |
|---|---|---|
| **YouTube** | `developers.google.com/youtube/terms/api-services-terms-of-service` | ⚠ **Probe read the wrong document — same error as CoinGecko** |
| **Tiingo** | Site ToS **plus** a separate licence that overrides it | ⚠ **Layered; needs a targeted read** |
| **Bitget** | Exchange ToS; API docs may carry their own | ◻ Unresolved |
| **Twelve Data** | `twelvedata.com/terms` — appears to BE the API agreement | ✓ Probe read the right document |
| **Finnhub** | `finnhub.io/terms-of-service` — API clauses are inside it | ✓ Probe read the right document |
| **Binance.US** | `binance.us/terms-of-use` — explicitly covers the APIs | ✓ Probe read the right document |
| **OilPrice** | Site terms — no API product exists | ✓ Right document by default |

### YouTube — read the wrong document, and the registry already knew

The registry's `termsUrl` is the **API Services Terms of Service**. The probe's
own output reports `Terms found at: https://youtube.com/terms` — the consumer
site terms — and the clause it flagged, *"You may view or listen to Content for
your personal, non-commercial use"*, is from that document. It describes
watching videos on youtube.com. It does not describe Data API v3 use, which the
API Services ToS governs separately.

This is the CoinGecko pattern exactly, and it is visible in the probe output
without needing to fetch anything. **Read the registered URL.**

### Tiingo — the site ToS is not the last word

Tiingo's terms state that where Software carries its own licence agreement,
*"the license agreement shall take precedence"* over the Terms in any conflict —
and separately that **display or data redistribution requires a separate licence
from Tiingo**. So the document the probe read can be overridden by a licence
attached to the plan, and the app's use (displaying quotes) may be exactly the
case that separate licence covers. **Needs the plan's licence, not just the ToS.**

### The four already read correctly

- **Twelve Data** — the probe's own excerpt defines *"Customer"* and *"Internal
  Use"*, which is API-agreement drafting, not website boilerplate.
- **Finnhub** — the flagged clause sits under a heading reading *"Redistribution
  Rights and Personal Use"* and speaks of *"data obtained from Finnhub"*. That is
  API language inside the single ToS.
- **Binance.US** — its ToU states users agree to it by accessing *the Website or
  BAM APIs*, so it governs API access on its face. (The separate agreements that
  exist are for authenticated and institutional endpoints, which RP-5 forbids
  this app from using regardless.)
- **OilPrice** — an RSS publisher with no API product; there is no other document
  to find. Its personal/non-commercial clause sits in *Disclaimers* and addresses
  website content, so whether it reaches RSS syndication is a reading question,
  not a wrong-document question.

### What this changes

The personal/non-commercial question is **seven sources wide on paper but at
most five in substance** — YouTube almost certainly drops out on reading the
right document, and Tiingo's answer depends on a licence nobody has looked at
rather than on the ToS the probe read.

---

## Confirmed as recorded

- **Yahoo** — probe `blocked`; entry already `prohibited` and hard-blocked in
  `pinnedFetch`. The removal decision holds.
- **SEC, Treasury, Frankfurter, Nasdaq Trader, mempool.space** — government or
  openly-published reference data; nothing in the probe contradicts the entries.
- Remaining hosts: no clause matched, or matched clauses consistent with the
  recorded verdict. All still `seeded` — no clause matching, and no absence of
  it, is a reading.
