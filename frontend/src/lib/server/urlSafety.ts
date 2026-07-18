// Server-side URL validation for user-supplied endpoints (custom providers).
// Prevents SSRF: the server must never be coaxed into fetching internal,
// loopback, link-local, or cloud-metadata addresses.

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

/**
 * Validate a user-supplied URL is a public http(s) endpoint.
 * Returns an error message, or null when the URL is acceptable.
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
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    BLOCKED_HOST_SUFFIXES.some(s => host.endsWith(s)) ||
    !host.includes('.') ||                                       // bare hostnames resolve internally
    isPrivateIpv4(host) ||
    isPrivateIpv6(host)
  ) {
    return 'URL points to a private or internal address — only public endpoints are allowed'
  }
  return null
}
