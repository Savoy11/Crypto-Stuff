'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// User-defined price alerts across all modules (crypto + stocks + funds).
// Alerts are one-shot: they fire once, keep a triggered record, and can be
// re-armed. Monitoring happens client-side while the app is open
// (usePriceAlertMonitor); server-side delivery arrives with the backend.

export type AlertInstrumentKind = 'crypto' | 'security'
export type AlertCondition = 'above' | 'below'

export interface PriceAlert {
  id: string
  kind: AlertInstrumentKind
  /** CoinGecko id for crypto, ticker symbol for securities */
  target: string
  label: string
  condition: AlertCondition
  price: number
  createdAt: string
  /** null = armed; ISO date = fired */
  triggeredAt: string | null
  /** Price observed when the alert fired */
  triggeredPrice: number | null
}

interface PriceAlertState {
  alerts: PriceAlert[]
  addAlert: (a: Omit<PriceAlert, 'id' | 'createdAt' | 'triggeredAt' | 'triggeredPrice'>) => void
  removeAlert: (id: string) => void
  rearmAlert: (id: string) => void
  markTriggered: (id: string, price: number) => void
}

export const usePriceAlertStore = create<PriceAlertState>()(
  persist(
    (set) => ({
      alerts: [],
      addAlert: (a) => set((s) => ({
        alerts: [...s.alerts, {
          ...a,
          id: Math.random().toString(36).slice(2, 10),
          createdAt: new Date().toISOString(),
          triggeredAt: null,
          triggeredPrice: null,
        }],
      })),
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((x) => x.id !== id) })),
      rearmAlert: (id) => set((s) => ({
        alerts: s.alerts.map((x) => x.id === id ? { ...x, triggeredAt: null, triggeredPrice: null } : x),
      })),
      markTriggered: (id, price) => set((s) => ({
        alerts: s.alerts.map((x) => x.id === id ? { ...x, triggeredAt: new Date().toISOString(), triggeredPrice: price } : x),
      })),
    }),
    { name: 'fnf:price-alerts:v1' }
  )
)
