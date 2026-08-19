'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { clsx } from 'clsx'
import { Microscope, Loader2, Wrench, Sparkles, AlertCircle, Bitcoin, LineChart, Globe2 } from 'lucide-react'
import { useWatchlistBias } from '@/lib/watchlist/useWatchlistBias'
import { agentWatchlistPayload } from '@/lib/watchlist/bias'

type Market = 'crypto' | 'equities' | 'macro'

const RESEARCH_AGENT: Record<Market, string> = {
  crypto: 'research-analyst',
  equities: 'equity-research',
  macro: 'macro-research',
}

/**
 * Which market each deep-linkable agent belongs to.
 *
 * Must cover every id in RESEARCH_AGENTS (api/agents/research/route.ts). The
 * previous version matched two literals — 'macro-research' and
 * 'equity-research' — so `?agent=macro-screener` and `?agent=equity-screener`
 * fell through to the crypto default and silently ran the crypto analyst
 * against a macro question (W4-C8).
 */
const AGENT_MARKET: Record<string, Market> = {
  'research-analyst': 'crypto',
  'data-scraper': 'crypto',
  'equity-research': 'equities',
  'equity-screener': 'equities',
  'equity-data-scraper': 'equities',
  'equity-diligence': 'equities',
  'macro-research': 'macro',
  'macro-screener': 'macro',
}

/**
 * The agents each market offers, in the order they appear as chips.
 *
 * NT5 (2026-08-18): `data-scraper`, `equity-data-scraper` and `equity-diligence`
 * had editable prompts in the AI Agents tab and no way to run them at all —
 * configurable placeholders that could never execute. This picker is their
 * invocation path. `equity-screener` and `macro-screener` were already
 * whitelisted on the run route but reachable only by deep link, so they surface
 * here too rather than staying URL-only knowledge.
 *
 * `structured: true` marks an agent whose prompt asks for machine-readable
 * output. Its report renders the same way, but the page says what it is — a
 * wall of JSON with no explanation reads as a malfunction.
 */
interface AgentChoice {
  id: string
  label: string
  blurb: string
  structured?: boolean
}

const MARKET_AGENTS: Record<Market, AgentChoice[]> = {
  crypto: [
    { id: 'research-analyst', label: 'Research', blurb: 'Multi-angle analysis of a coin, protocol or question, grounded in live platform data.' },
    { id: 'data-scraper', label: 'Data Scraper', blurb: 'Searches for staking opportunities, new listings and market updates not yet tracked here, and returns them as structured records.', structured: true },
  ],
  equities: [
    { id: 'equity-research', label: 'Research', blurb: 'Company analysis: financial health, valuation vs history, growth drivers and risks.' },
    { id: 'equity-screener', label: 'Screener', blurb: 'Sector-relative outliers across the stock universe, then a drill-down into what makes each one an outlier.' },
    { id: 'equity-diligence', label: 'Diligence', blurb: 'Red-flag investigation of one company: accounting quality, litigation, SEC enforcement, short-seller reports, governance, insider activity.' },
    { id: 'equity-data-scraper', label: 'Data Scraper', blurb: 'Upcoming earnings, rating changes, IPOs and index changes as structured records.', structured: true },
  ],
  macro: [
    { id: 'macro-research', label: 'Research', blurb: 'Commodities, currencies and rates analysis grounded in live quotes, the yield curve and macro news.' },
    { id: 'macro-screener', label: 'Screener', blurb: 'Cross-instrument scan over the macro universe.' },
  ],
}

const AGENT_BY_ID = new Map<string, AgentChoice>(
  Object.values(MARKET_AGENTS).flat().map((a) => [a.id, a]),
)

