// Server-side URL validation for user-supplied endpoints (custom providers).
// Prevents SSRF: the server must never be coaxed into fetching internal,
// loopback, link-local, or cloud-metadata addresses.
//
// Two layers, deliberately separate:
//
//   validatePublicHttpUrl()          — synchronous, string-level. Protocol,
//                                      credentials, and the hostname/IP literal.
//   validatePublicHttpUrlResolved()  — the above PLUS a DNS resolution, with
//                                      every returned address checked.
//
// The string layer alone was the M3 finding: a hostname is only text, so
// `evil.example.com A 169.254.169.254` sails through it. Anything that is
// about to *fetch* must use the resolving layer. The string layer stays for
// save-time validation (a config's URL should not be rejected because DNS
// happened to be down when the user clicked Save) and as the fast pre-check
// inside the resolving layer.

import { lookup } from 'node:dns/promises'

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
])

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa']

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)]
  if (a === 0 || a === 10 || a === 127) return true              // this-net, private, loopback
  if (a === 169 && b === 254) return true                        // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true               // private
  if (a === 192 && b === 168) return true                        // private
  if (a === 100 && b >= 64 && b <= 127) return true              // CGNAT
  return false
}

function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === '::' || h === '::1') return true                     // unspecified, loopback
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true // link-local, ULA
  if (h.startsWith('::ffff:')) return isPrivateIpv4(h.slice(7))  // v4-mapped
  return false
}

/** True for any address literal that must never be fetched. */
export function isPrivateAddress(host: string): boolean {
  return isPrivateIpv4(host) || isPrivateIpv6(host)
}

const PRIVATE_ADDRESS_ERROR =
  'URL points to a private or internal address — only public endpoints are allowed'

/**
 * Validate a user-supplied URL is a public http(s) endpoint, by inspection of
 * the URL string alone. Returns an error message, or null when acceptable.
 *
 * Does NOT resolve DNS — a hostname that *resolves* to a private address
 * passes here. Use validatePublicHttpUrlResolved() before fetching.
 */
export function validatePublicHttpUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.replace('{asset}', 'bitcoin'))
  } catch {
    return 'Invalid URL'
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return `Unsupported protocol: ${url.protocol.replace(':', '')} (only http/https allowed)`
  }
  if (url.username || url.password) {
    return 'URLs with embedded credentials are not allowed'
  }
  const host = url.hostname.toLowerCase()
  // URL.hostname keeps the brackets on an IPv6 literal ("[2606:4700::1]").
  // The dotless-hostname heuristic below would reject every one of them as a
  // "bare hostname", including public ones — an accident of that heuristic,
  // not a decision: isPrivateIpv6 exists precisely to sort v6 into public and
  // private. Literals are exempted from the heuristic and judged on address.
  const isAddressLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    BLOCKED_HOST_SUFFIXES.some(s => host.endsWith(s)) ||
    (!isAddressLiteral && !host.includes('.')) ||                // bare hostnames resolve internally
    isPrivateAddress(host)
  ) {
    return PRIVATE_ADDRESS_ERROR
  }
  return null
}

/**
 * Validate a user-supplied URL is a public http(s) endpoint, resolving its
 * hostname and rejecting if ANY returned address is private/reserved. Returns
 * an error message, or null when acceptable.
 *
 * Every address is checked, not just the first: a host that answers with both
 * a public and a private address must be rejected, since which one the socket
 * ends up using is not ours to choose.
 *
 * ⚠ Residual risk — this validates, it does not pin. Between this lookup and
 * the connect that follows, a hostile resolver can answer differently (classic
 * DNS rebinding); the socket may reach an address this function never saw.
 * Closing that fully means connecting to the vetted IP rather than the name,
 * which under Next's global fetch needs an undici dispatcher with a custom
 * `connect.lookup` — undici is not a dependency here, and adding one to the
 * bundle for this was judged the larger risk. What this does close is the
 * whole no-DNS-controls-needed class: a plain `A 169.254.169.254` record, a
 * CNAME into an internal zone, a split-horizon name. If you later add undici
 * for another reason, pin here.
 */
export async function validatePublicHttpUrlResolved(raw: string): Promise<string | null> {
  const result = await resolvePublicAddresses(raw)
  return 'error' in result ? result.error : null
}

/**
 * The same check as validatePublicHttpUrlResolved, but it hands back the
 * vetted addresses so a caller can *connect to one of them* instead of
 * re-resolving the name. That is what closes the rebinding window: the socket
 * goes to an address this function saw and approved, not to whatever the
 * resolver says a moment later. See pinnedFetch.ts for the transport side.
 *
 * `addresses` is empty for an address literal — there was nothing to resolve,
 * the literal itself was already checked, and the URL can be fetched as-is.
 */
export async function resolvePublicAddresses(
  raw: string
): Promise<{ error: string } | { addresses: string[] }> {
  const stringError = validatePublicHttpUrl(raw)
  if (stringError) return { error: stringError }

  // Safe: validatePublicHttpUrl already parsed it.
  const host = new URL(raw.replace('{asset}', 'bitcoin')).hostname.toLowerCase()

  // An address literal has nothing to resolve and was already checked above.
  const bare = host.replace(/^\[|\]$/g, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || bare.includes(':')) return { addresses: [] }

  let resolved: { address: string }[]
  try {
    resolved = await lookup(host, { all: true, verbatim: true })
  } catch {
    return { error: `Could not resolve host: ${host}` }
  }
  if (resolved.length === 0) return { error: `Could not resolve host: ${host}` }
  if (resolved.some(a => isPrivateAddress(a.address))) return { error: PRIVATE_ADDRESS_ERROR }
  return { addresses: resolved.map(a => a.address) }
}
