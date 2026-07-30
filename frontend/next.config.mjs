/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Linting runs as its own step (`npm run lint` → eslint, and a dedicated CI
  // job), NOT during the build. Decided on Next 14, whose built-in build lint
  // drove the ESLint 8 API and errored against ESLint 9:
  //   ⨯ ESLint: Invalid Options: - Unknown options: useEslintrc, extensions
  // It printed that while still exiting 0, i.e. the build *looked* linted and
  // wasn't. Turning it off makes the truth explicit instead. Kept off on
  // Next 15 deliberately — build-lint is deprecated in 15 and removed in 16,
  // and the dedicated lint step is the one CI actually gates on. See
  // eslint.config.mjs.
  eslint: { ignoreDuringBuilds: true },
  images: {
    domains: ['assets.coingecko.com', 'cryptologos.cc', 'raw.githubusercontent.com'],
    formats: ['image/avif', 'image/webp'],
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    return [
      {
        // Proxies leftover /api/* traffic to the legacy backend.
        //
        // `/api/auth/` is excluded because Auth.js owns it, and `/api/user/`
        // because the DB-backed user-data routes (builder plans, portfolios…)
        // live there. This rewrite runs in the default `afterFiles` phase,
        // which resolves *after* concrete file routes but *before* dynamic
        // ones — so /api/auth/signup (a real file) reached its handler while
        // /api/auth/csrf and /api/auth/callback/* (served by the [...nextauth]
        // catch-all) were silently proxied to the dormant backend and 500'd.
        // The same trap catches any dynamic segment: /api/user/builder-plans/
        // [id] would proxy too. First-party routes with dynamic params MUST
        // live under an excluded prefix — add new prefixes here, not routes
        // outside /api/user/.
        source: '/api/:path((?!auth/|user/).*)',
        destination: `${apiUrl}/api/:path`,
      },
    ]
  },
  async redirects() {
    return [
      // Global page de-routed pending a post-production rework (see T5 triage:
      // docs/assessments/T5-utility-triage.md). The page and its
      // /live-data/cbdc-data route are intentionally LEFT IN PLACE — this only
      // removes user access. Delete this entry to re-enable the page.
      { source: '/global-adoption', destination: '/headlines', permanent: false },
      // Risk Case Studies removed (2026-07): static educational replay with no
      // clear user value — page deleted, deep links land on Headlines.
      { source: '/backtests', destination: '/headlines', permanent: false },
      // Reserve Transparency Monitor folded into the Coins page (2026-07-29).
      // It duplicated /assets' "Reserve Monitor" tab — same route, same table,
      // same detail panel — while being the only copy that carried the
      // provenance disclosure and the peg-mechanism fix. One surface now, with
      // those corrections, in components/analytics/reserves.
      //
      // Unlike the two redirects above this preserves the destination content:
      // ?tab=reserves opens the same monitor the old URL showed, so bookmarks
      // still work rather than dumping the reader on an unrelated page.
      { source: '/reserves', destination: '/assets?tab=reserves', permanent: false },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ]
  },
}

export default nextConfig