const EXAMPLES: Record<Market, string[]> = {
  crypto: [
    'Compare ETH and SOL staking: APYs, risk profiles, and which suits a risk-averse holder.',
    'Analyze BTC price action over the last year and summarize the trend with key levels.',
    'What is the cheapest end-to-end route to move $10,000 USDC from Kraken to a wallet on Arbitrum?',
    'Summarize the latest news sentiment for the top L1s and flag anything material.',
  ],
  equities: [
    'Analyze NVDA: financial health, valuation vs history, growth drivers, and key risks.',
    'Compare AAPL and MSFT on margins, growth, and valuation — which is the better value today?',
    'Review the latest 8-K filings and news for JPM and flag anything material.',
    'Is TSLA cheap or expensive right now? Walk through the valuation multiples and what justifies them.',
  ],
  macro: [
    'Analyze gold: current level vs the 1Y range, what is driving it, and the trade-offs between the ETF proxies.',
    'Read the treasury yield curve today — shape, 2s10s and 3m10y spreads, and what changed vs a month ago.',
    'What is moving oil right now? Pull the latest quotes and commodities news and explain the drivers.',
    'Assess EUR/USD: trend, rate-differential story, and what the next central-bank meetings could change.',
  ],
}

/**
 * Examples for the agents that are not their market's default. A scraper or a
 * diligence run needs a differently-shaped task than "analyze X", and offering
 * the research examples for them would teach the wrong usage on first contact.
 */
const AGENT_EXAMPLES: Record<string, string[]> = {
  'data-scraper': [
    'Find liquid staking protocols launched in the last six months that are not in the platform catalog. Return name, chain, receipt token, current APR and source URL.',
    'Collect current advertised staking APRs for ETH, SOL and ATOM across the major exchanges, with the page you read each figure from.',
    'List coins that entered the top 200 by market cap this month, with market cap, chain and launch date.',
  ],
  'equity-data-scraper': [
    'Collect the earnings dates confirmed for the next two weeks among S&P 500 companies, with the session (pre/post) and the source.',
    'Find analyst rating changes published this week for mega-cap technology names, with the firm, old and new rating, and price target.',
    'List index additions and deletions announced this quarter for the S&P 500 and Nasdaq-100, with effective dates.',
  ],
  'equity-diligence': [
    'Investigate NVDA for red flags: accounting quality, litigation, SEC enforcement history, short-seller reports, governance and insider selling. Cite every source.',
    'Run diligence on a recent IPO of your choosing and report what a buyer should verify before investing.',
    'Review the last three years of filings for any restatements, auditor changes or going-concern language at BA.',
  ],
  'equity-screener': [
    'Scan for sector-relative valuation outliers and explain what makes the three most extreme ones outliers.',
    'Find high-dividend-yield outliers and check whether each yield is supported by earnings or a falling price.',
  ],
  'macro-screener': [
    'Scan the macro universe for instruments furthest from their 50-day average and explain what moved them.',
    'Which commodities and currencies show the strongest 1-month momentum right now, and what is driving each?',
  ],
}

interface ReportResult {
  report: string
  toolsUsed: { name: string; input: unknown }[]
}

