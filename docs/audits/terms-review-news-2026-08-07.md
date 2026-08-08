# Source terms review worksheet — 2026-08-07

> ⚠ **THIS RUN READ NOTHING. It is the work queue, not the review.**
>
> Generated in an environment whose network policy blocks every publisher host
> at the gateway (`connect_rejected` on all ten). Every `robots.txt` line below
> says 403 and every `Terms found at` says none — that is this machine, not the
> publishers, and per the probe's own rule "couldn't read it" is neither
> permission nor refusal.
>
> **Re-run it from a machine that can reach these sites:**
> `npm run terms:report -- --news --out docs/audits/terms-review-news-<date>.md`
>
> Then read each linked document, fill in the conclusion boxes, and flip the
> entries in `frontend/src/lib/server/sourceTerms.ts` from `review: 'seeded'` to
> `review: 'verified'` with an updated `reviewedAt`. The registry's UI counts and
> its `confidence` grade key off that field, so they correct themselves.


10 host(s). Probe output is **advisory**: it locates the document and
highlights candidate clauses. Read the linked terms, then record your conclusion and
flip the entry's `review` to `'verified'` in `src/lib/server/sourceTerms.ts`.

For a news feed, the four questions that actually settle it:

1. Is there a **separate RSS/syndication policy**, distinct from the site ToS? Publishers
   often permit far more via RSS than their general ToS suggests.
2. Does it restrict use to **personal / non-commercial**? Most news RSS terms do. Decide
   whether this deployment is inside that line.
3. What may be **displayed** — headline and link only, or headline + summary? The app shows
   the feed summary, so a headline-and-link-only policy is a code change, not a note.
4. Is **attribution** required, and in what form (name, logo, link back)? Record it as a
   `conditions` entry so it survives the next person.

---

## CoinDesk — `coindesk.com`

| | |
|---|---|
| Current verdict | `conditional` (confidence: medium) |
| Review state | ⚠️ **seeded — never read** (2026-08-06) |
| Registered terms URL | https://www.coindesk.com/terms |
| Probe outcome | `registry-seeded` |
| robots.txt | robots.txt not readable (HTTP 403) — no stated restriction |
| Terms found at | _none found at the usual locations_ |
| Summary | CoinDesk: permitted subject to 2 condition(s) — Headline, link and feed summary only; Attribute and link back to the origin article. ⚠ Seeded entry — the terms document has not been read for this project; treat as a working assumption, not a clearance. |

**Recorded finding:** Publishes a public RSS feed. Syndication of headline/link/summary with attribution and a link back is the intended use; full-text reproduction is not.

**Recorded conditions:**
- Headline, link and feed summary only
- Attribute and link back to the origin article

_No clauses matched. That is not a pass — it may mean the document was not the
right one, or the wording is unusual. Check the page the probe actually read._

**Your conclusion:**

- [ ] Verdict confirmed as recorded
- [ ] Verdict changed to: `________`
- [ ] Conditions to add/change: `________`

---

## Cointelegraph — `cointelegraph.com`

| | |
|---|---|
| Current verdict | `conditional` (confidence: medium) |
| Review state | ⚠️ **seeded — never read** (2026-08-06) |
| Registered terms URL | https://cointelegraph.com/terms-and-privacy |
| Probe outcome | `registry-seeded` |
| robots.txt | robots.txt not readable (HTTP 403) — no stated restriction |
| Terms found at | _none found at the usual locations_ |
| Summary | Cointelegraph: permitted subject to 2 condition(s) — Headline, link and feed summary only; Attribute and link back to the origin article. ⚠ Seeded entry — the terms document has not been read for this project; treat as a working assumption, not a clearance. |

**Recorded finding:** Publishes a public RSS feed for syndication of headline/link/summary with attribution.

**Recorded conditions:**
- Headline, link and feed summary only
- Attribute and link back to the origin article

_No clauses matched. That is not a pass — it may mean the document was not the
right one, or the wording is unusual. Check the page the probe actually read._

**Your conclusion:**

- [ ] Verdict confirmed as recorded
- [ ] Verdict changed to: `________`
- [ ] Conditions to add/change: `________`

---

## Decrypt — `decrypt.co`

| | |
|---|---|
| Current verdict | `conditional` (confidence: medium) |
| Review state | ⚠️ **seeded — never read** (2026-08-06) |
| Registered terms URL | https://decrypt.co/terms |
| Probe outcome | `registry-seeded` |
| robots.txt | robots.txt not readable (HTTP 403) — no stated restriction |
| Terms found at | _none found at the usual locations_ |
| Summary | Decrypt: permitted subject to 2 condition(s) — Headline, link and feed summary only; Attribute and link back to the origin article. ⚠ Seeded entry — the terms document has not been read for this project; treat as a working assumption, not a clearance. |

