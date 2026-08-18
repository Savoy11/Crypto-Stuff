import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import { COIN_INFO, NETWORKS, EXCHANGES } from '@/lib/data/transferFees'
import { STAKING_PROVIDERS } from '@/lib/data/stakingProviders'
import { EQUITY_CATALOG } from '@/lib/data/equityCatalog'
import { AGENT_DEFAULTS } from '@/lib/agents/prompts'

/**
 * NT12 — boundary drift guard (approved P3-W2 decision session, 2026-08-17).
 *
 * Every boundary where a NUMBER or a LIST is restated outside the catalog that
 * owns it had drifted by the time the P3 review looked: v1 discovery said 16
 * coins / 16 networks while the API served 22/18, the MCP README said 12 tools
 * while the server shipped 13, and the app-assistant's system prompt described
 * the pre-suite app. Each was fixed by hand; none was prevented from recurring.
 *
 * This suite is the prevention. It does not test behaviour — it tests that the
 * app's self-descriptions still match the catalogs they describe. The specific
 * failure it exists to stop is the quiet one: a catalog grows, every restated
 * count silently becomes a lie, and the surfaces whose whole job is telling
 * consumers what exists are the last to know.
 *
 * When one of these fails, fix the DESCRIPTION, not the assertion — unless the
 * catalog genuinely shrank, in which case the description was right to change
 * and the assertion follows it.
 *
 * Deliberately reads source files as text rather than importing them: the MCP
 * server is a separate package with its own build, and the point is to check
 * what the shipped text SAYS, which an import would hide behind evaluation.
 */

const REPO_ROOT   = path.resolve(process.cwd(), '..')
const MCP_INDEX   = path.join(REPO_ROOT, 'mcp-server/src/index.ts')
const MCP_README  = path.join(REPO_ROOT, 'mcp-server/README.md')
const CLAUDE_MD   = path.join(REPO_ROOT, 'CLAUDE.md')

const read = (p: string) => fs.readFileSync(p, 'utf8')

// ─── The catalogs, as the single source of truth ─────────────────────────────

const REAL = {
  coins:     Object.keys(COIN_INFO),
  networks:  Object.keys(NETWORKS),
  exchanges: EXCHANGES.length,
  providers: STAKING_PROVIDERS.length,
  equities:  EQUITY_CATALOG.length,
  // 11 real GICS sectors; SECTOR_INFO also carries an 'other' bucket that no
  // catalog entry uses, so a raw key count would claim 12.
  sectors:   new Set(EQUITY_CATALOG.map(e => e.sector)).size,
}

