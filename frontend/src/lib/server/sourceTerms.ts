// ─────────────────────────────────────────────────────────────────────────────
// SOURCE TERMS REGISTRY — "is Finance Now allowed to use this website?"
//
// Every external host the app fetches from has a dated entry here recording
// what that site's terms of use actually say about automated access and
// redistribution, and the verdict that follows. Two things consume it:
//
//   1. RUNTIME (deny-by-default for user-supplied URLs). `assertSourceAllowed`
//      is called from pinnedFetch, which is the only path an arbitrary,
//      user-entered feed URL can take. A host we have marked `prohibited` can
//      not be fetched at all, no matter how it was configured.
//   2. TEST TIME (regression guard for built-ins). `__tests__/sourceTerms.test`
//      walks every host in lib/data/dataSources.ts and fails the suite if one
//      is unregistered or prohibited. That is what stops a new /live-data route
//      from quietly introducing a source nobody checked.
//
// ⚠ WHY THIS EXISTS. Yahoo Finance was the app's keyless workhorse for equity,
// fund and macro quotes, charts, OHLCV, trailing returns, fund holdings and
// per-ticker news. It was reached through query1.finance.yahoo.com/v8/… —
// undocumented endpoints backing Yahoo's own web app, with no published API
// terms granting third-party programmatic access, while Yahoo's Terms of
// Service prohibit automated access and the redistribution of content. It was
// removed on 2026-08-06 for that reason, and the entry below is what keeps it
// out: re-adding a Yahoo fetcher now fails at the socket, not in review.
//
// ⚠ THIS IS A COMPLIANCE RECORD, NOT LEGAL ADVICE. Each entry is this
// project's reading of a published document on a stated date. Terms change;
// `SOURCE_TERMS_REVIEW_AFTER_DAYS` is why entries go stale rather than silently
// aging. Use `probeSiteTerms()` (termsProbe.ts) to re-check a host, and read
// the document yourself before flipping a verdict.
//
// ⚠ ALMOST EVERY ENTRY HERE IS `seeded`, NOT `verified` — READ `review` BEFORE
// TRUSTING ONE. The registry was written in an environment whose network policy
// blocked every publisher and provider host at the gateway, so not one terms
// document could be opened while it was being authored. The entries are honest
// starting positions drawn from each provider's publicly documented posture
// (published API docs, documented free tiers, openly advertised RSS feeds) —
// they are NOT readings, and the first cut of this file wrongly presented them
// as such by giving them all a `verifiedAt` date.
//
// `npm run terms:report` runs the probe over every registered host and writes a
// review worksheet. Run it from the owner's machine, read the documents it
// links, and flip entries to `verified` as you go. Until then, treat a seeded
// `approved` or `conditional` as "nobody has objected yet", not as a clearance.
//
// ⚠ VERIFICATION IS HOST-DEPENDENT, like the data audits (see CLAUDE.md).
// Several publishers 403 datacenter IPs on their own legal pages, so a probe
// run from CI or a cloud box can report "couldn't read the terms" for a site
// that serves them fine from a residential connection. Re-verify on the
// owner's machine; never downgrade a verdict on the strength of a CI probe.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * - `approved`    — terms permit this use, unconditionally enough to just use it.
 * - `conditional` — permitted while specific conditions hold (attribution, rate
 *                   limit, non-commercial, key required). Conditions are listed
 *                   and are the maintainer's obligation, not the code's.
 * - `prohibited`  — terms forbid it, or there are no terms granting it and the
 *                   site's general ToS forbid automated access. Hard-blocked.
 */
export type TermsVerdict = 'approved' | 'conditional' | 'prohibited'

/** How solid the finding is. Drives whether the UI nudges for a re-read. */
export type TermsConfidence = 'high' | 'medium' | 'low'

/**
 * - `verified` — a human opened this site's terms document and read the
 *   relevant clauses on `reviewedAt`. The registry's promise.
 * - `seeded`   — the entry was written from the provider's publicly documented
 *   posture (published API docs, a documented free tier, an openly advertised
 *   RSS feed) WITHOUT the terms document being read end-to-end. A reasonable
 *   starting position, and explicitly not a review.
 *
 * Seeded entries still serve data: these feeds have been in production for
 * months, and breaking the app over a documentation gap is the wrong failure —
 * the same reasoning that makes verdicts go stale rather than expire. But they
 * are counted, badged in the UI, and are the work queue.
 */
export type ReviewState = 'verified' | 'seeded'

export interface SourceTermsEntry {
  /** Registrable host. Matches this host exactly OR any subdomain of it. */
  domain: string
  /** Display name of the operator. */
  name: string
  verdict: TermsVerdict
  /** The document the verdict was read from. */
  termsUrl: string
  /**
   * What that document says, in the maintainer's words, specific enough that a
   * later reader can find the clause again. Not a slogan — if this reads
   * "allowed", it is not a finding.
   */
  finding: string
  /** Obligations that must keep holding for a `conditional` verdict. */
  conditions?: string[]
  /**
   * Has anyone actually READ this site's terms for this project?
   *
   * This field exists because the first cut of this registry did not have it,
   * and every entry carried a `verifiedAt` date that made it look reviewed when
   * none of them had been read end-to-end. A verdict nobody checked, wearing a
   * date that says somebody did, is worse than no registry at all — it launders
   * an assumption into a record. So the two states are now distinct and
   * required, and a seeded entry is flagged everywhere it surfaces.
   */
  review: ReviewState
  /**
   * ISO date (YYYY-MM-DD) of that review — or, for a `seeded` entry, the date
   * the entry was WRITTEN. Read it together with `review`; on its own it means
   * only "this text is this old".
   */
  reviewedAt: string
  confidence: TermsConfidence
  /**
   * A FIRST-HAND observation that this host's robots.txt disallows our agent.
   *
   * Deliberately separate from `verdict` and `review`. Those describe the TERMS
   * document, which is often unreadable from here and is a matter of
   * interpretation; robots.txt is a machine-readable instruction we either
   * honour or do not. An entry can therefore be `seeded` on its terms and still
   * carry a dated, verified robots reading — which is exactly Reddit's
   * situation after the 2026-08-29 probe.
   *
   * When present, `assertRobotsPermits` refuses the fetch unless the named
   * credential is configured — the credential being the thing that moves the
   * request out of the disallowed anonymous path.
   */
  robotsDisallowed?: {
    /** ISO date the robots.txt was actually read. */
    observedAt: string
    /** Env var whose presence lifts the block, if the operator has one. */
    liftedBy?: string
    note: string
  }
}

