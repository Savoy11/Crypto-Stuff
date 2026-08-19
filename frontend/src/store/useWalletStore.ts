import { create } from 'zustand'
import { toast } from 'react-hot-toast'
import { migrateStorageKey } from '@/lib/utils/storageMigration'
import type { WalletsResponse } from '@/app/api/user/wallets/route'

// One-time key migration for the Finance Now rename — runs before any read below.
migrateStorageKey('caep:wallets', 'fn:wallets')

// ─── DB-backed wallet store (NT3, 2026-08-18) ────────────────────────────────
// Wallets persist to Postgres via /api/user/wallets — the last user data to
// leave browser storage, closing the set portfolios, watchlists and builder
// plans started. Same optimistic pattern as useWatchlistStore: a mutation
// updates local state at once and syncs in the background; a failed sync toasts
// and re-hydrates so the UI converges back to the server's truth.
//
// Ids are client-generated UUIDs the API accepts on create, so the row added
// optimistically IS the row the server creates.
//
// localStorage keeps ONE role: `fn:wallets` is legacy, imported once and then
// renamed so the import cannot repeat. It is no longer written to.


// ─── Chain metadata ────────────────────────────────────────────────────────────

export type ChainId =
  | 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc' | 'avalanche'
  | 'solana' | 'bitcoin' | 'xrp' | 'tron'

export const CHAIN_META: Record<ChainId, { label: string; symbol: string; color: string; type: 'evm' | 'sol' | 'btc' | 'xrp' | 'tron' }> = {
  ethereum:  { label: 'Ethereum',       symbol: 'ETH',  color: '#627EEA', type: 'evm' },
  polygon:   { label: 'Polygon',        symbol: 'POL',  color: '#8247E5', type: 'evm' },
  arbitrum:  { label: 'Arbitrum One',   symbol: 'ETH',  color: '#28A0F0', type: 'evm' },
  base:      { label: 'Base',           symbol: 'ETH',  color: '#0052FF', type: 'evm' },
  optimism:  { label: 'Optimism',       symbol: 'ETH',  color: '#FF0420', type: 'evm' },
  bsc:       { label: 'BNB Chain',      symbol: 'BNB',  color: '#F3BA2F', type: 'evm' },
  avalanche: { label: 'Avalanche',      symbol: 'AVAX', color: '#E84142', type: 'evm' },
  solana:    { label: 'Solana',         symbol: 'SOL',  color: '#9945FF', type: 'sol' },
  bitcoin:   { label: 'Bitcoin',        symbol: 'BTC',  color: '#F7931A', type: 'btc' },
  xrp:       { label: 'XRP Ledger',     symbol: 'XRP',  color: '#23292F', type: 'xrp' },
  tron:      { label: 'TRON',           symbol: 'TRX',  color: '#EC0928', type: 'tron' },
}

export const EVM_CHAINS: ChainId[] = ['ethereum', 'polygon', 'arbitrum', 'base', 'optimism', 'bsc', 'avalanche']
export const ALL_CHAINS   = Object.keys(CHAIN_META) as ChainId[]

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WatchedWallet {
  id:       string
  label:    string
  address:  string
  chain:    ChainId
  addedAt:  string
}

export interface ConnectedWallet {
  id:          string
  label:       string
  address:     string
  chain:       'ethereum' | 'solana'
  provider:    'metamask' | 'phantom' | 'coinbase-wallet' | 'walletconnect'
  connectedAt: string
}

// ─── Store ─────────────────────────────────────────────────────────────────────

interface WalletState {
  watched:   WatchedWallet[]
  connected: ConnectedWallet[]
  /** True once the first server answer (or failure) has arrived. */
  hydrated:  boolean
  /** Set when the server can't be reached — the page shows an honest banner. */
  syncError: string | null

  addWatched:       (w: Omit<WatchedWallet, 'id' | 'addedAt'>) => void
  removeWatched:    (id: string) => void
  updateWatchLabel: (id: string, label: string) => void

  addConnected:    (w: Omit<ConnectedWallet, 'id' | 'connectedAt'>) => void
  removeConnected: (id: string) => void
}

/**
 * Client-side UUID. crypto.randomUUID is available in every browser this app
 * supports; the fallback exists for non-secure contexts (plain http on a LAN
 * host), where it is undefined and the store would otherwise throw on first add.
 */
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

async function api(path: string, init?: RequestInit): Promise<WalletsResponse> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json
}

