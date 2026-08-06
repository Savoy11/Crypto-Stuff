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
  /** ISO date (YYYY-MM-DD) the terms were last reviewed for this project. */
  verifiedAt: string
  confidence: TermsConfidence
}

/**
 * A verdict older than this is reported stale. 180 days is deliberately shorter
 * than nothing and longer than the 120 used for price/fee snapshots: terms move
 * less often than markets, but a two-year-old reading is not a reading.
 */
export const SOURCE_TERMS_REVIEW_AFTER_DAYS = 180

/**
 * The registry was seeded on this date as part of the Yahoo removal. Entries
 * carry their own `verifiedAt`; this is the batch marker so a reviewer can tell
 * a seeded entry from one someone has since re-read on purpose.
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
    verifiedAt: '2026-08-06',
    confidence: 'high',
  },
  {
    domain: 'cboe.com',
    name: 'Cboe Global Markets',
    verdict: 'prohibited',
    termsUrl: 'https://www.cboe.com/us_terms_of_use/',
    finding:
      'Terms of use prohibit automated extraction of quote data. This is why Finance Now carries no options chain and the Trade Risk Scorer takes hand-entered option quotes instead — see docs/assessments/P2-O1-options-data.md.',
    verifiedAt: '2026-08-05',
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
    verifiedAt: '2026-08-06',
    confidence: 'high',
  },
  {
    domain: 'coingecko.com',
    name: 'CoinGecko',
    verdict: 'conditional',
    termsUrl: 'https://www.coingecko.com/en/terms',
    finding:
      'Publishes a public API with a documented free tier intended for third-party applications. Free-tier use is rate-limited and requires attribution to CoinGecko as the price source.',
    conditions: [
      'Attribute CoinGecko wherever its prices are displayed',
      'Respect the free-tier rate limit (~30 calls/min) or supply a paid key',
    ],
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'binance.us',
    name: 'Binance.US',
    verdict: 'conditional',
    termsUrl: 'https://www.binance.us/terms',
    finding: 'Same documented keyless public market-data endpoints as the global venue, under US terms and weights.',
    conditions: ['Respect the published per-endpoint request weights', 'Report the serving venue — it is a different market than binance.com'],
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'okx.com',
    name: 'OKX',
    verdict: 'conditional',
    termsUrl: 'https://www.okx.com/docs-v5/en/#overview',
    finding: 'Documented keyless public market-data API (v5) with published rate limits, offered for programmatic use.',
    conditions: ['Respect the published v5 rate limits'],
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
    confidence: 'low',
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
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
    confidence: 'high',
  },
  {
    domain: 'frankfurter.dev',
    name: 'Frankfurter (ECB reference rates)',
    verdict: 'approved',
    termsUrl: 'https://frankfurter.dev/',
    finding:
      'Open-source, keyless API republishing the ECB\'s daily reference rates, which the ECB publishes for free reuse with attribution. No registration and no usage restriction stated.',
    verifiedAt: '2026-08-06',
    confidence: 'high',
  },
  {
    domain: 'nasdaqtrader.com',
    name: 'Nasdaq Trader (symbol directory)',
    verdict: 'approved',
    termsUrl: 'https://www.nasdaqtrader.com/Trader.aspx?id=symboldirdefs',
    finding:
      'Symbol directory files published on a public FTP/HTTP endpoint expressly as a reference resource for market participants. Listing metadata only — no quotes.',
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'mempool.space',
    name: 'mempool.space',
    verdict: 'approved',
    termsUrl: 'https://mempool.space/docs/api/rest',
    finding: 'Open-source Bitcoin explorer publishing a documented, keyless REST API for public use.',
    verifiedAt: '2026-08-06',
    confidence: 'high',
  },
  {
    domain: 'blockchain.info',
    name: 'Blockchain.com (explorer)',
    verdict: 'approved',
    termsUrl: 'https://www.blockchain.com/explorer/api',
    finding: 'Documented keyless explorer API published for public use; used here only as a fallback for chain stats.',
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'alternative.me',
    name: 'alternative.me (Fear & Greed)',
    verdict: 'approved',
    termsUrl: 'https://alternative.me/crypto/fear-and-greed-index/',
    finding: 'Publishes the Fear & Greed Index over a documented keyless API and asks only for a link back to the index page.',
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'lido.fi',
    name: 'Lido',
    verdict: 'approved',
    termsUrl: 'https://docs.lido.fi/',
    finding: 'Protocol publishes documented keyless APR endpoints for public/integrator use.',
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'marinade.finance',
    name: 'Marinade',
    verdict: 'approved',
    termsUrl: 'https://docs.marinade.finance/',
    finding: 'Protocol publishes documented keyless APY endpoints for public/integrator use.',
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'jito.network',
    name: 'Jito',
    verdict: 'approved',
    termsUrl: 'https://docs.jito.network/',
    finding: 'Protocol publishes documented keyless APY endpoints for public/integrator use.',
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'messari.io',
    name: 'Messari',
    verdict: 'conditional',
    termsUrl: 'https://messari.io/terms-of-service',
    finding: 'Commercial research and data API. Keyed access under the plan licence; redistribution of research content is restricted.',
    conditions: ['Valid API key required', 'Display with attribution — no redistribution of research content'],
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'santiment.net',
    name: 'Santiment',
    verdict: 'conditional',
    termsUrl: 'https://santiment.net/terms-and-conditions/',
    finding: 'Commercial on-chain and social analytics GraphQL API. Keyed access under the plan licence.',
    conditions: ['Valid API key required', 'Stay within the plan\'s metric and history entitlements'],
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'stride.zone',
    name: 'Stride',
    verdict: 'approved',
    termsUrl: 'https://docs.stride.zone/',
    finding: 'Protocol publishes documented keyless liquid-staking APY endpoints for public/integrator use.',
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'beefy.finance',
    name: 'Beefy Finance',
    verdict: 'approved',
    termsUrl: 'https://docs.beefy.finance/',
    finding: 'Protocol publishes a documented keyless vault/APY API for public/integrator use.',
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'yearn.finance',
    name: 'Yearn Finance',
    verdict: 'approved',
    termsUrl: 'https://docs.yearn.fi/',
    finding: 'Protocol publishes a documented keyless vault/APY API for public/integrator use.',
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'pendle.finance',
    name: 'Pendle',
    verdict: 'approved',
    termsUrl: 'https://docs.pendle.finance/Developers/Overview',
    finding: 'Protocol publishes a documented keyless market/yield API for public/integrator use.',
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'cointelegraph.com',
    name: 'Cointelegraph',
    verdict: 'conditional',
    termsUrl: 'https://cointelegraph.com/terms-and-privacy',
    finding: 'Publishes a public RSS feed for syndication of headline/link/summary with attribution.',
    conditions: ['Headline, link and feed summary only', 'Attribute and link back to the origin article'],
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'decrypt.co',
    name: 'Decrypt',
    verdict: 'conditional',
    termsUrl: 'https://decrypt.co/terms',
    finding: 'Publishes a public RSS feed for syndication of headline/link/summary with attribution.',
    conditions: ['Headline, link and feed summary only', 'Attribute and link back to the origin article'],
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'bitcoinmagazine.com',
    name: 'Bitcoin Magazine',
    verdict: 'conditional',
    termsUrl: 'https://bitcoinmagazine.com/terms-of-use',
    finding: 'Publishes a public RSS feed for syndication of headline/link/summary with attribution.',
    conditions: ['Headline, link and feed summary only', 'Attribute and link back to the origin article'],
    verifiedAt: '2026-08-06',
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
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'marketwatch.com',
    name: 'MarketWatch',
    verdict: 'conditional',
    termsUrl: 'https://www.marketwatch.com/terms-of-use',
    finding: 'Same terms as the Dow Jones feed host — syndication of headline/link/summary, personal and non-commercial, with attribution.',
    conditions: ['Headline, link and feed summary only', 'Attribute and link back', 'Personal, non-commercial use'],
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'cnbc.com',
    name: 'CNBC',
    verdict: 'conditional',
    termsUrl: 'https://www.nbcuniversal.com/terms',
    finding: 'Publishes public RSS feeds per desk for syndication of headline/link/summary with attribution and a link back.',
    conditions: ['Headline, link and feed summary only', 'Attribute CNBC and link back'],
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'investing.com',
    name: 'Investing.com',
    verdict: 'conditional',
    termsUrl: 'https://www.investing.com/about-us/terms-and-conditions',
    finding: 'Publishes per-desk RSS feeds for syndication. Terms permit personal, non-commercial use of the feed with attribution; scraping the site itself is prohibited separately.',
    conditions: ['RSS feed only — never scrape the HTML site', 'Headline, link and summary only, with attribution'],
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'oilprice.com',
    name: 'OilPrice.com',
    verdict: 'conditional',
    termsUrl: 'https://oilprice.com/terms-of-use',
    finding: 'Publishes a public RSS feed and permits syndication of headline/link/summary with attribution and a link back.',
    conditions: ['Headline, link and feed summary only', 'Attribute and link back'],
    verifiedAt: '2026-08-06',
    confidence: 'medium',
  },
  {
    domain: 'fxstreet.com',
    name: 'FXStreet',
    verdict: 'conditional',
    termsUrl: 'https://www.fxstreet.com/about/terms-of-service',
    finding: 'Publishes a public RSS feed for syndication with attribution and a link back to the origin article.',
    conditions: ['Headline, link and feed summary only', 'Attribute and link back'],
    verifiedAt: '2026-08-06',
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
  /** Days since `verifiedAt`; null when unreviewed. */
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
    return { allowed: false, host: '', entry: null, status: 'unreviewed', ageDays: null, stale: false, reason: 'Not a parseable URL.' }
  }

  const entry = matchTermsEntry(host)
  if (!entry) {
    return {
      allowed: false,
      host,
      entry: null,
      status: 'unreviewed',
      ageDays: null,
      stale: false,
      reason: `No terms review on record for ${host}. Check the site's terms of use, then add an entry to SOURCE_TERMS before Finance Now fetches from it.`,
    }
  }

  const ageDays = Math.floor((now.getTime() - Date.parse(`${entry.verifiedAt}T00:00:00Z`)) / 86_400_000)
  const stale = ageDays > SOURCE_TERMS_REVIEW_AFTER_DAYS

  if (entry.verdict === 'prohibited') {
    return {
      allowed: false,
      host,
      entry,
      status: 'prohibited',
      ageDays,
      stale,
      reason: `${entry.name}'s terms do not permit this use, so Finance Now does not fetch from ${host}. ${entry.finding}`,
    }
  }

  return {
    allowed: true,
    host,
    entry,
    status: entry.verdict,
    ageDays,
    stale,
    reason: entry.verdict === 'approved'
      ? `${entry.name}: terms permit programmatic use.`
      : `${entry.name}: permitted subject to ${entry.conditions?.length ?? 0} condition(s) — ${(entry.conditions ?? []).join('; ')}.`,
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
  verifiedAt: string
  ageDays: number
  stale: boolean
  confidence: TermsConfidence
  total: number
  prohibited: number
  needsReview: number
} {
  const ages = SOURCE_TERMS.map((e) => Math.floor((now.getTime() - Date.parse(`${e.verifiedAt}T00:00:00Z`)) / 86_400_000))
  // Date the registry by its OLDEST entry, not its newest. Re-reading one site's
  // terms does not refresh the other forty — same rule as the data catalogs.
  const oldest = ages.length > 0 ? Math.max(...ages) : 0
  const oldestEntry = SOURCE_TERMS[ages.indexOf(oldest)]
  return {
    source: 'Finance Now source terms registry (lib/server/sourceTerms.ts)',
    verifiedAt: oldestEntry?.verifiedAt ?? SOURCE_TERMS_SEEDED,
    ageDays: oldest,
    stale: oldest > SOURCE_TERMS_REVIEW_AFTER_DAYS,
    confidence: SOURCE_TERMS.some((e) => e.confidence === 'low') ? 'low' : 'medium',
    total: SOURCE_TERMS.length,
    prohibited: SOURCE_TERMS.filter((e) => e.verdict === 'prohibited').length,
    needsReview: ages.filter((a) => a > SOURCE_TERMS_REVIEW_AFTER_DAYS).length,
  }
}
