import { NextRequest, NextResponse } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { runAgent, MissingApiKeyError } from '@/lib/agents/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/agents/chat
//   { messages: [{ role: 'user'|'assistant', content: string }], pageContext?: { pathname, asset } }
//
// Drives the App Assistant (Agent 1). It has tools for live platform data and
// is given the user's current page as context so it can answer "what am I
// looking at" style questions.
export async function POST(req: NextRequest) {
  let body: {
    messages?: { role: 'user' | 'assistant'; content: string }[]
    pageContext?: { pathname?: string; asset?: string }
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const incoming = body.messages ?? []
  if (incoming.length === 0) return NextResponse.json({ error: 'messages required' }, { status: 400 })

  const messages: Anthropic.MessageParam[] = incoming.map((m) => ({ role: m.role, content: m.content }))

  let systemSuffix: string | undefined
  if (body.pageContext?.pathname) {
    const parts = [`The user is currently on the "${body.pageContext.pathname}" page of the app.`]
    if (body.pageContext.asset) parts.push(`They are viewing the asset: ${body.pageContext.asset}.`)
    systemSuffix = `Current context: ${parts.join(' ')}`
  }

  try {
    const result = await runAgent({
      agentId: 'app-assistant',
      messages,
      origin: new URL(req.url).origin,
      systemSuffix,
      maxTokens: 1536,
    })
    return NextResponse.json({ ok: true, reply: result.text, toolsUsed: result.toolsUsed })
  } catch (e) {
    if (e instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: 'The assistant is not configured. Add ANTHROPIC_API_KEY to .env.local and restart the dev server.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Agent error' }, { status: 500 })
  }
}
