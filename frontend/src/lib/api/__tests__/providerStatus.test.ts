import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Regression cover for the news outage found by the 2026-07-29 audit run.
//
// `/live-data/news` returned no articles and `/api/v1/news` returned HTTP 502
// "all news providers failed upstream". The feeds were fine. The real cause:
// every crypto news provider had `lastStatus: 'error'` persisted in
// .provider-config.json from a failed Test press, `getAllProviders()` maps that
// to status 'error', and the pipeline getters required status === 'active'. One
// bad moment while testing benched a provider permanently — no retry, no decay,
// no signal that the data path had been switched off rather than the feed being
// empty.
//
// These tests pin the two properties that fix depends on: an errored provider
// still serves data, and a disabled one still does not.

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fnf-providers-'))
  vi.resetModules()
  // providers.ts reads its store relative to process.cwd().
  vi.spyOn(process, 'cwd').mockReturnValue(dir)
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const writeConfig = (configs: Record<string, unknown>) =>
  writeFileSync(join(dir, '.provider-config.json'), JSON.stringify({ configs }), 'utf8')

describe('provider status gating (news outage regression)', () => {
  it('keeps serving a keyless provider whose last Test failed', async () => {
    // Exactly the state the audit found: benched by a failed test.
    writeConfig({
      reddit: { lastStatus: 'error', lastError: 'HTTP 429', lastTested: '2026-07-20T00:00:00Z' },
    })
    const { getAllProviders, getSocialProviders } = await import('../live/providers')

    const reddit = getAllProviders().find((p) => p.id === 'reddit')
    // The UI must still show the failure — this is a diagnostic, not a no-op.
    expect(reddit?.status).toBe('error')

    // …but the data pipeline must still try it.
    expect(getSocialProviders().map((p) => p.id)).toContain('reddit')
  })

  it('still honours an explicit disable', async () => {
    // `enabled: false` is a user decision, not a transient failure.
    writeConfig({ reddit: { enabled: false } })
    const { getSocialProviders } = await import('../live/providers')
    expect(getSocialProviders().map((p) => p.id)).not.toContain('reddit')
  })

  it('does not bench every crypto news provider when all of them errored', async () => {
    const { BUILTIN_PROVIDERS } = await import('../live/providers')
    const newsIds = BUILTIN_PROVIDERS
      .filter((p) => p.category === 'news' && (p.market ?? 'crypto') === 'crypto')
      .map((p) => p.id)
    expect(newsIds.length).toBeGreaterThan(0)

    // Mark every one of them errored — the outage state.
    writeConfig(Object.fromEntries(newsIds.map((id) => [id, { lastStatus: 'error' }])))

    vi.resetModules()
    const { getNewsProviders } = await import('../live/providers')
    // Before the fix this was 0, which made the route report ok:false and the
    // v1 route blame the upstream feeds.
    expect(getNewsProviders().length).toBeGreaterThan(0)
  })

  it('keeps a keyed provider out of the pipeline when it has no key', async () => {
    // The fix must not accidentally promote key-gated providers. Note the
    // status is 'disabled', not 'unconfigured': `enabled` defaults to false for
    // a requiresKey provider with no key, and the !enabled branch wins. Pinning
    // the observed value rather than the one I assumed.
    writeConfig({})
    const { getAllProviders, getNewsProviders } = await import('../live/providers')

    const messari = getAllProviders().find((p) => p.id === 'messari')
    expect(messari?.status).toBe('disabled')
    expect(getNewsProviders().map((p) => p.id)).not.toContain('messari')
  })

  it('serves crypto news with no API keys at all — the outage condition', async () => {
    // This is the regression that matters. Before the keyless RSS built-ins,
    // a config with no keys yielded ZERO crypto news providers, so the route
    // returned ok:false and /api/v1/news reported a 502 blaming the feeds.
    writeConfig({})
    const { getNewsProviders } = await import('../live/providers')
    const ids = getNewsProviders().map((p) => p.id)

    expect(ids.length).toBeGreaterThan(0)
    expect(ids).toContain('coindesk-rss')
    // And the keyed ones stay out until someone supplies a key.
    expect(ids).not.toContain('cryptopanic')
  })
})
