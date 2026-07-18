import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { loadAgentConfig } from '@/lib/agents/config'
import { guardSensitiveRoute } from '@/lib/server/apiGuard'
import { getProviderKey } from '@/lib/api/live/providers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const denied = guardSensitiveRoute(req, 'pump-report-chat', 20)
  if (denied) return denied

  // UI-saved key (Integrations → AI Providers) or ANTHROPIC_API_KEY env var
  const apiKey = getProviderKey('anthropic') ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'No Anthropic API key. Set it in Settings → Integrations → AI Providers.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
  const client = new Anthropic({ apiKey })

  let messages: Anthropic.MessageParam[] = []
  let context = ''
  try {
    const body = await req.json()
    messages = body.messages ?? []
    context  = body.context  ?? ''
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // Load agent config — picks up any overrides saved from the AI Agents tab
  const agentCfg   = loadAgentConfig('pump-report-chat')
  const baseSystem = agentCfg?.systemPrompt ?? ''
  const model      = agentCfg?.model        ?? 'claude-sonnet-4-6'
  const temperature = agentCfg?.temperature ?? 0.3

  const systemWithContext = context
    ? `${baseSystem}\n\n## Current investigation context:\n${context}`
    : baseSystem

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: 2048,
          temperature,
          system: systemWithContext,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
          messages,
          stream: true,
        })

        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } catch {
        controller.enqueue(encoder.encode('\n\n[Agent error — please try again]'))
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