describe('NT12 — MCP server metadata matches what it ships', () => {
  const src = read(MCP_INDEX)

  // `server.tool(` at the start of a line is the registration call; counting
  // the text is the point (see the file comment) — an import would count what
  // the module evaluates to, which is exactly what a stale README cannot.
  const registeredTools = Array.from(src.matchAll(/^server\.tool\(\s*\n\s*'([a-z_]+)'/gm)).map(m => m[1])

  it('registers a non-trivial tool set (the regex still matches the file)', () => {
    // Guards the guard: a refactor of the registration style would otherwise
    // make every assertion below vacuously pass on an empty list.
    expect(registeredTools.length).toBeGreaterThan(5)
  })

  it('the README tool count equals the number of tools actually registered', () => {
    const heading = read(MCP_README).match(/##\s*Tools\s*\((\d+)\)/)
    expect(heading, 'mcp-server/README.md must carry a "## Tools (N)" heading').not.toBeNull()
    expect(Number(heading![1])).toBe(registeredTools.length)
  })

  it('every registered tool is named in the README', () => {
    const readme = read(MCP_README)
    const missing = registeredTools.filter(t => !readme.includes(t))
    expect(missing, `tools shipped but undocumented in the MCP README: ${missing.join(', ')}`).toEqual([])
  })

  it('every registered tool is named in the CLAUDE.md MCP table', () => {
    const claude = read(CLAUDE_MD)
    const missing = registeredTools.filter(t => !claude.includes(t))
    expect(missing, `tools shipped but absent from CLAUDE.md: ${missing.join(', ')}`).toEqual([])
  })

  it('the README documents no tool the server does not register', () => {
    // The reverse direction: a removed tool leaves its documentation behind,
    // which reads as a capability the agent can call and cannot.
    const readme = read(MCP_README)
    const documented = Array.from(readme.matchAll(/`([a-z]+_[a-z_]+)`/g)).map(m => m[1])
    const phantom = Array.from(new Set(documented)).filter(t => !registeredTools.includes(t))
    expect(phantom, `documented in the MCP README but not registered: ${phantom.join(', ')}`).toEqual([])
  })

  it('no MCP tool description hardcodes a coin list that has fallen behind the catalog', () => {
    // The concrete D-20 residue: get_coin_prices enumerated 16 coin ids in its
    // description while the transfer-fee catalog carried 22. An agent reads a
    // tool description as the contract, so a short list is a capability the
    // model will not use rather than a cosmetic staleness.
    const enumerations = Array.from(src.matchAll(/Supported coins:\s*([a-z0-9,\s]+)\./g))
    for (const [, list] of enumerations) {
      const listed = list.split(',').map(c => c.trim()).filter(Boolean)
      const missing = REAL.coins.filter(c => !listed.includes(c))
      expect(missing, `an MCP tool description lists ${listed.length} coins; the catalog has ${REAL.coins.length} (missing: ${missing.join(', ')})`).toEqual([])
    }
  })
})

describe('NT12 — /api/v1 discovery matches the routes that exist', () => {
  const V1_DIR = path.join(process.cwd(), 'src/app/api/v1')

  /** Every shipped v1 route path, derived from the filesystem. */
  const shippedPaths = (() => {
    const out: string[] = []
    const walk = (dir: string, prefix: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full, `${prefix}/${entry.name}`)
        else if (entry.name === 'route.ts') out.push(prefix || '/api/v1')
      }
    }
    walk(V1_DIR, '/api/v1')
    return out
  })()

  const discoverySrc = read(path.join(V1_DIR, 'route.ts'))

  it('the filesystem walk found the v1 routes (guards the guard)', () => {
    expect(shippedPaths.length).toBeGreaterThan(5)
  })

  it('every shipped v1 endpoint appears in the discovery document', () => {
    // `/api/v1` itself is the discovery document and does not list itself;
    // openapi.json is a spec file, documented as `docs`, not as an endpoint.
    const exempt = new Set(['/api/v1', '/api/v1/openapi.json'])
    const missing = shippedPaths.filter(p => !exempt.has(p) && !discoverySrc.includes(`'${p}'`))
    expect(missing, `v1 routes shipped but absent from discovery: ${missing.join(', ')}`).toEqual([])
  })

  it('discovery derives its coin and network lists rather than restating them', () => {
    // D-20's fix was to DERIVE these. Restating them is how they drifted the
    // first time, so the guard pins the mechanism, not just today's numbers.
    expect(discoverySrc).toContain('Object.keys(COIN_INFO)')
    expect(discoverySrc).toContain('Object.keys(NETWORKS)')
    expect(discoverySrc).not.toMatch(/supported_coins:\s*\[/)
    expect(discoverySrc).not.toMatch(/supported_networks:\s*\[/)
  })
})

describe('NT12 — agent prompts match the catalogs they describe', () => {
  const assistant = AGENT_DEFAULTS.find(a => a.id === 'app-assistant')

  it('the app-assistant agent still exists (guards the guard)', () => {
    expect(assistant, 'app-assistant must exist in AGENT_DEFAULTS').toBeDefined()
  })

  const prompt = assistant?.systemPrompt ?? ''

  /**
   * Pull "<n> <noun>" out of the prompt. The prompt states its counts as prose
   * ("30 exchanges, 22 coins, 18 networks"), which is the right way to write it
   * for a model and the wrong way to keep it true — hence this test.
   */
  const claimed = (noun: string): number | null => {
    const m = prompt.match(new RegExp(`(\\d+)\\s+${noun}`))
    return m ? Number(m[1]) : null
  }

  const CLAIMS: Array<[string, number]> = [
    ['exchanges', REAL.exchanges],
    ['coins',     REAL.coins.length],
    ['networks',  REAL.networks.length],
    ['sectors',   REAL.sectors],
  ]

  for (const [noun, real] of CLAIMS) {
    it(`the assistant's "${noun}" count matches the catalog (${real})`, () => {
      const stated = claimed(noun)
      expect(stated, `the app-assistant prompt no longer states a ${noun} count — if that is deliberate, drop this row from CLAIMS`).not.toBeNull()
      expect(stated).toBe(real)
    })
  }

  it('the assistant\'s curated staking-provider count matches the catalog', () => {
    const m = prompt.match(/(\d+)\s+curated providers/)
    expect(m, 'the app-assistant prompt no longer states a curated-provider count').not.toBeNull()
    expect(Number(m![1])).toBe(REAL.providers)
  })

  it('the assistant\'s curated-stock fallback count matches the equity catalog', () => {
    const m = prompt.match(/(\d+)-name curated fallback/)
    expect(m, 'the app-assistant prompt no longer states a curated-fallback size').not.toBeNull()
    expect(Number(m![1])).toBe(REAL.equities)
  })
})
