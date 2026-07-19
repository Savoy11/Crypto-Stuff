import { geminiVideoAnalyzer } from './adapters/gemini'
import { NoVideoAnalyzerError, type VideoAnalyzer, type VideoIngestion } from './analyzer'

export * from './analyzer'

/**
 * Every known video analyzer, in preference order.
 *
 * To add a provider: write an adapter implementing VideoAnalyzer and append it
 * here. Nothing else changes — routes and UI select by capability, never by
 * provider name.
 *
 * Currently one entry, and that is a statement about the ecosystem rather than
 * an unfinished list. Gemini is the only provider that ingests a video URL
 * directly. GPT- and Claude-class vision models accept frames, not videos, so
 * an adapter for them needs a download-extract-encode pipeline this app does
 * not have — and downloading YouTube media raises licensing questions worth
 * answering deliberately rather than by accident. Those adapters would declare
 * ingestion: 'frames' and be filtered out by getVideoAnalyzers() until that
 * pipeline exists.
 */
const ANALYZERS: VideoAnalyzer[] = [
  geminiVideoAnalyzer,
]

/** Ingestion modes the app can actually service today. */
const SUPPORTED_INGESTION: VideoIngestion[] = ['url']

/** Analyzers that are both capable and configured. */
export function getVideoAnalyzers(): VideoAnalyzer[] {
  return ANALYZERS.filter(
    (a) => SUPPORTED_INGESTION.includes(a.ingestion) && a.isConfigured()
  )
}

/** Every registered analyzer, configured or not — for describing setup state in UI. */
export function listVideoAnalyzers(): Array<{
  id: string
  label: string
  ingestion: VideoIngestion
  configured: boolean
  supported: boolean
}> {
  return ANALYZERS.map((a) => ({
    id: a.id,
    label: a.label,
    ingestion: a.ingestion,
    configured: a.isConfigured(),
    supported: SUPPORTED_INGESTION.includes(a.ingestion),
  }))
}

/**
 * Pick an analyzer, optionally by provider id.
 *
 * Throws NoVideoAnalyzerError with a message that distinguishes "nothing is
 * set up" from "the one you asked for isn't", since the fixes differ.
 */
export function selectVideoAnalyzer(providerId?: string): VideoAnalyzer {
  const available = getVideoAnalyzers()

  if (providerId) {
    const match = available.find((a) => a.id === providerId)
    if (match) return match
    const known = ANALYZERS.find((a) => a.id === providerId)
    throw new NoVideoAnalyzerError(
      known
        ? `${known.label} is registered but not configured — add its API key under Integrations → AI Providers.`
        : `Unknown video analysis provider "${providerId}".`
    )
  }

  if (available.length === 0) {
    throw new NoVideoAnalyzerError(
      'No video-capable AI provider is configured. Gemini is currently the only model that can read a video from a URL — add a Google (Gemini) key under Integrations → AI Providers.'
    )
  }
  return available[0]
}
