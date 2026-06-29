import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { loadAgentConfig } from '@/lib/agents/config'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

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
