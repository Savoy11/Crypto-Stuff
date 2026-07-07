import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ModuleId } from '@/lib/modules/registry'

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
    { name: 'caep:entitlements' }
  )
)
