/**
 * Generates docs/DATA-SOURCES.md from the canonical registry in
 * src/lib/data/dataSources.ts, and (with --verify) cross-checks the registry
 * against the hosts actually fetched in each /live-data route.
 *
 *   npm run data-sources           # regenerate DATA-SOURCES.md
 *   npm run data-sources -- --verify   # also print registry↔code drift
 *
 * The registry is the single source of truth; this file only renders/checks it,
 * so the doc can never silently drift from the code the way a hand-written table
 * would. Run it whenever a data source is added, removed, or changes status.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_SOURCES, SOURCE_STATUS_META, type DataSourceEntry } from '../src/lib/data/dataSources'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(here, '..')
const repoRoot = path.resolve(frontendDir, '..')
const liveDataDir = path.join(frontendDir, 'src/app/live-data')
const outFile = path.join(repoRoot, 'DATA-SOURCES.md')

const MODULE_TITLES: Record<DataSourceEntry['module'], string> = {
  crypto: 'Crypto', equities: 'Equities', funds: 'ETFs & Funds', macro: 'Macro Markets', shared: 'Shared / Cross-module',
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|')
}

function providerCell(e: DataSourceEntry): string {
  return e.providers.map(p => {
    const auth = p.auth === 'none' ? '' : p.auth === 'paid' ? ' _(paid)_' : ' _(key)_'
    const name = p.url ? `[${p.name}](${p.url})` : p.name
    const host = p.host ? ` \`${p.host}\`` : ''
    return `${name}${host}${auth}`
  }).join('<br>')
}

function renderMarkdown(): string {
  const now = new Date().toISOString().slice(0, 10)
  const lines: string[] = []
  lines.push('# Finance Now — Data Source Inventory')
  lines.push('')
  lines.push('_Auto-generated from `src/lib/data/dataSources.ts` by `npm run data-sources`. **Do not hand-edit** —')
  lines.push('change the registry and regenerate. This is the "where does the data come from" companion to')
  lines.push('`DATA-AVAILABILITY.md` (which tracks whether each surface is live). The same registry powers the')
  lines.push('in-app **/data-sources** page and the per-page provenance badges, so the app and the docs never diverge._')
  lines.push('')
  lines.push(`_Last generated: **${now}**_`)
  lines.push('')
  lines.push('## Legend')
  lines.push('')
  lines.push('| Status | Meaning |')
  lines.push('|--------|---------|')
  for (const [k, v] of Object.entries(SOURCE_STATUS_META)) {
    const meaning: Record<string, string> = {
      live: 'Sourced from a real external provider at request time.',
      partial: 'Some fields live, others static reference values or labeled estimates.',
      'key-gated': 'Needs an API key / paid plan the project may not have. Route reports this honestly.',
      derived: 'Computed from other live data, not a single upstream.',
      unavailable: 'No free real-time source; the UI shows an explicit "not available" notice.',
    }
    lines.push(`| **${v.label}** | ${meaning[k]} |`)
  }
  lines.push('')
  lines.push('Provider tags: `key` = needs an API key · `paid` = needs a paid plan · untagged = keyless.')
  lines.push('')

  const modules = [...new Set(DATA_SOURCES.map(e => e.module))]
  for (const m of modules) {
    lines.push(`## ${MODULE_TITLES[m]}`)
    lines.push('')
    lines.push('| Surface | Status | Provider(s) | Cadence | Route |')
    lines.push('|---------|--------|-------------|---------|-------|')
    for (const e of DATA_SOURCES.filter(x => x.module === m)) {
      const status = SOURCE_STATUS_META[e.status].label
      const route = e.route ? `\`${e.route}\`` : '—'
      lines.push(`| ${esc(e.surface)} | ${status} | ${providerCell(e)} | ${esc(e.cadence ?? '—')} | ${route} |`)
    }
    lines.push('')
    // Notes + static-data footnotes for this module
    const withNotes = DATA_SOURCES.filter(x => x.module === m && (x.notes || x.staticData?.length))
    if (withNotes.length) {
      for (const e of withNotes) {
        const bits: string[] = []
        if (e.notes) bits.push(e.notes)
        if (e.staticData?.length) bits.push(`Reference/fallback data: ${e.staticData.map(s => `\`${s}\``).join(', ')}.`)
        lines.push(`- **${esc(e.surface)}** — ${bits.join(' ')}`)
      }
      lines.push('')
    }
  }

  lines.push('---')
  lines.push('')
  lines.push(`_${DATA_SOURCES.length} surfaces catalogued. Regenerate with \`npm run data-sources\`; verify against the route code with \`npm run data-sources -- --verify\`._`)
  lines.push('')
  return lines.join('\n')
}