/**
 * A verdict older than this is reported stale. 180 days is deliberately shorter
 * than nothing and longer than the 120 used for price/fee snapshots: terms move
 * less often than markets, but a two-year-old reading is not a reading.
 */
export const SOURCE_TERMS_REVIEW_AFTER_DAYS = 180

/**
 * The registry was seeded on this date as part of the Yahoo removal. Entries
 * carry their own `reviewedAt`; this is the batch marker, so a reviewer can tell
 * a seeded entry from one someone has since read on purpose.
 */
export const SOURCE_TERMS_SEEDED = '2026-08-06'

// ─── The registry ─────────────────────────────────────────────────────────────
//
// Ordering is by verdict then domain, so the prohibited list is impossible to
// miss when reading this file.

export const SOURCE_TERMS: SourceTermsEntry[] = [
  // ── PROHIBITED ─────────────────────────────────────────────────────────────
  {
    domain: 'yahoo.com',
    name: 'Yahoo (incl. Yahoo Finance)',
    verdict: 'prohibited',
    termsUrl: 'https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html',
    finding:
      'The query1/query2.finance.yahoo.com v8/v10 endpoints are undocumented internals of Yahoo\'s own web app — Yahoo publishes no third-party API terms granting programmatic access to them, and its Terms of Service prohibit accessing the services by automated means and reproducing or redistributing content. Covers finance.yahoo.com and feeds.finance.yahoo.com (per-ticker RSS) as well: the RSS feeds are published under the same ToS with no separate grant. Removed as a data source 2026-08-06.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'high',
  },
  {
    domain: 'cboe.com',
    name: 'Cboe Global Markets',
    verdict: 'prohibited',
    termsUrl: 'https://www.cboe.com/delayed_quotes/options/',
    finding:
      'The delayed-quote pages carry a notice, checked verbatim across four product pages (CBOE, OPTIONS, VIX, futures): downloading quote-table data "by using auto-extraction programs/queries and/or software" is strictly prohibited, Cboe blocks the IP addresses of parties who attempt it, and access by any means other than manual ticker-symbol entry is prohibited. cdn.cboe.com/api/global/delayed_quotes/* is the backing API for exactly those pages, so a server-side route polling it is the prohibited pattern described almost word for word. Programmatic use is routed through the paid All Access API. This is why Finance Now carries no options chain and the Trade Risk Scorer takes hand-entered legs.',
    reviewedAt: '2026-08-05',
    // The one VERIFIED entry in this registry: read on the owner's machine
    // during the P2-O1 audit, evidence written up in
    // docs/assessments/P2-O1-options-data.md. Everything else is seeded.
    review: 'verified',
    confidence: 'high',
  },

  // ── CONDITIONAL ────────────────────────────────────────────────────────────
  {
    domain: 'sec.gov',
    name: 'U.S. SEC (EDGAR)',
    verdict: 'conditional',
    termsUrl: 'https://www.sec.gov/os/webmaster-faq#developers',
    finding:
      'EDGAR is public-domain U.S. government data and explicitly open to programmatic access, subject to a published access policy: a declared User-Agent carrying a contact address, and no more than 10 requests/second. Covers data.sec.gov and www.sec.gov.',
    conditions: [
      'Send a descriptive User-Agent including a contact email on every request',
      'Stay under 10 requests/second across all EDGAR hosts',
    ],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'high',
  },
  {
    domain: 'coingecko.com',
    name: 'CoinGecko',
    verdict: 'conditional',
    // The API Terms — NOT the Website Terms and Conditions. The distinction is
    // the whole finding: the 2026-08-29 probe read coingecko.com/en/terms and
    // flagged "personal / non-commercial use only", which governs republishing
    // SITE content (screenshots) and does not describe API use at all.
    termsUrl: 'https://www.coingecko.com/en/api_terms',
    finding:
      'API Terms clause 4.1.6 read on 2026-08-29 (Scope of Use section, owner\'s machine): "You are entitled to charge for your services and products that incorporate or integrates our CoinGecko API. However, you are not permitted to sell, rent, lease, sub-license, re-distribute or syndicate access to the CoinGecko API or part thereof." Commercial use of a product BUILT ON the API is therefore permitted; what is barred is reselling API access itself, which this app does not do. Clause 4 prescribes the attribution message verbatim. Clause 4.1.2 incorporates the Website Terms by reference, but the API grant is the specific one governing API reads — the site ToU\'s Personal Use clause is about republishing site content. Scope of Use was read in full; the remainder of the document was not.',
    conditions: [
      'Display "Powered by CoinGecko" prominently, in a legible font no smaller than 10px (clause 4) — the wording is prescribed, not paraphrasable',
      'Do not resell, sub-license, redistribute or syndicate API access (clause 4.1.6)',
      'Stay within the selected plan\'s rate and monthly call limits; do not circumvent them (clause 4.2)',
      'Never use the data in or to target advertising (clause 4.1.7.3)',
      'Do not imply CoinGecko endorsement; follow the Brand Attribution Guide (clause 4.5)',
      'No public statements about CoinGecko or its products without prior written consent (clause 4.1.7.6)',
    ],
    reviewedAt: '2026-08-29',
    review: 'verified',
    confidence: 'high',
  },
  {
    domain: 'llama.fi',
    name: 'DefiLlama',
    verdict: 'conditional',
    termsUrl: 'https://defillama.com/docs/api',
    finding:
      'Publishes a free, keyless, openly documented API for TVL, stablecoin supply and yields, offered for third-party use. No registration; fair-use rate limiting. Covers api.llama.fi, stablecoins.llama.fi, coins.llama.fi and yields.llama.fi.',
    conditions: ['Attribute DefiLlama', 'Keep request volume within fair use — no bulk mirroring'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'financialmodelingprep.com',
    name: 'Financial Modeling Prep',
    verdict: 'conditional',
    termsUrl: 'https://site.financialmodelingprep.com/terms-of-service',
    finding:
      'Commercial market-data API. Access is granted by the licence attached to the API key the operator holds; the free tier permits personal/development use at a documented request cap. Redistribution beyond the licensed application requires a higher plan.',
    conditions: [
      'A valid FMP API key must be configured — no keyless path',
      'Stay within the plan\'s request cap and redistribution scope',
    ],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'finnhub.io',
    name: 'Finnhub',
    verdict: 'conditional',
    termsUrl: 'https://finnhub.io/terms-of-service',
    finding:
      'Commercial market-data API with a registered free tier for personal and non-commercial use. Access is by API key; the free tier is explicitly not for commercial redistribution.',
    conditions: ['Valid API key required', 'Free tier is personal / non-commercial only'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'twelvedata.com',
    name: 'Twelve Data',
    verdict: 'conditional',
    termsUrl: 'https://twelvedata.com/terms',
    finding:
      'Commercial market-data API. Keyed access under the plan\'s licence; the free tier carries a hard credit budget (8 credits/min) and is for non-commercial use.',
    conditions: ['Valid API key required', 'Respect the plan credit budget'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'tiingo.com',
    name: 'Tiingo',
    verdict: 'conditional',
    termsUrl: 'https://www.tiingo.com/about/terms',
    finding:
      'Commercial market-data API with a free tier for personal use. Keyed access; end-of-day and IEX data carry exchange-derived redistribution limits set by the plan.',
    conditions: ['Valid API key required', 'Free tier is personal use — no redistribution'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'alphavantage.co',
    name: 'Alpha Vantage',
    verdict: 'conditional',
    termsUrl: 'https://www.alphavantage.co/terms_of_service/',
    finding:
      'Documented public API issued against a free key, offered for third-party application use at 25 requests/day on the free tier.',
    conditions: ['Valid API key required', 'Free tier is 25 requests/day — do not exceed'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'coinmarketcap.com',
    name: 'CoinMarketCap',
    verdict: 'conditional',
    termsUrl: 'https://coinmarketcap.com/api/documentation/v1/#section/Terms-of-Use',
    finding:
      'Commercial API. Keyed access under a plan licence; attribution to CoinMarketCap is required wherever its data is displayed.',
    conditions: ['Valid API key required', 'Attribute CoinMarketCap on any surface showing its data'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'binance.com',
    name: 'Binance',
    verdict: 'conditional',
    termsUrl: 'https://www.binance.com/en/terms',
    finding:
      'Publishes documented, keyless public market-data REST endpoints intended for programmatic use, under per-endpoint request weights. Note this is a terms verdict, not an availability one: binance.com answers 451 from many hosts on geographic grounds.',
    conditions: ['Respect the published per-endpoint request weights'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'binance.us',
    name: 'Binance.US',
    verdict: 'conditional',
    termsUrl: 'https://www.binance.us/terms',
    finding: 'Same documented keyless public market-data endpoints as the global venue, under US terms and weights.',
    conditions: ['Respect the published per-endpoint request weights', 'Report the serving venue — it is a different market than binance.com'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'okx.com',
    name: 'OKX',
    verdict: 'conditional',
    termsUrl: 'https://www.okx.com/docs-v5/en/#overview',
    finding: 'Documented keyless public market-data API (v5) with published rate limits, offered for programmatic use.',
    conditions: ['Respect the published v5 rate limits'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'stocktwits.com',
    name: 'StockTwits',
    verdict: 'conditional',
    termsUrl: 'https://stocktwits.com/terms',
    finding:
      'Public symbol-stream endpoints are reachable without a key and are widely used by third-party apps, but the terms reserve the platform\'s content and require attribution. Treat message text as StockTwits content shown with credit, not as data to store or re-serve.',
    conditions: [
      'Attribute StockTwits on any surface showing its messages',
      'Display only — do not mirror, store long-term, or re-serve message content',
    ],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'low',
  },
  {
    domain: 'reddit.com',
    name: 'Reddit',
    verdict: 'conditional',
    termsUrl: 'https://redditinc.com/policies/data-api-terms',
    finding:
      'Reddit\'s Data API Terms govern programmatic access and require registered OAuth credentials for anything beyond incidental use; unauthenticated datacenter requests are refused (403) by design rather than by accident. Public .rss/.json endpoints are read at low volume for display only.',
    conditions: [
      'Read-only, low volume, display only — no dataset building',
      'Register OAuth credentials before increasing volume',
      'Expect and accept 403s from datacenter IPs rather than working around them',
    ],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'low',
    // Observed first-hand by `npm run terms:report` on the owner's machine,
    // 2026-08-29: reddit.com/robots.txt disallows / for this app's agent. That
    // is a direct instruction, and a stronger signal than the 403s the entry's
    // conditions already anticipated — a 403 is a refusal we might have been
    // working around; a robots disallow is one we were not honouring at all.
    robotsDisallowed: {
      observedAt: '2026-08-29',
      liftedBy: 'REDDIT_CLIENT_ID',
      note: 'robots.txt disallows / for our user-agent. Reddit\'s Data API Terms route legitimate programmatic access through registered OAuth credentials, so configuring REDDIT_CLIENT_ID moves the request off the anonymous path robots forbids. Until then Finance Now does not fetch reddit.com.',
    },
  },
  {
    domain: 'youtube.com',
    name: 'YouTube',
    verdict: 'conditional',
    termsUrl: 'https://developers.google.com/youtube/terms/api-services-terms-of-service',
    finding:
      'Per-channel Atom feeds (/feeds/videos.xml) and the Data API v3 are published for third-party use. The API is keyed and quota-metered (100 units per search against 10,000/day); embedding must use the YouTube player, and video content must not be downloaded.',
    conditions: [
      'Link or embed via the YouTube player — never download or re-host video',
      'Data API searches only on an explicit user action (quota)',
    ],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'cdn.jsdelivr.net',
    name: 'jsDelivr (currency-api mirror)',
    verdict: 'conditional',
    termsUrl: 'https://www.jsdelivr.com/terms',
    finding:
      'Open-source CDN serving the community `fawazahmed0/currency-api` dataset. The CDN permits public asset delivery; the dataset itself is community-maintained and is not an official central-bank source.',
    conditions: ['Label extended-tier FX as community-sourced, never as ECB — the UI already does'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'wikipedia.org',
    name: 'Wikipedia',
    verdict: 'conditional',
    termsUrl: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
    finding:
      'Article text is CC BY-SA licensed and the REST summary API is public, subject to the Wikimedia User-Agent policy requiring an identifying agent string.',
    conditions: ['Send an identifying User-Agent', 'Attribute Wikipedia and preserve CC BY-SA on reused text'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'high',
  },

  // ── APPROVED ───────────────────────────────────────────────────────────────
  {
    domain: 'home.treasury.gov',
    name: 'U.S. Treasury',
    verdict: 'approved',
    termsUrl: 'https://home.treasury.gov/footer/data-quality',
    finding:
      'Daily par yield curve XML published by a U.S. federal agency. U.S. government works are not subject to copyright and the data is published expressly for public reuse.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'high',
  },
  {
    domain: 'frankfurter.dev',
    name: 'Frankfurter (ECB reference rates)',
    verdict: 'approved',
    termsUrl: 'https://frankfurter.dev/',
    finding:
      'Open-source, keyless API republishing the ECB\'s daily reference rates, which the ECB publishes for free reuse with attribution. No registration and no usage restriction stated.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'high',
  },
  {
    domain: 'nasdaqtrader.com',
    name: 'Nasdaq Trader (symbol directory)',
    verdict: 'approved',
    termsUrl: 'https://www.nasdaqtrader.com/Trader.aspx?id=symboldirdefs',
    finding:
      'Symbol directory files published on a public FTP/HTTP endpoint expressly as a reference resource for market participants. Listing metadata only — no quotes.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'mempool.space',
    name: 'mempool.space',
    verdict: 'approved',
    termsUrl: 'https://mempool.space/docs/api/rest',
    finding: 'Open-source Bitcoin explorer publishing a documented, keyless REST API for public use.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'high',
  },
  {
    domain: 'bitget.com',
    name: 'Bitget (public market-data API)',
    verdict: 'conditional',
    termsUrl: 'https://www.bitget.com/api-doc/spot/market/Get-Coin-List',
    finding:
      'Publishes a documented public REST API; the spot public coin list (incl. per-chain withdrawal fees) is documented as unauthenticated. Seeded from the published API documentation — the exchange ToS have not been read for this project, and the endpoint itself is unprobed (see the Bybit removal: a seeded public claim loses to the owner probe).',
    conditions: ['Respect documented rate limits', 'Keyless public endpoints only — no authenticated endpoints (RP-5)'],
    reviewedAt: '2026-08-21',
    review: 'seeded',
    confidence: 'low',
  },
  {
    domain: 'poloniex.com',
    name: 'Poloniex (public market-data API)',
    verdict: 'conditional',
    termsUrl: 'https://api-docs.poloniex.com/',
    finding:
      'Publishes a documented public REST API; the currencies reference (incl. withdrawal fees) is documented as unauthenticated. Seeded from the published API documentation — the exchange ToS have not been read for this project, and the endpoint itself is unprobed (see the Bybit removal: a seeded public claim loses to the owner probe).',
    conditions: ['Respect documented rate limits', 'Keyless public endpoints only — no authenticated endpoints (RP-5)'],
    reviewedAt: '2026-08-21',
    review: 'seeded',
    confidence: 'low',
  },
  {
    domain: 'lbkex.com',
    name: 'LBank (public market-data API)',
    verdict: 'conditional',
    termsUrl: 'https://www.lbank.com/docs/index.html',
    finding:
      'Publishes a documented public REST API; withdrawConfigs is documented as an unauthenticated public endpoint. Seeded from the published API documentation — the exchange ToS have not been read for this project, and the endpoint itself is unprobed (see the Bybit removal: a seeded public claim loses to the owner probe).',
    conditions: ['Respect documented rate limits', 'Keyless public endpoints only — no authenticated endpoints (RP-5)'],
    reviewedAt: '2026-08-21',
    review: 'seeded',
    confidence: 'low',
  },
  {
    domain: 'bitfinex.com',
    name: 'Bitfinex (public conf API)',
    verdict: 'conditional',
    termsUrl: 'https://docs.bitfinex.com/reference/rest-public-conf',
    finding:
      'Publishes a documented public REST API; the v2 public conf endpoints (incl. the currency tx-fee map) are documented as unauthenticated. Seeded from the published API documentation — the exchange ToS have not been read for this project, and the endpoint itself is unprobed (see the Bybit removal: a seeded public claim loses to the owner probe).',
    conditions: ['Respect documented rate limits', 'Keyless public endpoints only — no authenticated endpoints (RP-5)'],
    reviewedAt: '2026-08-21',
    review: 'seeded',
    confidence: 'low',
  },
  {
    domain: 'xt.com',
    name: 'XT.com (public market-data API)',
    verdict: 'conditional',
    termsUrl: 'https://doc.xt.com/',
    finding:
      'Publishes a documented public REST API; the public wallet-support currency endpoint is documented as unauthenticated. Seeded from the published API documentation — the exchange ToS have not been read for this project, and the endpoint itself is unprobed (see the Bybit removal: a seeded public claim loses to the owner probe).',
    conditions: ['Respect documented rate limits', 'Keyless public endpoints only — no authenticated endpoints (RP-5)'],
    reviewedAt: '2026-08-21',
    review: 'seeded',
    confidence: 'low',
  },
  {
    domain: 'publicnode.com',
    name: 'PublicNode (Allnodes) — free public RPC gateways',
    verdict: 'conditional',
    termsUrl: 'https://www.publicnode.com/',
    finding:
      'Operates free, keyless public JSON-RPC gateways for ~75 chains, advertised for open public use with no signup or API key. Used here for a single eth_gasPrice read per chain per revalidate window — far inside any reasonable public-endpoint budget. Seeded from the service\'s publicly advertised posture; the terms document has not been read for this project, and the endpoints themselves are unprobed from this environment.',
    conditions: [
      'Read-only public JSON-RPC methods only',
      'One request per chain per revalidate window — do not poll',
      'Degrade to the static estimate rather than retrying on failure',
    ],
    reviewedAt: '2026-08-22',
    review: 'seeded',
    confidence: 'low',
  },
  {
    domain: 'kucoin.com',
    name: 'KuCoin (public market-data API)',
    verdict: 'conditional',
    termsUrl: 'https://www.kucoin.com/docs',
    finding:
      'KuCoin publishes a documented public REST API; the currencies endpoint (incl. per-chain withdrawal fees) is unauthenticated. Docs impose public rate limits. Seeded from the published API documentation — the exchange ToS have not been read for this project.',
    conditions: ['Respect documented rate limits', 'Keyless public endpoints only — no authenticated endpoints (RP-5)'],
    reviewedAt: '2026-08-21',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'huobi.pro',
    name: 'HTX / Huobi (public market-data API)',
    verdict: 'conditional',
    termsUrl: 'https://huobiapi.github.io/docs/spot/v1/en/',
    finding:
      'HTX publishes a documented public REST API; v2/reference/currencies (incl. per-chain withdrawal fees) is unauthenticated. Seeded from the published API documentation — the exchange ToS have not been read for this project.',
    conditions: ['Respect documented rate limits', 'Keyless public endpoints only — no authenticated endpoints (RP-5)'],
    reviewedAt: '2026-08-21',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'blockchain.info',
    name: 'Blockchain.com (explorer)',
    verdict: 'approved',
    termsUrl: 'https://www.blockchain.com/explorer/api',
    finding: 'Documented keyless explorer API published for public use; used here only as a fallback for chain stats.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'alternative.me',
    name: 'alternative.me (Fear & Greed)',
    verdict: 'approved',
    termsUrl: 'https://alternative.me/crypto/fear-and-greed-index/',
    finding: 'Publishes the Fear & Greed Index over a documented keyless API and asks only for a link back to the index page.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'lido.fi',
    name: 'Lido',
    verdict: 'approved',
    termsUrl: 'https://docs.lido.fi/',
    finding: 'Protocol publishes documented keyless APR endpoints for public/integrator use.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'marinade.finance',
    name: 'Marinade',
    verdict: 'approved',
    termsUrl: 'https://docs.marinade.finance/',
    finding: 'Protocol publishes documented keyless APY endpoints for public/integrator use.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'jito.network',
    name: 'Jito',
    verdict: 'approved',
    termsUrl: 'https://docs.jito.network/',
    finding: 'Protocol publishes documented keyless APY endpoints for public/integrator use.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },

  {
    domain: 'googleapis.com',
    name: 'Google APIs (YouTube Data API v3)',
    verdict: 'conditional',
    termsUrl: 'https://developers.google.com/youtube/terms/api-services-terms-of-service',
    finding:
      'Reached only for the YouTube Data API v3 search endpoint, under the YouTube API Services Terms: a registered project key, a 10,000-unit daily quota (100 per search), and no storing of API data beyond the permitted caching window.',
    conditions: [
      'Registered API key required',
      'Search only on an explicit user action — 100 quota units each',
      'Do not persist API responses beyond the permitted cache window',
    ],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'cryptopanic.com',
    name: 'CryptoPanic',
    verdict: 'conditional',
    termsUrl: 'https://cryptopanic.com/developers/api/',
    finding:
      'Commercial news-aggregation API. Keyed access under a plan licence; the free tier ended April 2026, so any use now is under a paid plan\'s terms.',
    conditions: ['Paid API key required', 'Attribute CryptoPanic and link back to source articles'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'messari.io',
    name: 'Messari',
    verdict: 'conditional',
    termsUrl: 'https://messari.io/terms-of-service',
    finding: 'Commercial research and data API. Keyed access under the plan licence; redistribution of research content is restricted.',
    conditions: ['Valid API key required', 'Display with attribution — no redistribution of research content'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'lunarcrush.com',
    name: 'LunarCrush',
    verdict: 'conditional',
    termsUrl: 'https://lunarcrush.com/about/terms',
    finding:
      'Commercial social-analytics API. Keyed access under the plan licence. Note this is a terms verdict, not an availability one — LunarCrush also blocks datacenter IPs.',
    conditions: ['Valid API key required', 'Attribute LunarCrush on any surface showing its scores'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'santiment.net',
    name: 'Santiment',
    verdict: 'conditional',
    termsUrl: 'https://santiment.net/terms-and-conditions/',
    finding: 'Commercial on-chain and social analytics GraphQL API. Keyed access under the plan licence.',
    conditions: ['Valid API key required', 'Stay within the plan\'s metric and history entitlements'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },

  // ── DeFi protocol APIs (staking / yield discovery) ─────────────────────────
  // All four are protocol-operated, keyless, documented endpoints published so
  // integrators can display the protocol's own rates. Same shape as Lido and
  // Marinade above, and the same standing condition: these are the protocol's
  // published figures, to be shown as theirs and not re-derived into something
  // that looks like an independent measurement.
  {
    domain: 'rocketpool.net',
    name: 'Rocket Pool',
    verdict: 'approved',
    termsUrl: 'https://docs.rocketpool.net/',
    finding: 'Protocol publishes documented keyless network-stats endpoints for public/integrator use.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'stride.zone',
    name: 'Stride',
    verdict: 'approved',
    termsUrl: 'https://docs.stride.zone/',
    finding: 'Protocol publishes documented keyless liquid-staking APY endpoints for public/integrator use.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'beefy.finance',
    name: 'Beefy Finance',
    verdict: 'approved',
    termsUrl: 'https://docs.beefy.finance/',
    finding: 'Protocol publishes a documented keyless vault/APY API for public/integrator use.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'yearn.finance',
    name: 'Yearn Finance',
    verdict: 'approved',
    termsUrl: 'https://docs.yearn.fi/',
    finding: 'Protocol publishes a documented keyless vault/APY API for public/integrator use.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'pendle.finance',
    name: 'Pendle',
    verdict: 'approved',
    termsUrl: 'https://docs.pendle.finance/Developers/Overview',
    finding: 'Protocol publishes a documented keyless market/yield API for public/integrator use.',
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },

  // ── Publisher RSS ──────────────────────────────────────────────────────────
  // RSS is a syndication format: publishing a feed is an invitation to read it
  // programmatically. The condition every one of these carries is the same, and
  // it is the line the app must not cross — headline, link and summary as the
  // publisher chose to syndicate them, linking back to the origin. Reproducing
  // full article text is a different act with different terms.
  {
    domain: 'coindesk.com',
    name: 'CoinDesk',
    verdict: 'conditional',
    termsUrl: 'https://www.coindesk.com/terms',
    finding: 'Publishes a public RSS feed. Syndication of headline/link/summary with attribution and a link back is the intended use; full-text reproduction is not.',
    conditions: ['Headline, link and feed summary only', 'Attribute and link back to the origin article'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'cointelegraph.com',
    name: 'Cointelegraph',
    verdict: 'conditional',
    termsUrl: 'https://cointelegraph.com/terms-and-privacy',
    finding: 'Publishes a public RSS feed for syndication of headline/link/summary with attribution.',
    conditions: ['Headline, link and feed summary only', 'Attribute and link back to the origin article'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'decrypt.co',
    name: 'Decrypt',
    verdict: 'conditional',
    termsUrl: 'https://decrypt.co/terms',
    finding: 'Publishes a public RSS feed for syndication of headline/link/summary with attribution.',
    conditions: ['Headline, link and feed summary only', 'Attribute and link back to the origin article'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'bitcoinmagazine.com',
    name: 'Bitcoin Magazine',
    verdict: 'conditional',
    termsUrl: 'https://bitcoinmagazine.com/terms-of-use',
    finding: 'Publishes a public RSS feed for syndication of headline/link/summary with attribution.',
    conditions: ['Headline, link and feed summary only', 'Attribute and link back to the origin article'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'dowjones.io',
    name: 'Dow Jones (MarketWatch feed delivery)',
    verdict: 'conditional',
    termsUrl: 'https://www.marketwatch.com/terms-of-use',
    finding:
      'feeds.content.dowjones.io serves MarketWatch\'s public top-stories RSS. Dow Jones publishes it for syndication; the terms are personal, non-commercial use with attribution, and expressly not bulk reproduction of article text.',
    conditions: ['Headline, link and feed summary only', 'Attribute MarketWatch and link back', 'Personal, non-commercial use'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'marketwatch.com',
    name: 'MarketWatch',
    verdict: 'conditional',
    termsUrl: 'https://www.marketwatch.com/terms-of-use',
    finding: 'Same terms as the Dow Jones feed host — syndication of headline/link/summary, personal and non-commercial, with attribution.',
    conditions: ['Headline, link and feed summary only', 'Attribute and link back', 'Personal, non-commercial use'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'cnbc.com',
    name: 'CNBC',
    verdict: 'conditional',
    termsUrl: 'https://www.nbcuniversal.com/terms',
    finding: 'Publishes public RSS feeds per desk for syndication of headline/link/summary with attribution and a link back.',
    conditions: ['Headline, link and feed summary only', 'Attribute CNBC and link back'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'investing.com',
    name: 'Investing.com',
    verdict: 'conditional',
    termsUrl: 'https://www.investing.com/about-us/terms-and-conditions',
    finding: 'Publishes per-desk RSS feeds for syndication. Terms permit personal, non-commercial use of the feed with attribution; scraping the site itself is prohibited separately.',
    conditions: ['RSS feed only — never scrape the HTML site', 'Headline, link and summary only, with attribution'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'oilprice.com',
    name: 'OilPrice.com',
    verdict: 'conditional',
    termsUrl: 'https://oilprice.com/terms-of-use',
    finding: 'Publishes a public RSS feed and permits syndication of headline/link/summary with attribution and a link back.',
    conditions: ['Headline, link and feed summary only', 'Attribute and link back'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
  {
    domain: 'fxstreet.com',
    name: 'FXStreet',
    verdict: 'conditional',
    termsUrl: 'https://www.fxstreet.com/about/terms-of-service',
    finding: 'Publishes a public RSS feed for syndication with attribution and a link back to the origin article.',
    conditions: ['Headline, link and feed summary only', 'Attribute and link back'],
    reviewedAt: '2026-08-06',
    review: 'seeded',
    confidence: 'medium',
  },
]

// ─── Lookup + evaluation ──────────────────────────────────────────────────────

/** Lowercase host, no port, no trailing dot. Returns null for an unparseable URL. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return null
  }
}

/**
 * Registry entry governing `host`, or null.
 *
 * Matches the host itself or any subdomain of `entry.domain`, and when several
 * entries match, the MOST SPECIFIC wins. That ordering is the whole point: it
 * lets a broad `conditional` grant coexist with a narrow carve-out, in either
 * direction, without the file order deciding the answer.
 *
 * Suffix matching is on a label boundary — `notyahoo.com` must not match
 * `yahoo.com`, and a plain `endsWith` would say it does.
 */
export function matchTermsEntry(host: string): SourceTermsEntry | null {
  const h = host.toLowerCase().replace(/\.$/, '')
  let best: SourceTermsEntry | null = null
  for (const entry of SOURCE_TERMS) {
    const d = entry.domain.toLowerCase()
    if (h !== d && !h.endsWith(`.${d}`)) continue
    if (!best || d.length > best.domain.length) best = entry
  }
  return best
}

export interface SourceTermsDecision {
  /** May the app fetch this URL? */
  allowed: boolean
  host: string
  /** `null` when no registry entry governs the host. */
  entry: SourceTermsEntry | null
  /** `'unreviewed'` when there is no entry — distinct from a verdict. */
  status: TermsVerdict | 'unreviewed'
  /**
   * Whether the entry backing this decision was actually read. `null` when
   * there is no entry. A caller showing the verdict should show this too — a
   * seeded `approved` is a working assumption, not a clearance.
   */
  review: ReviewState | null
  /** Days since `reviewedAt`; null when unreviewed. */
  ageDays: number | null
  /** Verdict older than the review window. Stale ≠ disallowed — it is a prompt. */
  stale: boolean
  /** One sentence a human (or an error message) can act on. */
  reason: string
}

/**
 * Evaluate a URL against the registry.
 *
 * `now` is injectable so staleness is testable without freezing the clock —
 * same convention as every provenance helper in lib/data.
 *
 * An unreviewed host is `allowed: false`. Deny-by-default is the only setting
 * that makes this a safeguard rather than a label: the failure mode it exists
 * to prevent is a source getting used because nobody got round to checking it.
 */
export function checkSourceTerms(url: string, now: Date = new Date()): SourceTermsDecision {
  const host = hostOf(url)
  if (!host) {
    return { allowed: false, host: '', entry: null, status: 'unreviewed', review: null, ageDays: null, stale: false, reason: 'Not a parseable URL.' }
  }

  const entry = matchTermsEntry(host)
  if (!entry) {
    return {
      allowed: false,
      host,
      entry: null,
      status: 'unreviewed',
      review: null,
      ageDays: null,
      stale: false,
      reason: `No terms review on record for ${host}. Check the site's terms of use, then add an entry to SOURCE_TERMS before Finance Now fetches from it.`,
    }
  }

  const ageDays = Math.floor((now.getTime() - Date.parse(`${entry.reviewedAt}T00:00:00Z`)) / 86_400_000)
  const stale = ageDays > SOURCE_TERMS_REVIEW_AFTER_DAYS

  if (entry.verdict === 'prohibited') {
    return {
      allowed: false,
      host,
      entry,
      status: 'prohibited',
      review: entry.review,
      ageDays,
      stale,
      reason: `${entry.name}'s terms do not permit this use, so Finance Now does not fetch from ${host}. ${entry.finding}`,
    }
  }

  // A seeded entry says so in the reason itself. Anything rendering this string
  // — an error message, a log line, the Integrations panel — then carries the
  // caveat automatically, instead of it living only in a field nobody reads.
  const caveat = entry.review === 'seeded'
    ? ' ⚠ Seeded entry — the terms document has not been read for this project; treat as a working assumption, not a clearance.'
    : ''

  return {
    allowed: true,
    host,
    entry,
    status: entry.verdict,
    review: entry.review,
    ageDays,
    stale,
    reason: (entry.verdict === 'approved'
      ? `${entry.name}: terms permit programmatic use.`
      : `${entry.name}: permitted subject to ${entry.conditions?.length ?? 0} condition(s) — ${(entry.conditions ?? []).join('; ')}.`) + caveat,
  }
}

/** Thrown by `assertSourceAllowed`. Distinguishable from a transport failure. */
export class SourceTermsError extends Error {
  readonly decision: SourceTermsDecision
  constructor(decision: SourceTermsDecision) {
    super(`Blocked by source terms policy: ${decision.reason}`)
    this.name = 'SourceTermsError'
    this.decision = decision
  }
}

/**
 * Throw unless the registry positively permits fetching `url`.
 *
 * The STRICT form — an unreviewed host fails. Use it where "nobody has checked
 * this" should stop the build or the request: the repo-wide test over
 * DATA_SOURCES, and any future route that wants to refuse to ship a source
 * silently. It is deliberately NOT what the transport layer uses; see
 * `assertSourceNotProhibited`.
 */
export function assertSourceAllowed(url: string, now: Date = new Date()): SourceTermsDecision {
  const decision = checkSourceTerms(url, now)
  if (!decision.allowed) throw new SourceTermsError(decision)
  return decision
}

/**
 * Throw only when the registry says this host is off-limits.
 *
 * The RUNTIME form, used by pinnedFetch. It is looser than
 * `assertSourceAllowed` on purpose, and the split is the whole design:
 *
 *   • `prohibited` is a decision about someone else's terms. It binds every
 *     request, forever, with no override — that is what makes the Yahoo removal
 *     stick rather than being a code change someone can undo by pasting a URL
 *     into the Integrations page.
 *   • `unreviewed` is a decision about US — nobody has looked yet. Blocking it
 *     at the socket would break a source the user was explicitly shown the
 *     terms for and explicitly approved, since acknowledging a feed doesn't add
 *     a registry entry. So it is gated where the human is: at save time in
 *     /live-data/config, via probeSiteTerms and `termsAcknowledged`.
 *
 * Collapsing the two would either let a prohibited host through or make the
 * acknowledgement flow a lie. Keep them separate.
 */
/** Thrown when robots.txt disallows us and no credential lifts it. */
export class RobotsDisallowedError extends Error {
  constructor(public readonly host: string, public readonly note: string) {
    super(`robots.txt disallows ${host}: ${note}`)
    this.name = 'RobotsDisallowedError'
  }
}

/**
 * Refuse a fetch to a host whose robots.txt disallows our agent, unless the
 * entry names a credential and that credential is configured.
 *
 * Separate from the terms check on purpose: this one is not interpretation.
 * Either the file says we may not, or it does not.
 */
export function assertRobotsPermits(url: string, env: NodeJS.ProcessEnv = process.env): void {
  let host: string
  try { host = new URL(url).hostname } catch { return }
  const entry = SOURCE_TERMS.find(
    (e) => host === e.domain || host.endsWith(`.${e.domain}`),
  )
  const rd = entry?.robotsDisallowed
  if (!rd) return
  if (rd.liftedBy && (env[rd.liftedBy] ?? '').trim()) return
  throw new RobotsDisallowedError(host, rd.note)
}

/** True when this host may be fetched — the non-throwing form, for callers that degrade. */
export function robotsPermits(url: string, env: NodeJS.ProcessEnv = process.env): boolean {
  try { assertRobotsPermits(url, env); return true } catch { return false }
}

export function assertSourceNotProhibited(url: string, now: Date = new Date()): SourceTermsDecision {
  const decision = checkSourceTerms(url, now)
  if (decision.status === 'prohibited') throw new SourceTermsError(decision)
  return decision
}

/**
 * Registry-level provenance, in the same shape the data catalogs use, so the
 * /data-sources page can render it with the existing <ProvenanceNotice>.
 */
export function getSourceTermsProvenance(now: Date = new Date()): {
  source: string
  reviewedAt: string
  ageDays: number
  stale: boolean
  confidence: TermsConfidence
  total: number
  prohibited: number
  /** Entries past the review window. */
  needsReview: number
  /** Entries whose terms document has actually been read. */
  verified: number
  /** Entries written from documented posture, never read. The work queue. */
  seeded: number
} {
  const ages = SOURCE_TERMS.map((e) => Math.floor((now.getTime() - Date.parse(`${e.reviewedAt}T00:00:00Z`)) / 86_400_000))
  // Date the registry by its OLDEST entry, not its newest. Re-reading one site's
  // terms does not refresh the other forty — same rule as the data catalogs.
  const oldest = ages.length > 0 ? Math.max(...ages) : 0
  const oldestEntry = SOURCE_TERMS[ages.indexOf(oldest)]
  const seeded = SOURCE_TERMS.filter((e) => e.review === 'seeded').length
  return {
    source: 'Finance Now source terms registry (lib/server/sourceTerms.ts)',
    reviewedAt: oldestEntry?.reviewedAt ?? SOURCE_TERMS_SEEDED,
    ageDays: oldest,
    stale: oldest > SOURCE_TERMS_REVIEW_AFTER_DAYS,
    // Registry-level confidence is bounded by its weakest entry, and while
    // anything is seeded that bound is 'low'. Averaging would let 47 unread
    // entries hide behind one real review.
    confidence: seeded > 0 || SOURCE_TERMS.some((e) => e.confidence === 'low') ? 'low' : 'medium',
    total: SOURCE_TERMS.length,
    prohibited: SOURCE_TERMS.filter((e) => e.verdict === 'prohibited').length,
    needsReview: ages.filter((a) => a > SOURCE_TERMS_REVIEW_AFTER_DAYS).length,
    verified: SOURCE_TERMS.length - seeded,
    seeded,
  }
}
