import { NextRequest, NextResponse } from 'next/server'
import { loadAllAgentConfigs, saveAgentOverride, resetAgentOverride } from '@/lib/agents/config'
import { PROVIDERS, PROVIDER_MODELS } from '@/lib/agents/prompts'

export const dynamic = 'force-dynamic'

// GET — returns all agent configs (defaults merged with overrides) + provider/model options
export async function GET() {
  try {
    const agents = loadAllAgentConfigs()
    return NextResponse.json({ agents, providers: PROVIDERS, providerModels: PROVIDER_MODELS })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST — save or reset an agent config
// Body: { id, action: 'save', provider, model, temperature, systemPrompt }
//    or { id, action: 'reset' }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, action } = body

    if (!id || !action) {
      return NextResponse.json({ error: 'id and action are required' }, { status: 400 })
    }

    if (action === 'reset') {
      resetAgentOverride(id)
      const agents = loadAllAgentConfigs()
      return NextResponse.json({ ok: true, agents })
    }

    if (action === 'save') {
      const { provider, model, temperature, systemPrompt } = body
      saveAgentOverride(id, { provider, model, temperature, systemPrompt })
      const agents = loadAllAgentConfigs()
      return NextResponse.json({ ok: true, agents })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
