import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { AddressInfo } from 'node:net'

// These tests open real sockets against a local server. That is the point:
// pinning is a transport-layer behaviour, and a mocked fetch would prove
// nothing about where the packets actually went.
//
// The DNS half is faked by hand rather than by mocking node:dns — each test
// asks pinnedFetch for a URL whose host is an address literal or whose
// resolution we control, and asserts on which server received the request.

const { pinnedFetch } = await import('../pinnedFetch')

let good: Server
let goodPort: number
let evil: Server
let evilPort: number

beforeAll(async () => {
  good = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('GOOD')
  })
  evil = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('EVIL')
  })
  await new Promise<void>(r => good.listen(0, '127.0.0.1', r))
  await new Promise<void>(r => evil.listen(0, '127.0.0.1', r))
  goodPort = (good.address() as AddressInfo).port
  evilPort = (evil.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise<void>(r => good.close(() => r()))
  await new Promise<void>(r => evil.close(() => r()))
})

describe('pinnedFetch', () => {
  it('refuses a URL that fails string-level validation before opening a socket', async () => {
    await expect(pinnedFetch('file:///etc/passwd')).rejects.toThrow(/Unsupported protocol/)
    await expect(pinnedFetch('http://user:pw@example.com')).rejects.toThrow(/embedded credentials/)
  })

  it('refuses a private address literal', async () => {
    // The local servers ARE on 127.0.0.1, so this doubles as proof that the
    // guard is what stops the request rather than the request simply failing.
    await expect(pinnedFetch(`http://127.0.0.1:${goodPort}/`)).rejects.toThrow(
      /private or internal address/
    )
    await expect(pinnedFetch('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      /private or internal address/
    )
  })

  it('refuses an unresolvable host', async () => {
    // .invalid is reserved by RFC 2606 and must never resolve.
    await expect(pinnedFetch('http://nothing-here.invalid/')).rejects.toThrow(
      /Could not resolve host|private or internal address/
    )
  })

  it('surfaces upstream failures rather than hanging on a pinned agent', async () => {
    // A 1 ms deadline against a host that resolves: the request must reject,
    // and the agent must be closed on the way out (the `finally` in
    // pinnedFetch). A leaked agent would keep this suite from exiting.
    await expect(
      pinnedFetch('http://example.com/', { signal: AbortSignal.timeout(1) })
    ).rejects.toThrow()
  })
})

// The pin itself: prove the socket goes to the address we vetted, not to
// whatever the name resolves to at connect time. resolvePublicAddresses is
// stubbed so we can hand pinnedFetch a public-looking host and control the
// answer, which is exactly the rebinding shape.
describe('pinnedFetch — the pin holds', () => {
  it('connects to the vetted address even when the name would resolve elsewhere', async () => {
    vi.resetModules()
    vi.doMock('../urlSafety', async () => {
      const actual = await vi.importActual<typeof import('../urlSafety')>('../urlSafety')
      return {
        ...actual,
        // "example.test resolves to the good server" — and, critically, the
        // private-address guard is relaxed for this one test so a loopback
        // address can stand in for a public one. isPrivateAddress stays real
        // inside pinnedFetch's belt-and-braces check, so we neutralise it too.
        resolvePublicAddresses: async () => ({ addresses: ['127.0.0.1'] }),
        isPrivateAddress: () => false,
      }
    })
    const { pinnedFetch: pinned } = await import('../pinnedFetch')

    // Host says one thing; the pin says 127.0.0.1 with the good server's port.
    const response = await pinned(`http://example.test:${goodPort}/`)
    const body = await response.text()

    expect(body).toBe('GOOD')
    expect(body).not.toBe('EVIL')
    expect(evilPort).not.toBe(goodPort) // sanity: the two servers are distinct
    vi.doUnmock('../urlSafety')
    vi.resetModules()
  })
})