/** Extract hosts hardcoded in each route's fetch() URLs. */
function hostsInRoute(routeId: string): Set<string> {
  const f = path.join(liveDataDir, routeId, 'route.ts')
  const hosts = new Set<string>()
  if (!fs.existsSync(f)) return hosts
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(/https?:\/\/[^'"`\s)]+/g)) {
    try {
      const host = new URL(m[0]).host
      // Skip template-literal hosts (e.g. `https://${host}/…` in custom-feed code).
      if (host.includes('$') || host.includes('{')) continue
      hosts.add(host)
    } catch { /* not a real url literal */ }
  }
  return hosts
}

function verify(): void {
  console.log('\n── Registry ↔ code drift check ──')
  // Map every owned route id (own id + covers[] + ids named in `route`) to its entry.
  const ownerOf = new Map<string, DataSourceEntry>()
  // Precedence: own id wins over covers, which wins over a route-string mention.
  for (const e of DATA_SOURCES) ownerOf.set(e.id, e)
  for (const e of DATA_SOURCES) for (const c of e.covers ?? []) if (!ownerOf.has(c)) ownerOf.set(c, e)
  for (const e of DATA_SOURCES) {
    for (const m of (e.route ?? '').matchAll(/[a-z0-9-]+/g)) {
      const id = m[0]
      if ((id.includes('-') || id.length > 3) && !ownerOf.has(id)) ownerOf.set(id, e)
    }
  }
  const routeIds = fs.readdirSync(liveDataDir).filter(d => fs.existsSync(path.join(liveDataDir, d, 'route.ts')))
  let issues = 0
  for (const id of routeIds) {
    const codeHosts = hostsInRoute(id)
    const entry = ownerOf.get(id)
    if (!entry) {
      if (codeHosts.size) { console.log(`  ⚠ route "${id}" has no registry entry (hosts: ${[...codeHosts].join(', ')})`); issues++ }
      continue
    }
    // An entry with a summary provider (a named provider with no host, e.g.
    // "Cosmostation / Subscan / chain LCDs") deliberately folds in extra hosts —
    // don't flag those. Same for the integrations roster routes.
    const hasSummaryProvider = entry.providers.some(p => !p.host)
    if (hasSummaryProvider || entry.id === 'config' || entry.id === 'news') continue
    const reg = new Set(entry.providers.map(p => p.host).filter(Boolean) as string[])
    const missing = [...codeHosts].filter(h => !reg.has(h) && !isBundled(h, reg))
    if (missing.length) { console.log(`  ⚠ "${id}" fetches ${missing.join(', ')} not named in "${entry.id}"`); issues++ }
  }
  console.log(issues ? `\n${issues} drift item(s) — reconcile registry with code.` : '  ✓ no drift: every route host is represented in the registry.')
}

/** Registry entries often summarise several sibling hosts under one label
 * (e.g. "Cosmostation / Subscan / chain LCDs"). Treat a host as covered if the
 * registry lists any host sharing its second-level domain. */
function isBundled(host: string, reg: Set<string>): boolean {
  const sld = host.split('.').slice(-2).join('.')
  return [...reg].some(h => h.endsWith(sld))
}

const md = renderMarkdown()
fs.writeFileSync(outFile, md)
console.log(`Wrote ${path.relative(repoRoot, outFile)} (${DATA_SOURCES.length} surfaces).`)
if (process.argv.includes('--verify')) verify()
