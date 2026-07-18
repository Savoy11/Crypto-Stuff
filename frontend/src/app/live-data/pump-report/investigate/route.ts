import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { loadAgentConfig } from '@/lib/agents/config'
import { guardSensitiveRoute } from '@/lib/server/apiGuard'
import { getProviderKey } from '@/lib/api/live/providers'

export const dynamic = 'force-dynamic'

// ─── Types (shared with frontend via import) ──────────────────────────────────

export interface EvidenceLink {
  title: string
  url: string
  source: string
  date: string
  excerpt: string
}

export interface ReportFinding {
  category: string
  severity: 'info' | 'warning' | 'alert' | 'critical'
  headline: string
  detail: string
  sources: EvidenceLink[]
}

export interface InvestigationReport {
  target: string
  targetType: string
  generatedAt: string
  overallRisk: 'clean' | 'suspicious' | 'flagged' | 'critical'
  riskScore: number
  executiveSummary: string
  findings: ReportFinding[]
  redFlags: string[]
  mitigatingFactors: string[]
  conclusion: string
  searchesRun: string[]
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystem(target: string, targetType: string): string {
  return `You are an autonomous crypto fraud investigator with web search access. Your job is to conduct a comprehensive investigation into "${target}" (type: ${targetType}) and produce a structured evidence report.

INVESTIGATION PROTOCOL — you must run ALL of the following search angles:
1. Pump-and-dump scheme allegations — search: "${target} pump dump scheme allegations"
2. Price manipulation & wash trading — search: "${target} price manipulation wash trading evidence"
3. SEC / CFTC / regulatory enforcement — search: "${target} SEC CFTC DOJ regulatory action enforcement"
4. Rug pull, exit scam, developer fraud — search: "${target} rug pull exit scam developer fraud"
5. Coordinated influencer / paid promotion — search: "${target} paid promotion coordinated shilling influencer"
6. Community fraud reports — search: "${target} scam fraud warning community report reddit"
7. Whale / large holder manipulation — search: "${target} whale manipulation large holder insider"
8. Collapse signals & warning signs — search: "${target} collapse warning sign red flag 2024 2025"

REPORTING RULES:
- After all searches, output your findings as a JSON object between <REPORT> and </REPORT> tags
- Include REAL URLs from your web search results — never fabricate URLs
- If a search finds nothing suspicious, record it honestly as a clean result with sources showing absence of evidence
- Severity: info=no issue found, warning=unverified concern, alert=credible allegation, critical=confirmed/enforcement action
- Be precise and evidence-based; do not speculate beyond what sources say

OUTPUT FORMAT:
First, write a short plain-text investigation log (2–4 sentences per search angle, what you searched and what you found). Prefix each section with "🔍 Searching: [topic]" and "📋 Found: [summary]"

After the log, output exactly:
<REPORT>
{
  "target": "${target}",
  "targetType": "${targetType}",
  "generatedAt": "<ISO timestamp>",
  "overallRisk": "clean|suspicious|flagged|critical",
  "riskScore": <0.0-10.0>,
  "executiveSummary": "<2-3 sentence summary>",
  "findings": [
    {
      "category": "<search angle name>",
      "severity": "info|warning|alert|critical",
      "headline": "<one line>",
      "detail": "<1-2 sentences of detail>",
      "sources": [
        { "title": "<page title>", "url": "<real URL>", "source": "<domain>", "date": "<YYYY-MM-DD or year>", "excerpt": "<key quote or description, max 120 chars>" }
      ]
    }
  ],
  "redFlags": ["<specific red flag 1>", ...],
  "mitigatingFactors": ["<factor reducing risk>", ...],
  "conclusion": "<1-2 sentence overall verdict>",
  "searchesRun": ["<list of search queries actually run>"]
}
</REPORT>`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const denied = guardSensitiveRoute(req, 'pump-report-investigate', 6)
  if (denied) return denied

  const apiKey = getProviderKey('anthropic') ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'No Anthropic API key. Set it in Settings → Integrations → AI Providers.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
  const client = new Anthropic({ apiKey })

  let target = '', targetType = 'coin'
  try {
    const body = await req.json()
    target     = body.target     ?? ''
    targetType = body.targetType ?? 'coin'
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  if (!target) return new Response('No target', { status: 400 })

  // Load agent config (respects any overrides saved in AI Agents tab)
  const agentCfg = loadAgentConfig('pump-report-investigator')
  const systemPrompt = agentCfg?.systemPrompt ?? buildSystem(target, targetType)
  const model        = agentCfg?.model        ?? 'claude-sonnet-4-6'
  const temperature  = agentCfg?.temperature  ?? 0.2

  // Inject target into system prompt if it contains a placeholder, else append target context
  const resolvedSystem = systemPrompt.includes('${target}')
    ? systemPrompt.replace(/\$\{target\}/g, target).replace(/\$\{targetType\}/g, targetType)
    : `${systemPrompt}\n\nCurrent investigation target: ${target} (type: ${targetType})`

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: 8000,
          temperature,
          system: resolvedSystem,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
          messages: [{ role: 'user', content: `Begin a full autonomous investigation into: ${target}. Run all 8 search angles and produce the complete evidence report.` }],
          stream: true,
        })

        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode('\n\n<ERROR>Investigation failed — check ANTHROPIC_API_KEY and web_search tool access.</ERROR>'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  })
}
