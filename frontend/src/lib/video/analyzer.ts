// Provider-agnostic video analysis.
//
// The contract every adapter implements, plus the registry that picks one. Add
// a provider by writing an adapter and registering it in ./adapters — nothing
// else in the app needs to change.
//
// IMPORTANT CAPABILITY NOTE
// "Models that can process video" is not one capability, it is two, and they
// differ enormously in cost to implement:
//
//   1. URL ingestion — hand the model a YouTube URL and it fetches, decodes and
//      reasons over the audio + visual streams itself. Today Gemini is the only
//      provider that does this, and only through its NATIVE API. The app's
//      existing agent runner talks to Gemini via its OpenAI-compatible shim
//      (runner.ts), which does NOT support it — hence a separate adapter here.
//
//   2. Frame ingestion — the caller downloads the video, extracts frames and
//      sends them as images. GPT/Claude-class vision models work this way. It
//      needs a download-and-decode pipeline the app does not have, and pulling
//      video files down from YouTube is its own licensing question. Adapters
//      declare `ingestion: 'frames'` so the registry can skip them until that
//      pipeline exists, rather than failing at call time.
//
// The registry therefore selects on capability, not on provider name.

export type VideoIngestion = 'url' | 'frames'

export interface VideoAnalysisRequest {
  /** Public video URL. Adapters that need an id parse it themselves. */
  videoUrl: string
  /** What to ask about the video. */
  question: string
  /** Override the adapter's default model. */
  model?: string
  /**
   * Lower detail costs roughly a third of the tokens (~100/sec of video versus
   * ~300/sec) at some loss of visual nuance. Default 'low': for "what was said
   * about rate cuts" the audio track carries the answer.
   */
  detail?: 'low' | 'default'
}

/** A moment the model pointed at, for deep-linking back into the video. */
export interface VideoTimestamp {
  /** Seconds from start. */
  seconds: number
  /** As the model wrote it, e.g. "12:04". */
  label: string
}

export interface VideoAnalysisResult {
  text: string
  timestamps: VideoTimestamp[]
  provider: string
  model: string
  /** Absent when the provider does not report usage. */
  tokensUsed?: number
}

export interface VideoAnalyzer {
  /** Matches the provider id in providers.ts, so keys resolve consistently. */
  id: string
  label: string
  ingestion: VideoIngestion
  defaultModel: string
  /** False when no API key is configured — the caller shows a setup notice. */
  isConfigured(): boolean
  analyze(request: VideoAnalysisRequest): Promise<VideoAnalysisResult>
}

/** Thrown when no capable, configured provider is available. */
export class NoVideoAnalyzerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoVideoAnalyzerError'
  }
}

/**
 * Parse "MM:SS" / "HH:MM:SS" references out of model prose.
 *
 * Models are asked to cite moments inline rather than in a structured field,
 * because structured output support varies by provider and this has to work
 * across all of them. Shared here so every adapter reports timestamps the same
 * way.
 */
export function extractTimestamps(text: string): VideoTimestamp[] {
  const seen = new Set<string>()
  const out: VideoTimestamp[] = []

  for (const m of text.matchAll(/\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/g)) {
    const label = m[0]
    if (seen.has(label)) continue

    const hours = m[1] ? parseInt(m[1], 10) : 0
    const minutes = parseInt(m[2], 10)
    const secs = parseInt(m[3], 10)
    if (secs > 59 || (m[1] && minutes > 59)) continue // not a timecode

    seen.add(label)
    out.push({ seconds: hours * 3600 + minutes * 60 + secs, label })
  }
  return out
}

/** Append a `t=` deep link so a cited moment is one click away. */
export function withTimestamp(videoUrl: string, seconds: number): string {
  const url = new URL(videoUrl)
  url.searchParams.set('t', `${Math.max(0, Math.floor(seconds))}s`)
  return url.toString()
}
