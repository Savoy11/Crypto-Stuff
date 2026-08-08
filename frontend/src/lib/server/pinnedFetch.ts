// Transport half of the SSRF defence (audit M3). urlSafety.ts decides whether
// an address is allowed; this file makes sure the socket actually goes there.
//
// Validating a hostname and then handing the *name* to fetch leaves a window:
// between our lookup and the connect, a resolver under an attacker's control
// can answer differently, and the socket lands somewhere we never approved.
// That is DNS rebinding, and no amount of pre-checking the name closes it.
//
// The fix is to connect to the vetted IP. undici's connector takes a `lookup`,
// so we hand it one that ignores DNS entirely and returns the address
// resolvePublicAddresses() already approved. TLS is unaffected: undici passes
// `servername` from the URL, so SNI and certificate validation still use the
// hostname — we change where the packets go, not who we think we're talking to.
//
// Why undici's own fetch rather than the global one: a dispatcher only works
// with the fetch implementation it was built for. Node's built-in fetch is
// backed by a *vendored* undici whose major version tracks the Node release,
// so passing an Agent from the npm `undici` package to global fetch dies with
// `InvalidArgumentError: invalid onRequestStart method` the moment the two
// drift apart. Importing both from the same package makes that a non-issue,
// and it stops a Node upgrade from silently disabling the pin.
//
// On the undici major: this sits on 7.x. It had to while the app targeted
// Node 20 — undici 8 declares `engines.node >= 22.19.0` and calls
// `worker_threads.markAsUncloneable` unconditionally, so the build died
// collecting page data with `TypeError: markAsUncloneable is not a function`,
// which a Node 22 dev machine does not reproduce. That constraint is gone now
// that CI and all three Dockerfile stages run Node 22, so 8 is available; 7 is
// kept because nothing in 8 is needed here and neither line carries an
// advisory. If you do move, `engines.node` in package.json is already the
// floor undici 8 wants.

import { Agent, fetch as undiciFetch } from 'undici'
import { isPrivateAddress, resolvePublicAddresses } from '@/lib/server/urlSafety'
import { assertSourceNotProhibited } from '@/lib/server/sourceTerms'

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | { address: string; family: number }[],
  family?: number
) => void

const familyOf = (address: string): 4 | 6 => (address.includes(':') ? 6 : 4)

/**
 * A dispatcher whose DNS answer is fixed to `addresses`. One per request:
 * these are cheap, and a shared pool keyed by origin would happily reuse a
 * socket opened under a different pin.
 */
function pinnedAgent(addresses: string[]): Agent {
  return new Agent({
    connect: {
      lookup(_hostname: string, options: { all?: boolean }, callback: LookupCallback) {
        // Belt and braces: these came from resolvePublicAddresses, but this is
        // the last line before a socket opens, so re-check rather than trust.
        const safe = addresses.filter(a => !isPrivateAddress(a))
        if (safe.length === 0) {
          const err: NodeJS.ErrnoException = new Error('No public address available for host')
          err.code = 'ENOTFOUND'
          callback(err, '')
          return
        }
        if (options?.all) {
          callback(null, safe.map(address => ({ address, family: familyOf(address) })))
          return
        }
        callback(null, safe[0], familyOf(safe[0]))
      },
    },
  })
}

export interface PinnedFetchInit {
  headers?: Record<string, string>
  redirect?: 'manual' | 'error' | 'follow'
  signal?: AbortSignal
  method?: string
  body?: string
  /**
   * Skip the source-terms gate. Reserved for the terms probe itself, which has
   * to reach robots.txt and the terms document of a host precisely BECAUSE it
   * is unreviewed — gating it would make the safeguard unable to run. Nothing
   * that consumes a site's data may set this.
   */
  skipTermsCheck?: boolean
}

/**
 * fetch(), with the connection pinned to a pre-validated address.
 *
 * Throws — before opening anything — if the source-terms registry prohibits
 * this host (see sourceTerms.ts), or if the URL fails string-level or
 * resolve-level validation. Address-literal URLs skip pinning: there is no name
 * to rebind, and the literal was already checked.
 *
 * The terms gate lives here because this is the one function an arbitrary,
 * user-supplied URL passes through — custom feeds from the Integrations page
 * reach upstream via customFeeds.ts and marketData.ts, and both go through
 * here. Putting the check at the socket rather than at the save means a source
 * that was configured before a verdict changed stops working when the verdict
 * changes, instead of quietly continuing.
 *
 * The body is buffered and re-wrapped in a standard `Response` so the pinned
 * agent can be closed here rather than left to a caller who may never get
 * round to it. Everything this guards is an RSS or JSON document, so nothing
 * is lost by not streaming.
 *
 * ⚠ Requests made through this function are NOT covered by Next's fetch
 * cache — `next: { revalidate }` has no effect on a request carrying a custom
 * dispatcher. Callers that relied on it now hit their upstream every time.
 */
export async function pinnedFetch(url: string, init: PinnedFetchInit = {}): Promise<Response> {
  // Runs BEFORE address resolution: a prohibited host should not cost a DNS
  // lookup, and the answer doesn't depend on where it resolves. Note this is
  // the `notProhibited` form, not the strict one — see sourceTerms.ts for why
  // an unreviewed host is gated at save time rather than here.
  const { skipTermsCheck, ...fetchInit } = init
  if (!skipTermsCheck) assertSourceNotProhibited(url)

  const resolution = await resolvePublicAddresses(url)
  if ('error' in resolution) throw new Error(resolution.error)

  // Address literal — nothing to pin, already validated, so the platform
  // fetch (and its cache integration) is fine here.
  if (resolution.addresses.length === 0) {
    return fetch(url, fetchInit as RequestInit)
  }

  const agent = pinnedAgent(resolution.addresses)
  try {
    const res = await undiciFetch(url, { ...fetchInit, dispatcher: agent })
    const body = await res.arrayBuffer()
    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: [...res.headers] as [string, string][],
    })
  } finally {
    await agent.close().catch(() => {})
  }
}
