'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bot,
  Cpu,
  Thermometer,
  RotateCcw,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Server,
  MonitorSmartphone,
  Plug,
  AppWindow,
  FlaskConical,
  DatabaseZap,
  TrendingDown,
  LineChart,
  ExternalLink,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'mistral'
  | 'groq'
  | 'xai'
  | 'deepseek'
  | 'perplexity'
  | 'together'
  | 'cohere'

interface AgentConfig {
  id: string
  name: string
  description: string
  runtime: 'frontend' | 'backend'
  provider: ProviderId
  model: string
  temperature: number
  systemPrompt: string
  isCustomized: boolean
  updatedAt?: string
}

interface ModelOption    { id: string; label: string; hint: string }
interface ProviderOption { id: ProviderId; label: string; hint: string; envVar: string; docsUrl: string }

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId =
  | 'app-assistant' | 'research-analyst' | 'data-scraper' | 'pump-report'
  | 'equity-research' | 'equity-scraper' | 'equity-diligence' | 'equity-screener'
  | 'macro-research' | 'macro-screener'

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType; agentIds: string[]; group: 'shared' | 'crypto' | 'equities' | 'macro' }> = [
  { id: 'app-assistant',    label: 'App Assistant',       icon: AppWindow,    group: 'shared',   agentIds: ['app-assistant']                              },
  { id: 'research-analyst', label: 'Research & Analysis', icon: FlaskConical, group: 'crypto',   agentIds: ['research-analyst']                           },
  { id: 'data-scraper',     label: 'Data Scraper',        icon: DatabaseZap,  group: 'crypto',   agentIds: ['data-scraper']                               },
  { id: 'pump-report',      label: 'Pump Report',         icon: TrendingDown, group: 'crypto',   agentIds: ['pump-report-investigator', 'pump-report-chat'] },
  { id: 'equity-research',  label: 'Equity Research',     icon: FlaskConical, group: 'equities', agentIds: ['equity-research']                            },
  { id: 'equity-screener',  label: 'Equity Screener',     icon: LineChart,    group: 'equities', agentIds: ['equity-screener']                            },
  { id: 'equity-scraper',   label: 'Equity Scraper',      icon: DatabaseZap,  group: 'equities', agentIds: ['equity-data-scraper']                        },
  { id: 'equity-diligence', label: 'Equity Diligence',    icon: TrendingDown, group: 'equities', agentIds: ['equity-diligence']                           },
  { id: 'macro-research',   label: 'Macro Research',      icon: FlaskConical, group: 'macro',    agentIds: ['macro-research']                             },
  { id: 'macro-screener',   label: 'Macro Screener',      icon: LineChart,    group: 'macro',    agentIds: ['macro-screener']                             },
]

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  providers,
  providerModels,
  onSaved,
}: {
  agent: AgentConfig
  providers: ProviderOption[]
  providerModels: Record<ProviderId, ModelOption[]>
  onSaved: () => void
}) {
  const [expanded, setExpanded]     = useState(false)
  const [prompt, setPrompt]         = useState(agent.systemPrompt)
  const [provider, setProvider]     = useState<ProviderId>(agent.provider)
  const [model, setModel]           = useState(agent.model)
  const [temperature, setTemperature] = useState(agent.temperature)
  const [saving, setSaving]         = useState(false)
  const [resetting, setResetting]   = useState(false)
  const [result, setResult]         = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    setPrompt(agent.systemPrompt)
    setProvider(agent.provider)
    setModel(agent.model)
    setTemperature(agent.temperature)
  }, [agent.systemPrompt, agent.provider, agent.model, agent.temperature])

  function handleProviderChange(newProvider: ProviderId) {
    setProvider(newProvider)
    const models = providerModels[newProvider] ?? []
    if (models.length > 0 && !models.some((m) => m.id === model)) {
      setModel(models[0].id)
    }
  }

  const models = providerModels[provider] ?? []
  const dirty =
    prompt !== agent.systemPrompt ||
    provider !== agent.provider ||
    model !== agent.model ||
    temperature !== agent.temperature

  async function handleSave() {
    setSaving(true); setResult(null)
    try {
      const res  = await fetch('/api/agents/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: agent.id, action: 'save', provider, systemPrompt: prompt, model, temperature }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setResult({ ok: false, msg: data.error ?? 'Failed to save' })
      else { setResult({ ok: true, msg: 'Saved — agent will use this on its next run' }); onSaved() }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Save failed' })
    }
    setSaving(false)
  }

  async function handleReset() {
    if (!confirm(`Reset "${agent.name}" to its built-in default?`)) return
    setResetting(true); setResult(null)
    try {
      const res  = await fetch('/api/agents/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: agent.id, action: 'reset' }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setResult({ ok: false, msg: data.error ?? 'Failed to reset' })
      else { setResult({ ok: true, msg: 'Reset to default' }); onSaved() }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Reset failed' })
    }
    setResetting(false)
  }

  const RuntimeIcon    = agent.runtime === 'backend' ? Server : MonitorSmartphone
  const activeProvider = providers.find((p) => p.id === provider)
  const providerHint   = activeProvider?.hint
  const providerDocs   = activeProvider?.docsUrl

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 transition-all">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="size-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
          <Bot size={18} className="text-violet-400" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-slate-100">{agent.name}</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
              <RuntimeIcon size={9} /> {agent.runtime}
            </span>
            {agent.isCustomized ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Customized</span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-500 border border-slate-700">Default</span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{agent.description}</p>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
          <ChevronRight size={16} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="px-5 pb-5 pt-0 space-y-4 border-t border-slate-800/60">
          {/* Provider */}
          <div className="pt-4">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              <Plug size={11} /> Provider
            </label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-violet-500/60 focus:outline-none"
            >
              {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <div className="flex items-center justify-between mt-0.5">
              {providerHint && <p className="text-[11px] text-slate-600">{providerHint}</p>}
              {providerDocs && (
                <a
                  href={providerDocs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-violet-500 hover:text-violet-400 transition-colors flex-shrink-0 ml-2"
                >
                  Get API key <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>

          {/* Model + temperature */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                <Cpu size={11} /> Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-violet-500/60 focus:outline-none"
              >
                {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <p className="text-[11px] text-slate-600 mt-0.5">{models.find((m) => m.id === model)?.hint}</p>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                <Thermometer size={11} /> Temperature: <span className="text-slate-300 font-mono">{temperature.toFixed(2)}</span>
              </label>
              <input
                type="range" min={0} max={1} step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full accent-violet-500 mt-2"
              />
              <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                <span>Precise (0)</span><span>Creative (1)</span>
              </div>
            </div>
          </div>

          {/* System prompt */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">System Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={14}
              spellCheck={false}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-violet-500/60 focus:outline-none font-mono leading-relaxed resize-y"
            />
            <p className="text-[11px] text-slate-600 mt-1">
              {prompt.length.toLocaleString()} characters
              {agent.updatedAt && <> · last edited {new Date(agent.updatedAt).toLocaleString()}</>}
            </p>
          </div>

          {result && (
            <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${result.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {result.ok ? <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" /> : <XCircle size={12} className="mt-0.5 flex-shrink-0" />}
              {result.msg}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleReset}
              disabled={resetting || !agent.isCustomized}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40 disabled:hover:text-slate-400"
              title={agent.isCustomized ? 'Reset to built-in default' : 'Already at default'}
            >
              {resetting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Reset to default
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-40"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {dirty ? 'Save changes' : 'Saved'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentConfigPage() {
  const [activeTab, setActiveTab] = useState<TabId>('app-assistant')
  const [agents, setAgents]       = useState<AgentConfig[]>([])
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [providerModels, setProviderModels] = useState<Record<ProviderId, ModelOption[]>>({} as Record<ProviderId, ModelOption[]>)
  const [loading, setLoading]     = useState(true)

  const fetchAgents = useCallback(async () => {
    try {
      const res  = await fetch('/api/agents/prompts')
      const data = await res.json()
      setAgents(data.agents ?? [])
      setProviders(data.providers ?? [])
      setProviderModels(data.providerModels ?? {})
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  const tab        = TABS.find((t) => t.id === activeTab)!
  const tabAgents  = agents.filter((a) => tab.agentIds.includes(a.id))
  const customized = tabAgents.filter((a) => a.isCustomized).length

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <Bot size={20} className="text-violet-400" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Agent Configuration</h1>
          <p className="text-sm text-slate-400">
            Configure each AI agent — choose a provider, model, temperature, and system prompt. Changes take effect immediately.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-800 pb-0">
        {TABS.map(({ id, label, icon: Icon, agentIds }) => {
          const tabCustomized = agents.filter((a) => agentIds.includes(a.id) && a.isCustomized).length
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-violet-500 text-violet-400 bg-violet-500/5'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
              }`}
            >
              <Icon size={14} />
              {label}
              {tabCustomized > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Customized" />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl border border-slate-800 bg-slate-900/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Tab description */}
          <p className="text-xs text-slate-500">
            {activeTab === 'app-assistant'    && 'The App Assistant is available throughout the platform to help users navigate and interpret data across both crypto and equities.'}
            {activeTab === 'research-analyst' && 'The crypto Research Agent performs deep fundamental analysis — triggered from any coin page or the Research page.'}
            {activeTab === 'data-scraper'     && 'The Data Scraper is designed to find new staking opportunities and coin listings — configurable here, but it has no invocation trigger yet and never runs. Wiring a trigger (or retiring it) is an open decision.'}
            {activeTab === 'pump-report'      && 'Two agents power the Pump Report tab: the Investigator runs the 8-angle autonomous sweep, the Chat Agent handles follow-up questions.'}
            {activeTab === 'equity-research'  && 'The Equity Research Agent analyzes stocks using live quotes, SEC-filed financials, filings, news, and social sentiment. Launch it from any stock page or the Research page.'}
            {activeTab === 'equity-screener'  && 'The Equity Screener scans the whole universe for sector-relative statistical outliers (cheap/expensive, high-yield, high/low-beta) and explains opportunities vs traps. Run it from the “AI Outlier Scan” panel on the Stock Registry.'}
            {activeTab === 'equity-scraper'   && 'The Equity Data Scraper is designed to find upcoming earnings, analyst rating changes, IPOs, and index changes — configurable here, but it has no invocation trigger yet and never runs.'}
            {activeTab === 'equity-diligence' && 'The Equity Due Diligence agent is designed to investigate a stock for red flags — accounting quality, litigation, SEC actions, short-seller reports, governance. Configurable here, but it has no invocation trigger yet and never runs.'}
            {activeTab === 'macro-research'   && 'The Macro Research Agent analyzes commodities, currencies, and bonds/rates using live futures/FX quotes, the official treasury yield curve, and macro news. Launch it from the Research page.'}
            {activeTab === 'macro-screener'   && 'The Macro Screener sweeps every macro instrument for the biggest moves and regime signals (dollar, curve shape, energy/gold tone) and explains the drivers. No panel yet — run it from the Research page via ?agent=macro-screener.'}
          </p>

          {tabAgents.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-5 py-8 text-center text-sm text-slate-500">
              No agents configured for this tab.
            </div>
          ) : (
            tabAgents.map((a) => (
              <AgentCard key={a.id} agent={a} providers={providers} providerModels={providerModels} onSaved={fetchAgents} />
            ))
          )}

          {customized > 0 && (
            <p className="text-[11px] text-amber-500/70 text-center">
              {customized} agent{customized > 1 ? 's' : ''} on this tab {customized > 1 ? 'have' : 'has'} custom settings
            </p>
          )}
        </div>
      )}

      {/* API key reminder */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-5 py-4 text-xs text-slate-500 space-y-1">
        <p className="text-slate-400 font-medium mb-2">
          API Keys — set in <a href="/settings" className="text-violet-400 hover:underline">Settings → Integrations → AI Providers</a>, or via <span className="font-mono">frontend/.env.local</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium w-28 flex-shrink-0">{p.label.split(' ')[0]}:</span>
              <span className="font-mono text-slate-500">{p.envVar}</span>
              <a
                href={p.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-violet-500 hover:text-violet-400 transition-colors flex items-center gap-0.5 flex-shrink-0"
              >
                Get key <ExternalLink size={9} />
              </a>
            </div>
          ))}
        </div>
        <p className="pt-2 border-t border-slate-800/60 mt-2">Defaults live in <span className="font-mono text-slate-400">src/lib/agents/prompts.ts</span>. Overrides are stored in <span className="font-mono text-slate-400">.agent-prompts.json</span>. Reset an agent to restore its default.</p>
      </div>
    </div>
  )
}
