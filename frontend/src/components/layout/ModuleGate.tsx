'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import type { ModuleId } from '@/lib/modules/registry'
import { MODULES } from '@/lib/modules/registry'
import { useEntitlementStore } from '@/store/useEntitlementStore'

// Wraps a module's pages so a disabled module shows an unlock notice instead
// of its content. Client-side only for now — becomes a server-side entitlement
// check when real auth lands.

export function ModuleGate({ module, children }: { module: ModuleId; children: React.ReactNode }) {
  const isEnabled = useEntitlementStore((s) => s.isEnabled(module))
  const meta = MODULES.find((m) => m.id === module)

  if (isEnabled) return <>{children}</>

  return (
    <div className="max-w-md mx-auto mt-24 rounded-card border border-border bg-bg-card p-8 text-center">
      <div className="mx-auto size-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
        <Lock size={18} className="text-amber-400" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-medium text-text-primary">
        The {meta?.label ?? module} module is disabled
      </p>
      <p className="mt-1 text-xs text-text-muted leading-relaxed">
        Re-enable it under Integrations → Modules to access these pages.
      </p>
      <Link
        href="/settings"
        className="inline-block mt-4 px-3 py-1.5 rounded text-xs bg-bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
      >
        Open Integrations
      </Link>
    </div>
  )
}
