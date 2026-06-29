import { NextRequest, NextResponse } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { runAgent, MissingApiKeyError } from '@/lib/agents/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// POST /api/agents/research
//   { task: string }
//
// Drives the Research & Analysis agent (Agent 2). Single-shot: the user gives a
// research task, the agent gathers data through its tools and returns a
// structured report. Longer token + iteration budget than the chat assistant.
export async function POST(req: NextRequest) {
  let body: { task?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const task = body.task?.trim()
  if (!task) return NextResponse.json({ error: 'task required' }, { status: 400 })

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: task }]

  try {
    const result = await runAgent({
      agentId: 'research-analyst',
      messages,
      origin: new URL(req.url).origin,
      maxTokens: 4096,
      maxIterations: 12,
    })
    return NextResponse.json({ ok: true, report: result.text, toolsUsed: result.toolsUsed })
  } catch (e) {
    if (e instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: 'The research agent is not configured. Add ANTHROPIC_API_KEY to .env.local and restart the dev server.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Agent error' }, { status: 500 })
  }
}
