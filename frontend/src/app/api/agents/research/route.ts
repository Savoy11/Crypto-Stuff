import { NextRequest, NextResponse } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { runAgent, MissingApiKeyError, AgentDisabledError } from '@/lib/agents/runner'
import { guardSensitiveRoute } from '@/lib/server/apiGuard'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Research/scan agents the user may target. Whitelisted so the client can't
// invoke an arbitrary agent id.
const RESEARCH_AGENTS = new Set(['research-analyst', 'equity-research', 'equity-screener'])

// POST /api/agents/research
//   { task: string }
//
// Drives the Research & Analysis agent (Agent 2). Single-shot: the user gives a
// research task, the agent gathers data through its tools and returns a
// structured report. Longer token + iteration budget than the chat assistant.
export async function POST(req: NextRequest) {
  const denied = guardSensitiveRoute(req, 'agents-research', 6)
  if (denied) return denied

  let body: { task?: string; agentId?: string; watchlist?: { terms: string[]; labels: string[] } }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const task = body.task?.trim()
  if (!task) return NextResponse.json({ error: 'task required' }, { status: 400 })

  const agentId = body.agentId && RESEARCH_AGENTS.has(body.agentId) ? body.agentId : 'research-analyst'

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: task }]

  try {
    // Forwarded from the client — the server can't read localStorage.
    const result = await runAgent({
      watchlist: body.watchlist,
      agentId,
      messages,
      origin: new URL(req.url).origin,
      maxTokens: 4096,
      maxIterations: 12,
      webSearchMaxUses: 8, // research does multi-angle web lookups
    })
    return NextResponse.json({ ok: true, report: result.text, toolsUsed: result.toolsUsed, agentId })
  } catch (e) {
    if (e instanceof MissingApiKeyError || e instanceof AgentDisabledError) {
      return NextResponse.json({ error: e.message }, { status: 503 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Agent error' }, { status: 500 })
  }
}
