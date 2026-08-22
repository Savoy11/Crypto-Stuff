#!/usr/bin/env node
// Probe the keyless public JSON-RPC endpoints behind the EVM live-gas providers
// — RUN THIS ON THE OWNER'S MACHINE.
//
// The build environment's egress proxy blocks these hosts, so whether they
// answer keyless is a verdict only the owner's machine can reach — the same
// rule as the exchange fee probe and the data audits.
//
// Usage:  npm run gas-probe
//
// Prints, per network: which endpoint answered, the raw gas price, the gwei
// reading, and the resulting fee — next to the static estimate it replaces, so
// an order-of-magnitude mistake is obvious rather than subtle.

import { EVM_LIVE_GAS, NETWORK_GAS, feeFromGasPriceHex } from '../src/lib/data/networkFees.ts'

let anyLive = false

for (const [network, cfg] of Object.entries(EVM_LIVE_GAS)) {
  const info = NETWORK_GAS[network]
  process.stdout.write(`\n── ${network} (${info.token})\n`)
  let done = false
  for (const url of cfg.rpcUrls) {
    if (done) break
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] }),
      })
      process.stdout.write(`   ${url} -> HTTP ${res.status}\n`)
      if (!res.ok) continue
      const json = await res.json()
      const hex = json?.result
      const fee = feeFromGasPriceHex(hex, cfg.gasLimit)
      if (fee === null) {
        process.stdout.write(`   ⚠ unusable gas price: ${JSON.stringify(hex)} — falls back to the static estimate\n`)
        continue
      }
      const gwei = Number(hex) / 1e9
      process.stdout.write(
        `   gasPrice ${hex} = ${gwei.toFixed(3)} gwei\n` +
        `   fee @ ${cfg.gasLimit} gas = ${fee.toFixed(8)} ${info.token}` +
        `   (static estimate was ${info.native} ${info.token})\n`
      )
      const ratio = fee / info.native
      if (ratio > 10 || ratio < 0.1) {
        process.stdout.write(
          `   ⚠ ${ratio.toFixed(2)}x the static fallback. Two possible causes — check which:\n` +
          `     (a) the fallback is stale/conservative (expected: it is deliberately high), or\n` +
          `     (b) our gas-limit or units are wrong. Compare the gwei reading above to a\n` +
          `         public gas tracker for this chain; if the gwei matches, it is (a).\n`
        )
      }
      anyLive = true
      done = true
    } catch (err) {
      process.stdout.write(`   ${url} -> FAILED: ${err?.message ?? err}\n`)
    }
  }
  if (!done) process.stdout.write('   no endpoint answered — this network stays on its static estimate\n')
}

process.stdout.write(
  `\n── summary ──\n   ${anyLive ? 'At least one network is live.' : 'No network answered; nothing changes — every fee stays an honest estimate.'}\n` +
  `\nSpot-check one reading against a public gas tracker (e.g. etherscan.io/gastracker) before trusting the overlay.\n` +
  `Arbitrum/Optimism/Base are deliberately absent: eth_gasPrice omits the L1 data fee that dominates their cost.\n`
)
