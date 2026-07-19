import { getProviderKey } from '@/lib/api/live/providers'
import {
  extractTimestamps,
  type VideoAnalyzer,
  type VideoAnalysisRequest,
  type VideoAnalysisResult,
} from '../analyzer'

// Gemini video adapter — the only URL-ingesting provider today.
//
// Uses the NATIVE generateContent endpoint, not the OpenAI-compatible shim the
// agent runner uses: file_data/file_uri parts are native-only, and they are what
// let the model fetch a YouTube URL itself instead of us downloading it.
//
// Key resolution goes through getProviderKey('google'), the same path as the
// LLM providers on the Integrations page, so a Gemini key entered there powers
// both agents and video analysis.

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Flash is the deliberate default. Video is token-heavy — roughly 300 tokens
 * per second at default resolution, 100 at low — so a Pro-tier model turns a
 * routine question into a materially expensive call for little gain on
 * "what did they say about X".
 */
const DEFAULT_MODEL = 'gemini-2.5-flash'

const SYSTEM_PREAMBLE = [
  'You are analysing a finance or crypto video for an analytics platform.',
  'Answer the question directly and concisely.',
  'Cite specific moments as timestamps in MM:SS or HH:MM:SS form inline in your answer,',
  'so the reader can jump straight to them.',
  'If the video does not address the question, say so plainly rather than speculating.',
].join(' ')

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  usageMetadata?: { totalTokenCount?: number }
  error?: { message?: string; status?: string }
}

export const geminiVideoAnalyzer: VideoAnalyzer = {
  id: 'google',
  label: 'Google (Gemini)',
  ingestion: 'url',
  defaultModel: DEFAULT_MODEL,

  isConfigured() {
    return !!getProviderKey('google')
  },

  async analyze(request: VideoAnalysisRequest): Promise<VideoAnalysisResult> {
    const key = getProviderKey('google')
    if (!key) throw new Error('No Google (Gemini) API key configured')

    const model = request.model ?? DEFAULT_MODEL
    const detail = request.detail ?? 'low'

    const res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            // The model fetches this itself — no download on our side.
            { file_data: { file_uri: request.videoUrl } },
            { text: `${SYSTEM_PREAMBLE}\n\nQuestion: ${request.question}` },
          ],
        }],
        generationConfig: {
          mediaResolution: detail === 'low' ? 'MEDIA_RESOLUTION_LOW' : 'MEDIA_RESOLUTION_MEDIUM',
          temperature: 0.2,
        },
      }),
      // Video analysis is slow; well past Next's default expectations.
      signal: AbortSignal.timeout(180_000),
    })

    const data = await res.json().catch(() => ({})) as GeminiResponse

    if (!res.ok) {
      // Surface Gemini's own message — quota, unsupported model and private
      // video all land here and each needs a different fix.
      throw new Error(data.error?.message ?? `Gemini video analysis failed (HTTP ${res.status})`)
    }

    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim()

    if (!text) throw new Error('Gemini returned no analysis for this video')

    return {
      text,
      timestamps: extractTimestamps(text),
      provider: 'google',
      model,
      tokensUsed: data.usageMetadata?.totalTokenCount,
    }
  },
}
