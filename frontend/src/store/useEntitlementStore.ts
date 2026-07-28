import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ModuleId } from '@/lib/modules/registry'
import { migrateStorageKey } from '@/lib/utils/storageMigration'

// One-time key migration for the Finance Now rename — runs before any read below.
migrateStorageKey('caep:entitlements', 'fn:entitlements')


// Which suite modules the current user has access to. Every module is enabled
// by default; this becomes license-driven when real auth + billing land
// (docs/ROADMAP.md, Phase 6). Core can never be disabled.

interface EntitlementState {
  disabled: Partial<Record<ModuleId, boolean>>
}

interface EntitlementActions {
  isEnabled: (id: ModuleId) => boolean
  setEnabled: (id: ModuleId, enabled: boolean) => void
}

export const useEntitlementStore = create<EntitlementState & EntitlementActions>()(
  persist(
    (set, get) => ({
      disabled: {},

      isEnabled: (id) => id === 'core' || !get().disabled[id],

      setEnabled: (id, enabled) => {
        if (id === 'core') return
        set((state) => ({ disabled: { ...state.disabled, [id]: !enabled } }))
      },
    }),
    {
      name: 'fn:entitlements',
      // Rehydrated explicitly from <Providers> rather than during store
      // creation. Zustand's default is a synchronous read of localStorage as
      // soon as this module is imported, which means the client's very first
      // render already reflects the saved bundle while the server rendered the
      // all-enabled default. Any disabled module then changed the sidebar's
      // section list mid-hydration, React saw mismatched text ("Crypto" vs
      // "Equities"), and threw away the entire server tree to re-render on the
      // client. Deferring the read keeps the first client render identical to
      // the server's; the real state lands an effect later.
      skipHydration: true,
    }
  )
)