function ResearchInner() {
  const params = useSearchParams()
  const marketParam = params.get('market')
  const agentParam = params.get('agent') ?? ''
  const initialMarket: Market =
    AGENT_MARKET[agentParam]
    ?? (marketParam === 'macro' || marketParam === 'equities' || marketParam === 'crypto'
      ? marketParam
      : 'crypto')

  // A deep link naming a specific agent runs THAT agent, not just its market's
  // default — `?agent=macro-screener` is the documented way to reach a screener.
  // Before NT5 that state lived in a separate `pinnedAgent` flag; the agent
  // selector made it redundant, since the selection IS the agent to run.
  const [market, setMarket] = useState<Market>(initialMarket)
  // The agent actually being run. A deep link pins one; otherwise it is the
  // market's first (research) agent, and switching market resets it — a pinned
  // equity agent must not survive a switch to Macro.
  const [agentId, setAgentId] = useState<string>(
    AGENT_MARKET[agentParam] ? agentParam : RESEARCH_AGENT[initialMarket],
  )
  const [task, setTask] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const watchlist = useWatchlistBias()

  // Deep-link prefill: /research?symbol=MSFT (or ?task=...) — from a stock page.
  useEffect(() => {
    const symbol = params.get('symbol')
    const preset = params.get('task')
    if (preset) { setTask(preset); return }
    if (symbol) {
      setMarket('equities')
      setAgentId(RESEARCH_AGENT.equities)
      setTask(`Analyze ${symbol.toUpperCase()}: business and industry, financial health, valuation vs history and peers, growth drivers, catalysts, and key risks. End with a risk-adjusted outlook.`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/agents/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: trimmed,
          agentId,
          // See AssistantWidget — the server cannot read the watchlist itself.
          watchlist: agentWatchlistPayload(watchlist) ?? undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setError(data.error ?? 'Research failed')
      else setResult({ report: data.report, toolsUsed: data.toolsUsed ?? [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    }
    setLoading(false)
  }

  const activeAgent = AGENT_BY_ID.get(agentId)

  const markets: Array<{ id: Market; label: string; icon: React.ElementType }> = [
    { id: 'crypto', label: 'Crypto', icon: Bitcoin },
    { id: 'equities', label: 'Equities', icon: LineChart },
    { id: 'macro', label: 'Macro', icon: Globe2 },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <Microscope size={20} className="text-violet-400" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Research &amp; Analysis</h1>
          <p className="text-sm text-slate-400">
            Give the agent a research task. It gathers live data through the platform&apos;s tools and returns a structured report.
          </p>
        </div>
      </div>

      {/* Market selector */}
      <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900/60 p-0.5">
        {markets.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setMarket(id); setAgentId(RESEARCH_AGENT[id]); setResult(null); setError(null) }}
            className={clsx(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              market === id ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200',
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Agent selector (NT5). Every agent in this market, not just the default —
          three of these had no invocation path at all before. */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {MARKET_AGENTS[market].map((a) => (
            <button
              key={a.id}
              onClick={() => { setAgentId(a.id); setResult(null); setError(null) }}
              className={clsx(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                agentId === a.id
                  ? 'border-violet-500/60 bg-violet-600/20 text-violet-200'
                  : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">{activeAgent?.blurb}</p>
      </div>

      {/* Task input */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={4}
          placeholder={market === 'equities'
            ? 'e.g. Analyze MSFT: financial health, valuation vs history and peers, growth drivers, and key risks.'
            : market === 'macro'
            ? 'e.g. Analyze gold: level vs the 1Y range, drivers, and how the ETF proxies compare.'
            : 'e.g. Compare the risk-adjusted staking yield of ETH vs SOL and recommend which fits a conservative holder.'}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:border-violet-500/60 focus:outline-none resize-y leading-relaxed"
        />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-600">
            {activeAgent?.label ?? 'Research'} agent · reports can take 20–60s.
            {activeAgent?.structured && ' Returns structured records rather than prose.'}
          </p>
          <button
            onClick={() => run(task)}
            disabled={loading || !task.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? 'Researching…' : 'Run research'}
          </button>
        </div>
      </div>

      {/* Examples */}
      {!result && !loading && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Try an example</p>
          {(AGENT_EXAMPLES[agentId] ?? EXAMPLES[market]).map((e) => (
            <button
              key={e}
              onClick={() => { setTask(e); run(e) }}
              className="w-full text-left text-sm text-slate-300 px-3.5 py-2.5 rounded-lg border border-slate-800 bg-slate-800/40 hover:bg-slate-800 hover:border-slate-700 transition-colors"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={15} className="animate-spin text-violet-400" />
            Gathering data and analyzing…
          </div>
          <div className="space-y-2 pt-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-3 rounded bg-slate-800 animate-pulse" style={{ width: `${90 - i * 8}%` }} />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 bg-red-500/10 text-red-300 border border-red-500/20">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Research failed</p>
            <p className="text-red-400/90 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Report */}
      {result && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
            <Microscope size={14} className="text-violet-400" />
            <span className="text-sm font-semibold text-slate-200">Report</span>
            {result.toolsUsed.length > 0 && (
              <div className="ml-auto flex flex-wrap gap-1 justify-end">
                {Array.from(new Set(result.toolsUsed.map((t) => t.name))).map((name) => (
                  <span key={name} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                    <Wrench size={9} /> {name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="px-5 py-4 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{result.report}</div>
        </div>
      )}
    </div>
  )
}

export default function ResearchPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto text-sm text-slate-500">Loading…</div>}>
      <ResearchInner />
    </Suspense>
  )
}
