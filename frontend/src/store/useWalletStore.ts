import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { migrateStorageKey } from '@/lib/utils/storageMigration'

// One-time key migration for the Finance Now rename — runs before any read below.
migrateStorageKey('caep:wallets', 'fn:wallets')


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

  addWatched:       (w: Omit<WatchedWallet, 'id' | 'addedAt'>) => void
  removeWatched:    (id: string) => void
  updateWatchLabel: (id: string, label: string) => void

  addConnected:    (w: Omit<ConnectedWallet, 'id' | 'connectedAt'>) => void
  removeConnected: (id: string) => void
}

function uid() { return Math.random().toString(36).slice(2, 10) }

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      watched:   [],
      connected: [],

      addWatched: (w) => set((s) => ({
        watched: [...s.watched, { ...w, id: uid(), addedAt: new Date().toISOString() }],
      })),
      removeWatched:    (id) => set((s) => ({ watched:   s.watched.filter(w => w.id !== id) })),
      updateWatchLabel: (id, label) => set((s) => ({
        watched: s.watched.map(w => w.id === id ? { ...w, label } : w),
      })),

      addConnected: (w) => set((s) => ({
        connected: [...s.connected, { ...w, id: uid(), connectedAt: new Date().toISOString() }],
      })),
      removeConnected: (id) => set((s) => ({ connected: s.connected.filter(w => w.id !== id) })),

    }),
    {
      name: 'fn:wallets',
      // v1 (historic): stripped exchange API secrets from browser storage once
      // credentials moved server-side.
      //
      // v2 (2026-08-18): exchange API linking was REMOVED entirely on security
      // grounds — an exchange key is the highest-value secret the app held, and
      // it sat in plaintext at rest. This migration drops the `exchanges` array
      // from any persisted state so a stale key preview cannot resurface in a
      // UI that no longer exists. The server-side `.exchange-credentials.json`
      // is not touched by code: it is host-local and gitignored, and deleting a
      // file outside the app's own data is the operator's call, not a
      // migration's. Delete it by hand to complete the removal.
      version: 2,
      migrate: (persisted) => {
        const s = persisted as Record<string, unknown> | undefined
        if (s && 'exchanges' in s) delete s.exchanges
        return s
      },
    },
  ),
)
