'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Settings,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  PlugZap,
  Rss,
  MessageSquare,
  Video,
  Star,
  ChevronRight,
  Plus,
  Trash2,
  Globe,
  Pencil,
  X,
  Blocks,
  TrendingUp,
  Bot,
  Cpu,
  ShieldAlert,
  ShieldCheck,
  ScrollText,
} from 'lucide-react'
import type { TermsProbeReport } from '@/lib/server/termsProbe'
import { timeAgo } from '@/lib/utils/format'
import { OPTIONAL_MODULES } from '@/lib/modules/registry'
import { useEntitlementStore } from '@/store/useEntitlementStore'
import { useFeedBiasStore, BIAS_FEEDS } from '@/store/useFeedBiasStore'
import { useWatchlistBias } from '@/lib/watchlist/useWatchlistBias'
import { BIAS_STRENGTHS } from '@/lib/watchlist/bias'
import { migrateStorageKey } from '@/lib/utils/storageMigration'

// One-time key migration for the Finance Now rename — runs before any read below.
migrateStorageKey('caep-custom-subreddits', 'fn-custom-subreddits')


// ─── Suite modules panel ──────────────────────────────────────────────────────
// Toggles which suite modules (Crypto, Equities, ETFs & Funds) appear in the
// sidebar. Backed by the entitlement store — becomes license-driven when
// billing lands (docs/ROADMAP.md, Phase 6).

