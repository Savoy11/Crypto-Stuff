import { describe, expect, it } from 'vitest'
import { categorize, type RuleLike } from '../categorize'

const rule = (over: Partial<RuleLike>): RuleLike => ({
  id: 'r1', categoryId: 'groceries', matchType: 'contains', pattern: 'market',
  priority: 100, enabled: true, ...over,
})

describe('categorize', () => {
  it('contains / starts_with / exact / regex all match case-insensitively', () => {
    const tx = { description: 'WHOLE FOODS MARKET #123', amount: -50 }
    expect(categorize([rule({})], tx)?.categoryId).toBe('groceries')
    expect(categorize([rule({ matchType: 'starts_with', pattern: 'whole' })], tx)?.categoryId).toBe('groceries')
    expect(categorize([rule({ matchType: 'exact', pattern: 'whole foods market #123' })], tx)?.categoryId).toBe('groceries')
    expect(categorize([rule({ matchType: 'regex', pattern: 'market\\s+#\\d+' })], tx)?.categoryId).toBe('groceries')
  })

  it('returns null when nothing matches — uncategorized is honest', () => {
    expect(categorize([rule({})], { description: 'SHELL GAS', amount: -30 })).toBeNull()
  })

  it('first match wins in priority order', () => {
    const rules = [
      rule({ id: 'low', categoryId: 'shopping', priority: 200, pattern: 'amzn' }),
      rule({ id: 'high', categoryId: 'subscriptions', priority: 10, pattern: 'amzn' }),
    ]
    expect(categorize(rules, { description: 'AMZN Prime', amount: -9 })?.ruleId).toBe('high')
  })

  it('amount narrowing compares magnitudes', () => {
    const r = rule({ minAmount: 5, maxAmount: 15 })
    expect(categorize([r], { description: 'market', amount: -9 })).not.toBeNull()
    expect(categorize([r], { description: 'market', amount: -400 })).toBeNull()
  })

  it('account narrowing only applies when both sides carry an account', () => {
    const r = rule({ accountId: 'acct-1' })
    expect(categorize([r], { description: 'market', amount: -9, accountId: 'acct-2' })).toBeNull()
    expect(categorize([r], { description: 'market', amount: -9, accountId: 'acct-1' })).not.toBeNull()
    expect(categorize([r], { description: 'market', amount: -9 })).not.toBeNull()
  })

  it('matches rawDescription over the cleaned description when present', () => {
    const tx = { description: 'Cleaned name', rawDescription: 'SQ *MARKET 4821', amount: -9 }
    expect(categorize([rule({})], tx)).not.toBeNull()
  })

  it('disabled rules and invalid regexes never match', () => {
    expect(categorize([rule({ enabled: false })], { description: 'market', amount: -9 })).toBeNull()
    expect(categorize([rule({ matchType: 'regex', pattern: '(' })], { description: 'market', amount: -9 })).toBeNull()
  })
})