**Recorded finding:** Publishes a public RSS feed for syndication of headline/link/summary with attribution.

**Recorded conditions:**
- Headline, link and feed summary only
- Attribute and link back to the origin article

_No clauses matched. That is not a pass — it may mean the document was not the
right one, or the wording is unusual. Check the page the probe actually read._

**Your conclusion:**

- [ ] Verdict confirmed as recorded
- [ ] Verdict changed to: `________`
- [ ] Conditions to add/change: `________`

---

## Bitcoin Magazine — `bitcoinmagazine.com`

| | |
|---|---|
| Current verdict | `conditional` (confidence: medium) |
| Review state | ⚠️ **seeded — never read** (2026-08-06) |
| Registered terms URL | https://bitcoinmagazine.com/terms-of-use |
| Probe outcome | `registry-seeded` |
| robots.txt | robots.txt not readable (HTTP 403) — no stated restriction |
| Terms found at | _none found at the usual locations_ |
| Summary | Bitcoin Magazine: permitted subject to 2 condition(s) — Headline, link and feed summary only; Attribute and link back to the origin article. ⚠ Seeded entry — the terms document has not been read for this project; treat as a working assumption, not a clearance. |

**Recorded finding:** Publishes a public RSS feed for syndication of headline/link/summary with attribution.

**Recorded conditions:**
- Headline, link and feed summary only
- Attribute and link back to the origin article

_No clauses matched. That is not a pass — it may mean the document was not the
right one, or the wording is unusual. Check the page the probe actually read._

**Your conclusion:**

- [ ] Verdict confirmed as recorded
- [ ] Verdict changed to: `________`
- [ ] Conditions to add/change: `________`

---

## Dow Jones (MarketWatch feed delivery) — `dowjones.io`

| | |
|---|---|
| Current verdict | `conditional` (confidence: medium) |
| Review state | ⚠️ **seeded — never read** (2026-08-06) |
| Registered terms URL | https://www.marketwatch.com/terms-of-use |
| Probe outcome | `registry-seeded` |
| robots.txt | robots.txt not readable (Could not resolve host: dowjones.io) — no stated restriction |
| Terms found at | _none found at the usual locations_ |
| Summary | Dow Jones (MarketWatch feed delivery): permitted subject to 3 condition(s) — Headline, link and feed summary only; Attribute MarketWatch and link back; Personal, non-commercial use. ⚠ Seeded entry — the terms document has not been read for this project; treat as a working assumption, not a clearance. |

**Recorded finding:** feeds.content.dowjones.io serves MarketWatch's public top-stories RSS. Dow Jones publishes it for syndication; the terms are personal, non-commercial use with attribution, and expressly not bulk reproduction of article text.

**Recorded conditions:**
- Headline, link and feed summary only
- Attribute MarketWatch and link back
- Personal, non-commercial use

_No clauses matched. That is not a pass — it may mean the document was not the
right one, or the wording is unusual. Check the page the probe actually read._

**Your conclusion:**

- [ ] Verdict confirmed as recorded
- [ ] Verdict changed to: `________`
- [ ] Conditions to add/change: `________`

---

## MarketWatch — `marketwatch.com`

| | |
|---|---|
| Current verdict | `conditional` (confidence: medium) |
| Review state | ⚠️ **seeded — never read** (2026-08-06) |
| Registered terms URL | https://www.marketwatch.com/terms-of-use |
| Probe outcome | `registry-seeded` |
| robots.txt | robots.txt not readable (HTTP 403) — no stated restriction |
| Terms found at | _none found at the usual locations_ |
| Summary | MarketWatch: permitted subject to 3 condition(s) — Headline, link and feed summary only; Attribute and link back; Personal, non-commercial use. ⚠ Seeded entry — the terms document has not been read for this project; treat as a working assumption, not a clearance. |

**Recorded finding:** Same terms as the Dow Jones feed host — syndication of headline/link/summary, personal and non-commercial, with attribution.

**Recorded conditions:**
- Headline, link and feed summary only
- Attribute and link back
- Personal, non-commercial use

_No clauses matched. That is not a pass — it may mean the document was not the
right one, or the wording is unusual. Check the page the probe actually read._

**Your conclusion:**

- [ ] Verdict confirmed as recorded
- [ ] Verdict changed to: `________`
- [ ] Conditions to add/change: `________`

---

## CNBC — `cnbc.com`

