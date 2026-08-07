// ─────────────────────────────────────────────────────────────────────────────
// TERMS PROBE — automated pre-flight check on a website Finance Now is being
// asked to use as a data source.
//
// This is the half of the safeguard that runs against a site nobody has
// reviewed yet: a user pastes a feed URL into Integrations, and before it is
// saved we go and look at what the site says about being read by software.
// It answers three questions, each independently reported:
//
//   1. robots.txt — does the site's own machine-readable access policy allow
//      our user-agent to fetch this path? This is the one hard, unambiguous
//      signal available, so a disallow is treated as a block.
//   2. Where are the terms? — try the conventional paths, and scan the
//      homepage for a link whose text or href looks like a terms document.
//   3. What do the terms say? — scan for the language that actually decides
//      this question: automated access, scraping, redistribution, commercial
//      use, and the permissive counterparts (published API, feed syndication).
//
// ⚠ ADVISORY, NOT A DETERMINATION. A keyword scan cannot read a contract. The
// probe's job is to stop the obvious cases automatically and to put the real
// document in front of a human for everything else — which is why the report
// always carries the terms URL and the matched sentences, not just a verdict.
// `blocked` is the only outcome the app enforces on its own; everything else
// routes to an explicit human acknowledgement.
//
// ⚠ A FAILED PROBE IS NOT A PASS, AND NOT A FAIL EITHER. Publishers 403
// datacenter IPs, including on their legal pages. `unknown` means we could not
// read it — never treat that as either permission or refusal (see CLAUDE.md on
// why availability checks must run on the owner's machine).
//
// The parsing here is pure and exported so it is testable without a network:
// parseRobotsTxt / isPathAllowedByRobots / discoverTermsLinks / scanTermsText.
// ─────────────────────────────────────────────────────────────────────────────

import { pinnedFetch } from '@/lib/server/pinnedFetch'
import { checkSourceTerms, type SourceTermsDecision } from '@/lib/server/sourceTerms'

/** Sent on every probe request. Identifies the app rather than pretending to be a browser. */
export const PROBE_USER_AGENT = 'FinanceNow/1.0 (source-terms compliance check)'

/** The token a robots.txt would use to name us specifically. */
export const PROBE_ROBOTS_TOKEN = 'financenow'

const PROBE_TIMEOUT_MS = 8_000
/** Terms pages are long; cap what we read so one huge document can't stall a save. */
const MAX_TERMS_BYTES = 600_000

// ─── robots.txt ───────────────────────────────────────────────────────────────

export interface RobotsGroup {
  /** Lowercased user-agent tokens this group applies to. */
  agents: string[]
  allow: string[]
  disallow: string[]
}

export interface RobotsFile {
  groups: RobotsGroup[]
  /** True when the file existed and parsed — distinct from "no rules". */
  present: boolean
}

/**
 * Parse robots.txt into agent groups.
 *
 * Consecutive `User-agent` lines share one group of rules (that is the actual
 * spec, and the naive one-agent-per-group reading silently loses rules for
 * every agent but the last). Comments and unknown directives are dropped.
 */
export function parseRobotsTxt(text: string): RobotsFile {
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null
  let lastWasAgent = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const field = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    if (!current) continue
    lastWasAgent = false
    if (field === 'allow') current.allow.push(value)
    else if (field === 'disallow') current.disallow.push(value)
  }

  return { groups, present: true }
}

/** Does a robots pattern (with `*` and `$`) match this path? */
function robotsPatternMatches(pattern: string, path: string): boolean {
  if (pattern === '') return false // `Disallow:` with no value means "allow all"
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const rx = new RegExp(
    '^' + body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : '')
  )
  return rx.test(path)
}

/**
 * Is `path` fetchable by `agent` under these rules?
 *
 * Group selection follows the spec: the most specific matching user-agent group
 * wins outright, and `*` is only consulted when no named group matches. Within
 * a group the longest matching rule wins, with Allow beating Disallow on a tie
 * — which is what lets a site say "stay out of /api, except /api/public".
 */
export function isPathAllowedByRobots(robots: RobotsFile, path: string, agent = PROBE_ROBOTS_TOKEN): boolean {
  if (robots.groups.length === 0) return true
  const a = agent.toLowerCase()

  const named = robots.groups.filter((g) => g.agents.some((t) => t !== '*' && a.includes(t)))
  const applicable = named.length > 0 ? named : robots.groups.filter((g) => g.agents.includes('*'))
  if (applicable.length === 0) return true

  let best: { len: number; allow: boolean } | null = null
  for (const group of applicable) {
    for (const rule of group.disallow) {
      if (robotsPatternMatches(rule, path) && (!best || rule.length > best.len)) best = { len: rule.length, allow: false }
    }
    for (const rule of group.allow) {
      // `>=` so an Allow of equal length beats a Disallow — the documented tie-break.
      if (robotsPatternMatches(rule, path) && (!best || rule.length >= best.len)) best = { len: rule.length, allow: true }
    }
  }
  return best ? best.allow : true
}

