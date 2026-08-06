# Source Terms — "are we allowed to use this website?"

_Added 2026-08-06, alongside the removal of Yahoo Finance as a data source._

Finance Now reads about forty external hosts. Until now the question the codebase
answered carefully was **where does this data come from** (`lib/data/dataSources.ts`,
the `/data-sources` page, the per-page `SourceLine` badges). The question it did not
answer anywhere was **may we take it** — and the answer for the app's single most
load-bearing source turned out to be no.

This document describes the safeguard that now answers it, on both sides: built-in
sources the maintainer adds in code, and arbitrary feed URLs a user pastes into the
Integrations page.

> **This is a compliance-tracking mechanism, not legal advice.** Every verdict is
> this project's reading of a published document on a stated date. The code's job is
> to make that reading explicit, dated, enforced, and re-checkable — not to be right
> about the law on its own.

---

## The three pieces

| Piece | File | What it does |
|---|---|---|
| **Registry** | `frontend/src/lib/server/sourceTerms.ts` | A dated verdict per domain, with the terms URL and what the document actually says |
| **Probe** | `frontend/src/lib/server/termsProbe.ts` | Live check of an unreviewed site: robots.txt, terms discovery, clause scan |
| **Enforcement** | `pinnedFetch`, `/live-data/config`, `__tests__/sourceTerms.test.ts` | Blocks at the socket, gates at save time, fails the build for an unreviewed built-in |

---

## The registry

```ts
{
  domain: 'yahoo.com',            // matches the host or ANY subdomain, on a label boundary
  name: 'Yahoo (incl. Yahoo Finance)',
  verdict: 'prohibited',          // 'approved' | 'conditional' | 'prohibited'
  termsUrl: 'https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html',
  finding: '…what the document says, specific enough to find the clause again…',
  conditions: ['…'],              // required when verdict is 'conditional'
  verifiedAt: '2026-08-06',
  confidence: 'high',
}
```

Three verdicts, because two would collapse a real distinction:

- **`approved`** — permitted, unconditionally enough to just use. Public-domain
  government data, open-source keyless APIs, protocol-published rate endpoints.
- **`conditional`** — permitted *while specific conditions hold*. This is most of the
  registry, and the conditions are the maintainer's obligation, not something code can
  enforce: attribution, a rate limit, "personal use only", "headline and link only,
  never full article text". Writing them down is the point — an obligation nobody
  recorded is one nobody keeps.
- **`prohibited`** — forbidden, or no terms grant it and the site's general ToS forbid
  automated access. Hard-blocked in code.

**Staleness, not expiry.** A verdict older than `SOURCE_TERMS_REVIEW_AFTER_DAYS` (180)
is reported stale; it is *not* disallowed. Terms change, but breaking the app because
nobody re-read a document is the wrong failure. `getSourceTermsProvenance()` dates the
registry by its **oldest** entry — re-reading one site's terms does not refresh the
other forty, the same rule the hand-maintained data catalogs follow.

---

## Two assertion forms, and why the split matters

```ts
assertSourceAllowed(url)        // STRICT — unreviewed fails
assertSourceNotProhibited(url)  // RUNTIME — only 'prohibited' fails
```

The distinction is the design, not an accident:

- **`prohibited` is a decision about someone else's terms.** It binds every request,
  forever, with no override. This is what makes the Yahoo removal *stick*: it is not a
  provider-list edit someone can undo by pasting a URL into Integrations.
- **`unreviewed` is a decision about us** — nobody has looked yet. Blocking that at the
  socket would break a source the user was shown the terms for and explicitly approved,
  since acknowledging a feed does not add a registry entry. So it is gated where the
  human is: at save time.

Collapsing them would either let a prohibited host through or make the acknowledgement
flow a lie.

---

## Enforcement, by path

### Built-in sources → test time

`src/lib/server/__tests__/sourceTerms.test.ts` walks every `host` declared in
`lib/data/dataSources.ts` and fails if one is unregistered or prohibited. Built-ins
never pass through a form, so there is no human to ask at save time; the review has to
be enforced somewhere and this is it.

Adding a `/live-data` route that fetches a new host means listing it in
`dataSources.ts` (the project already requires this, and `npm run data-sources --
--verify` cross-checks it against the code). The test then fails until someone reads
that site's terms and records a verdict. **It worked on its first run** — it caught ten
hosts already in production with no review on record.

### User-added feeds → save time, then socket

1. User pastes a URL into **Integrations → Add custom source**.
2. `POST /live-data/config` (`add-custom` / `update-custom` — edits go through the same
   gate, or "add an approved feed, then edit the URL" is a hole straight through it)
   calls `probeSiteTerms(url)`.
3. Outcome:
   - **hard block** → `403`, no override. Registry says prohibited, *or* the site's own
     robots.txt disallows the path. There is no checkbox for this, deliberately.
   - **needs acknowledgement** → `409` carrying the full report. The UI shows the
     matched clauses, the robots.txt result and a link to the terms, and asks the user
     to confirm they have read them. Re-POST with `termsAcknowledged: true`.
   - **clear** → saved.
4. Thereafter `pinnedFetch` re-checks the registry on **every request**. Putting the
   check at the socket rather than only at the save means a source configured before a
   verdict changed stops working when the verdict changes, instead of quietly
   continuing.

---

## What the probe actually checks

Three independent signals, reported separately rather than mashed into a score:

1. **robots.txt** — the one hard, machine-readable signal a site publishes about
   automated access. A disallow is a block. The parser follows the real spec:
   consecutive `User-agent` lines share one rule group, the most specific matching
   agent group wins outright, longest matching rule wins within a group, and `Allow`
   takes the tie — which is what lets a site say "stay out of `/api`, except
   `/api/public`".
2. **Terms discovery** — conventional paths (`/terms`, `/legal`, …) plus a scan of the
   homepage for links matching on **href *and* link text**, because plenty of sites
   link "Legal" to `/policies/9182` and an href-only scan misses exactly the pages
   hardest to guess.
3. **Clause scan** — restrictive patterns (automated access, scraping, redistribution,
   personal/non-commercial, prior written permission) and permissive ones (public API,
   RSS syndication, open licence). Every match carries **the sentence it came from**, not
   just a label: a verdict a human cannot check is not reviewable, and this report
   exists to be reviewed.

### Two things the probe will not do

**It will not call a keyword scan a reading.** `inconclusive` — nothing prohibitive
found — still requires human acknowledgement. Only `blocked` is enforced automatically.

**It will not treat "couldn't read it" as permission.** Publishers 403 datacenter IPs,
including on their legal pages (both terms documents consulted while writing the seed
registry returned 403 from this environment). `unknown` is its own outcome and asks a
human, exactly as `needs-review` does. This mirrors the rule already in `CLAUDE.md`:
availability findings must come from the owner's machine, never from CI.

---

## Maintenance

- **Adding a source:** read the terms, add an entry, run `npx vitest run sourceTerms`.
- **Re-verifying:** `POST /live-data/source-terms { url }` runs the probe, or
  `GET /live-data/source-terms` returns the whole registry. Both are surfaced on the
  **/data-sources** page, prohibited entries first — they explain missing functionality
  elsewhere in the app, so burying them under thirty approvals would defeat the point.
- **Changing a verdict:** read the document yourself and update `verifiedAt`. Never
  downgrade a verdict on the strength of a CI probe.

The seed registry (2026-08-06) was written from each provider's published terms and
carries a `confidence` field per entry; entries marked `low` (Reddit, StockTwits) are
the ones where public terms are least clear about third-party display use, and are the
first that should be re-read on the owner's machine.
