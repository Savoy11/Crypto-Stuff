// Live-data accuracy test harness.
// Hits every /live-data/* and /api/v1/* route against the running dev server
// (which in turn calls the real upstream APIs), validates response shape, and
// sanity-checks the actual values. Run with: node scripts/test-live-data.mjs
//
// Exit code 0 = all pass, 1 = at least one failure.

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

const results = []
function pass(name, detail) { results.push({ name, ok: true, detail }) }
function fail(name, detail) { results.push({ name, ok: false, detail }) }

async function getJson(path) {
  const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = null }
  return { status: res.status, json, text, headers: res.headers }
}

// A test = { path, name, check(json,status,headers) -> string|true }. Returning a
// string means PASS with that detail; throwing or returning false-y means FAIL.
const tests = [
  // ── /live-data ────────────────────────────────────────────────────────────
  { path: '/live-data/markets', name: 'markets', check: (j) => {
    const quotes = j.quotes ?? (Array.isArray(j) ? null : j)
    const entries = quotes && !Array.isArray(quotes) ? Object.entries(quotes) : []
    if (entries.length === 0) throw new Error('no market rows')
    const px = quotes.btc?.price
    if (px && (px < 1000 || px > 5_000_000)) throw new Error(`BTC price implausible: ${px}`)
    return `${entries.length} assets${px ? `, BTC=$${Math.round(px).toLocaleString()}` : ''}`
  }},
  { path: '/live-data/ohlcv?id=btc&range=1Y', name: 'ohlcv btc 1Y', check: (j) => {
    if (!j.ok || !Array.isArray(j.candles)) throw new Error('not ok / no candles')
    if (j.candles.length < 100) throw new Error(`only ${j.candles.length} candles for 1Y`)
    const c = j.candles.at(-1)
    if (!(c.high >= c.low && c.high >= c.open && c.high >= c.close)) throw new Error('OHLC invariant broken')
    return `${j.candles.length} candles, source=${j.source}, last close=$${Math.round(c.close).toLocaleString()}`
  }},
  { path: '/live-data/ohlcv?id=xrp&range=6M', name: 'ohlcv xrp 6M (regression)', check: (j) => {
    if (!j.ok || !Array.isArray(j.candles) || j.candles.length < 100) throw new Error(`xrp 6M sparse: ${j.candles?.length}`)
    return `${j.candles.length} candles, source=${j.source}`
  }},
  { path: '/live-data/ohlcv?id=eth&range=MAX', name: 'ohlcv eth MAX', check: (j) => {
    if (!j.ok || !Array.isArray(j.candles) || j.candles.length < 50) throw new Error(`eth MAX: ${j.candles?.length}`)
    return `${j.candles.length} candles, source=${j.source}`
  }},
  { path: '/live-data/fear-greed', name: 'fear-greed', check: (j) => {
    const v = j.value ?? j.now?.value ?? j.data?.[0]?.value
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`value out of range: ${v}`)
    return `index=${n}`
  }},
  { path: '/live-data/defi-tvl', name: 'defi-tvl', check: (j) => {
    const tvl = j.totalTvl ?? j.tvl ?? j.total ?? j.current
    if (!Number.isFinite(Number(tvl)) || Number(tvl) < 1e9) throw new Error(`TVL implausible: ${tvl}`)
    return `TVL=$${(Number(tvl)/1e9).toFixed(1)}B`
  }},
  { path: '/live-data/btc-stats', name: 'btc-stats', check: (j) => {
    if (!j || typeof j !== 'object') throw new Error('no object')
    const keys = Object.keys(j)
    if (keys.length === 0) throw new Error('empty')
    return `keys: ${keys.slice(0,6).join(', ')}`
  }},
  { path: '/live-data/funding-rates', name: 'funding-rates', check: (j) => {
    const arr = Array.isArray(j) ? j : (j.rates ?? j.data)
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('no rates')
    return `${arr.length} instruments`
  }},
  { path: '/live-data/network-fees', name: 'network-fees', check: (j) => {
    const obj = j.networks ?? j.fees ?? j
    const count = Array.isArray(obj) ? obj.length : Object.keys(obj).length
    if (count < 5) throw new Error(`only ${count} networks`)
    return `${count} networks`
  }},
  { path: '/live-data/staking-rates', name: 'staking-rates', check: (j) => {
    const obj = j.rates ?? j
    const keys = Array.isArray(obj) ? obj : Object.keys(obj)
    if (!keys || keys.length === 0) throw new Error('no rates')
    return `${keys.length} rate entries`
  }},
  { path: '/live-data/staking-discovery', name: 'staking-discovery', check: (j) => {
    const arr = Array.isArray(j) ? j : (j.pools ?? j.opportunities ?? j.providers ?? j.data ?? j.results)
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('no pools')
    const apys = arr.map((p) => p.apy).filter((n) => Number.isFinite(n))
    return `${arr.length} pools, APY ${Math.min(...apys).toFixed(1)}–${Math.max(...apys).toFixed(1)}%`
  }},
  { path: '/live-data/coin-discovery', name: 'coin-discovery', check: (j) => {
    const arr = Array.isArray(j) ? j : (j.candidates ?? j.coins ?? j.data ?? j.results)
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('no candidates')
    return `${arr.length} candidates`
  }},
  { path: '/live-data/coin-search?q=bitcoin', name: 'coin-search', check: (j) => {
    const arr = Array.isArray(j) ? j : (j.results ?? j.coins ?? j.data)
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('no results for "bitcoin"')
    return `${arr.length} matches`
  }},
  { path: '/live-data/news?coin=btc&limit=10', name: 'news', check: (j) => {
    const arr = Array.isArray(j) ? j : (j.articles ?? j.items ?? j.data)
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('no articles')
    const withTitle = arr.filter((a) => a.title || a.headline).length
    return `${arr.length} articles, ${withTitle} titled`
  }},
  { path: '/live-data/social?coin=btc', name: 'social', check: (j) => {
    if (!j || typeof j !== 'object') throw new Error('no payload')
    return `keys: ${Object.keys(j).slice(0,5).join(', ') || 'empty'}`
  }},
  { path: '/live-data/reserves', name: 'reserves', check: (j) => {
    if (!j || typeof j !== 'object') throw new Error('no payload')
    return `keys: ${Object.keys(j).slice(0,5).join(', ')}`
  }},
  { path: '/live-data/cbdc-data', name: 'cbdc-data', check: (j) => {
    const arr = Array.isArray(j) ? j : (j.countries ?? j.data ?? j.cbdcs)
    if (!Array.isArray(arr) && typeof j !== 'object') throw new Error('no payload')
    return Array.isArray(arr) ? `${arr.length} entries` : `keys: ${Object.keys(j).slice(0,5).join(', ')}`
  }},
  { path: '/live-data/portfolio-prices?ids=bitcoin,ethereum,solana', name: 'portfolio-prices', check: (j) => {
    const n = Object.keys(j.prices ?? {}).length
    if (n === 0) throw new Error(`no prices (source=${j.source}, missing=${(j.missing||[]).join(',')})`)
    return `${n} priced (source=${j.source})`
  }},
  { path: '/live-data/portfolio-history?coins=btc&days=30', name: 'portfolio-history', check: (j) => {
    if (!j || typeof j !== 'object') throw new Error('no payload')
    return `keys: ${Object.keys(j).slice(0,5).join(', ')}`
  }},
  { path: '/live-data/chart?id=btc&days=30', name: 'chart', check: (j) => {
    if (!j || typeof j !== 'object') throw new Error('no payload')
    return `keys: ${Object.keys(j).slice(0,5).join(', ')}`
  }},
  { path: '/live-data/config', name: 'config (providers)', check: (j) => {
    if (!Array.isArray(j.providers)) throw new Error('no providers array')
    const leaked = j.providers.find((p) => p.config && p.config.apiKey)
    if (leaked) throw new Error(`API key leaked to client for ${leaked.id}`)
    return `${j.providers.length} providers, no keys leaked`
  }},
  { path: '/live-data/alerts', name: 'alerts', check: (j) => {
    if (!j) throw new Error('no payload'); return 'ok'
  }},

  // ── /api/v1 (agent-facing) ──────────────────────────────────────────────────
  { path: '/api/v1/', name: 'v1 discovery', check: (j, s, h) => {
    if (!Array.isArray(j.endpoints)) throw new Error('no endpoints')
    if (h.get('access-control-allow-origin') !== '*') throw new Error('missing CORS header')
    return `${j.endpoints.length} endpoints, CORS ok`
  }},
  { path: '/api/v1/prices?coins=btc,eth', name: 'v1 prices', check: (j) => {
    const obj = j.prices ?? j.data ?? j
    const n = Array.isArray(obj) ? obj.length : Object.keys(obj).length
    if (n < 1) throw new Error('no prices')
    return `${n} coins`
  }},
  { path: '/api/v1/exchanges', name: 'v1 exchanges', check: (j) => {
    const arr = Array.isArray(j) ? j : (j.exchanges ?? j.data)
    if (!Array.isArray(arr) || arr.length < 10) throw new Error(`only ${arr?.length} exchanges`)
    return `${arr.length} exchanges`
  }},
  { path: '/api/v1/network-fees', name: 'v1 network-fees', check: (j) => {
    const arr = Array.isArray(j) ? j : (j.networks ?? j.fees ?? j.data)
    const n = Array.isArray(arr) ? arr.length : Object.keys(arr ?? {}).length
    if (n < 10) throw new Error(`only ${n} networks`)
    return `${n} networks`
  }},
  { path: '/api/v1/staking/opportunities?coin=eth', name: 'v1 staking', check: (j) => {
    const arr = Array.isArray(j) ? j : (j.opportunities ?? j.data)
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('no opportunities')
    return `${arr.length} ETH staking options`
  }},
  { path: '/api/v1/news?coin=btc&limit=5', name: 'v1 news', check: (j) => {
    const arr = Array.isArray(j) ? j : (j.articles ?? j.data ?? j.news)
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('no articles')
    return `${arr.length} articles`
  }},
  { path: '/api/v1/transfer/routes?from=binance&to=coinbase&coin=usdt&amount=1000', name: 'v1 transfer routes', check: (j) => {
    const arr = Array.isArray(j) ? j : (j.routes ?? j.data)
    if (!Array.isArray(arr)) throw new Error('no routes array')
    return `${arr.length} routes`
  }},
  { path: '/api/v1/openapi.json', name: 'v1 openapi', check: (j) => {
    if (!j.openapi || !j.paths) throw new Error('not a valid openapi doc')
    return `openapi ${j.openapi}, ${Object.keys(j.paths).length} paths`
  }},
  // Error handling: bad transfer params should 400, not 500
  { path: '/api/v1/transfer/routes', name: 'v1 transfer (missing params → 400)', check: (j, s) => {
    if (s !== 400) throw new Error(`expected 400, got ${s}`)
    return 'correctly rejected'
  }},

  // ── agent prompts ─────────────────────────────────────────────────────────
  { path: '/api/agents/prompts', name: 'agent prompts list', check: (j, s, h) => {
    if (!Array.isArray(j.agents) || j.agents.length !== 3) throw new Error(`expected 3 agents, got ${j.agents?.length}`)
    if (h.get('access-control-allow-origin') !== '*') throw new Error('missing CORS header')
    return `${j.agents.length} agents, CORS ok`
  }},
]

const run = async () => {
  for (const t of tests) {
    try {
      const { status, json, headers } = await getJson(t.path)
      if (json === null && status >= 400 && !t.name.includes('400')) {
        fail(t.name, `HTTP ${status}, non-JSON body`)
        continue
      }
      const detail = t.check(json ?? {}, status, headers)
      pass(t.name, typeof detail === 'string' ? detail : `HTTP ${status}`)
    } catch (e) {
      fail(t.name, e.message)
    }
  }

  const passed = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  console.log('\n══════════════ LIVE DATA TEST RESULTS ══════════════\n')
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'}  ${r.name.padEnd(36)} ${r.detail ?? ''}`)
  }
  console.log(`\n${passed.length}/${results.length} passed, ${failed.length} failed\n`)
  process.exit(failed.length === 0 ? 0 : 1)
}

run()