export const useWalletStore = create<WalletState>()((set, get) => ({
  watched:   [],
  connected: [],
  hydrated:  false,
  syncError: null,

  addWatched: (w) => {
    const row: WatchedWallet = { ...w, id: uuid(), addedAt: new Date().toISOString() }
    set((s) => ({ watched: [...s.watched, row] }))
    api('/api/user/wallets', {
      method: 'POST',
      body: JSON.stringify({ id: row.id, kind: 'watched', address: row.address, chain: row.chain, label: row.label }),
    }).catch((e: Error) => {
      toast.error(`Address not saved: ${e.message}`)
      set((s) => ({ watched: s.watched.filter((x) => x.id !== row.id) }))
    })
  },

  removeWatched: (id) => {
    const prev = get().watched
    set({ watched: prev.filter((w) => w.id !== id) })
    api(`/api/user/wallets/${id}`, { method: 'DELETE' }).catch((e: Error) => {
      toast.error(`Delete not saved: ${e.message}`)
      set({ watched: prev })
    })
  },

  updateWatchLabel: (id, label) => {
    const prev = get().watched
    set({ watched: prev.map((w) => (w.id === id ? { ...w, label } : w)) })
    api(`/api/user/wallets/${id}`, { method: 'PATCH', body: JSON.stringify({ label }) }).catch((e: Error) => {
      toast.error(`Rename not saved: ${e.message}`)
      set({ watched: prev })
    })
  },

  addConnected: (w) => {
    const row: ConnectedWallet = { ...w, id: uuid(), connectedAt: new Date().toISOString() }
    set((s) => ({ connected: [...s.connected, row] }))
    api('/api/user/wallets', {
      method: 'POST',
      body: JSON.stringify({
        id: row.id, kind: 'connected', address: row.address, chain: row.chain,
        label: row.label, provider: row.provider,
      }),
    }).catch((e: Error) => {
      toast.error(`Connection not saved: ${e.message}`)
      set((s) => ({ connected: s.connected.filter((x) => x.id !== row.id) }))
    })
  },

  removeConnected: (id) => {
    const prev = get().connected
    set({ connected: prev.filter((w) => w.id !== id) })
    api(`/api/user/wallets/${id}`, { method: 'DELETE' }).catch((e: Error) => {
      toast.error(`Delete not saved: ${e.message}`)
      set({ connected: prev })
    })
  },
}))

// ─── Hydration + one-time legacy import ──────────────────────────────────────

const LEGACY_KEY = 'fn:wallets'

interface LegacyPersisted {
  state?: { watched?: WatchedWallet[]; connected?: ConnectedWallet[] }
}

/**
 * Wallets saved in this browser before persistence landed.
 *
 * Legacy ids were 8-char random strings, not UUIDs, so they are dropped and the
 * server assigns fresh ones — same as the watchlist import. Connected wallets
 * are imported too: a browser connection the user re-authorises anyway is still
 * a record of an address they care about, and dropping it would silently empty
 * a tab they had populated.
 */
function readLegacy(): Array<Record<string, unknown>> {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LegacyPersisted
    const out: Array<Record<string, unknown>> = []
    for (const w of parsed.state?.watched ?? []) {
      if (w?.address && w?.chain) out.push({ kind: 'watched', address: w.address, chain: w.chain, label: w.label ?? '' })
    }
    for (const c of parsed.state?.connected ?? []) {
      if (c?.address && c?.chain && c?.provider) {
        out.push({ kind: 'connected', address: c.address, chain: c.chain, label: c.label ?? '', provider: c.provider })
      }
    }
    return out
  } catch {
    return []
  }
}

function retireLegacyKey() {
  try {
    const val = localStorage.getItem(LEGACY_KEY)
    if (val != null) {
      localStorage.setItem(`${LEGACY_KEY}:imported`, val)
      localStorage.removeItem(LEGACY_KEY)
    }
  } catch { /* quota or private mode — the import simply repeats next visit */ }
}

let hydrating: Promise<void> | null = null

/** Split the server's flat wallet list back into the two shapes the UI uses. */
function partition(wallets: NonNullable<WalletsResponse['wallets']>) {
  const watched: WatchedWallet[] = []
  const connected: ConnectedWallet[] = []
  for (const w of wallets) {
    if (w.kind === 'connected') {
      connected.push({
        id: w.id, label: w.label, address: w.address,
        chain: w.chain as ConnectedWallet['chain'],
        provider: (w.provider ?? 'metamask') as ConnectedWallet['provider'],
        connectedAt: w.createdAt,
      })
    } else {
      watched.push({ id: w.id, label: w.label, address: w.address, chain: w.chain as ChainId, addedAt: w.createdAt })
    }
  }
  return { watched, connected }
}

/**
 * Load wallets from the server. Call from a consumer's mount effect —
 * concurrent calls share one request; force=true re-fetches (used to converge
 * after a failed mutation).
 *
 * The legacy import runs on first hydration even when the account already has
 * wallets: each browser's saved addresses merge in additively, since another
 * device having written first must not discard this browser's list. It does
 * NOT run when the server is unreachable — importing on error would fork the
 * data into two divergent copies.
 */
export function hydrateWallets(force = false): Promise<void> {
  const store = useWalletStore
  if (hydrating) return hydrating
  if (store.getState().hydrated && !force) return Promise.resolve()

  hydrating = (async () => {
    try {
      let { wallets } = await api('/api/user/wallets')
      const legacy = readLegacy()
      if (legacy.length > 0) {
        ;({ wallets } = await api('/api/user/wallets', { method: 'POST', body: JSON.stringify({ wallets: legacy }) }))
        retireLegacyKey()
        toast.success(`Imported ${legacy.length} wallet${legacy.length > 1 ? 's' : ''} saved in this browser`)
      }
      store.setState({ ...partition(wallets ?? []), hydrated: true, syncError: null })
    } catch (e) {
      store.setState({ hydrated: true, syncError: e instanceof Error ? e.message : 'Wallets unavailable' })
    } finally {
      hydrating = null
    }
  })()
  return hydrating
}
