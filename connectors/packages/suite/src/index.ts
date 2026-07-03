/**
 * @caep/connector-suite — the bundle product.
 *
 * Customers who buy the bundle install this one package and get every
 * asset-class connector pre-wired into a registry. Customers who buy a
 * single connector install that package directly and register it themselves:
 *
 *   import { ConnectorRegistry } from '@caep/connector-core'
 *   import { CryptoConnector } from '@caep/connector-crypto'
 *   const registry = new ConnectorRegistry(myEntitlements)
 *   registry.register(new CryptoConnector())
 */
import {
  ConnectorRegistry,
  type ConnectorConfig,
  type EntitlementProvider,
} from '@caep/connector-core'
import { CryptoConnector, CRYPTO_CONNECTOR_SKU } from '@caep/connector-crypto'
import { ForexConnector, FOREX_CONNECTOR_SKU } from '@caep/connector-forex'
import { EquitiesConnector, EQUITIES_CONNECTOR_SKU } from '@caep/connector-equities'
import { CommoditiesConnector, COMMODITIES_CONNECTOR_SKU } from '@caep/connector-commodities'

export * from '@caep/connector-core'
export { CryptoConnector, CRYPTO_CONNECTOR_SKU } from '@caep/connector-crypto'
export { ForexConnector, FOREX_CONNECTOR_SKU } from '@caep/connector-forex'
export { EquitiesConnector, EQUITIES_CONNECTOR_SKU } from '@caep/connector-equities'
export {
  CommoditiesConnector,
  COMMODITIES_CONNECTOR_SKU,
  COMMODITY_CATALOG,
} from '@caep/connector-commodities'

/** All individually sellable SKUs plus the bundle SKU from core. */
export const CONNECTOR_SKUS = {
  crypto: CRYPTO_CONNECTOR_SKU,
  forex: FOREX_CONNECTOR_SKU,
  equities: EQUITIES_CONNECTOR_SKU,
  commodities: COMMODITIES_CONNECTOR_SKU,
} as const

export interface SuiteOptions {
  /** Defaults to AllowAllEntitlements (everything unlocked). */
  entitlements?: EntitlementProvider
  /** FMP key shared by the equities and commodities connectors. */
  fmpApiKey?: string
  /** Serve sample data from key-gated connectors instead of live calls. */
  demoMode?: boolean
  /** Per-connector config overrides, applied on top of the shared options. */
  overrides?: Partial<Record<keyof typeof CONNECTOR_SKUS, ConnectorConfig>>
}

/** Build a registry with all four connectors registered. */
export function createConnectorSuite(options: SuiteOptions = {}): ConnectorRegistry {
  const { entitlements, fmpApiKey, demoMode, overrides } = options
  const fmpConfig: ConnectorConfig = { apiKey: fmpApiKey, demoMode }
  return new ConnectorRegistry(entitlements)
    .register(new CryptoConnector({ ...overrides?.crypto }))
    .register(new ForexConnector({ ...overrides?.forex }))
    .register(new EquitiesConnector({ ...fmpConfig, ...overrides?.equities }))
    .register(new CommoditiesConnector({ ...fmpConfig, ...overrides?.commodities }))
}
