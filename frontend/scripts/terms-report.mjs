#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// TERMS REVIEW WORKSHEET — turns "read 47 terms documents" into a checklist.
//
//   npm run terms:report              # every registered host
//   npm run terms:report -- --seeded  # only the ones nobody has read yet
//   npm run terms:report -- --news    # only the news publishers
//   npm run terms:report -- --out docs/audits/terms-2026-08-07.md
//
// For each host it fetches robots.txt, finds the terms document, and scans it
// for the clauses that decide whether an app like this may read the feed. It
// writes a markdown worksheet: current verdict, what the probe saw, a link to
// the document, and a blank line for your conclusion.
//
// ⚠ RUN THIS FROM THE OWNER'S MACHINE. Publishers 403 datacenter IPs, and this
// project's own network policy blocks most of them outright — a cloud or CI run
// reports "couldn't read the terms" for sites that serve them fine from a
// residential connection. Same rule as `npm run audit`: an environment-dependent
// result measured in the wrong environment is worse than no result, because it
// looks like one.
//
// ⚠ THE PROBE DOES NOT DECIDE ANYTHING. It finds the document and highlights
// candidate clauses so you spend your reading time in the right paragraphs.
// Flipping an entry to `review: 'verified'` is a human act.
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync } from 'node:fs'

// The probe is TypeScript with `@/` path aliases, so this runs under tsx —
// `npm run terms:report` invokes it that way. (tsx's programmatic `register()`
// is not used: it goes through the deprecated --loader path and throws on
// Node 22, which is this project's floor.)
const { SOURCE_TERMS } = await import('../src/lib/server/sourceTerms.ts')
const { probeSiteTerms } = await import('../src/lib/server/termsProbe.ts')

const args = process.argv.slice(2)
const seededOnly = args.includes('--seeded')
const newsOnly = args.includes('--news')
const outIdx = args.indexOf('--out')
const outPath = outIdx !== -1 ? args[outIdx + 1] : null

// The news publishers, by the feeds the app actually fetches. Kept here rather
// than derived from a `category` field because the registry describes hosts,
// not roles — one host can serve a feed and an API.
const NEWS_DOMAINS = new Set([
  'coindesk.com', 'cointelegraph.com', 'decrypt.co', 'bitcoinmagazine.com',
  'dowjones.io', 'marketwatch.com', 'cnbc.com',
  'investing.com', 'oilprice.com', 'fxstreet.com',
])

let entries = SOURCE_TERMS
if (seededOnly) entries = entries.filter((e) => e.review === 'seeded')
if (newsOnly) entries = entries.filter((e) => NEWS_DOMAINS.has(e.domain))

if (entries.length === 0) {
  console.log('Nothing to review with those filters.')
  process.exit(0)
}

const stamp = new Date().toISOString().slice(0, 10)
const lines = [
  `# Source terms review worksheet — ${stamp}`,
  '',
  `${entries.length} host(s). Probe output is **advisory**: it locates the document and`,
  'highlights candidate clauses. Read the linked terms, then record your conclusion and',
  "flip the entry's `review` to `'verified'` in `src/lib/server/sourceTerms.ts`.",
  '',
  'For a news feed, the four questions that actually settle it:',
  '',
  '1. Is there a **separate RSS/syndication policy**, distinct from the site ToS? Publishers',
  '   often permit far more via RSS than their general ToS suggests.',
  '2. Does it restrict use to **personal / non-commercial**? Most news RSS terms do. Decide',
  '   whether this deployment is inside that line.',
  '3. What may be **displayed** — headline and link only, or headline + summary? The app shows',
  '   the feed summary, so a headline-and-link-only policy is a code change, not a note.',
  '4. Is **attribution** required, and in what form (name, logo, link back)? Record it as a',
  '   `conditions` entry so it survives the next person.',
  '',
  '---',
  '',
]

console.error(`Probing ${entries.length} host(s)…\n`)

for (const entry of entries) {
  const url = `https://${entry.domain}/`
  process.stderr.write(`  ${entry.domain} … `)

  let report = null
  let error = null
  try {
    report = await probeSiteTerms(url)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  console.error(error ? `error (${error})` : report.outcome)

  lines.push(`## ${entry.name} — \`${entry.domain}\``)
  lines.push('')
  lines.push(`| | |`)
  lines.push(`|---|---|`)
  lines.push(`| Current verdict | \`${entry.verdict}\` (confidence: ${entry.confidence}) |`)
  lines.push(`| Review state | ${entry.review === 'verified' ? '✅ verified' : '⚠️ **seeded — never read**'} (${entry.reviewedAt}) |`)
  lines.push(`| Registered terms URL | ${entry.termsUrl} |`)
  if (error) {
    lines.push(`| Probe | ❌ failed — ${error} |`)
  } else {
    lines.push(`| Probe outcome | \`${report.outcome}\` |`)
    lines.push(`| robots.txt | ${report.robots.detail} |`)
    lines.push(`| Terms found at | ${report.terms.url ?? '_none found at the usual locations_'} |`)
    // The summary carries the seeded caveat and any staleness note. Printing
    // only `outcome` was how a run that read nothing still looked like a pass.
    lines.push(`| Summary | ${report.summary.replace(/\|/g, '\\|')} |`)
  }
  lines.push('')
  lines.push(`**Recorded finding:** ${entry.finding}`)
  lines.push('')
  if (entry.conditions?.length) {
    lines.push('**Recorded conditions:**')
    for (const c of entry.conditions) lines.push(`- ${c}`)
    lines.push('')
  }

  const signals = report?.terms.signals ?? []
  if (signals.length > 0) {
    lines.push('**Clauses the probe flagged** (read them in context — a keyword is not a clause):')
    lines.push('')
    for (const s of signals) {
      lines.push(`- ${s.kind === 'restrictive' ? '🔴' : '🟢'} **${s.label}** — “${s.excerpt}”`)
    }
    lines.push('')
  } else if (report && !error) {
    lines.push('_No clauses matched. That is not a pass — it may mean the document was not the')
    lines.push('right one, or the wording is unusual. Check the page the probe actually read._')
    lines.push('')
  }

  lines.push('**Your conclusion:**')
  lines.push('')
  lines.push('- [ ] Verdict confirmed as recorded')
  lines.push('- [ ] Verdict changed to: `________`')
  lines.push('- [ ] Conditions to add/change: `________`')
  lines.push('')
  lines.push('---')
  lines.push('')
}

const out = lines.join('\n')
if (outPath) {
  writeFileSync(outPath, out, 'utf8')
  console.error(`\nWrote ${outPath}`)
} else {
  console.log(out)
}
