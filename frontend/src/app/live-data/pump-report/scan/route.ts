import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { guardSensitiveRoute } from '@/lib/server/apiGuard'
import { getProviderKey } from '@/lib/api/live/providers'

export const dynamic = 'force-dynamic'

export interface ScanTarget {
  type: 'coin' | 'wallet' | 'site'
  id: string
  label: string
}

export interface ScanFinding {
  target: ScanTarget
  summary: string
  riskLevel: 'clean' | 'suspicious' | 'flagged' | 'critical' | 'error'
  evidence: string[]
  sources: string[]
  scannedAt: string
}

export interface ScanResponse {
  ok: boolean
  findings: ScanFinding[]
  scanId: string
  completedAt: string
}

async function scanTarget(target: ScanTarget, client: Anthropic): Promise<ScanFinding> {
  const query =
    target.type === 'coin'
      ? `pump and dump scheme "${target.label}" cryptocurrency fraud scam allegations 2023 2024 2025`
      : target.type === 'wallet'
      ? `cryptocurrency wallet address "${target.id}" fraud scam pump dump flagged`
      : `website "${target.label}" cryptocurrency scam fraud pump dump scheme`

  const systemPrompt = `You are a crypto fraud intelligence analyst. Your job is to assess pump-and-dump schemes,
rug pulls, wash trading, and collapse risk. Be precise and evidence-based. Only report what you actually find.
If you find no evidence of misconduct, say so clearly. Never invent findings.`

  const userPrompt = `Search the internet for evidence of pump-and-dump activity, fraud allegations, scam reports,
rug pull accusations, SEC enforcement, or collapse risk for: ${target.type.toUpperCase()} — "${target.label}" ${target.type === 'wallet' ? `(address: ${target.id})` : ''}.

Return a JSON object with this exact shape:
{
  "summary": "1-2 sentence summary of what you found",
  "riskLevel": "clean" | "suspicious" | "flagged" | "critical",
  "evidence": ["specific finding 1", "specific finding 2", ...],
  "sources": ["source URL or description 1", ...]
}

Risk level guide:
- clean: no credible allegations found
- suspicious: minor red flags or unverified claims
- flagged: credible reports, enforcement action, or clear manipulation patterns
- critical: confirmed fraud, active scam, or imminent collapse risk`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [{ role: 'user', content: userPrompt }],
    })

    // Extract the text content from the response
    let text = ''
    for (const block of response.content) {
      if (block.type === 'text') text += block.text
    }

    // Parse JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        target,
        summary: parsed.summary ?? 'No summary available.',
        riskLevel: parsed.riskLevel ?? 'clean',
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        scannedAt: new Date().toISOString(),
      }
    }
    throw new Error('No JSON in response')
  } catch (err) {
    return {
      target,
      summary: 'Scan could not be completed for this target.',
      riskLevel: 'error', // a failed scan must not read as a clean verdict
      evidence: [],
      sources: [],
      scannedAt: new Date().toISOString(),
    }
  }
}

export async function POST(req: NextRequest) {
  const denied = guardSensitiveRoute(req, 'pump-report-scan', 6)
  if (denied) return denied

  const apiKey = getProviderKey('anthropic') ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'No Anthropic API key. Set it in Settings → Integrations → AI Providers.' }, { status: 500 })
  }
  const client = new Anthropic({ apiKey })

  let targets: ScanTarget[] = []
  try {
    const body = await req.json()
    targets = body.targets ?? []
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  if (targets.length === 0) {
    return NextResponse.json({ ok: false, error: 'No targets provided' }, { status: 400 })
  }

  // Cap to 5 targets per scan to keep latency reasonable
  const capped = targets.slice(0, 5)

  const findings = await Promise.allSettled(capped.map((t) => scanTarget(t, client)))

  const results: ScanFinding[] = findings.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          target: capped[i],
          summary: 'Scan failed for this target.',
          riskLevel: 'error' as const,
          evidence: [],
          sources: [],
          scannedAt: new Date().toISOString(),
        }
  )

  return NextResponse.json({
    ok: true,
    findings: results,
    scanId: `scan_${Date.now()}`,
    completedAt: new Date().toISOString(),
  } satisfies ScanResponse)
}
