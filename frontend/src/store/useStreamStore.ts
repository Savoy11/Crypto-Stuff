import { create } from 'zustand'

// Previously exported by lib/websocket/client.ts, which the M8 sweep removed.
// The store is the only surviving owner of connection status, so the type
// lives with it.
export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface StreamState {
  connectionStatus: WsStatus
  lastHeartbeat: string | null
  subscribedChannels: string[]
  streamErrors: number
}

interface StreamActions {
  setConnectionStatus: (status: WsStatus) => void
  setLastHeartbeat: (ts: string) => void
  addChannel: (channel: string) => void
  removeChannel: (channel: string) => void
  incrementErrors: () => void
  resetErrors: () => void
}

export const useStreamStore = create<StreamState & StreamActions>()((set) => ({
  connectionStatus: 'disconnected',
  lastHeartbeat: null,
  subscribedChannels: [],
  streamErrors: 0,

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setLastHeartbeat: (ts) => set({ lastHeartbeat: ts }),

  addChannel: (channel) =>
    set((state) => ({
      subscribedChannels: state.subscribedChannels.includes(channel)
        ? state.subscribedChannels
        : [...state.subscribedChannels, channel],
    })),

  removeChannel: (channel) =>
    set((state) => ({
      subscribedChannels: state.subscribedChannels.filter((c) => c !== channel),
    })),

  incrementErrors: () => set((state) => ({ streamErrors: state.streamErrors + 1 })),

  resetErrors: () => set({ streamErrors: 0 }),
}))
