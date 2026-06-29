import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface DashboardWidgetConfig {
  id: string
  visible: boolean
}

const DEFAULT_WIDGETS: DashboardWidgetConfig[] = [
  { id: 'market-overview',   visible: true },
  { id: 'risk-heatmap',      visible: true },
  { id: 'recent-alerts',     visible: true },
  { id: 'free-data',         visible: true },
  { id: 'peg-stability',     visible: true },
  { id: 'liquidity-monitor', visible: true },
]

interface DashboardState {
  widgets: DashboardWidgetConfig[]
  poppedOut: string[]
  setVisible: (id: string, visible: boolean) => void
  reorder: (fromId: string, toId: string) => void
  popOut: (id: string) => void
  dock: (id: string) => void
  reset: () => void
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      widgets: DEFAULT_WIDGETS,
      poppedOut: [],

      setVisible: (id, visible) =>
        set((s) => ({
          widgets: s.widgets.map((w) => (w.id === id ? { ...w, visible } : w)),
        })),

      reorder: (fromId, toId) =>
        set((s) => {
          if (fromId === toId) return s
          const arr = [...s.widgets]
          const fromIdx = arr.findIndex((w) => w.id === fromId)
          const toIdx   = arr.findIndex((w) => w.id === toId)
          if (fromIdx < 0 || toIdx < 0) return s
          const [item] = arr.splice(fromIdx, 1)
          arr.splice(toIdx, 0, item)
          return { widgets: arr }
        }),

      popOut: (id) =>
        set((s) => ({
          poppedOut: s.poppedOut.includes(id) ? s.poppedOut : [...s.poppedOut, id],
        })),

      dock: (id) =>
        set((s) => ({ poppedOut: s.poppedOut.filter((p) => p !== id) })),

      reset: () => set({ widgets: DEFAULT_WIDGETS, poppedOut: [] }),
    }),
    { name: 'caep:dashboard' },
  ),
)
