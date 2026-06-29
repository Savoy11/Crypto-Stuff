// Server-side helper — reads agent config merging defaults with .agent-prompts.json overrides.
// Safe to import in route handlers only (uses 'fs'); do NOT import from client components.

import fs from 'fs'
import path from 'path'
import { AGENT_DEFAULTS, type AgentDefault } from './prompts'

const OVERRIDE_FILE = path.join(process.cwd(), '.agent-prompts.json')

type Overrides = Record<string, Partial<AgentDefault> & { updatedAt?: string }>

function readOverrides(): Overrides {
  try {
    const raw = fs.readFileSync(OVERRIDE_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function writeOverrides(data: Overrides) {
  fs.writeFileSync(OVERRIDE_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

/** Return the merged (default + override) config for a single agent id. */
export function loadAgentConfig(id: string): (AgentDefault & { isCustomized: boolean; updatedAt?: string }) | null {
  const def = AGENT_DEFAULTS.find(a => a.id === id)
  if (!def) return null
  const overrides = readOverrides()
  const ov = overrides[id] ?? {}
  const { updatedAt, ...rest } = ov
  return { ...def, ...rest, isCustomized: Object.keys(rest).length > 0, updatedAt }
}

/** Return all agents merged with overrides. */
export function loadAllAgentConfigs() {
  const overrides = readOverrides()
  return AGENT_DEFAULTS.map(def => {
    const ov = overrides[def.id] ?? {}
    const { updatedAt, ...rest } = ov
    return { ...def, ...rest, isCustomized: Object.keys(rest).length > 0, updatedAt }
  })
}

/** Save an override for one agent. */
export function saveAgentOverride(id: string, patch: Partial<AgentDefault>) {
  const def = AGENT_DEFAULTS.find(a => a.id === id)
  if (!def) throw new Error(`Unknown agent: ${id}`)
  const overrides = readOverrides()
  overrides[id] = { ...patch, updatedAt: new Date().toISOString() }
  writeOverrides(overrides)
}

/** Remove any override for one agent (resets to default). */
export function resetAgentOverride(id: string) {
  const overrides = readOverrides()
  delete overrides[id]
  writeOverrides(overrides)
}
