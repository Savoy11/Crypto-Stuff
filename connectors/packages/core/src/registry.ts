import type { AssetClassConnector, ConnectorMetadata } from './connector.js'
import { AllowAllEntitlements, type EntitlementProvider } from './entitlements.js'
import { ConnectorError } from './errors.js'
import type { AssetClass, Quote, SearchResult } from './types.js'

export interface ConnectorListing {
  metadata: ConnectorMetadata
  entitled: boolean
}

/**
 * Runtime home for whatever set of connectors a customer installed and
 * licensed. Host apps register connectors once, then route by asset class.
 * Entitlement checks happen here, at the access boundary, so an installed
 * but unlicensed connector is inert.
 */
export class ConnectorRegistry {
  private readonly connectors = new Map<string, AssetClassConnector>()

  constructor(private readonly entitlements: EntitlementProvider = new AllowAllEntitlements()) {}

  register(connector: AssetClassConnector): this {
    this.connectors.set(connector.metadata.id, connector)
    return this
  }

  /** Catalog view: everything installed, flagged with entitlement status. */
  list(): ConnectorListing[] {
    return [...this.connectors.values()].map((connector) => ({
      metadata: connector.metadata,
      entitled: this.entitlements.isEntitled(connector.metadata.sku),
    }))
  }

  /** @throws ConnectorError NOT_FOUND | NOT_ENTITLED */
  get(id: string): AssetClassConnector {
    const connector = this.connectors.get(id)
    if (!connector) {
      throw new ConnectorError('NOT_FOUND', `No connector registered with id "${id}"`)
    }
    if (!this.entitlements.isEntitled(connector.metadata.sku)) {
      throw new ConnectorError(
        'NOT_ENTITLED',
        `Connector "${id}" is installed but not licensed (SKU ${connector.metadata.sku})`,
      )
    }
    return connector
  }

  /** First entitled connector serving the asset class, if any. */
  forAssetClass(assetClass: AssetClass): AssetClassConnector | undefined {
    for (const connector of this.connectors.values()) {
      if (
        connector.metadata.assetClass === assetClass &&
        this.entitlements.isEntitled(connector.metadata.sku)
      ) {
        return connector
      }
    }
    return undefined
  }

  /** Route a quote request by asset class. */
  async getQuote(assetClass: AssetClass, symbol: string): Promise<Quote> {
    const connector = this.forAssetClass(assetClass)
    if (!connector) {
      throw new ConnectorError(
        'NOT_FOUND',
        `No entitled connector available for asset class "${assetClass}"`,
      )
    }
    return connector.getQuote(symbol)
  }

  /** Fan a search out across all entitled connectors; failures are skipped. */
  async searchAll(query: string, limitPerClass = 5): Promise<SearchResult[]> {
    const entitled = [...this.connectors.values()].filter((connector) =>
      this.entitlements.isEntitled(connector.metadata.sku),
    )
    const settled = await Promise.allSettled(
      entitled.map((connector) => connector.search(query, limitPerClass)),
    )
    return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  }
}
