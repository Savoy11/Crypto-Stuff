# Business & Compliance Checklist

Company-level work that belongs to **neither product's backlog**. CAEP (this repo) and
Chronolens are developed independently, but they are shipped by one business — entity
structure, regulatory research, disclosures and tax compliance are decided once, for both.

**This doc is worked separately from the website and the software.** Product work lives in
`docs/ROADMAP.md` (CAEP) and Chronolens's `docs/MASTER-CHECKLIST.md`.

**Last updated:** 2026-07-26 · Source: owner brain dump

> Nothing here is legal or tax advice. These are the questions to take to a lawyer and an
> accountant, plus the homework to do before those meetings so they're cheap and short.

---

## 1. Entity & filings

- [ ] **How to structure the business filing** covering both the website and the desktop
      application.
- [ ] **LLC vs S-Corp** — S-Corp is a *tax election*, not a separate entity type, so the real
      questions are: form an LLC now, and does electing S-Corp treatment save enough
      self-employment tax to be worth the payroll overhead (it usually only pays off past a
      meaningful profit level).
- [ ] **One entity or two? Should the website and software file separately?** Decide on the
      real trade-off, not vibes:
      - *One entity, two products* — cheaper, simpler books, single tax return; but the two
        products share liability.
      - *Two entities* — liability isolation and a clean sale of one product later; costs
        double filings/registered agents/bookkeeping.
      - A middle path exists: one holding entity with the products as separate DBAs or
        wholly-owned subsidiaries.
      - Note the products have genuinely different risk surfaces: CAEP touches financial data,
        risk scoring and (potentially) brokerage links; Chronolens is a research/media site.
- [ ] Registered agent, EIN/TIN, state of formation, operating agreement.
- [ ] Business bank account + bookkeeping separate from personal, from day one.

## 2. Regulatory research (both products)

- [ ] **Federal regulations applicable to the website and the software.** Priority areas:
      - **Investment advice vs. information** — SEC/state investment-adviser rules. Risk scores
        and "recommendations" at scale is exactly the line flagged in
        `docs/MARKET-ASSESSMENT.md`'s risk register. Keep framing informational; know where the
        line actually is.
      - **Broker-dealer** — triggered only if the brokerage-linking work goes beyond read-only.
      - **FTC** — affiliate disclosure, endorsement rules, "clear and conspicuous".
      - **Data licensing / redistribution** — serving third-party data from our keys.
      - **Privacy** — GDPR/UK GDPR (EU/UK visitors), CCPA (California), plus cookie/consent
        rules if analytics or ad tech ships.
      - **Crypto-specific promotion rules** — UK FCA financial promotion regime covers crypto
        referrals; several jurisdictions restrict crypto affiliate marketing.
- [ ] **Which countries can access which product**, and whether geo-blocking is cheaper than
      compliance in the hard jurisdictions. (Chronolens tracks the site-side implementation;
      the *decision* is here.)
- [ ] 🔁 **Standing item: re-check data-source licensing on a cadence, for both products.**
      Not a one-time gate. A licence change is *silent* — a broken feed announces itself, but a
      provider changing its terms breaks nothing: the code keeps fetching while the business
      becomes non-compliant. Applies to CAEP's provider registry (CoinGecko, FMP, Finnhub,
      Twelve Data, Tiingo, Alpha Vantage, exchange APIs) exactly as it does to Chronolens's
      eleven feeds. Quarterly once live, plus on every trigger: a new source is added, ads or
      affiliate links go live, beta → public, a new jurisdiction opens, a provider announces
      terms/pricing changes, or a plan is upgraded. Each product's checklist tracks its own
      per-source verification; the obligation to keep looking lives here.

## 3. Disclosures & public documents

- [ ] **Develop the required disclosure documents and decide where they're posted.** At minimum:
      Terms of Service, Privacy Policy, "Not investment advice" disclaimer, affiliate/ad
      disclosure ("How we make money"), data-source attribution page, and a contact/complaints
      route.
- [ ] **Source-labeling policy (both products).** Decide the house rule for how third-party data
      is labeled wherever it appears: which sources must be named, in what wording, how
      licence-required attribution is rendered (Wikipedia CC BY-SA, LoC, GDELT, SEC all differ),
      and how *derived* figures are marked so a computed score is never mistaken for a
      publisher's number. Write it once here; each product's checklist tracks its own rendering.
- [ ] Placement rules: linked in the footer of every page **and** surfaced at the point of
      relevance (a disclaimer nobody sees does not protect anyone).
- [ ] Keep one canonical copy per document, shared by both products where the text is identical,
      so they can't drift.

## 4. Tax & ongoing compliance

- [ ] **Tax paperwork / TIN / compliance tracking — an internal tool for the owner.** Confirmed
      scope: this tracks *the company's own* obligations (filings due, TIN/EIN records,
      quarterly estimates, 1099s from affiliate programs) so taxes get filed correctly. It is
      **not** a user-facing product feature and ships in neither product. Cheapest first
      version is a deadline calendar plus a document checklist; only build an agent for it if
      the manual version proves it earns its keep.
- [ ] Affiliate income is reportable — expect 1099s once affiliate links go live; bookkeeping
      must be in place **before** the first payout, not after.
- [ ] Annual entity filings / franchise tax calendar.

## 5. Definition of "done": releasable and sellable

- [ ] **Answer the question: what does a releasable, sellable product actually look like?** —
      so there's an objective switch from *building* to *maintaining and updating*. This is one
      business decision with a **per-product answer**; write the bar here, then mirror it as a
      release gate in each product's checklist.
- [ ] Suggested shape for each bar (fill in per product):
      - Feature floor: the specific list that must work, with nothing half-built behind a nav link
      - Data honesty: every surface either shows real data or says plainly that it can't
        (CAEP: the REAL-vs-FALLBACK audit rule · Chronolens: the ⛔ pre-release feed gate)
      - Legal floor: sections 1–3 of this document closed
      - Operational floor: backups, error monitoring, a support inbox someone reads
      - Quality floor: no known data-corrupting bug; tests green
- [ ] Explicitly name what is **out** of v1, so scope creep has something to bounce off.

## 6. Documentation accuracy

- [ ] **Review all project documents** so they accurately describe what each product actually is
      and does — both repos have docs written at different stages, and stale claims in a public
      repo are a liability once there are customers. Known example: Chronolens's
      `docs/EVENTS-SCHEMA.md` carried a "not yet applied" header long after the migrations
      existed.
- [ ] Same pass over anything user-facing: marketing copy, README, in-app help — no claim that
      overstates what ships.
