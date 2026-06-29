import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Chain metadata ────────────────────────────────────────────────────────────

export type ChainId =
  | 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc' | 'avalanche'
  | 'solana' | 'bitcoin'

export const CHAIN_META: Record<ChainId, { label: string; symbol: string; color: string; type: 'evm' | 'sol' | 'btc' }> = {
  ethereum:  { label: 'Ethereum',       symbol: 'ETH',  color: '#627EEA', type: 'evm' },
  polygon:   { label: 'Polygon',        symbol: 'POL',  color: '#8247E5', type: 'evm' },
  arbitrum:  { label: 'Arbitrum One',   symbol: 'ETH',  color: '#28A0F0', type: 'evm' },
  base:      { label: 'Base',           symbol: 'ETH',  color: '#0052FF', type: 'evm' },
  optimism:  { label: 'Optimism',       symbol: 'ETH',  color: '#FF0420', type: 'evm' },
  bsc:       { label: 'BNB Chain',      symbol: 'BNB',  color: '#F3BA2F', type: 'evm' },
  avalanche: { label: 'Avalanche',      symbol: 'AVAX', color: '#E84142', type: 'evm' },
  solana:    { label: 'Solana',         symbol: 'SOL',  color: '#9945FF', type: 'sol' },
  bitcoin:   { label: 'Bitcoin',        symbol: 'BTC',  color: '#F7931A', type: 'btc' },
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
  binance:  { label: 'Binance',  color: '#F3BA2F', website: 'https://binance.com'  },
  coinbase: { label: 'Coinbase', color: '#0052FF', website: 'https://coinbase.com' },
  kraken:   { label: 'Kraken',   color: '#5741D9', website: 'https://kraken.com'   },
  okx:      { label: 'OKX',      color: '#1A1A1A', website: 'https://okx.com'      },
  bybit:    { label: 'Bybit',    color: '#F7A600', website: 'https://bybit.com'    },
}

export interface ExchangeConnection {
  id:        string
  label:     string
  exchange:  ExchangeId
  apiKey:    string
  apiSecret: string
  addedAt:   string
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

  addExchange:    (e: Omit<ExchangeConnection, 'id' | 'addedAt'>) => void
  removeExchange: (id: string) => void
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

      addExchange: (e) => set((s) => ({
        exchanges: [...s.exchanges, { ...e, id: uid(), addedAt: new Date().toISOString() }],
      })),
      removeExchange: (id) => set((s) => ({ exchanges: s.exchanges.filter(e => e.id !== id) })),
    }),
    { name: 'caep:wallets' },
  ),
)
