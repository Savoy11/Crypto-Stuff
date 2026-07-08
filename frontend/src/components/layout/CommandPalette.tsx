'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { Search, CornerDownLeft, FileText, Bitcoin, LineChart, Landmark } from 'lucide-react'
import { MODULES } from '@/lib/modules/registry'
import { useEntitlementStore } from '@/store/useEntitlementStore'
import { ASSET_LIST } from '@/lib/data/assetList'
import { EQUITY_CATALOG } from '@/lib/data/equityCatalog'
import { FUND_CATALOG } from '@/lib/data/fundCatalog'

// Global command palette (⌘K / Ctrl+K) — jump to any page or any tracked
// instrument (crypto, stocks, funds) from anywhere in the suite.

interface PaletteItem {
  key: string
  group: 'Pages' | 'Crypto' | 'Stocks' | 'ETFs & Funds'
  label: string
  sub: string
  href: string
  /** Lowercased haystack for matching */
  haystack: string
}

const GROUP_ICONS = {
  'Pages': FileText,
  'Crypto': Bitcoin,
  'Stocks': LineChart,
  'ETFs & Funds': Landmark,
} as const

const GROUP_ORDER: PaletteItem['group'][] = ['Pages', 'Crypto', 'Stocks', 'ETFs & Funds']

export function CommandPalette() {
  const router = useRouter()
  const isEnabled = useEntitlementStore((s) => s.isEnabled)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Index: pages from enabled modules + all three instrument catalogs
  const index: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = []
    for (const mod of MODULES) {
      if (!isEnabled(mod.id)) continue
      for (const nav of mod.navItems) {
        const label = mod.label ? `${mod.label} · ${nav.label}` : nav.label
        items.push({
          key: `page:${nav.href}`, group: 'Pages', label, sub: nav.href, href: nav.href,
          haystack: `${label} ${nav.href}`.toLowerCase(),
        })
      }
    }
    if (isEnabled('crypto')) {
      for (const a of ASSET_LIST) {
        items.push({
          key: `crypto:${a.id}`, group: 'Crypto', label: `${a.symbol} — ${a.name}`, sub: 'Asset detail',
          href: `/assets/${a.id}`, haystack: `${a.symbol} ${a.name}`.toLowerCase(),
        })
      }
    }
    if (isEnabled('equities')) {
      for (const e of EQUITY_CATALOG) {
        items.push({
          key: `eq:${e.symbol}`, group: 'Stocks', label: `${e.symbol} — ${e.name}`, sub: e.industry,
          href: `/equities/${e.symbol.toLowerCase()}`, haystack: `${e.symbol} ${e.name} ${e.industry}`.toLowerCase(),
        })
      }
    }
    if (isEnabled('funds')) {
      for (const f of FUND_CATALOG) {
        items.push({
          key: `fund:${f.symbol}`, group: 'ETFs & Funds', label: `${f.symbol} — ${f.name}`,
          sub: f.type === 'etf' ? 'ETF' : 'Mutual fund',
          href: `/funds/${f.symbol.toLowerCase()}`, haystack: `${f.symbol} ${f.name} ${f.issuer}`.toLowerCase(),
        })
      }
    }
    return items
  }, [isEnabled])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      // Empty query: show pages only, they're the most useful default
      return index.filter((i) => i.group === 'Pages').slice(0, 12)
    }
    const scored = index
      .map((item) => {
        // Rank: exact symbol > starts-with > substring
        const firstToken = item.haystack.split(' ')[0]
        const score = firstToken === q ? 0 : item.haystack.startsWith(q) ? 1 : item.haystack.includes(q) ? 2 : -1
        return { item, score }
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score || GROUP_ORDER.indexOf(a.item.group) - GROUP_ORDER.indexOf(b.item.group))
      .map((r) => r.item)
    return scored.slice(0, 14)
  }, [index, query])

  // Global hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus + reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => { setSelected(0) }, [query])

  const go = useCallback((item: PaletteItem) => {
    setOpen(false)
    router.push(item.href)
  }, [router])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && results[selected]) {
      e.preventDefault()
      go(results[selected])
    }
  }

  // Keep the selected row visible
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!open) return null

  let lastGroup: string | null = null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="w-full max-w-xl rounded-xl border border-border bg-bg-card shadow-2xl shadow-black/50 overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <Search size={16} className="text-text-muted flex-shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page, stock, fund, or coin…"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded border border-border text-[10px] font-mono text-text-muted">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-text-muted">No matches for “{query}”.</p>
          )}
          {results.map((item, i) => {
            const showHeader = item.group !== lastGroup
            lastGroup = item.group
            const Icon = GROUP_ICONS[item.group]
            return (
              <div key={item.key}>
                {showHeader && (
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                    {item.group}
                  </p>
                )}
                <button
                  data-selected={i === selected}
                  onClick={() => go(item)}
                  onMouseEnter={() => setSelected(i)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded text-left text-sm transition-colors',
                    i === selected ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-secondary'
                  )}
                >
                  <Icon size={14} className={i === selected ? 'text-accent-blue' : 'text-text-muted'} aria-hidden />
                  <span className="flex-1 min-w-0 truncate font-medium">{item.label}</span>
                  <span className="text-[11px] text-text-muted flex-shrink-0">{item.sub}</span>
                  {i === selected && <CornerDownLeft size={12} className="text-accent-blue/70 flex-shrink-0" aria-hidden />}
                </button>
              </div>
            )
          })}
        </div>

        <div className="px-4 py-2 border-t border-border flex items-center gap-3 text-[10px] text-text-muted">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span className="ml-auto font-mono">{index.length.toLocaleString()} pages &amp; instruments indexed</span>
        </div>
      </div>
    </div>
  )
}
