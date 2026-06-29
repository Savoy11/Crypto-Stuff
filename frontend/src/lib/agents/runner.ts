import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { AGENT_TOOLS, runTool } from './tools'
import { type ProviderId } from './prompts'
import { loadAgentConfig } from './config'

// Alias so existing call-sites below don't need renaming
const getAgentConfig = loadAgentConfig

// ─── Shared agent loop ────────────────────────────────────────────────────────

export interface AgentRunResult {
  text: string
  toolsUsed: { name: string; input: unknown }[]
  stopReason: string | null
}

const PROVIDER_ENV_VARS: Record<ProviderId, string> = {
  anthropic:  'ANTHROPIC_API_KEY',
  openai:     'OPENAI_API_KEY',
  google:     'GOOGLE_API_KEY',
  mistral:    'MISTRAL_API_KEY',
  groq:       'GROQ_API_KEY',
  xai:        'XAI_API_KEY',
  deepseek:   'DEEPSEEK_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  together:   'TOGETHER_API_KEY',
  cohere:     'COHERE_API_KEY',
}

const PROVIDER_BASE_URLS: Partial<Record<ProviderId, string>> = {
  google:     'https://generativelanguage.googleapis.com/v1beta/openai/',
  mistral:    'https://api.mistral.ai/v1',
  groq:       'https://api.groq.com/openai/v1',
  xai:        'https://api.x.ai/v1',
  deepseek:   'https://api.deepseek.com/v1',
  perplexity: 'https://api.perplexity.ai',
  together:   'https://api.together.xyz/v1',
  cohere:     'https://api.cohere.com/compatibility/v1',
}

export class MissingApiKeyError extends Error {
  constructor(provider: ProviderId) {
    const envVar = PROVIDER_ENV_VARS[provider] ?? `${provider.toUpperCase()}_API_KEY`
    super(`${envVar} is not set`)
    this.name = 'MissingApiKeyError'
  }
}

export interface RunAgentOptions {
  agentId: string
  messages: Anthropic.MessageParam[]
  origin: string
  systemSuffix?: string
  maxTokens?: number
  maxIterations?: number
}

// ─── Anthropic runner ─────────────────────────────────────────────────────────

async function runAgentAnthropic(
  cfg: ReturnType<typeof getAgentConfig> & object,
  opts: RunAgentOptions,
): Promise<AgentRunResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new MissingApiKeyError('anthropic')

  const client = new Anthropic({ apiKey })
  const system = opts.systemSuffix ? `${cfg.systemPrompt}\n\n${opts.systemSuffix}` : cfg.systemPrompt
  const messages: Anthropic.MessageParam[] = [...opts.messages]
  const toolsUsed: { name: string; input: unknown }[] = []
  const maxIterations = opts.maxIterations ?? 8
  let stopReason: string | null = null

  for (let i = 0; i < maxIterations; i++) {
    const response = await client.messages.create({
      model: cfg.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: cfg.temperature,
      system,
      tools: AGENT_TOOLS,
      messages,
    })
    stopReason = response.stop_reason
    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
      return { text, toolsUsed, stopReason }
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    )
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        toolsUsed.push({ name: tu.name, input: tu.input })
        const result = await runTool(tu.name, tu.input as Record<string, unknown>, opts.origin)
        return { type: 'tool_result' as const, tool_use_id: tu.id, content: JSON.stringify(result) }
      })
    )
    messages.push({ role: 'user', content: toolResults })
  }

  return { text: 'I reached the maximum number of steps before finishing. Please narrow the question and try again.', toolsUsed, stopReason }
}

// ─── OpenAI/Gemini runner ─────────────────────────────────────────────────────

/** Convert Anthropic-style tool definitions to OpenAI function-calling format. */
function toOpenAITools(tools: Anthropic.Tool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }))
}

/** Convert incoming Anthropic-style messages to OpenAI chat messages. */
function toOpenAIMessages(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ]
  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role as 'user' | 'assistant', content: m.content })
    } else if (Array.isArray(m.content)) {
      // Flatten content blocks to string for simplicity
      const text = m.content
        .filter((b): b is Anthropic.TextBlockParam => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
      if (text) out.push({ role: m.role as 'user' | 'assistant', content: text })
    }
  }
  return out
}

async function runAgentOpenAI(
  cfg: ReturnType<typeof getAgentConfig> & object,
  opts: RunAgentOptions,
  provider: ProviderId,
): Promise<AgentRunResult> {
  const envVar = PROVIDER_ENV_VARS[provider]
  const apiKey = process.env[envVar]
  if (!apiKey) throw new MissingApiKeyError(provider)

  const baseURL = PROVIDER_BASE_URLS[provider]
  const client = new OpenAI({ apiKey, ...(baseURL && { baseURL }) })

  const system = opts.systemSuffix ? `${cfg.systemPrompt}\n\n${opts.systemSuffix}` : cfg.systemPrompt
  const openaiTools = toOpenAITools(AGENT_TOOLS)
  const toolsUsed: { name: string; input: unknown }[] = []
  const maxIterations = opts.maxIterations ?? 8
  let stopReason: string | null = null

  // Build the initial message list
  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = toOpenAIMessages(system, opts.messages)

  for (let i = 0; i < maxIterations; i++) {
    const response = await client.chat.completions.create({
      model: cfg.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: cfg.temperature,
      tools: openaiTools,
      messages: chatMessages,
    })

    const choice = response.choices[0]
    stopReason = choice.finish_reason ?? null
    const assistantMsg = choice.message
    chatMessages.push(assistantMsg)

    if (choice.finish_reason !== 'tool_calls' || !assistantMsg.tool_calls?.length) {
      return { text: assistantMsg.content?.trim() ?? '', toolsUsed, stopReason }
    }

    // Execute all tool calls in parallel
    const toolResultMessages = await Promise.all(
      assistantMsg.tool_calls.map(async (tc) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fn = (tc as any).function as { name: string; arguments: string }
        const input = JSON.parse(fn.arguments || '{}')
        toolsUsed.push({ name: fn.name, input })
        const result = await runTool(fn.name, input, opts.origin)
        return {
          role: 'tool' as const,
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        }
      })
    )
    chatMessages.push(...toolResultMessages)
  }

  return { text: 'I reached the maximum number of steps before finishing. Please narrow the question and try again.', toolsUsed, stopReason }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function runAgent(opts: RunAgentOptions): Promise<AgentRunResult> {
  const cfg = getAgentConfig(opts.agentId)
  if (!cfg) throw new Error(`Unknown agent: ${opts.agentId}`)

  if (cfg.provider === 'anthropic') return runAgentAnthropic(cfg, opts)
  return runAgentOpenAI(cfg, opts, cfg.provider)
}
