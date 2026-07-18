import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// Server-side store for exchange API credentials. Secrets never leave the
// server: the client references connections by id and only ever sees metadata
// plus a short key preview. Same file-based pattern as .provider-config.json.

export interface StoredExchangeConnection {
  id:        string
  label:     string
  exchange:  string
  apiKey:    string
  apiSecret: string
  addedAt:   string
}

/** What the client is allowed to see. */
export interface ExchangeConnectionMeta {
  id:         string
  label:      string
  exchange:   string
  keyPreview: string
  addedAt:    string
}

const STORE_PATH = path.join(process.cwd(), '.exchange-credentials.json')

function readStore(): StoredExchangeConnection[] {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
      if (Array.isArray(raw.connections)) return raw.connections
    }
  } catch {}
  return []
}

function writeStore(connections: StoredExchangeConnection[]): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ connections }, null, 2), { encoding: 'utf8', mode: 0o600 })
}

function toMeta(c: StoredExchangeConnection): ExchangeConnectionMeta {
  return {
    id:         c.id,
    label:      c.label,
    exchange:   c.exchange,
    keyPreview: c.apiKey.slice(0, 8),
    addedAt:    c.addedAt,
  }
}

export function listExchangeConnections(): ExchangeConnectionMeta[] {
  return readStore().map(toMeta)
}

export function addExchangeConnection(
  input: { label: string; exchange: string; apiKey: string; apiSecret: string }
): ExchangeConnectionMeta {
  const conn: StoredExchangeConnection = {
    id:        crypto.randomUUID(),
    label:     input.label,
    exchange:  input.exchange,
    apiKey:    input.apiKey,
    apiSecret: input.apiSecret,
    addedAt:   new Date().toISOString(),
  }
  writeStore([...readStore(), conn])
  return toMeta(conn)
}

export function removeExchangeConnection(id: string): boolean {
  const all = readStore()
  const remaining = all.filter(c => c.id !== id)
  if (remaining.length === all.length) return false
  writeStore(remaining)
  return true
}

/** Server-internal only — never expose the result to the client. */
export function getExchangeConnection(id: string): StoredExchangeConnection | undefined {
  return readStore().find(c => c.id === id)
}
