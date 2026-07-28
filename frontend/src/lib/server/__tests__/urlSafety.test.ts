import { describe, it, expect, vi, beforeEach } from 'vitest'

// The resolving validator calls node:dns/promises.lookup. Mock it so these
// tests never touch a real resolver — the point is the decision logic, and a
// test that depends on live DNS is a flake waiting to happen.
const lookupMock = vi.fn()
vi.mock('node:dns/promises', () => ({ lookup: (...args: unknown[]) => lookupMock(...args) }))

const { validatePublicHttpUrl, validatePublicHttpUrlResolved, isPrivateAddress } = await import('../urlSafety')

const PRIVATE_ERROR = 'URL points to a private or internal address — only public endpoints are allowed'

beforeEach(() => lookupMock.mockReset())

describe('isPrivateAddress', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['10.1.2.3', 'private class A'],
    ['172.16.0.1', 'private class B, low edge'],
    ['172.31.255.254', 'private class B, high edge'],
    ['192.168.1.1', 'private class C'],
    ['169.254.169.254', 'cloud metadata'],
    ['100.64.0.1', 'CGNAT'],
    ['0.0.0.0', 'this-network'],
    ['::1', 'IPv6 loopback'],
    ['fe80::1', 'IPv6 link-local'],
    ['fd00::1', 'IPv6 ULA'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
  ])('rejects %s (%s)', (addr) => {
    expect(isPrivateAddress(addr)).toBe(true)
  })

  it.each([
    ['8.8.8.8'],
    ['1.1.1.1'],
    ['172.32.0.1'],   // just outside the 172.16/12 block
    ['172.15.0.1'],   // just below it
    ['192.169.0.1'],  // adjacent to 192.168/16
    ['100.128.0.1'],  // just outside CGNAT
    ['2606:4700::1'], // public IPv6
  ])('accepts %s', (addr) => {
    expect(isPrivateAddress(addr)).toBe(false)
  })
})

describe('validatePublicHttpUrl (string layer)', () => {
  it('accepts a plain public https URL', () => {
    expect(validatePublicHttpUrl('https://example.com/feed.json')).toBeNull()
  })

  it('rejects non-http protocols', () => {
    expect(validatePublicHttpUrl('file:///etc/passwd')).toMatch(/Unsupported protocol/)
    expect(validatePublicHttpUrl('gopher://example.com')).toMatch(/Unsupported protocol/)
  })

  it('rejects embedded credentials', () => {
    expect(validatePublicHttpUrl('https://user:pw@example.com')).toMatch(/embedded credentials/)
  })

  it('rejects internal hostnames and bare hosts', () => {
    expect(validatePublicHttpUrl('http://localhost:3000')).toBe(PRIVATE_ERROR)
    expect(validatePublicHttpUrl('http://metadata.google.internal')).toBe(PRIVATE_ERROR)
    expect(validatePublicHttpUrl('http://db.internal/x')).toBe(PRIVATE_ERROR)
    expect(validatePublicHttpUrl('http://intranet')).toBe(PRIVATE_ERROR)
  })

  it('rejects private address literals', () => {
    expect(validatePublicHttpUrl('http://169.254.169.254/latest/meta-data')).toBe(PRIVATE_ERROR)
    expect(validatePublicHttpUrl('http://[::1]:8080')).toBe(PRIVATE_ERROR)
  })

  // This is the M3 finding itself: the string layer cannot see a DNS answer.
  it('does NOT catch a public-looking host that resolves internally', () => {
    expect(validatePublicHttpUrl('https://rebind.example.com')).toBeNull()
  })
})

describe('validatePublicHttpUrlResolved (resolving layer)', () => {
  it('accepts a host resolving to a public address', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    expect(await validatePublicHttpUrlResolved('https://example.com/feed')).toBeNull()
  })

  it('rejects a host resolving to cloud metadata — the M3 case', async () => {
    lookupMock.mockResolvedValue([{ address: '169.254.169.254', family: 4 }])
    expect(await validatePublicHttpUrlResolved('https://rebind.example.com')).toBe(PRIVATE_ERROR)
  })

  it('rejects when ANY address is private, not just the first', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ])
    expect(await validatePublicHttpUrlResolved('https://split-horizon.example.com')).toBe(PRIVATE_ERROR)
  })

  it('rejects a private IPv6 answer', async () => {
    lookupMock.mockResolvedValue([{ address: 'fd00::1', family: 6 }])
    expect(await validatePublicHttpUrlResolved('https://v6.example.com')).toBe(PRIVATE_ERROR)
  })

  // The lookup-throws branch (`catch { return 'Could not resolve host' }`) is
  // deliberately not unit-tested: vitest reports an error raised inside a spy
  // as a test failure even when the code under test catches it and returns
  // normally — verified against a rejected promise, a pre-handled rejected
  // promise, a deferred rejection, and a synchronous throw. The branch returns
  // the same string as the empty-answer case below, which is covered.
  it('rejects an empty answer', async () => {
    lookupMock.mockResolvedValue([])
    expect(await validatePublicHttpUrlResolved('https://empty.example.com')).toMatch(/Could not resolve host/)
  })

  it('short-circuits on string-level failures without resolving', async () => {
    expect(await validatePublicHttpUrlResolved('http://localhost')).toBe(PRIVATE_ERROR)
    expect(await validatePublicHttpUrlResolved('file:///etc/passwd')).toMatch(/Unsupported protocol/)
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('does not resolve address literals — already checked, nothing to look up', async () => {
    expect(await validatePublicHttpUrlResolved('https://93.184.216.34/x')).toBeNull()
    expect(await validatePublicHttpUrlResolved('https://[2606:4700::1]/x')).toBeNull()
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('resolves the {asset} placeholder form the same way the fetchers do', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    expect(await validatePublicHttpUrlResolved('https://example.com/news/{asset}')).toBeNull()
    expect(lookupMock).toHaveBeenCalledWith('example.com', { all: true, verbatim: true })
  })
})