// ─── Finding the terms document ───────────────────────────────────────────────

/** Conventional locations, tried in order before falling back to link discovery. */
export const COMMON_TERMS_PATHS = [
  '/terms', '/terms-of-use', '/terms-of-service', '/terms-and-conditions',
  '/tos', '/legal/terms', '/legal', '/about/terms', '/api/terms', '/api-terms',
]

const TERMS_LINK_RE = /terms|conditions|legal|tos\b|acceptable[- ]use|api[- ]licen[cs]e/i

/**
 * Pull candidate terms URLs out of a page's HTML.
 *
 * Matches on href AND link text, because plenty of sites link "Legal" to
 * /policies/1234 — an href-only scan misses exactly the pages that are hardest
 * to guess. Results are absolute, deduped, and ordered best-guess first.
 */
export function discoverTermsLinks(html: string, baseUrl: string): string[] {
  const found = new Map<string, number>()
  const anchor = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = anchor.exec(html)) !== null) {
    const href = m[1]
    const text = m[2].replace(/<[^>]*>/g, ' ').trim()
    const hrefHit = TERMS_LINK_RE.test(href)
    const textHit = TERMS_LINK_RE.test(text)
    if (!hrefHit && !textHit) continue
    let abs: string
    try {
      abs = new URL(href, baseUrl).toString()
    } catch {
      continue
    }
    if (!/^https?:/i.test(abs)) continue
    // Both signals agreeing is the strongest candidate; href alone beats text alone.
    const score = (hrefHit ? 2 : 0) + (textHit ? 1 : 0)
    found.set(abs, Math.max(found.get(abs) ?? 0, score))
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1]).map(([url]) => url).slice(0, 5)
}

// ─── Reading the terms ────────────────────────────────────────────────────────

export type TermsSignalKind = 'restrictive' | 'permissive'

export interface TermsSignal {
  kind: TermsSignalKind
  /** What was matched, e.g. 'automated access'. */
  label: string
  /** The sentence it was matched in, so a human can judge it in context. */
  excerpt: string
}

interface SignalRule { label: string; re: RegExp }

// Prohibition clauses put the negative on either side of the thing being
// prohibited — "you may not use any robot" and "robots are prohibited" are the
// same clause — so this pair is matched in both orders. A one-directional
// version missed the more common English phrasing outright.
const AGENT_WORDS = '(?:automat(?:ed|ic)|robot|spider|crawler|scraper|bot)'
const DENY_WORDS = '(?:prohibit|not permitted|may not|must not|shall not|forbidden|without[^.]{0,20}written)'

const RESTRICTIVE_RULES: SignalRule[] = [
  {
    label: 'prohibits automated access',
    re: new RegExp(
      `\\b${AGENT_WORDS}\\b[^.]{0,120}\\b${DENY_WORDS}|\\b${DENY_WORDS}\\b[^.]{0,120}\\b${AGENT_WORDS}`,
      'i'
    ),
  },
  { label: 'prohibits scraping', re: /\b(scrap(?:e|ing)|harvest(?:ing)?|data[- ]?min(?:e|ing)|screen[- ]?scrap)/i },
  { label: 'prohibits redistribution', re: /\b(redistribut|republish|resell|retransmit|sublicen[cs])/i },
  { label: 'personal / non-commercial use only', re: /\bpersonal(?:,| and)?[^.]{0,30}non[- ]commercial\b|\bnon[- ]commercial use only\b/i },
  { label: 'requires prior written permission', re: /\bprior written (?:consent|permission|authorization)\b/i },
  { label: 'prohibits framing / caching', re: /\b(frame|framing|mirror|cache|caching)\b[^.]{0,80}\b(prohibit|may not|not permitted)/i },
]

const PERMISSIVE_RULES: SignalRule[] = [
  { label: 'offers a public API', re: /\b(public|open|developer|free)\s+api\b|\bapi (?:is )?(?:free|open|publicly available)\b/i },
  { label: 'permits RSS syndication', re: /\brss\b[^.]{0,120}\b(may|permit|allow|free to|encourag)/i },
  { label: 'grants a licence to use the data', re: /\bwe grant you\b|\bhereby grant(?:s|ed)?\b[^.]{0,120}\blicen[cs]e\b/i },
  { label: 'open / permissive licence', re: /\b(creative commons|CC[- ]BY|MIT licen[cs]e|apache licen[cs]e|public domain|open data)\b/i },
  { label: 'attribution-based permission', re: /\b(with|provided|subject to)\b[^.]{0,60}\battribution\b/i },
]

