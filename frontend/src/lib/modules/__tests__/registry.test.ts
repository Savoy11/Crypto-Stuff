import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { MODULES, flattenNavItems, moduleForPath } from '../registry'

/**
 * Registry guard. The sidebar renders entirely from this file, so a wrong entry
 * here is a nav item that 404s or a page nothing links to — and neither fails a
 * build.
 *
 * Extended 2026-08-19 with the nested-nav primitive (items 6/7): children are
 * checked exactly like top-level entries, since "it's only a sub-item" is
 * precisely how a broken link survives review.
 */

const APP_DIR = path.join(process.cwd(), 'src/app/(dashboard)')

/** Does a route exist on disk for this href? */
function pageExists(href: string): boolean {
  const rel = href.replace(/^\//, '')
  return fs.existsSync(path.join(APP_DIR, rel, 'page.tsx'))
}

const allItems = MODULES.flatMap((m) => flattenNavItems(m.navItems).map((item) => ({ mod: m, item })))

describe('module registry', () => {
  it('found nav items to check (guards the guard)', () => {
    expect(allItems.length).toBeGreaterThan(20)
  })

  it('every nav item — parent and child alike — routes to a real page', () => {
    const broken = allItems
      .filter(({ item }) => !pageExists(item.href))
      .map(({ item }) => `${item.label} → ${item.href}`)
    expect(broken, `nav entries with no page.tsx: ${broken.join(', ')}`).toEqual([])
  })

  it('nav hrefs are unique across the whole suite', () => {
    // Two entries pointing at one route means one of them can never be the
    // "active" item, and the sidebar highlight becomes arbitrary.
    const seen = new Map<string, string[]>()
    for (const { mod, item } of allItems) {
      seen.set(item.href, [...(seen.get(item.href) ?? []), mod.id])
    }
    const dupes = [...seen.entries()].filter(([, mods]) => mods.length > 1)
    expect(dupes.map(([href]) => href), 'duplicate nav hrefs').toEqual([])
  })

  it('every optional module route resolves back to its own module', () => {
    // What ModuleGate depends on: if moduleForPath cannot place a page, the
    // page renders outside its entitlement (review defect D-8).
    for (const { mod, item } of allItems) {
      if (!mod.optional) continue
      expect(moduleForPath(item.href)?.id, `${item.href} must belong to ${mod.id}`).toBe(mod.id)
    }
  })

  it('nests at most one level deep', () => {
    // The primitive is deliberately two levels. A third would make the sidebar
    // a file tree — every extra level is another click to the page you wanted.
    for (const mod of MODULES) {
      for (const item of mod.navItems) {
        for (const child of item.children ?? []) {
          expect(child.children, `${child.href} must not have children of its own`).toBeUndefined()
        }
      }
    }
  })

  it('gives each of crypto, equities and macro exactly one Scanner entry', () => {
    // Items 6/7: ONE scanner per section, promoted to nav. Two scanners in a
    // section, or a section without one, is what the decision ruled out.
    for (const id of ['crypto', 'equities', 'macro'] as const) {
      const mod = MODULES.find((m) => m.id === id)!
      const scanners = flattenNavItems(mod.navItems).filter((i) => i.label === 'Scanner')
      expect(scanners.length, `${id} must have exactly one Scanner nav entry`).toBe(1)
    }
  })

  it('never navigates to a route that next.config redirects away', () => {
    // The withheld-page failure mode, in both directions. Hiding a page means
    // TWO edits — drop the nav entry, add the redirect — and restoring it means
    // undoing both. Do one and not the other and you get either a nav item that
    // bounces the reader to Headlines, or a page reachable by URL that the
    // rollout decision said to hold back. Neither fails a build.
    //
    // Only redirects whose destination is a DIFFERENT page count. /reserves ->
    // /assets?tab=reserves is content-preserving: it moves a surface rather
    // than withdrawing one, and its destination is legitimately in the nav.
    const config = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8')
    const withdrawn = Array.from(
      config.matchAll(/source:\s*'([^']+)'\s*,\s*destination:\s*'\/headlines'/g),
    ).map((m) => m[1])

    // Guards the guard: if the regex stops matching, this test would pass
    // vacuously while every hidden page silently returned to the nav.
    expect(withdrawn.length, 'no /headlines redirects parsed from next.config.mjs').toBeGreaterThan(0)
    expect(withdrawn).toContain('/wallets')
    expect(withdrawn).toContain('/transfer-fees')

    const navHrefs = MODULES.flatMap((m) => flattenNavItems(m.navItems)).map((i) => i.href)
    const contradictions = withdrawn.filter((href) => navHrefs.includes(href))
    expect(
      contradictions,
      `these routes redirect to /headlines but are still in the sidebar: ${contradictions.join(', ')}`,
    ).toEqual([])
  })
})
