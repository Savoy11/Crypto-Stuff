/**
 * Entitlement layer — the mechanism that makes connectors individually
 * sellable. Every connector declares a `sku` in its metadata; the registry
 * refuses to hand out a connector unless the active EntitlementProvider
 * vouches for that SKU (or for the bundle SKU, which unlocks everything).
 *
 * `StaticEntitlements` covers local/dev and simple deployments. Production
 * licensing (signed license keys, remote entitlement service, per-seat
 * checks) plugs in by implementing `EntitlementProvider` — nothing else in
 * the stack changes.
 */

/** Owning this SKU unlocks every connector — the "bundle" product. */
export const BUNDLE_SKU = 'caep.connectors.suite'

export interface Entitlement {
  sku: string
  /** ISO 8601 expiry. Omit for perpetual licenses. */
  expiresAt?: string
}

export interface EntitlementProvider {
  isEntitled(sku: string): boolean
}

/** Grants everything. Default for development and internal use. */
export class AllowAllEntitlements implements EntitlementProvider {
  isEntitled(): boolean {
    return true
  }
}

/** Grants a fixed list of SKUs, honoring expiry and the bundle SKU. */
export class StaticEntitlements implements EntitlementProvider {
  private readonly bySku = new Map<string, Entitlement>()

  constructor(entitlements: Entitlement[]) {
    for (const entitlement of entitlements) {
      this.bySku.set(entitlement.sku, entitlement)
    }
  }

  isEntitled(sku: string): boolean {
    return this.isActive(this.bySku.get(BUNDLE_SKU)) || this.isActive(this.bySku.get(sku))
  }

  private isActive(entitlement: Entitlement | undefined): boolean {
    if (!entitlement) return false
    if (!entitlement.expiresAt) return true
    return Date.parse(entitlement.expiresAt) > Date.now()
  }
}
