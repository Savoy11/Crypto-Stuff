import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

export type ExchangeId = 'binance' | 'coinbase' | 'kraken' | 'okx' | 'bybit'

export const EXCHANGE_META: Record<ExchangeId, { label: string; color: string; website: string }> = {
  binance:  { label: 'Binance.US', color: '#F3BA2F', website: 'https://binance.us' },
  coinbase: { label: 'Coinbase', color: '#0052FF', website: 'https://coinbase.com' },
  kraken:   { label: 'Kraken',   color: '#5741D9', website: 'https://kraken.com'   },
  okx:      { label: 'OKX',      color: '#1A1A1A', website: 'https://okx.com'      },
  bybit:    { label: 'Bybit',    color: '#F7A600', website: 'https://bybit.com'    },
}

// Credentials live server-side only (.exchange-credentials.json via
// /live-data/wallet/exchange-connections). The browser keeps metadata and a
// short key preview — never the API secret.
export interface ExchangeConnection {
  id:         string
  label:      string
  exchange:   ExchangeId
  keyPreview: string
  addedAt:    string
}

export interface NewExchangeConnection {
  label:     string
  exchange:  ExchangeId
  apiKey:    string
  apiSecret: string
}

// ─── Store ─────────────────────────────────────────────────────────────────────

interface WalletState {
  watched:   WatchedWallet[]
  connected: ConnectedWallet[]
  exchanges: ExchangeConnection[]

  addWatched:       (w: Omit<WatchedWallet, 'id' | 'addedAt'>) => void
  removeWatched:    (id: string) => void
  updateWatchLabel: (id: string, label: string) => void

  addConnected:    (w: Omit<ConnectedWallet, 'id' | 'connectedAt'>) => void
  removeConnected: (id: string) => void

  addExchange:    (e: NewExchangeConnection) => Promise<void>
  removeExchange: (id: string) => Promise<void>
}

function uid() { return Math.random().toString(36).slice(2, 10) }

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      watched:   [],
      connected: [],
      exchanges: [],

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

      addExchange: async (e) => {
        const res = await fetch('/live-data/wallet/exchange-connections', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(e),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok || !d.ok) throw new Error(d.error ?? `Failed to save connection (HTTP ${res.status})`)
        set((s) => ({ exchanges: [...s.exchanges, d.connection as ExchangeConnection] }))
      },
      removeExchange: async (id) => {
        await fetch(`/live-data/wallet/exchange-connections?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
        set((s) => ({ exchanges: s.exchanges.filter(e => e.id !== id) }))
      },
    }),
    {
      name: 'caep:wallets',
      // v1: exchange API secrets no longer live in browser storage. Migrating
      // strips any previously persisted credentials; those connections must be
      // re-linked so the secret lands in the server-side store.
      version: 1,
      migrate: (persisted) => {
        const s = persisted as { exchanges?: Array<Record<string, unknown>> } | undefined
        if (s?.exchanges) {
          s.exchanges = s.exchanges.map(({ apiKey, apiSecret: _dropped, ...rest }) => ({
            ...rest,
            keyPreview: typeof apiKey === 'string' ? apiKey.slice(0, 8) : '',
          }))
        }
        return s
      },
    },
  ),
)
