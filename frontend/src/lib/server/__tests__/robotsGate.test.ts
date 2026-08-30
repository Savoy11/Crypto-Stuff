import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  assertRobotsPermits, robotsPermits, RobotsDisallowedError, SOURCE_TERMS,
} from '../sourceTerms'

/**
 * Reddit's robots.txt disallows our agent — observed first-hand by
 * `npm run terms:report` on the owner's machine, 2026-08-29, while the app was
 * reading reddit.com/r/*.rss on two routes. This gate is the response.
 *
 * The distinction these tests defend: a robots disallow is an INSTRUCTION, not
 * an interpretation of terms. It is enforced structurally rather than checked
 * at each call site, because a per-site check is bypassed by the next call site
 * someone adds.
 */

describe('assertRobotsPermits', () => {
  const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv
  const noEnv = env({})

  it('refuses a disallowed host with no credential', () => {
    expect(() => assertRobotsPermits('https://www.reddit.com/r/x/hot.rss', noEnv)).toThrow(RobotsDisallowedError)
    expect(robotsPermits('https://www.reddit.com/r/x/hot.rss', noEnv)).toBe(false)
  })

  it('covers subdomains, not just the registrable host', () => {
    // old.reddit.com and www.reddit.com are the same instruction.
    expect(robotsPermits('https://old.reddit.com/r/x.rss', noEnv)).toBe(false)
  })

  it('lifts the block when the named credential is configured', () => {
    // OAuth moves the request off the anonymous path robots forbids.
    expect(robotsPermits('https://www.reddit.com/r/x/hot.rss', env({ REDDIT_CLIENT_ID: 'abc' }))).toBe(true)
  })

  it('treats an empty or whitespace credential as absent', () => {
    expect(robotsPermits('https://www.reddit.com/', env({ REDDIT_CLIENT_ID: '   ' }))).toBe(false)
    expect(robotsPermits('https://www.reddit.com/', env({ REDDIT_CLIENT_ID: '' }))).toBe(false)
  })

  it('permits every host with no robots observation — this gate is opt-in', () => {
    for (const url of [
      'https://api.coingecko.com/api/v3/global',
      'https://data.sec.gov/api/xbrl/frames',
      'https://feeds.content.dowjones.io/public/rss/mw_topstories',
    ]) {
      expect(robotsPermits(url, noEnv), `${url} should not be gated`).toBe(true)
    }
  })

  it('ignores unparseable input rather than throwing on it', () => {
    expect(robotsPermits('not a url', noEnv)).toBe(true)
  })

  it('carries the reason, so a caller can explain the absence', () => {
    try {
      assertRobotsPermits('https://www.reddit.com/', noEnv)
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(RobotsDisallowedError)
      expect((e as RobotsDisallowedError).note).toContain('robots.txt disallows')
    }
  })
})

describe('the registry records the observation as first-hand', () => {
  it('Reddit carries a dated robots reading separate from its terms review', () => {
    const reddit = SOURCE_TERMS.find((e) => e.domain === 'reddit.com')!
    expect(reddit.robotsDisallowed?.observedAt).toBe('2026-08-29')
    expect(reddit.robotsDisallowed?.liftedBy).toBe('REDDIT_CLIENT_ID')
    // The TERMS are still unread — the probe could not fetch the Data API
    // Terms document. Recording the robots fact must not launder that into a
    // full review, which is the exact failure the `seeded` state exists for.
    expect(reddit.review).toBe('seeded')
  })
})

describe('the gate is structural, not per-call-site', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

  it('pinnedFetch enforces it, so a new call site inherits the block', () => {
    expect(read('src/lib/server/pinnedFetch.ts')).toContain('assertRobotsPermits')
  })

  it('both social routes gate their Reddit rung', () => {
    for (const f of ['src/app/live-data/social/route.ts', 'src/app/live-data/stock-social/route.ts']) {
      expect(read(f), `${f} fetches Reddit without the gate`).toContain('robotsPermits')
    }
  })
})