/** Strip HTML to readable text. Crude on purpose — we are pattern-matching, not rendering. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Scan terms text for the clauses that decide whether software may read this
 * site. Returns every match with the sentence it came from — a bare label is
 * not reviewable, and this report exists to be reviewed.
 */
export function scanTermsText(text: string): TermsSignal[] {
  const sentences = text.split(/(?<=[.;!?])\s+/)
  const signals: TermsSignal[] = []
  const seen = new Set<string>()

  const run = (rules: SignalRule[], kind: TermsSignalKind) => {
    for (const rule of rules) {
      for (const sentence of sentences) {
        if (sentence.length > 600 || !rule.re.test(sentence)) continue
        const key = `${kind}:${rule.label}`
        if (seen.has(key)) break
        seen.add(key)
        signals.push({ kind, label: rule.label, excerpt: sentence.trim().slice(0, 400) })
        break
      }
    }
  }
  run(RESTRICTIVE_RULES, 'restrictive')
  run(PERMISSIVE_RULES, 'permissive')
  return signals
}

// ─── The probe ────────────────────────────────────────────────────────────────

export type ProbeOutcome =
  /** Registry says prohibited, or robots.txt disallows the path. Refuse the source. */
  | 'blocked'
  /** Registry approves this host on a verdict someone actually read. */
  | 'registry-approved'
  /**
   * Registry permits it, but on a `seeded` entry — written from the provider's
   * documented posture, never read. Distinct from `registry-approved` because
   * collapsing them is how "nobody has objected yet" starts reading as "checked
   * and cleared", which is the exact failure this whole module exists to stop.
   * Does not block or prompt: the entry stands until someone reads it.
   */
  | 'registry-seeded'
  /** Readable terms with restrictive language. Needs an explicit human decision. */
  | 'needs-review'
  /** Nothing restrictive found, but a keyword scan is not a reading. Needs acknowledgement. */
  | 'inconclusive'
  /** Could not read robots or terms at all. Needs acknowledgement — NOT a pass. */
  | 'unknown'

export interface TermsProbeReport {
  url: string
  host: string
  outcome: ProbeOutcome
  /** One line for the UI. */
  summary: string
  /** Registry decision, always included — the probe never overrides it. */
  registry: SourceTermsDecision
  robots: {
    checked: boolean
    /** null when robots.txt could not be read at all. */
    allowed: boolean | null
    /** e.g. 'no robots.txt (nothing to disallow)' or 'Disallow: /api'. */
    detail: string
  }
  terms: {
    /** URL of the document actually read, if one was found. */
    url: string | null
    /** Every candidate we found, so a human can check the one we picked. */
    candidates: string[]
    signals: TermsSignal[]
    error?: string
  }
  /** True when the app will refuse to save this source no matter what. */
  hardBlock: boolean
  /** True when saving requires the user to confirm they have read the terms. */
  requiresAcknowledgement: boolean
  checkedAt: string
}