function ModulesPanel() {
  const { isEnabled, setEnabled } = useEntitlementStore()

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Blocks size={15} className="text-accent-blue" />
        <h2 className="text-sm font-semibold text-slate-300">Suite Modules</h2>
        <span className="text-xs text-slate-500">— disabled modules disappear from the sidebar and their pages lock</span>
      </div>
      <div className="space-y-2">
        {OPTIONAL_MODULES.map((mod) => {
          const enabled = isEnabled(mod.id)
          return (
            <div key={mod.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-200">{mod.label}</p>
                <p className="text-[11px] text-slate-500">
                  {mod.navItems.length} page{mod.navItems.length !== 1 ? 's' : ''} · {mod.navItems.map((item) => item.href).join(', ')}
                </p>
              </div>
              <button
                onClick={() => setEnabled(mod.id, !enabled)}
                role="switch"
                aria-checked={enabled}
                aria-label={`${enabled ? 'Disable' : 'Enable'} ${mod.label} module`}
                className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? 'bg-accent-blue' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Watchlist bias panel ─────────────────────────────────────────────────────

function WatchlistBiasPanel() {
  const { getStrength, setStrength } = useFeedBiasStore()
  const bias = useWatchlistBias()

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Star size={15} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-slate-300">Watchlist Bias</h2>
        <span className="text-xs text-slate-500">— how much your watchlist steers each feed</span>
      </div>

      {bias.isEmpty ? (
        <p className="text-xs text-slate-500 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
          Your watchlist is empty, so these settings have no effect yet.{' '}
          <Link href="/watchlist" className="text-accent-blue hover:underline">Add assets</Link> to steer your feeds.
        </p>
      ) : (
        <p className="text-xs text-slate-500 mb-3">
          Biasing on {bias.assetIds.length + bias.symbols.length} watchlist asset
          {bias.assetIds.length + bias.symbols.length !== 1 ? 's' : ''}.
        </p>
      )}

      <div className="space-y-2 mt-2">
        {BIAS_FEEDS.map((feed) => {
          const current = getStrength(feed.id)
          return (
            <div key={feed.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-200">{feed.label}</p>
                <p className="text-[11px] text-slate-500">{feed.description}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {BIAS_STRENGTHS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setStrength(feed.id, s.value)}
                    title={s.hint}
                    className={`px-2 py-1 rounded text-xs font-medium border transition-all ${
                      current === s.value
                        ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                        : 'text-slate-500 border-slate-700 hover:text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
        <span className="text-slate-400">Light</span> sorts watchlist matches to the top.{' '}
        <span className="text-slate-400">Strong</span> also asks providers for extra articles about those
        assets on the News pages (Crypto News and Market News); Headlines and Videos reorder only.{' '}
        <span className="text-slate-400">Only</span> hides everything else — market-wide news included.
        An empty watchlist is always treated as no bias, so no setting can leave a feed blank.
      </p>
    </section>
  )
}

// ─── AI Agents panel (enable/disable + link to full config) ───────────────────

interface AgentToggleInfo {
  id: string
  name: string
  description: string
  market?: 'crypto' | 'equities' | 'macro'
  provider: string
  model: string
  enabled?: boolean
}

function AiAgentsPanel() {
  const [agents, setAgents] = useState<AgentToggleInfo[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/prompts')
      const data = await res.json()
      setAgents(data.agents ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(id: string, enabled: boolean) {
    setBusy(id)
    await fetch('/api/agents/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'toggle', enabled }),
    })
    await load()
    setBusy(null)
  }

  const groups: Array<{ label: string; items: AgentToggleInfo[] }> = [
    { label: 'Shared', items: agents.filter((a) => !a.market) },
    { label: 'Crypto', items: agents.filter((a) => a.market === 'crypto') },
    { label: 'Equities', items: agents.filter((a) => a.market === 'equities') },
    { label: 'Macro', items: agents.filter((a) => a.market === 'macro') },
  ]

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Bot size={15} className="text-accent-blue" />
        <h2 className="text-sm font-semibold text-slate-300">AI Agents</h2>
        <span className="text-xs text-slate-500">— disable an agent to block it from running; edit models &amp; prompts on the</span>
        <a href="/agent-config" className="text-xs text-accent-blue hover:underline">AI Agents tab</a>
      </div>
      <div className="space-y-4">
        {groups.filter((g) => g.items.length > 0).map((g) => (
          <div key={g.label}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{g.label}</p>
            <div className="space-y-2">
              {g.items.map((a) => {
                const enabled = a.enabled !== false
                return (
                  <div key={a.id} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all ${enabled ? 'border-slate-800 bg-slate-900/40' : 'border-slate-800 bg-slate-900/20 opacity-60'}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200">{a.name}</p>
                      <p className="text-[11px] text-slate-500 line-clamp-1">{a.description}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{a.provider} · {a.model}</p>
                    </div>
                    <button
                      onClick={() => toggle(a.id, !enabled)}
                      disabled={busy === a.id}
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`${enabled ? 'Disable' : 'Enable'} ${a.name}`}
                      className={`relative h-5 w-9 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-accent-blue' : 'bg-slate-700'}`}
                    >
                      <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Subreddit manager (embedded inside Reddit provider card) ─────────────────

const SUBREDDIT_STORAGE_KEY = 'fn-custom-subreddits'

const BUILTIN_SUBREDDITS = [
  'CryptoCurrency', 'CryptoMarkets', 'SatoshiStreetBets', 'CryptoCurrencies',
  'altcoin', 'CryptoMoonShots', 'Crypto_General', 'CryptoTechnology',
  'defi', 'stablecoins', 'NFT', 'web3', 'BlockChain',
]

function SubredditPanel() {
  const [custom, setCustom] = useState<string[]>([])
  const [input, setInput] = useState('')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SUBREDDIT_STORAGE_KEY)
      if (stored) setCustom(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  function save(next: string[]) {
    setCustom(next)
    localStorage.setItem(SUBREDDIT_STORAGE_KEY, JSON.stringify(next))
  }

  function handleAdd() {
    const clean = input.trim().replace(/^r\//i, '').replace(/\s+/g, '')
    if (!clean || custom.includes(clean) || BUILTIN_SUBREDDITS.includes(clean)) { setInput(''); return }
    save([...custom, clean])
    setInput('')
  }

  return (
    <div className="space-y-3 pt-3 border-t border-slate-800/60">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Subreddits</p>

      {/* Built-in */}
      <div>
        <p className="text-[11px] text-slate-500 mb-1.5">Built-in (always active)</p>
        <div className="flex flex-wrap gap-1.5">
          {BUILTIN_SUBREDDITS.map((sub) => (
            <span key={sub} className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-400 border border-slate-700">
              r/{sub}
            </span>
          ))}
        </div>
      </div>

      {/* Custom */}
      <div>
        <p className="text-[11px] text-slate-500 mb-1.5">Custom (added by you)</p>
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">r/</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="subredditname"
              className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-sm text-slate-200 placeholder-slate-600 focus:border-orange-500/50 focus:outline-none"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!input.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-600 text-xs font-medium text-white hover:bg-orange-500 transition-colors disabled:opacity-40"
          >
            <Plus size={12} /> Add
          </button>
        </div>
        {custom.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {custom.map((sub) => (
              <span key={sub} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-orange-500/10 text-orange-300 border border-orange-500/20">
                r/{sub}
                <button onClick={() => save(custom.filter((s) => s !== sub))} className="text-orange-400/60 hover:text-orange-300 transition-colors" aria-label={`Remove r/${sub}`}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-600 italic">No custom subreddits yet — add one above.</p>
        )}
      </div>
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ProviderCategory = 'price' | 'news' | 'social' | 'video' | 'llm'
type ProviderMarket = 'crypto' | 'equities' | 'macro'
type ProviderStatus = 'active' | 'error' | 'unconfigured' | 'disabled'
type AuthMethod = 'none' | 'header' | 'query' | 'bearer'
type FeedFormat = 'rss' | 'atom' | 'youtube' | 'json-news' | 'json-price' | 'json-social' | 'json-quote' | 'json-ohlcv' | 'graphql' | 'websocket' | 'native'

interface BuiltinProviderView {
  id: string
  name: string
  category: ProviderCategory
  market?: ProviderMarket
  description: string
  features: string[]
  requiresKey: boolean
  keyUrl: string
  freeTierLabel?: string
  isCustom?: false
  config: {
    enabled: boolean
    hasKey: boolean
    lastTested?: string
    lastStatus?: ProviderStatus
    lastError?: string
    lastFetchAt?: string
    lastFetchCount?: number
    lastFetchError?: string
  }
}

interface CustomProviderView {
  id: string
  name: string
  category: ProviderCategory
  market?: ProviderMarket
  description: string
  url: string
  authMethod: AuthMethod
  authHeaderName?: string
  authQueryParam?: string
  format: FeedFormat
  jsonArrayPath?: string
  jsonFieldMap?: Record<string, string>
  isCustom: true
  config: {
    enabled: boolean
    hasKey: boolean
    lastTested?: string
    lastStatus?: ProviderStatus
    lastError?: string
    lastFetchAt?: string
    lastFetchCount?: number
    lastFetchError?: string
  }
}

type ProviderView = BuiltinProviderView | CustomProviderView

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: ProviderStatus }) {
  if (!status || status === 'unconfigured') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
        <AlertCircle size={10} /> Not configured
      </span>
    )
  }
  if (status === 'disabled') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-500 border border-slate-700">
        Disabled
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
        <XCircle size={10} /> Error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 size={10} /> Active
    </span>
  )
}

// ─── Built-in provider card ───────────────────────────────────────────────────

// ── Utilization indicator ───────────────────────────────────────────────────
// Shows whether a configured provider is ACTUALLY serving data — the truth the
// enable-toggle alone can't tell you. Written by the data routes on every fetch.
function UtilizationLine({ config, enabled }: {
  config: { lastFetchAt?: string; lastFetchCount?: number; lastFetchError?: string }
  enabled: boolean
}) {
  if (!enabled) return null
  const { lastFetchAt, lastFetchCount, lastFetchError } = config

  if (lastFetchError) {
    return (
      <p className="text-[11px] text-red-400 mt-1 truncate" title={lastFetchError}>
        ⚠ Last fetch failed: {lastFetchError}{lastFetchAt ? ` · ${timeAgo(lastFetchAt)}` : ''}
      </p>
    )
  }
  if (lastFetchCount != null && lastFetchAt) {
    return lastFetchCount > 0 ? (
      <p className="text-[11px] text-emerald-400/90 mt-1">
        ● Serving data — {lastFetchCount} item{lastFetchCount === 1 ? '' : 's'} in last fetch · {timeAgo(lastFetchAt)}
      </p>
    ) : (
      <p className="text-[11px] text-amber-400/90 mt-1">
        ○ Connected but contributed 0 items in last fetch · {timeAgo(lastFetchAt)}
      </p>
    )
  }
  return (
    <p className="text-[11px] text-slate-500 mt-1">
      ◌ No data fetched yet — not consumed by any feed so far
    </p>
  )
}

function ProviderCard({ provider, onUpdate, hideToggle }: { provider: BuiltinProviderView; onUpdate: () => void; hideToggle?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; detail?: string; error?: string } | null>(null)

  // LLM providers (hideToggle) are "configured when keyed" — no enable switch;
  // the agent runner uses the key regardless of any enabled flag.
  const enabled = hideToggle ? true : provider.config.enabled
  const hasKey = provider.config.hasKey
  const status: ProviderStatus = !enabled
    ? 'disabled'
    : (provider.config.lastStatus ?? (hasKey || !provider.requiresKey ? 'active' : 'unconfigured'))

  async function handleToggle() {
    setSaving(true)
    await fetch('/live-data/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: provider.id, action: 'toggle', enabled: !enabled }),
    })
    setSaving(false)
    onUpdate()
  }

  async function handleSave() {
    setSaving(true)
    setTestResult(null)
    await fetch('/live-data/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: provider.id, action: 'save', apiKey, enabled: true }),
    })
    setSaving(false)
    setApiKey('')
    onUpdate()
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    const res = await fetch('/live-data/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: provider.id, action: 'test', apiKey: apiKey || undefined }),
    })
    setTestResult(await res.json())
    setTesting(false)
    onUpdate()
  }

  return (
    <div className={`rounded-xl border transition-all ${enabled ? 'border-slate-700 bg-slate-900/60' : 'border-slate-800 bg-slate-900/30 opacity-60'}`}>
      <div className="flex items-center gap-4 px-5 py-4">
        {!hideToggle && (
          <button
            onClick={handleToggle}
            disabled={saving}
            className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-accent-blue' : 'bg-slate-700'}`}
            aria-label={`${enabled ? 'Disable' : 'Enable'} ${provider.name}`}
          >
            <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : ''}`} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-slate-100">{provider.name}</span>
            <StatusBadge status={status} />
            {provider.freeTierLabel && (
              <span className="text-[11px] text-slate-500">{provider.freeTierLabel}</span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{provider.description}</p>
          <UtilizationLine config={provider.config} enabled={enabled} />
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
          <ChevronRight size={16} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="px-5 pb-5 pt-0 space-y-4 border-t border-slate-800/60">
          <div className="pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">What this unlocks</p>
            <div className="flex flex-wrap gap-1.5">
              {provider.features.map((f) => (
                <span key={f} className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">{f}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                API Key {!provider.requiresKey && <span className="normal-case font-normal">(optional — improves rate limits)</span>}
              </label>
              <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-accent-blue hover:text-blue-300 transition-colors">
                Get a key <ExternalLink size={10} />
              </a>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasKey ? '••••••••  (key saved — enter new to replace)' : 'Paste your API key here'}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pr-8 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-blue/60 focus:outline-none font-mono"
                />
                <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <button onClick={handleTest} disabled={testing} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50">
                {testing ? <Loader2 size={12} className="animate-spin" /> : 'Test'}
              </button>
              {apiKey && (
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-blue text-xs font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                </button>
              )}
            </div>
            {testResult && (
              <div className={`mt-2 flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${testResult.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {testResult.ok ? <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" /> : <XCircle size={12} className="mt-0.5 flex-shrink-0" />}
                {testResult.ok ? (testResult.detail ?? 'Connection successful') : (testResult.error ?? 'Connection failed')}
              </div>
            )}
            {!testResult && provider.config.lastError && status === 'error' && (
              <p className="mt-1.5 text-[11px] text-red-400">Last error: {provider.config.lastError}</p>
            )}
          </div>
          {provider.id === 'reddit' && <SubredditPanel />}
        </div>
      )}
    </div>
  )
}

// ─── Custom provider card ─────────────────────────────────────────────────────

function CustomProviderCard({ provider, onUpdate }: { provider: CustomProviderView; onUpdate: () => void }) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; detail?: string; error?: string } | null>(null)
  const [removing, setRemoving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [form, setForm] = useState({
    name: provider.name,
    description: provider.description ?? '',
    url: provider.url,
    authMethod: provider.authMethod,
    authHeaderName: provider.authHeaderName ?? '',
    authQueryParam: provider.authQueryParam ?? '',
    format: provider.format,
    jsonArrayPath: provider.jsonArrayPath ?? '',
    apiKey: '',
  })

  const enabled = provider.config.enabled
  const status: ProviderStatus = !enabled ? 'disabled' : (provider.config.lastStatus ?? 'active')

  function setField(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleStartEdit() {
    // Reset form to latest provider values each time edit opens
    setForm({
      name: provider.name,
      description: provider.description ?? '',
      url: provider.url,
      authMethod: provider.authMethod,
      authHeaderName: provider.authHeaderName ?? '',
      authQueryParam: provider.authQueryParam ?? '',
      format: provider.format,
      jsonArrayPath: provider.jsonArrayPath ?? '',
      apiKey: '',
    })
    setEditError(null)
    setTestResult(null)
    setEditing(true)
  }

  async function handleToggle() {
    await fetch('/live-data/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: provider.id, action: 'toggle', enabled: !enabled }),
    })
    onUpdate()
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    const res = await fetch('/live-data/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: provider.id, action: 'test' }),
    })
    setTestResult(await res.json())
    setTesting(false)
    onUpdate()
  }

  async function handleRemove() {
    if (!confirm(`Remove "${provider.name}"? This cannot be undone.`)) return
    setRemoving(true)
    await fetch('/live-data/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', providerId: provider.id }),
    })
    onUpdate()
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.url.trim()) { setEditError('Name and URL are required'); return }
    setSaving(true)
    setEditError(null)
    const res = await fetch('/live-data/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update-custom',
        providerId: provider.id,
        customDef: {
          name: form.name.trim(),
          description: form.description.trim(),
          category: provider.category,
          url: form.url.trim(),
          authMethod: form.authMethod,
          authHeaderName: form.authHeaderName.trim() || undefined,
          authQueryParam: form.authQueryParam.trim() || undefined,
          format: form.format,
          jsonArrayPath: form.jsonArrayPath.trim() || undefined,
        },
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
      }),
    })
    const data = await res.json()
    if (!res.ok || data.error) {
      setEditError(data.error ?? 'Failed to save changes')
      setSaving(false)
      return
    }
    setSaving(false)
    setEditing(false)
    onUpdate()
  }

  return (
    <div className={`rounded-xl border transition-all ${enabled ? 'border-violet-700/50 bg-violet-900/10' : 'border-slate-800 bg-slate-900/30 opacity-60'}`}>
      {/* Header row — always visible */}
      <div className="flex items-center gap-4 px-5 py-4">
        <button
          onClick={handleToggle}
          className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-violet-500' : 'bg-slate-700'}`}
          aria-label={`${enabled ? 'Disable' : 'Enable'} ${provider.name}`}
        >
          <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : ''}`} />
        </button>
        <Globe size={14} className="text-violet-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-slate-100">{provider.name}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">Custom</span>
            <StatusBadge status={status} />
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">{provider.url}</p>
          <UtilizationLine config={provider.config} enabled={enabled} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={testing || editing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 size={11} className="animate-spin" /> : 'Test'}
          </button>
          <button
            onClick={editing ? () => setEditing(false) : handleStartEdit}
            className={`p-1.5 rounded-lg transition-colors ${editing ? 'text-violet-400 bg-violet-500/10' : 'text-slate-500 hover:text-violet-400 hover:bg-violet-500/10'}`}
            aria-label={editing ? 'Cancel edit' : 'Edit'}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={handleRemove}
            disabled={removing}
            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            aria-label="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Test result banner */}
      {testResult && !editing && (
        <div className={`mx-5 mb-4 flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${testResult.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {testResult.ok ? <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" /> : <XCircle size={12} className="mt-0.5 flex-shrink-0" />}
          {testResult.ok ? (testResult.detail ?? 'Endpoint reachable') : (testResult.error ?? 'Connection failed')}
        </div>
      )}

      {/* Inline edit form */}
      {editing && (
        <form onSubmit={handleSaveEdit} className="px-5 pb-5 pt-0 border-t border-violet-700/30 space-y-4">
          <p className="pt-4 text-[11px] font-semibold uppercase tracking-wider text-violet-400">Edit source</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-violet-500/60 focus:outline-none"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Format *</label>
              <select
                value={form.format}
                onChange={(e) => setField('format', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-violet-500/60 focus:outline-none"
              >
                {FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Endpoint URL * <span className="normal-case font-normal text-slate-600">(use {'{asset}'} as placeholder)</span>
              </label>
              <input
                value={form.url}
                onChange={(e) => setField('url', e.target.value)}
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-violet-500/60 focus:outline-none font-mono"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Description</label>
              <input
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Short description (optional)"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-violet-500/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Auth */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Authentication</label>
            <select
              value={form.authMethod}
              onChange={(e) => setField('authMethod', e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-violet-500/60 focus:outline-none"
            >
              {AUTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {form.authMethod === 'header' && (
              <input
                value={form.authHeaderName}
                onChange={(e) => setField('authHeaderName', e.target.value)}
                placeholder="Header name, e.g. X-Api-Key"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-violet-500/60 focus:outline-none font-mono"
              />
            )}
            {form.authMethod === 'query' && (
              <input
                value={form.authQueryParam}
                onChange={(e) => setField('authQueryParam', e.target.value)}
                placeholder="Query param name, e.g. api_key"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-violet-500/60 focus:outline-none font-mono"
              />
            )}
            {form.authMethod !== 'none' && (
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={form.apiKey}
                  onChange={(e) => setField('apiKey', e.target.value)}
                  placeholder={provider.config.hasKey ? '••••••••  (key saved — enter new to replace)' : 'API key / token'}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pr-8 text-sm text-slate-200 placeholder-slate-600 focus:border-violet-500/60 focus:outline-none font-mono"
                />
                <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            )}
          </div>

          {/* JSON-specific */}
          {(form.format === 'json-news' || form.format === 'json-price') && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                JSON array path <span className="normal-case font-normal text-slate-600">(optional — e.g. data.articles)</span>
              </label>
              <input
                value={form.jsonArrayPath}
                onChange={(e) => setField('jsonArrayPath', e.target.value)}
                placeholder="data.articles"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-violet-500/60 focus:outline-none font-mono"
              />
            </div>
          )}

          {editError && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <XCircle size={12} /> {editError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Save changes
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Add Custom Source form ───────────────────────────────────────────────────

const FORMAT_OPTIONS: { value: FeedFormat; label: string; hint: string }[] = [
  { value: 'rss',         label: 'RSS 2.0',                hint: 'Standard XML feed — most news sites, blogs, and CryptoPanic' },
  { value: 'atom',        label: 'Atom feed',              hint: 'Atom XML format — used by Reddit, some Google services' },
  { value: 'json-news',   label: 'JSON — News articles',   hint: 'REST API returning an array of article objects' },
  { value: 'json-social', label: 'JSON — Social posts',    hint: 'REST API returning social posts, comments, or mentions' },
  { value: 'json-price',  label: 'JSON — Price / market',  hint: 'REST API returning price, volume, or OHLCV data' },
  { value: 'json-quote',  label: 'JSON — Stock quote',     hint: 'REST API returning a stock quote; use {symbol} (per-symbol) or {symbols} (batch) in the URL — price/change fields auto-detected' },
  { value: 'json-ohlcv',  label: 'JSON — OHLCV history',   hint: 'REST API returning an array of candles for TA/backtests; use {symbol} in the URL — time/open/high/low/close fields auto-detected' },
  { value: 'graphql',     label: 'GraphQL',                hint: 'GraphQL endpoint — e.g. Santiment, The Graph, Messari' },
  // No 'websocket' option: the fetch path never implemented WS. A feed saved
  // with it logged a server warning and contributed 0 items while the UI
  // looked configured (review defect D-18). The FeedFormat type member stays
  // so legacy saved configs still parse; re-add the option only with a real
  // socket consumer behind it.
  { value: 'native',      label: 'Native / built-in',      hint: 'Handled directly by a built-in provider integration' },
]

const AUTH_OPTIONS: { value: AuthMethod; label: string }[] = [
  { value: 'none', label: 'No authentication' },
  { value: 'header', label: 'API key in header' },
  { value: 'query', label: 'API key in query param' },
  { value: 'bearer', label: 'Bearer token (Authorization header)' },
]

/**
 * The terms report, rendered where the user is about to commit to a source.
 *
 * It deliberately leads with the site's own words — the matched clauses and a
 * link to the document — rather than a green tick. A one-word verdict from a
 * keyword scan would be read as an assurance the scan cannot give, and the
 * decision this asks for is the user's to make on the real text.
 */
function TermsReportPanel({ report }: { report: TermsProbeReport }) {
  const restrictive = report.terms.signals.filter((s) => s.kind === 'restrictive')
  const blocked = report.hardBlock
  return (
    <div className={clsxLite(
      'rounded-lg border p-3 space-y-2 text-xs',
      blocked ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'
    )}>
      <div className="flex items-start gap-2">
        {blocked ? <ShieldAlert size={14} className="text-red-400 mt-0.5 shrink-0" />
                 : <ScrollText size={14} className="text-amber-400 mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <p className={blocked ? 'text-red-300 font-medium' : 'text-amber-200 font-medium'}>
            {blocked ? 'Blocked by source terms' : 'Check this site’s terms before using it'}
          </p>
          <p className="text-slate-300 mt-0.5 leading-relaxed">{report.summary}</p>
        </div>
      </div>

      <div className="text-slate-400 pl-6">
        <span className="text-slate-500">robots.txt:</span> {report.robots.detail}
      </div>

      {report.terms.url && (
        <div className="pl-6">
          <a href={report.terms.url} target="_blank" rel="noopener noreferrer"
             className="text-accent-blue hover:underline inline-flex items-center gap-1">
            Read the terms <ExternalLink size={10} />
          </a>
        </div>
      )}

      {restrictive.length > 0 && (
        <ul className="pl-6 space-y-1.5">
          {restrictive.map((s, i) => (
            <li key={i}>
              <span className="text-amber-300 font-medium">{s.label}</span>
              <span className="block text-slate-400 italic mt-0.5 leading-relaxed">“{s.excerpt}”</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Tiny local join — this file doesn't otherwise import clsx. */
function clsxLite(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

function AddCustomSourceForm({ category, market = 'crypto', onAdd }: { category: ProviderCategory; market?: ProviderMarket; onAdd: () => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Terms gate state. `report` is whatever the server sent back with a 403/409;
  // `acknowledged` is the user's explicit "I have read them", which the server
  // requires before it will save an unreviewed source — and which it ignores
  // entirely for a hard block.
  const [termsReport, setTermsReport] = useState<TermsProbeReport | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [checking, setChecking] = useState(false)
  const defaultFormat: FeedFormat = category === 'video'
    ? 'youtube' // channel id or full /feeds/videos.xml URL
    : market === 'equities'
      ? (category === 'price' ? 'json-quote' : category === 'news' ? 'rss' : 'json-social')
      : (category === 'news' || category === 'social' ? 'rss' : 'json-price')
  const [form, setForm] = useState({
    name: '',
    description: '',
    url: '',
    authMethod: 'none' as AuthMethod,
    authHeaderName: '',
    authQueryParam: '',
    apiKey: '',
    format: defaultFormat as FeedFormat,
    jsonArrayPath: '',
  })

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    // An acknowledgement is about ONE url. Editing it invalidates both the
    // report and the consent, or a user could get a report for a benign feed
    // and then save a different site under it.
    if (field === 'url') { setTermsReport(null); setAcknowledged(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.url.trim()) { setError('Name and URL are required'); return }
    setSaving(true)
    setError(null)
    const res = await fetch('/live-data/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add-custom',
        termsAcknowledged: acknowledged,
        customDef: {
          name: form.name.trim(),
          description: form.description.trim(),
          category,
          market,
          url: form.url.trim(),
          authMethod: form.authMethod,
          authHeaderName: form.authHeaderName.trim() || undefined,
          authQueryParam: form.authQueryParam.trim() || undefined,
          format: form.format,
          jsonArrayPath: form.jsonArrayPath.trim() || undefined,
        },
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
      }),
    })
    const data = await res.json()
    if (!res.ok || data.error) {
      // 403 = prohibited outright (no checkbox will help); 409 = we need the
      // user to read the terms and say so. Both carry the full report.
      setTermsReport(data.termsReport ?? null)
      setError(data.termsReport ? null : (data.error ?? 'Failed to add provider'))
      setSaving(false)
      return
    }
    // Save API key if provided
    if (form.apiKey && data.id) {
      await fetch('/live-data/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: data.id, action: 'save', apiKey: form.apiKey }),
      })
    }
    setSaving(false)
    setOpen(false)
    setTermsReport(null)
    setAcknowledged(false)
    setForm({ name: '', description: '', url: '', authMethod: 'none', authHeaderName: '', authQueryParam: '', apiKey: '', format: defaultFormat, jsonArrayPath: '' })
    onAdd()
  }

  /** Run the check on demand, before committing — same report the save uses. */
  async function checkTerms() {
    if (!form.url.trim()) { setError('Enter the endpoint URL first'); return }
    setChecking(true)
    setError(null)
    try {
      const res = await fetch('/live-data/source-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: form.url.trim() }),
      })
      const data = await res.json()
      if (data.report) setTermsReport(data.report as TermsProbeReport)
      else setError(data.error ?? 'Terms check failed')
    } catch {
      setError('Terms check failed — could not reach the site')
    } finally {
      setChecking(false)
    }
  }

  const sourceLabel = category === 'news' ? 'news source'
    : category === 'social' ? 'social source'
    : category === 'video' ? 'video channel'
    : market === 'equities' ? 'quote feed' : 'price feed'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-slate-700 text-sm text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
      >
        <Plus size={14} /> Add custom {sourceLabel}
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-violet-700/40 bg-violet-900/10 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-200">Add custom {sourceLabel}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 text-xs">Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Name *</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. My Crypto Feed" required className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-blue/60 focus:outline-none" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Format *</label>
          <select value={form.format} onChange={(e) => set('format', e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-accent-blue/60 focus:outline-none">
            {FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-[11px] text-slate-600 mt-0.5">{FORMAT_OPTIONS.find((o) => o.value === form.format)?.hint}</p>
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Endpoint URL * <span className="normal-case font-normal text-slate-600">
              {market === 'equities' ? <>(use {'{symbol}'} per-symbol or {'{symbols}'} for batch)</> : market === 'macro' ? <>(plain feed URL — articles are pillar-classified automatically)</> : <>(use {'{asset}'} as placeholder for asset ID)</>}
            </span>
          </label>
          <input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder={market === 'equities' ? 'https://example.com/api/quote/{symbol}' : market === 'macro' ? 'https://example.com/rss' : 'https://example.com/api/news?q={asset}'} required className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-blue/60 focus:outline-none font-mono" />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Description</label>
          <input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Short description (optional)" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-blue/60 focus:outline-none" />
        </div>
      </div>

      {/* Auth */}
      <div className="space-y-2">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Authentication</label>
        <select value={form.authMethod} onChange={(e) => set('authMethod', e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-accent-blue/60 focus:outline-none">
          {AUTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {form.authMethod === 'header' && (
          <input value={form.authHeaderName} onChange={(e) => set('authHeaderName', e.target.value)} placeholder="Header name, e.g. X-Api-Key" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-blue/60 focus:outline-none font-mono" />
        )}
        {form.authMethod === 'query' && (
          <input value={form.authQueryParam} onChange={(e) => set('authQueryParam', e.target.value)} placeholder="Query param name, e.g. apikey" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-blue/60 focus:outline-none font-mono" />
        )}
        {form.authMethod !== 'none' && (
          <input type="password" value={form.apiKey} onChange={(e) => set('apiKey', e.target.value)} placeholder="API key / token (saved server-side)" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-blue/60 focus:outline-none font-mono" />
        )}
      </div>

      {/* JSON-specific */}
      {(form.format === 'json-news' || form.format === 'json-price') && (
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            JSON array path <span className="normal-case font-normal text-slate-600">(optional — e.g. data.articles)</span>
          </label>
          <input value={form.jsonArrayPath} onChange={(e) => set('jsonArrayPath', e.target.value)} placeholder="data.articles" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-blue/60 focus:outline-none font-mono" />
          <p className="text-[11px] text-slate-600 mt-0.5">
            For JSON news: headline/title, url/link, publishedAt/date, source, summary/description are auto-detected.
          </p>
        </div>
      )}

      {/* ── Source terms gate ────────────────────────────────────────────
          Finance Now will not save a source whose terms forbid this use, and
          will not save one nobody has checked until you say you have read them.
          The check runs automatically on save; this button lets you run it
          before filling in the rest of the form. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Every source is checked against the site’s robots.txt and terms of use before it is saved.
          </p>
          <button
            type="button"
            onClick={checkTerms}
            disabled={checking || !form.url.trim()}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100 transition-colors disabled:opacity-40"
          >
            {checking ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
            Check terms
          </button>
        </div>

        {termsReport && <TermsReportPanel report={termsReport} />}

        {termsReport && !termsReport.hardBlock && termsReport.requiresAcknowledgement && (
          <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 accent-violet-500"
            />
            <span>
              I have read {termsReport.host}’s terms and they permit an application like Finance Now to
              fetch this feed.
            </span>
          </label>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <XCircle size={12} /> {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          // Disabled on a hard block, and while an acknowledgement is
          // outstanding. The server enforces both regardless — this only saves
          // the user a round-trip to be told no.
          disabled={saving || !!termsReport?.hardBlock || (!!termsReport?.requiresAcknowledgement && !acknowledged)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add Source
        </button>
      </div>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderView[]>([])
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState<string | null>(null)

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch('/live-data/config')
      const data = await res.json()
      // C-note-10 fix: on a non-localhost deploy without FN_ADMIN_TOKEN the
      // config route 401/403s, and this page used to swallow the denial and
      // render every provider section empty — a locked page disguised as a
      // broken one. Surface the guard's message.
      if (res.status === 401 || res.status === 403) {
        setAccessError(data.error ?? 'Integrations are restricted to localhost unless FN_ADMIN_TOKEN is configured.')
        return
      }
      setProviders(data.providers ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProviders() }, [fetchProviders])

  const builtinProviders = providers.filter((p): p is BuiltinProviderView => !p.isCustom)
  const customProviders = providers.filter((p): p is CustomProviderView => !!p.isCustom)

  const marketOf = (p: ProviderView) => p.market ?? 'crypto'
  const priceProviders = builtinProviders.filter((p) => p.category === 'price' && marketOf(p) === 'crypto')
  const customPriceProviders = customProviders.filter((p) => p.category === 'price' && marketOf(p) === 'crypto')
  const equityProviders = builtinProviders.filter((p) => p.category === 'price' && marketOf(p) === 'equities')
  const customEquityProviders = customProviders.filter((p) => p.category === 'price' && marketOf(p) === 'equities')
  const newsProviders = builtinProviders.filter((p) => p.category === 'news' && marketOf(p) === 'crypto')
  const customNewsProviders = customProviders.filter((p) => p.category === 'news' && marketOf(p) === 'crypto')
  const socialProviders = builtinProviders.filter((p) => p.category === 'social' && marketOf(p) === 'crypto')
  const customSocialProviders = customProviders.filter((p) => p.category === 'social' && marketOf(p) === 'crypto')
  const equityNewsProviders = builtinProviders.filter((p) => p.category === 'news' && marketOf(p) === 'equities')
  const customEquityNewsProviders = customProviders.filter((p) => p.category === 'news' && marketOf(p) === 'equities')
  const equitySocialProviders = builtinProviders.filter((p) => p.category === 'social' && marketOf(p) === 'equities')
  const customEquitySocialProviders = customProviders.filter((p) => p.category === 'social' && marketOf(p) === 'equities')
  const cryptoVideoProviders = builtinProviders.filter((p) => p.category === 'video' && marketOf(p) === 'crypto')
  const customCryptoVideoProviders = customProviders.filter((p) => p.category === 'video' && marketOf(p) === 'crypto')
  const equityVideoProviders = builtinProviders.filter((p) => p.category === 'video' && marketOf(p) === 'equities')
  const customEquityVideoProviders = customProviders.filter((p) => p.category === 'video' && marketOf(p) === 'equities')
  const macroDataProviders = builtinProviders.filter((p) => p.category === 'price' && marketOf(p) === 'macro')
  const macroNewsProviders = builtinProviders.filter((p) => p.category === 'news' && marketOf(p) === 'macro')
  const customMacroNewsProviders = customProviders.filter((p) => p.category === 'news' && marketOf(p) === 'macro')
  const llmProviders = builtinProviders.filter((p) => p.category === 'llm')

  const activeCount = providers.filter((p) => {
    if (!p.config.enabled) return false
    if (p.isCustom) return true
    return p.config.hasKey || !(p as BuiltinProviderView).requiresKey
  }).length

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
          <Settings size={20} className="text-accent-blue" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Data Integrations</h1>
          <p className="text-sm text-slate-400">
            Configure your data providers. Keys are stored server-side only and never sent to the browser.
            {activeCount > 0 && (
              <span className="ml-1 text-emerald-400">{activeCount} provider{activeCount !== 1 ? 's' : ''} active.</span>
            )}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl border border-slate-800 bg-slate-900/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {accessError && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300 leading-relaxed">
              {accessError} Module toggles and watchlist bias below still work — they are stored in your
              browser — but the provider sections need admin access to load.
            </div>
          )}
          {/* Suite modules */}
          <ModulesPanel />
          <WatchlistBiasPanel />

          {/* Crypto market data */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <PlugZap size={15} className="text-accent-blue" />
              <h2 className="text-sm font-semibold text-slate-300">Crypto Market Data</h2>
              <span className="text-xs text-slate-500">— highest-priority active provider is used for prices</span>
            </div>
            <div className="space-y-2">
              {priceProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              {customPriceProviders.map((p) => (
                <CustomProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              <AddCustomSourceForm category="price" onAdd={fetchProviders} />
            </div>
          </section>

          {/* Equity market data */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={15} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-300">Equity Market Data</h2>
              <span className="text-xs text-slate-500">— tried in order until one serves quotes; custom feeds run first</span>
            </div>
            <div className="space-y-2">
              {customEquityProviders.map((p) => (
                <CustomProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              {equityProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              <AddCustomSourceForm category="price" market="equities" onAdd={fetchProviders} />
            </div>
          </section>

          {/* Equity news */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Rss size={15} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-300">Equity News</h2>
              <span className="text-xs text-slate-500">— all active feeds run in parallel, articles merged and attributed</span>
            </div>
            <div className="space-y-2">
              {equityNewsProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              {customEquityNewsProviders.map((p) => (
                <CustomProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              <AddCustomSourceForm category="news" market="equities" onAdd={fetchProviders} />
            </div>
          </section>

          {/* Equity social */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={15} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-300">Equity Social</h2>
              <span className="text-xs text-slate-500">— all active providers run in parallel, signals merged and attributed</span>
            </div>
            <div className="space-y-2">
              {equitySocialProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              {customEquitySocialProviders.map((p) => (
                <CustomProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              <AddCustomSourceForm category="social" market="equities" onAdd={fetchProviders} />
            </div>
          </section>

          {/* Macro data */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <PlugZap size={15} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-slate-300">Macro Data Sources</h2>
              <span className="text-xs text-slate-500">— FX reference tables and the official yield curve; futures/FX quotes use the equity quote ladder above</span>
            </div>
            <div className="space-y-2">
              {macroDataProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
            </div>
          </section>

          {/* Macro news */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Rss size={15} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-slate-300">Macro News</h2>
              <span className="text-xs text-slate-500">— commodities, FX, and bonds feeds; general wires are kept only when an article classifies into a pillar</span>
            </div>
            <div className="space-y-2">
              {macroNewsProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              {customMacroNewsProviders.map((p) => (
                <CustomProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              <AddCustomSourceForm category="news" market="macro" onAdd={fetchProviders} />
            </div>
          </section>

          {/* Equity video */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Video size={15} className="text-violet-400" />
              <h2 className="text-sm font-semibold text-slate-300">Market Video Sources</h2>
              <span className="text-xs text-slate-500">— keyless YouTube channel feeds, merged on the Videos page</span>
            </div>
            <div className="space-y-2">
              {equityVideoProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              {customEquityVideoProviders.map((p) => (
                <CustomProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              <AddCustomSourceForm category="video" market="equities" onAdd={fetchProviders} />
            </div>
          </section>

          {/* Crypto video */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Video size={15} className="text-accent-blue" />
              <h2 className="text-sm font-semibold text-slate-300">Crypto Video Sources</h2>
              <span className="text-xs text-slate-500">— keyless YouTube channel feeds, merged on the Videos page</span>
            </div>
            <div className="space-y-2">
              {cryptoVideoProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              {customCryptoVideoProviders.map((p) => (
                <CustomProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              <AddCustomSourceForm category="video" market="crypto" onAdd={fetchProviders} />
            </div>
          </section>

          {/* News */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Rss size={15} className="text-accent-blue" />
              <h2 className="text-sm font-semibold text-slate-300">News & Analysis</h2>
              <span className="text-xs text-slate-500">— all active providers run in parallel, articles merged and attributed</span>
            </div>
            <div className="space-y-2">
              {newsProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              {customNewsProviders.map((p) => (
                <CustomProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              <AddCustomSourceForm category="news" onAdd={fetchProviders} />
            </div>
          </section>

          {/* Social */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={15} className="text-violet-400" />
              <h2 className="text-sm font-semibold text-slate-300">Social Intelligence</h2>
              <span className="text-xs text-slate-500">— all active providers run in parallel, signals merged and attributed</span>
            </div>
            <div className="space-y-2">
              {socialProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              {customSocialProviders.map((p) => (
                <CustomProviderCard key={p.id} provider={p} onUpdate={fetchProviders} />
              ))}
              <AddCustomSourceForm category="social" onAdd={fetchProviders} />
            </div>
          </section>

          {/* AI providers (LLM keys) */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Cpu size={15} className="text-accent-blue" />
              <h2 className="text-sm font-semibold text-slate-300">AI Providers</h2>
              <span className="text-xs text-slate-500">— API keys for the LLMs that power the agents; pick a provider per agent on the AI Agents tab</span>
            </div>
            <div className="space-y-2">
              {llmProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} onUpdate={fetchProviders} hideToggle />
              ))}
            </div>
          </section>

          {/* AI agents (enable/disable) */}
          <AiAgentsPanel />

          {/* Notes */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-5 py-4 text-xs text-slate-500 space-y-1">
            <p>Keys are saved to <span className="font-mono text-slate-400">.provider-config.json</span> in the app root (server-side only). Add this file to <span className="font-mono text-slate-400">.gitignore</span> if you use version control.</p>
            <p>You can also set built-in keys via environment variables: <span className="font-mono text-slate-400">COINGECKO_API_KEY</span>, <span className="font-mono text-slate-400">FMP_API_KEY</span>, <span className="font-mono text-slate-400">FINNHUB_API_KEY</span>, <span className="font-mono text-slate-400">TIINGO_API_KEY</span>, etc.</p>
            <p>Custom sources support RSS/Atom feeds and JSON APIs. Use <span className="font-mono text-slate-400">{'{asset}'}</span> for crypto asset IDs, or <span className="font-mono text-slate-400">{'{symbol}'}</span> / <span className="font-mono text-slate-400">{'{symbols}'}</span> for stock tickers in quote feeds.</p>
          </div>
        </>
      )}
    </div>
  )
}
