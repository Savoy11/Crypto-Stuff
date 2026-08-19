import { describe, it, expect } from 'vitest'
import { validateWallet, WALLET_CHAINS, WALLET_KINDS } from '../walletPersistence'
import { ALL_CHAINS } from '@/store/useWalletStore'

// NT3. validateWallet is the trust boundary for the wallets API: everything it
// accepts gets written under a user's id. It is pure, so it is tested directly
// rather than through the route.

const ADDR = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7'

describe('validateWallet', () => {
  it('accepts a watched address', () => {
    const v = validateWallet({ kind: 'watched', address: ADDR, chain: 'ethereum', label: 'Main' })
    expect(v).toEqual({ id: undefined, kind: 'watched', address: ADDR, chain: 'ethereum', label: 'Main', provider: null })
  })

  it('accepts a client-supplied UUID so the store can stay optimistic', () => {
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    const v = validateWallet({ id, kind: 'watched', address: ADDR, chain: 'base' })
    expect(v).toMatchObject({ id })
  })

  it('rejects a non-UUID id rather than silently assigning a new one', () => {
    // Silently replacing it would break the optimistic contract: the row the
    // client shows would not be the row the server created.
    expect(validateWallet({ id: 'abc123', kind: 'watched', address: ADDR, chain: 'base' }))
      .toEqual({ error: 'Wallet id must be a UUID' })
  })

  it('rejects an unknown chain', () => {
    const v = validateWallet({ kind: 'watched', address: ADDR, chain: 'dogechain' })
    expect(v).toHaveProperty('error')
  })

  it('rejects an unknown kind', () => {
    expect(validateWallet({ kind: 'exchange', address: ADDR, chain: 'ethereum' })).toHaveProperty('error')
  })

  it('requires a provider on a connected wallet', () => {
    // A connected wallet without a provider is meaningless — the provider is
    // how it was connected.
    expect(validateWallet({ kind: 'connected', address: ADDR, chain: 'ethereum' }))
      .toEqual({ error: 'connected wallets must name their provider' })
  })

  it('drops a provider sent with a watched address rather than storing a half-truth', () => {
    const v = validateWallet({ kind: 'watched', address: ADDR, chain: 'ethereum', provider: 'metamask' })
    expect(v).toMatchObject({ provider: null })
  })

  it('rejects an unknown provider', () => {
    expect(validateWallet({ kind: 'connected', address: ADDR, chain: 'ethereum', provider: 'evil-wallet' }))
      .toHaveProperty('error')
  })

  it('preserves address case — Solana and Tron addresses are case-significant', () => {
    // Lower-casing everything for "normalisation" would corrupt base58 chains.
    const sol = '7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK'
    const v = validateWallet({ kind: 'watched', address: sol, chain: 'solana' })
    expect(v).toMatchObject({ address: sol })
  })

  it('trims surrounding whitespace from a pasted address', () => {
    const v = validateWallet({ kind: 'watched', address: `  ${ADDR}  `, chain: 'ethereum' })
    expect(v).toMatchObject({ address: ADDR })
  })

  it('rejects an implausibly short or long address', () => {
    expect(validateWallet({ kind: 'watched', address: '0xabc', chain: 'ethereum' })).toHaveProperty('error')
    expect(validateWallet({ kind: 'watched', address: 'x'.repeat(200), chain: 'ethereum' })).toHaveProperty('error')
  })

  it('caps the label rather than rejecting a long one', () => {
    const v = validateWallet({ kind: 'watched', address: ADDR, chain: 'ethereum', label: 'y'.repeat(500) })
    expect((v as { label: string }).label).toHaveLength(120)
  })
})

describe('server allowlist vs client chain list', () => {
  it('covers exactly the chains the UI offers', () => {
    // The server keeps its own literal list on purpose — a trust boundary must
    // not widen because a client constant changed. This test is what keeps the
    // two deliberately in step instead of accidentally diverging.
    expect([...WALLET_CHAINS].sort()).toEqual([...ALL_CHAINS].sort())
  })

  it('knows both wallet kinds the store produces', () => {
    expect([...WALLET_KINDS]).toEqual(['watched', 'connected'])
  })
})
