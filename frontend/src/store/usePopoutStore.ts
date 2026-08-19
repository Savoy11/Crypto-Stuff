import { create } from 'zustand'

export type PopoutKey = 'prices' | 'market-overview' | 'news-feed' | 'staking-rates'

export const POPOUT_META: Record<PopoutKey, { title: string; defaultWidth: number; defaultHeight: number }> = {
  'prices':          { title: 'Live Prices',      defaultWidth: 360, defaultHeight: 400 },
  'market-overview': { title: 'Market Overview',  defaultWidth: 520, defaultHeight: 220 },
  'news-feed':       { title: 'News Feed',         defaultWidth: 440, defaultHeight: 520 },
  'staking-rates':   { title: 'Staking Rates',    defaultWidth: 380, defaultHeight: 340 },
}

export interface PopoutInstance {
  id: string
  key: PopoutKey
  title: string
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
  zIndex: number
}

interface PopoutStore {
  popouts: PopoutInstance[]
  maxZ: number
  open: (key: PopoutKey) => void
  close: (id: string) => void
  move: (id: string, x: number, y: number) => void
  resize: (id: string, width: number, height: number) => void
  toggleMinimize: (id: string) => void
  bringToFront: (id: string) => void
}

let idCounter = 0

export const usePopoutStore = create<PopoutStore>((set, get) => ({
  popouts: [],
  maxZ: 200,

  open: (key) => {
    const { popouts, maxZ } = get()
    // If already open, bring to front and un-minimize
    const existing = popouts.find((p) => p.key === key)
    if (existing) {
      const newZ = maxZ + 1
      set({
        maxZ: newZ,
        popouts: popouts.map((p) =>
          p.id === existing.id ? { ...p, zIndex: newZ, minimized: false } : p
        ),
      })
      return
    }
    const meta = POPOUT_META[key]
    const newZ = maxZ + 1
    const id = `popout-${++idCounter}`
    const offset = (popouts.length % 6) * 28
    set({
      maxZ: newZ,
      popouts: [
        ...popouts,
        {
          id, key,
          title: meta.title,
          x: 260 + offset,
          y: 80 + offset,
          width: meta.defaultWidth,
          height: meta.defaultHeight,
          minimized: false,
          zIndex: newZ,
        },
      ],
    })
  },

  close: (id) =>
    set((s) => ({ popouts: s.popouts.filter((p) => p.id !== id) })),

  move: (id, x, y) =>
    set((s) => ({
      popouts: s.popouts.map((p) => (p.id === id ? { ...p, x, y } : p)),
    })),

  resize: (id, width, height) =>
    set((s) => ({
      popouts: s.popouts.map((p) => (p.id === id ? { ...p, width, height } : p)),
    })),

  toggleMinimize: (id) =>
    set((s) => ({
      popouts: s.popouts.map((p) =>
        p.id === id ? { ...p, minimized: !p.minimized } : p
      ),
    })),

  bringToFront: (id) => {
    const { maxZ, popouts } = get()
    const top = popouts[popouts.length - 1]
    if (top?.id === id) return // already on top
    const newZ = maxZ + 1
    set({
      maxZ: newZ,
      popouts: popouts.map((p) => (p.id === id ? { ...p, zIndex: newZ } : p)),
    })
  },
}))
