/**
 * End-to-end demo of the connector suite. Run with:  npm run demo
 *
 * Shows the two commercial shapes:
 *   1. The bundle — every asset class through one registry.
 *   2. An individual license — only the crypto SKU is entitled, and the
 *      registry blocks access to everything else at the access boundary.
 *
 * Crypto (CoinGecko) and forex (Frankfurter) run live with no API keys.
 * Equities and commodities run in demo mode unless FMP_API_KEY is set.
 */
import {
  createConnectorSuite,
  StaticEntitlements,
  CONNECTOR_SKUS,
  isConnectorError,
} from '@caep/connector-suite'

const hasFmpKey = Boolean(process.env.FMP_API_KEY)

console.log('=== 1. Bundle: all connectors, one registry ===\n')
const suite = createConnectorSuite({ demoMode: !hasFmpKey })

for (const { metadata, entitled } of suite.list()) {
  console.log(
    `  [${entitled ? 'licensed' : 'locked'}] ${metadata.id} (${metadata.assetClass}) — ${metadata.provider}`,
  )
}

const requests = [
  ['crypto', 'btc'],
  ['forex', 'EUR/USD'],
  ['equities', 'AAPL'],
  ['commodities', 'gold'],
]

console.log('\n  Cross-asset quotes:')
for (const [assetClass, symbol] of requests) {
  try {
    const q = await suite.getQuote(assetClass, symbol)
    console.log(
      `    ${assetClass.padEnd(12)} ${q.symbol.padEnd(8)} ${q.price} ${q.currency}  (source: ${q.source})`,
    )
  } catch (err) {
    console.log(`    ${assetClass.padEnd(12)} ${symbol.padEnd(8)} FAILED: ${err.message}`)
  }
}

console.log('\n  30-day BTC history sample:')
try {
  const history = await suite.get('caep-crypto').getHistory({ symbol: 'btc', limit: 30 })
  const last = history.candles.at(-1)
  console.log(`    ${history.candles.length} candles, latest close ${last?.close} USD at ${last?.time}`)
} catch (err) {
  console.log(`    FAILED: ${err.message}`)
}

console.log('\n=== 2. Individual sale: crypto-only license ===\n')
const cryptoOnly = createConnectorSuite({
  demoMode: !hasFmpKey,
  entitlements: new StaticEntitlements([{ sku: CONNECTOR_SKUS.crypto }]),
})

for (const { metadata, entitled } of cryptoOnly.list()) {
  console.log(`  [${entitled ? 'licensed' : 'locked'}] ${metadata.id}`)
}

try {
  const q = await cryptoOnly.getQuote('crypto', 'eth')
  console.log(`\n  crypto quote OK: eth = ${q.price} USD`)
} catch (err) {
  console.log(`\n  crypto quote FAILED: ${err.message}`)
}

try {
  await cryptoOnly.get('caep-equities')
  console.log('  equities access: UNEXPECTEDLY ALLOWED (bug!)')
} catch (err) {
  if (isConnectorError(err) && err.code === 'NOT_ENTITLED') {
    console.log(`  equities access correctly blocked: ${err.message}`)
  } else {
    throw err
  }
}

console.log('\nDemo complete.')