| | |
|---|---|
| Current verdict | `conditional` (confidence: medium) |
| Review state | ⚠️ **seeded — never read** (2026-08-06) |
| Registered terms URL | https://www.nbcuniversal.com/terms |
| Probe outcome | `registry-seeded` |
| robots.txt | robots.txt not readable (HTTP 403) — no stated restriction |
| Terms found at | _none found at the usual locations_ |
| Summary | CNBC: permitted subject to 2 condition(s) — Headline, link and feed summary only; Attribute CNBC and link back. ⚠ Seeded entry — the terms document has not been read for this project; treat as a working assumption, not a clearance. |

**Recorded finding:** Publishes public RSS feeds per desk for syndication of headline/link/summary with attribution and a link back.

**Recorded conditions:**
- Headline, link and feed summary only
- Attribute CNBC and link back

_No clauses matched. That is not a pass — it may mean the document was not the
right one, or the wording is unusual. Check the page the probe actually read._

**Your conclusion:**

- [ ] Verdict confirmed as recorded
- [ ] Verdict changed to: `________`
- [ ] Conditions to add/change: `________`

---

## Investing.com — `investing.com`

| | |
|---|---|
| Current verdict | `conditional` (confidence: medium) |
| Review state | ⚠️ **seeded — never read** (2026-08-06) |
| Registered terms URL | https://www.investing.com/about-us/terms-and-conditions |
| Probe outcome | `registry-seeded` |
| robots.txt | robots.txt not readable (HTTP 403) — no stated restriction |
| Terms found at | _none found at the usual locations_ |
| Summary | Investing.com: permitted subject to 2 condition(s) — RSS feed only — never scrape the HTML site; Headline, link and summary only, with attribution. ⚠ Seeded entry — the terms document has not been read for this project; treat as a working assumption, not a clearance. |

**Recorded finding:** Publishes per-desk RSS feeds for syndication. Terms permit personal, non-commercial use of the feed with attribution; scraping the site itself is prohibited separately.

**Recorded conditions:**
- RSS feed only — never scrape the HTML site
- Headline, link and summary only, with attribution

_No clauses matched. That is not a pass — it may mean the document was not the
right one, or the wording is unusual. Check the page the probe actually read._

**Your conclusion:**

- [ ] Verdict confirmed as recorded
- [ ] Verdict changed to: `________`
- [ ] Conditions to add/change: `________`

---

## OilPrice.com — `oilprice.com`

| | |
|---|---|
| Current verdict | `conditional` (confidence: medium) |
| Review state | ⚠️ **seeded — never read** (2026-08-06) |
| Registered terms URL | https://oilprice.com/terms-of-use |
| Probe outcome | `registry-seeded` |
| robots.txt | robots.txt not readable (HTTP 403) — no stated restriction |
| Terms found at | _none found at the usual locations_ |
| Summary | OilPrice.com: permitted subject to 2 condition(s) — Headline, link and feed summary only; Attribute and link back. ⚠ Seeded entry — the terms document has not been read for this project; treat as a working assumption, not a clearance. |

**Recorded finding:** Publishes a public RSS feed and permits syndication of headline/link/summary with attribution and a link back.

**Recorded conditions:**
- Headline, link and feed summary only
- Attribute and link back

_No clauses matched. That is not a pass — it may mean the document was not the
right one, or the wording is unusual. Check the page the probe actually read._

**Your conclusion:**

- [ ] Verdict confirmed as recorded
- [ ] Verdict changed to: `________`
- [ ] Conditions to add/change: `________`

---

## FXStreet — `fxstreet.com`

| | |
|---|---|
| Current verdict | `conditional` (confidence: medium) |
| Review state | ⚠️ **seeded — never read** (2026-08-06) |
| Registered terms URL | https://www.fxstreet.com/about/terms-of-service |
| Probe outcome | `registry-seeded` |
| robots.txt | robots.txt not readable (HTTP 403) — no stated restriction |
| Terms found at | _none found at the usual locations_ |
| Summary | FXStreet: permitted subject to 2 condition(s) — Headline, link and feed summary only; Attribute and link back. ⚠ Seeded entry — the terms document has not been read for this project; treat as a working assumption, not a clearance. |

**Recorded finding:** Publishes a public RSS feed for syndication with attribution and a link back to the origin article.

**Recorded conditions:**
- Headline, link and feed summary only
- Attribute and link back

_No clauses matched. That is not a pass — it may mean the document was not the
right one, or the wording is unusual. Check the page the probe actually read._

**Your conclusion:**

- [ ] Verdict confirmed as recorded
- [ ] Verdict changed to: `________`
- [ ] Conditions to add/change: `________`

---