async function getText(url: string, limit = MAX_TERMS_BYTES): Promise<string> {
  const res = await pinnedFetch(url, {
    headers: { 'User-Agent': PROBE_USER_AGENT, Accept: 'text/html,text/plain,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    // The one legitimate use of the opt-out: reading a site's robots.txt and
    // terms is how the gate gets its answer, so it cannot be behind the gate.
    // SSRF validation and address pinning still apply — only the terms check
    // is skipped, and only for these two documents.
    skipTermsCheck: true,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.text()
  return body.slice(0, limit)
}

/**
 * Probe a candidate source URL.
 *
 * Never throws for a network reason: an unreachable site produces an `unknown`
 * report, because "we couldn't check" is a result the caller must handle, not
 * an exception that loses the other two signals we did collect.
 */
export async function probeSiteTerms(rawUrl: string, now: Date = new Date()): Promise<TermsProbeReport> {
  const registry = checkSourceTerms(rawUrl, now)
  const base: Omit<TermsProbeReport, 'outcome' | 'summary' | 'hardBlock' | 'requiresAcknowledgement'> = {
    url: rawUrl,
    host: registry.host,
    registry,
    robots: { checked: false, allowed: null, detail: 'not checked' },
    terms: { url: null, candidates: [], signals: [] },
    checkedAt: now.toISOString(),
  }

  // A prohibited registry entry ends it. The probe cannot overturn a reading of
  // the actual document, and a site whose terms forbid this is not made
  // acceptable by a permissive robots.txt.
  if (registry.entry?.verdict === 'prohibited') {
    return {
      ...base,
      outcome: 'blocked',
      summary: registry.reason,
      hardBlock: true,
      requiresAcknowledgement: false,
    }
  }

  let origin: string
  let path: string
  try {
    const u = new URL(rawUrl)
    origin = u.origin
    path = u.pathname || '/'
  } catch {
    return {
      ...base,
      outcome: 'blocked',
      summary: 'Not a parseable http(s) URL.',
      hardBlock: true,
      requiresAcknowledgement: false,
    }
  }

  // ── 1. robots.txt ──
  const robots = { ...base.robots }
  try {
    const text = await getText(`${origin}/robots.txt`, 200_000)
    const parsed = parseRobotsTxt(text)
    robots.checked = true
    robots.allowed = isPathAllowedByRobots(parsed, path)
    robots.detail = robots.allowed
      ? `robots.txt permits ${path} for ${PROBE_ROBOTS_TOKEN}`
      : `robots.txt disallows ${path} for ${PROBE_ROBOTS_TOKEN}`
  } catch (e) {
    // No robots.txt is the normal case for small feed hosts and means "no
    // restriction stated" — not a failure, and not a reason to block.
    robots.checked = true
    robots.allowed = null
    robots.detail = `robots.txt not readable (${e instanceof Error ? e.message : 'error'}) — no stated restriction`
  }

  if (robots.allowed === false) {
    return {
      ...base,
      robots,
      outcome: 'blocked',
      summary: `${registry.host} publishes a robots.txt that disallows automated access to ${path}. Finance Now honours it.`,
      hardBlock: true,
      requiresAcknowledgement: false,
    }
  }

  // ── 2 + 3. Find and read the terms ──
  const terms: TermsProbeReport['terms'] = { url: null, candidates: [], signals: [] }
  const candidates: string[] = []
  try {
    const home = await getText(origin, 400_000)
    candidates.push(...discoverTermsLinks(home, origin))
  } catch {
    // Homepage unreadable — fall through to the conventional paths.
  }
  for (const p of COMMON_TERMS_PATHS) {
    const u = `${origin}${p}`
    if (!candidates.includes(u)) candidates.push(u)
  }
  terms.candidates = candidates.slice(0, 8)

  for (const candidate of terms.candidates) {
    try {
      const html = await getText(candidate)
      const text = htmlToText(html)
      // A 200 that is really a soft-404 or a JS shell has nothing to scan;
      // treating it as "read the terms, found nothing" would be a false pass.
      if (text.length < 800) continue
      const signals = scanTermsText(text)
      terms.url = candidate
      terms.signals = signals
      break
    } catch {
      continue
    }
  }

  // A `prohibited` entry already returned above, so anything still holding an
  // entry here is approved or conditional — the registry has spoken and the
  // keyword scan does not get a vote.
  if (registry.entry) {
    return {
      ...base,
      robots,
      terms,
      outcome: registry.entry.review === 'verified' ? 'registry-approved' : 'registry-seeded',
      summary: registry.reason + (registry.stale ? ` This review is ${registry.ageDays} days old — worth re-reading.` : ''),
      hardBlock: false,
      requiresAcknowledgement: false,
    }
  }

  if (!terms.url) {
    return {
      ...base,
      robots,
      terms: { ...terms, error: 'No readable terms document found at the usual locations.' },
      outcome: 'unknown',
      summary: `Couldn't read terms for ${registry.host}. That is not permission — open the site's terms yourself before using it. (Publishers often block datacenter IPs; a check from your own machine may succeed.)`,
      hardBlock: false,
      requiresAcknowledgement: true,
    }
  }

  const restrictive = terms.signals.filter((s) => s.kind === 'restrictive')
  if (restrictive.length > 0) {
    return {
      ...base,
      robots,
      terms,
      outcome: 'needs-review',
      summary: `${registry.host}'s terms contain ${restrictive.length} clause(s) that may forbid this use: ${restrictive.map((s) => s.label).join(', ')}. Read them before continuing.`,
      hardBlock: false,
      requiresAcknowledgement: true,
    }
  }

  return {
    ...base,
    robots,
    terms,
    outcome: 'inconclusive',
    summary: `No prohibitive language found in ${registry.host}'s terms, but a keyword scan is not a reading — confirm the terms allow an app like Finance Now to fetch this feed.`,
    hardBlock: false,
    requiresAcknowledgement: true,
  }
}
