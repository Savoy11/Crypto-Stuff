#!/usr/bin/env node
// Finance Now live-data audit harness.
//
// Hits every /live-data/*, /api/v1/* and agent route against the running dev
// server (which in turn calls the real upstream APIs), validates response shape,
// sanity-checks the actual values, and — the part that matters most —
// classifies the PROVENANCE of what came back.
//
// ── Why provenance classification exists ──────────────────────────────────────
// A route that returns HTTP 200 with stale, reference, or empty data is more
// dangerous than one that returns 500, because every downstream check reads it
// as healthy and any resulting inaccuracy gets misattributed to the UI layer.
// Before this harness had provenance checks it reported 43/43 PASS while
// /live-data/stock-universe was serving a 79-entry hand-written catalog and
// /live-data/fund-holdings was serving 5 indicative holdings from a static file.
// Both were "working". Neither was real.
//
// Every test therefore returns a verdict, not just pass/fail:
//   REAL          — verified live data from the intended upstream
//   FALLBACK      — HTTP 200, but served from a static catalog / reference /
//                   estimate path instead of the intended upstream
//   UNCONFIGURED  — key-gated and honestly reporting it (configured:false)
//   EMPTY         — HTTP 200, well-formed, but carries no data
//   FAIL          — non-2xx, ok:false, or a value that failed a sanity check
//
// Exit code: 0 only if there are no FAILs. FALLBACK/EMPTY/UNCONFIGURED are
// reported loudly but do not fail the run by default, because several are the
// correct behaviour on a free-tier key set. Use --strict to fail on those too.
//
// ── Usage ─────────────────────────────────────────────────────────────────────
//   node scripts/test-live-data.mjs           # full audit      (npm run audit)
//   node scripts/test-live-data.mjs --quick   # fast CI subset  (npm run smoke)
//   node scripts/test-live-data.mjs --strict  # FALLBACK/EMPTY also fail
//   node scripts/test-live-data.mjs --json    # machine-readable output
//   BASE_URL=https://… node scripts/test-live-data.mjs
//
// Requires the app to be running.
//
// This file is the single live-data harness. The former scripts/smoke.mjs was a
// lighter, overlapping check; its unique cross-layer consistency assertions were
// folded in below (see the "cross-layer" group) so the two cannot drift apart.

const BASE = process.env.BASE_URL ?? process.env.FN_BASE_URL ?? process.env.CAEP_BASE_URL ?? 'http://localhost:3000'
const ARGS = new Set(process.argv.slice(2))
const QUICK = ARGS.has('--quick')
const STRICT = ARGS.has('--strict')
const JSON_OUT = ARGS.has('--json')

// ── Verdicts ──────────────────────────────────────────────────────────────────
const REAL = 'REAL'
const FALLBACK = 'FALLBACK'
const UNCONFIGURED = 'UNCONFIGURED'
const EMPTY = 'EMPTY'
const FAIL = 'FAIL'

const ICON = { REAL: '🟢', FALLBACK: '🟡', UNCONFIGURED: '🔑', EMPTY: '⚪', FAIL: '🔴' }

// Helpers a check() can return to declare a non-REAL verdict without throwing.
const fallback = (detail) => ({ verdict: FALLBACK, detail })
const unconfigured = (detail) => ({ verdict: UNCONFIGURED, detail })
const empty = (detail) => ({ verdict: EMPTY, detail })

const results = []

async function getJson(path) {
  const t0 = Date.now()
  const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } })
  const text = await res.text()
  const ms = Date.now() - t0
  let json = null
  try { json = JSON.parse(text) } catch { /* non-JSON body */ }
  return { status: res.status, json, text, headers: res.headers, ms }
}

// A test = { path, name, group, quick?, expectStatus?, check(json,status,headers) }
// check() returns: a string (REAL + detail) | { verdict, detail } | throws (FAIL).
const tests = [
  // ── Crypto market data ──────────────────────────────────────────────────────
  { group: 'crypto/market', path: '/live-data/markets', name: 'markets', quick: true, check: (j) => {
    const quotes = j.quotes ?? {}
    const entries = Object.entries(quotes)
    if (entries.length === 0) throw new Error('no market rows')
    const px = quotes.btc?.price
    if (!(px > 1000 && px < 5_000_000)) throw new Error(`BTC price implausible: ${px}`)
    const eth = quotes.eth?.price
    if (!(eth > 100 && eth < 100_000)) throw new Error(`ETH price implausible: ${eth}`)
    const usdc = quotes.usdc?.price
    if (typeof usdc === 'number' && Math.abs(usdc - 1) > 0.05) throw new Error(`USDC depegged in feed: ${usdc}`)
    if (String(j.source ?? '').includes('-fallback')) {
      return fallback(`${entries.length} assets via fallback source=${j.source}`)
    }
    return `${entries.length} assets, source=${j.source}, BTC=$${Math.round(px).toLocaleString()}`
  }},

  { group: 'crypto/market', path: '/live-data/ohlcv?id=btc&range=1Y', name: 'ohlcv btc 1Y', quick: true, check: (j) => {
    if (!j.ok || !Array.isArray(j.candles)) throw new Error('not ok / no candles')
    if (j.candles.length < 100) throw new Error(`only ${j.candles.length} candles for 1Y`)
    const c = j.candles.at(-1)
    if (!(c.high >= c.low && c.high >= c.open && c.high >= c.close)) throw new Error('OHLC invariant broken')
    // Degenerate candles (o==h==l==c) mean a price series was reshaped to look
    // like OHLCV — real candles must show intra-period range.
    const flat = j.candles.filter((k) => k.open === k.high && k.high === k.low && k.low === k.close).length
    if (flat > j.candles.length * 0.5) throw new Error(`${flat}/${j.candles.length} candles have zero range — not real OHLC`)
    // Binance.com is geo-blocked (451) from some regions; the route silently
    // falls back to the Binance.US mirror, which is a DIFFERENT venue with its
    // own liquidity and prices. `venue` surfaces which one actually served.
    if (j.source === 'binance' && j.venue === 'binance-us') {
      return fallback(`${j.candles.length} candles — Binance.com geo-blocked, served by Binance.US (different venue/prices)`)
    }
    return `${j.candles.length} candles, source=${j.source}${j.venue ? ` (${j.venue})` : ''}, last=$${Math.round(c.close).toLocaleString()}`
  }},

  { group: 'crypto/market', path: '/live-data/ohlcv?id=xrp&range=6M', name: 'ohlcv xrp 6M (regression)', check: (j) => {
    if (!j.ok || !Array.isArray(j.candles) || j.candles.length < 100) throw new Error(`xrp 6M sparse: ${j.candles?.length}`)
    if (j.source === 'binance' && j.venue === 'binance-us') return fallback(`${j.candles.length} candles via Binance.US`)
    return `${j.candles.length} candles, source=${j.source}`
  }},

  { group: 'crypto/market', path: '/live-data/ohlcv?id=eth&range=MAX', name: 'ohlcv eth MAX', check: (j) => {
    if (!j.ok || !Array.isArray(j.candles) || j.candles.length < 50) throw new Error(`eth MAX: ${j.candles?.length}`)
    if (j.source === 'binance' && j.venue === 'binance-us') return fallback(`${j.candles.length} candles via Binance.US`)
    return `${j.candles.length} candles, source=${j.source}`
  }},

  { group: 'crypto/market', path: '/live-data/chart?id=btc&days=30', name: 'chart (synthetic OHLC proxy)', check: (j) => {
    if (!j.ok || !Array.isArray(j.candles) || j.candles.length === 0) throw new Error('no candles')
    const flat = j.candles.filter((k) => k.open === k.high && k.high === k.low && k.low === k.close).length
    // This route builds candles from CoinGecko's price-only series, so every
    // candle is legitimately zero-range. It must SAY so, or a consumer will
    // mistake it for real OHLCV (the shape is identical).
    if (flat === j.candles.length && !j.synthetic) {
      throw new Error('all candles zero-range but payload lacks synthetic:true marker')
    }
    return j.synthetic
      ? fallback(`${j.candles.length} price points, correctly marked synthetic:true (not real OHLC)`)
      : `${j.candles.length} candles`
  }},

  { group: 'crypto/market', path: '/live-data/coin-list', name: 'coin-list', check: (j) => {
    if (!j.ok || !Array.isArray(j.coins) || j.coins.length === 0) throw new Error(`no coins (source=${j.source})`)
    if (j.source === 'none' || j.source === 'error') return fallback(`source=${j.source}`)
    return `${j.coins.length} coins, source=${j.source}`
  }},

  { group: 'crypto/market', path: '/live-data/coin-search?q=bitcoin', name: 'coin-search', check: (j) => {
    const arr = j.coins ?? j.results ?? []
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('no results for "bitcoin"')
    return `${arr.length} matches`
  }},

  { group: 'crypto/market', path: '/live-data/coin-discovery', name: 'coin-discovery', check: (j) => {
    const arr = j.candidates ?? []
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('no candidates')
    return `${arr.length} candidates`
  }},

  { group: 'crypto/market', path: '/live-data/assets/list', name: 'assets/list', check: (j) => {
    const arr = j.assets ?? []
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('no assets')
    return `${arr.length} assets (static catalog by design)`
  }},

  { group: 'crypto/market', path: '/live-data/fear-greed', name: 'fear-greed', quick: true, check: (j) => {
    const n = Number(j.value ?? j.now?.value)
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`value out of range: ${j.value}`)
    return `index=${n}`
  }},

  { group: 'crypto/market', path: '/live-data/funding-rates', name: 'funding-rates', check: (j) => {
    const arr = j.rates ?? []
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('no rates')
    // Binance fapi is geo-blocked (451) here; the route uses OKX instead.
    const srcs = [...new Set(arr.map((r) => r.exchange ?? r.source).filter(Boolean))]
    return `${arr.length} instruments${srcs.length ? ` via ${srcs.join(', ')}` : ''}`
  }},

  { group: 'crypto/market', path: '/live-data/defi-tvl', name: 'defi-tvl', check: (j) => {
    const tvl = Number(j.totalTvl ?? j.tvl ?? j.total)
    if (!Number.isFinite(tvl) || tvl < 1e9) throw new Error(`TVL implausible: ${tvl}`)
    return `TVL=$${(tvl / 1e9).toFixed(1)}B, ${(j.protocols ?? []).length} protocols`
  }},

  { group: 'crypto/market', path: '/live-data/btc-stats', name: 'btc-stats', check: (j) => {
    if (!j.ok) throw new Error('not ok')
    if (!(j.blockHeight > 800_000)) throw new Error(`block height implausible: ${j.blockHeight}`)
    return `height=${j.blockHeight}, hashrate=${j.hashrateTHs ? Math.round(j.hashrateTHs / 1e6) + ' EH/s' : '?'}`
  }},

  { group: 'crypto/market', path: '/live-data/network-fees', name: 'network-fees', quick: true, check: (j) => {
    const nets = j.networkFees ?? {}
    const count = Object.keys(nets).length
    if (count < 10) throw new Error(`only ${count} networks`)
    if (j.btcFeeSource !== 'live') return fallback(`BTC fee not live (btcFeeSource=${j.btcFeeSource})`)
    // Only Bitcoin is a live fee; every other chain is static-gas × live-price.
    const live = Object.values(nets).filter((f) => f.source === 'live').length
    return `${count} networks, ${live} live / ${count - live} estimated (by design)`
  }},

  { group: 'crypto/market', path: '/live-data/reserves', name: 'reserves', check: (j) => {
    if (!j.ok || !Array.isArray(j.assets) || j.assets.length === 0) throw new Error('no reserve assets')
    return `${j.assets.length} stablecoins`
  }},

  { group: 'crypto/market', path: '/live-data/risk-scores', name: 'risk-scores', check: (j) => {
    if (!j.ok) throw new Error('not ok')
    const sc = j.stablecoins ?? []
    if (sc.length === 0) throw new Error('no stablecoin scores')
    return `${sc.length} stablecoin composites`
  }},

  { group: 'crypto/market', path: '/live-data/alerts', name: 'alerts', check: (j) => {
    if (!j.ok) throw new Error('not ok')
    return `${(j.alerts ?? []).length} alerts`
  }},

  { group: 'crypto/market', path: '/live-data/cbdc-data', name: 'cbdc-data', check: (j) => {
    const arr = j.countries ?? []
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('no countries')
    if (j.source === 'fallback') {
      return fallback(`${arr.length} countries from static table (live CBDC news feed unavailable)`)
    }
    return `${arr.length} countries, source=${j.source}`
  }},

  // ── Staking ─────────────────────────────────────────────────────────────────
  { group: 'crypto/staking', path: '/live-data/staking-rates', name: 'staking-rates', quick: true, check: (j) => {
    if (!j.ok) throw new Error('not ok')
    const rates = j.rates ?? {}
    const sources = j.sources ?? {}
    const keys = Object.keys(rates)
    if (keys.length === 0) throw new Error('no rates')
    // The DeFiLlama + native-rate expansion added ~23 protocol keys to the
    // fallback table, so a current route ALWAYS returns ~51 keys regardless of
    // which upstreams the running IP can reach (these are fallback keys — their
    // presence is IP-independent). Far fewer keys means the server is running
    // pre-expansion code (a stale dev server / old checkout) — fail loudly here
    // rather than let the run pass green against code that isn't the branch's.
    const REQUIRED_KEYS = ['frax_eth', 'renzo_eth', 'kelp_eth', 'benqi_avax', 'lombard_btc', 'quicksilver_atom']
    const missingKeys = REQUIRED_KEYS.filter((k) => !(k in rates))
    if (missingKeys.length) throw new Error(`missing expanded staking keys (stale server / old code?): ${missingKeys.join(', ')} — only ${keys.length} keys returned`)
    const bad = keys.filter((k) => !(rates[k] >= 0 && rates[k] < 100))
    if (bad.length) throw new Error(`APR out of [0,100): ${bad.join(', ')}`)
    const live = keys.filter((k) => sources[k] === 'live')
    // Docs have historically claimed stETH + mSOL + jitoSOL are all live.
    // Assert that explicitly so a dead upstream cannot quietly become an
    // "estimate" while the docs still advertise it as live.
    const advertised = ['lido_eth', 'marinade_sol', 'jito_sol']
    const notLive = advertised.filter((k) => sources[k] && sources[k] !== 'live')
    if (notLive.length) {
      return fallback(`${live.length}/${keys.length} live — but advertised-live rates are estimates: ${notLive.map((k) => `${k}=${sources[k]}`).join(', ')}`)
    }
    return `${live.length}/${keys.length} live APRs`
  }},

  { group: 'crypto/staking', path: '/live-data/staking-discovery', name: 'staking-discovery', check: (j) => {
    if (!j.ok || !Array.isArray(j.pools) || j.pools.length === 0) throw new Error('no pools')
    const apys = j.pools.map((p) => p.apy).filter(Number.isFinite)
    if (apys.some((a) => a < 0 || a > 1000)) throw new Error('implausible APY present')
    return `${j.pools.length} pools, APY ${Math.min(...apys).toFixed(1)}–${Math.max(...apys).toFixed(1)}%`
  }},

  // ── News & social ───────────────────────────────────────────────────────────
  { group: 'crypto/news', path: '/live-data/news?coin=btc&limit=10', name: 'news', quick: true, check: (j) => {
    const arr = j.articles ?? []
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('no articles')
    // NB: crypto news articles use `headline`; equity market-news uses `title`.
    const titled = arr.filter((a) => a.headline || a.title).length
    if (titled === 0) throw new Error('articles have no headline/title')
    if (titled < arr.length) throw new Error(`${arr.length - titled}/${arr.length} articles missing a headline`)
    return `${arr.length} articles from ${(j.providers ?? []).length} providers`
  }},

  { group: 'crypto/news', path: '/live-data/social?coin=btc', name: 'social (reddit RSS)', check: (j) => {
    if (!j.ok) throw new Error('not ok')
    const sig = j.signals ?? []
    if (sig.length === 0) return empty('0 signals — Reddit RSS likely rate-limited (429) from this IP')
    const platforms = [...new Set(sig.map((s) => s.platform))]
    // Reddit's JSON API 403s server-side; only the Atom (.rss) feeds work, and
    // they 429 aggressively. Partial coverage is the norm, not a bug.
    if (!platforms.includes('reddit')) {
      return fallback(`${sig.length} signals but no Reddit — RSS feeds rate-limited`)
    }
    return `${sig.length} signals via ${platforms.join(', ')}`
  }},

  { group: 'crypto/video', path: '/live-data/videos', name: 'videos', check: (j) => {
    if (!j.ok) throw new Error('not ok')
    const v = j.videos ?? []
    if (v.length === 0) return empty('0 videos')
    return `${v.length} videos`
  }},

  { group: 'crypto/video', path: '/live-data/video-search?q=bitcoin', name: 'video-search', check: (j) => {
    if (!j.ok) throw new Error('not ok')
    if (j.configured === false) return unconfigured('no YouTube API key configured (honestly reported)')
    if ((j.videos ?? []).length === 0) return empty('configured but 0 results')
    return `${j.videos.length} videos`
  }},

  // ── Portfolio & wallets ─────────────────────────────────────────────────────
  { group: 'crypto/portfolio', path: '/live-data/portfolio-prices?ids=bitcoin,ethereum,solana', name: 'portfolio-prices', check: (j) => {
    const n = Object.keys(j.prices ?? {}).length
    if (n === 0) throw new Error(`no prices (source=${j.source}, missing=${(j.missing || []).join(',')})`)
    if (j.source === 'partial') return fallback(`${n}/3 priced, source=partial, missing=${(j.missing || []).join(',')}`)
    if (j.source === 'error') throw new Error('source=error')
    return `${n}/3 priced (source=${j.source})`
  }},

  { group: 'crypto/portfolio', path: '/live-data/portfolio-history?ids=bitcoin&date=2026-06-01', name: 'portfolio-history', check: (j) => {
    const n = Object.keys(j.prices ?? {}).length
    if (j.source === 'error' || n === 0) throw new Error(`no historical prices (source=${j.source})`)
    if (j.source === 'partial') return fallback(`partial history, ${n} priced`)
    return `${n} coin priced on ${j.date} (source=${j.source})`
  }},

  // Params are required; a missing-param request must be rejected, not answered
  // with a 200 that a caller could mistake for "no data available".
  { group: 'crypto/portfolio', path: '/live-data/portfolio-history', name: 'portfolio-history (missing params → 400)', check: (j, s) => {
    if (s !== 400) throw new Error(`expected 400 for missing params, got ${s} (source=${j.source})`)
    return 'correctly rejected'
  }},

  { group: 'crypto/wallet', path: '/live-data/wallet/btc?address=1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', name: 'wallet btc', check: (j) => {
    if (!j.ok) throw new Error(j.error ?? 'not ok')
    if (typeof j.balance !== 'number') throw new Error('no balance')
    return `balance=${j.balance} BTC`
  }},

  // Ethereum mainnet is the most-used chain here and was hard-502ing because the
  // single configured RPC (cloudflare-eth.com) started returning -32603. The
  // route now walks a ladder of public endpoints and reports which one served.
  { group: 'crypto/wallet', path: '/live-data/wallet/eth?address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', name: 'wallet eth (mainnet)', quick: true, check: (j) => {
    if (!j.ok) throw new Error(j.error ?? 'not ok')
    if (!(j.balance >= 0) || !(j.txCount > 0)) throw new Error(`implausible: balance=${j.balance} txCount=${j.txCount}`)
    return `${j.balance.toFixed(4)} ETH, ${j.txCount} txs, via ${j.rpc ?? 'unknown rpc'}`
  }},

  { group: 'crypto/wallet', path: '/live-data/wallet/eth?address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&chain=polygon', name: 'wallet eth (polygon)', check: (j) => {
    if (!j.ok) throw new Error(j.error ?? 'not ok')
    return `${j.balance.toFixed(2)} ${j.symbol}, via ${j.rpc ?? 'unknown rpc'}`
  }},

  { group: 'crypto/wallet', path: '/live-data/wallet/sol?address=9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', name: 'wallet sol', check: (j) => {
    if (!j.ok) throw new Error(j.error ?? 'not ok')
    return `balance=${j.balance} SOL`
  }},

  { group: 'crypto/wallet', path: '/live-data/wallet/tron?address=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', name: 'wallet tron', check: (j) => {
    if (!j.ok) throw new Error(j.error ?? 'not ok')
    return `balance=${j.balance} TRX`
  }},

  { group: 'crypto/wallet', path: '/live-data/wallet/xrp?address=rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh', name: 'wallet xrp', check: (j) => {
    if (!j.ok) throw new Error(j.error ?? 'not ok')
    return `balance=${j.balance} XRP`
  }},

  { group: 'crypto/wallet', path: '/live-data/wallet/exchange-connections', name: 'wallet exchange-connections', check: (j) => {
    if (!j.ok) throw new Error('not ok')
    const n = (j.connections ?? []).length
    return n === 0 ? empty('0 exchange connections configured') : `${n} connections`
  }},

  // ── Pump report ─────────────────────────────────────────────────────────────
  { group: 'crypto/pump', path: '/live-data/pump-report/metrics', name: 'pump-report metrics', check: (j) => {
    if (!j.ok) throw new Error('not ok')
    const m = j.metrics ?? []
    if (m.length === 0) return empty('0 metrics')
    return `${m.length} metrics`
  }},

  // ── Equities ────────────────────────────────────────────────────────────────
  { group: 'equities', path: '/live-data/security-quotes?symbols=AAPL,MSFT,BRK-B', name: 'security-quotes (provider ladder)', quick: true, check: (j) => {
    if (!j.ok || !j.quotes) throw new Error('no quotes payload')
    const all = Object.values(j.quotes)
    const ref = all.filter((q) => q.reference)
    if (j.source === 'reference' || ref.length === all.length) {
      return fallback(`all ${all.length} quotes are static catalog reference prices (source=${j.source})`)
    }
    const aapl = j.quotes.AAPL
    if (!aapl || !(aapl.price > 10 && aapl.price < 5000)) throw new Error(`AAPL price implausible: ${aapl?.price}`)
    if (ref.length > 0) return fallback(`${all.length - ref.length}/${all.length} live via ${j.source}, ${ref.length} reference`)
    return `${all.length}/${all.length} live via ${j.source}, AAPL=$${aapl.price.toFixed(2)}`
  }},

  { group: 'equities', path: '/live-data/security-ohlcv?symbol=AAPL&range=6M', name: 'security-ohlcv', quick: true, check: (j) => {
    if (!j.ok || !Array.isArray(j.candles) || j.candles.length < 80) throw new Error(`sparse candles: ${j.candles?.length} (source=${j.source})`)
    const c = j.candles.at(-1)
    if (!(c.high >= c.low && c.high >= c.open && c.high >= c.close)) throw new Error('OHLC invariant broken')
    if (j.source === 'none') throw new Error('no source served')
    return `${j.candles.length} candles via ${j.source}`
  }},

  // NB: security-chart takes Yahoo-style ranges (6mo), while its sibling
  // security-ohlcv takes 6M. Different vocabulary, same concept — asserted here
  // so the inconsistency is visible rather than surprising a caller with a 400.
  { group: 'equities', path: '/live-data/security-chart?symbol=AAPL&range=6mo', name: 'security-chart', check: (j) => {
    if (!j.ok || !j.chart) throw new Error('no chart payload')
    const pts = j.chart.points ?? []
    if (pts.length < 80) throw new Error(`sparse series: ${pts.length}`)
    return `${pts.length} close points (close-only by design)`
  }},

  { group: 'equities', path: '/live-data/security-chart?symbol=AAPL&range=6M', name: 'security-chart (wrong range vocab → 400)', check: (j, s) => {
    if (s !== 400) throw new Error(`expected 400 for bad range, got ${s}`)
    return 'correctly rejected (use 6mo not 6M)'
  }},

  { group: 'equities', path: '/live-data/security-returns?symbols=AAPL,MSFT', name: 'security-returns', check: (j) => {
    if (!j.ok) throw new Error('not ok')
    if (j.source === 'none') return fallback('source=none, no returns served')
    const n = Object.keys(j.returns ?? {}).length
    if (n === 0) return empty('0 symbols returned')
    return `${n} symbols via ${j.source}`
  }},

  { group: 'equities', path: '/live-data/stock-universe', name: 'stock-universe', quick: true, check: (j) => {
    if (!j.ok || !Array.isArray(j.entries) || j.entries.length === 0) throw new Error('no universe entries')
    const e = j.entries[0]
    if (!e.symbol || !e.sector || !(e.marketCapB > 0)) throw new Error(`bad top entry: ${JSON.stringify(e).slice(0, 80)}`)
    if (j.entries.length > 1 && j.entries[1].marketCapB > e.marketCapB) throw new Error('not sorted by market cap')
    // The FMP company-screener is a PAID endpoint. Without a paid key the route
    // serves the ~79-entry curated catalog — a fraction of the real universe,
    // and every downstream screener/outlier surface inherits that narrowing.
    if (j.source === 'catalog') {
      return fallback(`${j.count} stocks from curated catalog — FMP company-screener needs a PAID plan (real universe ≈ thousands)`)
    }
    return `${j.count} stocks, source=${j.source}, largest ${e.symbol} $${e.marketCapB.toFixed(0)}B`
  }},

  { group: 'equities', path: '/live-data/stock-universe?symbol=AAPL', name: 'stock-universe (single lookup)', check: (j) => {
    if (!j.ok || j.entries?.[0]?.symbol !== 'AAPL') throw new Error('AAPL lookup failed')
    return `${j.entries[0].name} · ${j.entries[0].sector}`
  }},

  { group: 'equities', path: '/live-data/stock-outliers?min_mcap=2', name: 'stock-outliers (screener)', check: (j) => {
    if (!j.ok || !j.categories) throw new Error('no outlier categories')
    if (!(j.evaluated > 0) || !(j.sectorsEvaluated > 0)) throw new Error(`nothing evaluated (${j.evaluated})`)
    const cats = ['cheap', 'expensive', 'highYield', 'highBeta', 'lowBeta']
    for (const c of cats) {
      if (!Array.isArray(j.categories[c])) throw new Error(`missing category ${c}`)
      for (const it of j.categories[c]) if (typeof it.z !== 'number') throw new Error(`item missing z in ${c}`)
    }
    const flagged = cats.reduce((n, c) => n + j.categories[c].length, 0)
    // Inherits stock-universe's source. On the catalog fallback this screens ~79
    // hand-picked large caps, so "outlier" means outlier within that small set.
    if (j.evaluated < 200) {
      return fallback(`only ${j.evaluated} evaluated across ${j.sectorsEvaluated} sectors — screening the curated catalog, not the real universe`)
    }
    return `${j.evaluated} evaluated across ${j.sectorsEvaluated} sectors, ${flagged} outliers`
  }},

  { group: 'equities', path: '/live-data/market-news?limit=10', name: 'market-news', quick: true, check: (j) => {
    if (!j.ok || !Array.isArray(j.articles) || j.articles.length === 0) throw new Error('no articles')
    const sources = [...new Set(j.articles.map((a) => a.source))]
    return `${j.articles.length} articles from ${sources.join(', ')}`
  }},

  // limit=80 (the max) on purpose. Signals are merged by recency, and StockTwits
  // posts arrive minutes old while Reddit threads are hours/days old — so at
  // small limits StockTwits fills every slot and Reddit reads as dead even when
  // it is working. Only a high limit distinguishes "Reddit blocked" from
  // "Reddit out-ranked". See the starvation note in the audit report.
  { group: 'equities', path: '/live-data/stock-social?limit=80', name: 'stock-social', check: (j) => {
    if (!j.ok || !Array.isArray(j.signals) || j.signals.length === 0) throw new Error('no signals')
    const platforms = [...new Set(j.signals.map((s) => s.platform))]
    const enabled = (j.providers ?? []).map((p) => p.id)
    const counts = platforms.map((p) => `${p}=${j.signals.filter((s) => s.platform === p).length}`).join(', ')
    // Reddit is enabled as a provider but its JSON API 403s server-side and its
    // Atom feeds 429 aggressively — so an all-StockTwits result is a HALF-DEAD
    // provider set, not a quiet day on Reddit. Flag it rather than pass green.
    if (enabled.includes('reddit-stocks') && !platforms.includes('reddit')) {
      return fallback(`${j.signals.length} signals but Reddit returned nothing (enabled but blocked/rate-limited) — StockTwits only`)
    }
    return `${j.signals.length} signals (${counts})`
  }},

  { group: 'equities', path: '/live-data/sec-filings?symbol=AAPL&form=8-K&limit=5', name: 'sec-filings', check: (j) => {
    if (!j.ok || !Array.isArray(j.filings) || j.filings.length === 0) throw new Error(`no filings (${j.error ?? 'empty'})`)
    const f = j.filings[0]
    if (!f.form?.startsWith('8-K')) throw new Error(`wrong form: ${f.form}`)
    if (!f.url?.startsWith('https://www.sec.gov/')) throw new Error(`bad url: ${f.url}`)
    if (!Array.isArray(f.itemLabels) || f.itemLabels.length === 0) throw new Error('no item labels')
    return `${j.filings.length} filings, latest ${f.filedAt}`
  }},

  { group: 'equities', path: '/live-data/company-facts?symbol=AAPL', name: 'company-facts (SEC XBRL)', check: (j) => {
    if (!j.ok || !j.fundamentals || !j.ratios) throw new Error(`no fundamentals (${j.error ?? 'empty'})`)
    const f = j.fundamentals, r = j.ratios
    if (!(f.revenue > 1e11)) throw new Error(`AAPL revenue implausible: ${f.revenue}`)
    if (!(f.sharesOutstanding > 1e9)) throw new Error(`shares implausible: ${f.sharesOutstanding}`)
    if (!(r.netMargin > 0.05 && r.netMargin < 0.6)) throw new Error(`net margin implausible: ${r.netMargin}`)
    if (!(r.currentRatio > 0.2 && r.currentRatio < 5)) throw new Error(`current ratio implausible: ${r.currentRatio}`)
    return `rev=$${(f.revenue / 1e9).toFixed(0)}B, netMargin=${(r.netMargin * 100).toFixed(1)}%`
  }},

  { group: 'equities', path: '/live-data/company-profile?symbol=AAPL&name=Apple', name: 'company-profile (SEC+wiki)', check: (j) => {
    if (!j.ok || !j.profile) throw new Error(`no profile (${j.error ?? 'empty'})`)
    if (!j.profile.sicDescription) throw new Error('no SIC classification')
    return `${j.profile.sicDescription} · wiki=${j.wiki ? 'yes' : 'no'}`
  }},

  { group: 'equities', path: '/live-data/market-calendar', name: 'market-calendar', check: (j) => {
    if (j.configured === false) return unconfigured('no FMP key configured (honestly reported)')
    if (!j.ok) throw new Error('not ok but reports configured')
    const n = (j.earnings ?? []).length + (j.economic ?? []).length
    if (n === 0) return empty('configured but 0 events')
    return `${(j.earnings ?? []).length} earnings, ${(j.economic ?? []).length} economic`
  }},

  // ── Funds ───────────────────────────────────────────────────────────────────
  { group: 'funds', path: '/live-data/fund-universe', name: 'fund-universe', check: (j) => {
    if (!j.ok || !Array.isArray(j.entries) || j.entries.length === 0) throw new Error('no fund entries')
    if (j.source === 'catalog') return fallback(`${j.entries.length} funds from static catalog`)
    return `${j.entries.length} funds, source=${j.source}`
  }},

  // VOO is the representative case: an open-end fund that files N-PORT, so the
  // keyless SEC path should return the FULL book (~500 names). This is the test
  // that proves the primary holdings source actually works.
  { group: 'funds', path: '/live-data/fund-holdings?symbol=VOO', name: 'fund-holdings (VOO, N-PORT filer)', check: (j) => {
    if (!j.ok) throw new Error(j.error ?? 'not ok')
    const h = j.holdings ?? []
    if (h.length === 0) throw new Error('no holdings')
    if (j.source === 'catalog') {
      return fallback(`only ${h.length} indicative holdings from static catalog — SEC N-PORT lookup failed for an N-PORT filer`)
    }
    if (!j.full || h.length < 100) return fallback(`${h.length} holdings via ${j.source} (partial book, full=${j.full})`)
    // N-PORT is filed quarterly and lands ~60 days after period end, so a book
    // older than ~8 months means the filing chain went stale, not just lagged.
    const ageDays = j.asOf ? (Date.now() - new Date(j.asOf).getTime()) / 86_400_000 : null
    if (ageDays != null && ageDays > 240) {
      return fallback(`${h.length} holdings via ${j.source} but asOf=${j.asOf} is ${Math.round(ageDays)} days stale`)
    }
    return `${h.length} holdings via ${j.source}, asOf=${j.asOf}`
  }},

  // SPY is a unit investment trust, NOT an open-end fund — UITs do not file
  // N-PORT at all, so falling back to the catalog's indicative top holdings is
  // correct here rather than a failure. Pinned as a test so nobody "fixes" the
  // SEC lookup to chase a filing that will never exist.
  { group: 'funds', path: '/live-data/fund-holdings?symbol=SPY', name: 'fund-holdings (SPY, UIT — catalog expected)', check: (j) => {
    if (!j.ok) throw new Error(j.error ?? 'not ok')
    const h = j.holdings ?? []
    if (h.length === 0) throw new Error('no holdings at all')
    if (j.source === 'catalog') {
      return fallback(`${h.length} indicative holdings from catalog — expected: SPY is a UIT and files no N-PORT`)
    }
    return `${h.length} holdings via ${j.source} (unexpectedly better than catalog)`
  }},

  { group: 'funds', path: '/live-data/fund-holdings-history?symbol=SPY', name: 'fund-holdings-history (SPY)', check: (j) => {
    if (!j.ok) {
      const e = String(j.error ?? '')
      if (/FMP_API_KEY|no SEC N-PORT/i.test(e)) return unconfigured(`no N-PORT series and no FMP key: ${e.slice(0, 90)}`)
      throw new Error(e || 'not ok')
    }
    return `${(j.changes ?? j.diffs ?? []).length} quarter-over-quarter changes`
  }},

  // ── Config / infra ──────────────────────────────────────────────────────────
  { group: 'infra', path: '/live-data/config', name: 'config (no key leakage)', quick: true, check: (j) => {
    if (!Array.isArray(j.providers)) throw new Error('no providers array')
    const leaked = j.providers.find((p) => p.config && p.config.apiKey)
    if (leaked) throw new Error(`API key leaked to client for ${leaked.id}`)
    return `${j.providers.length} providers, no keys leaked`
  }},

  { group: 'infra', path: '/live-data/config', name: 'config (llm providers)', check: (j) => {
    const llm = (j.providers ?? []).filter((p) => p.category === 'llm')
    if (llm.length < 5) throw new Error(`only ${llm.length} llm providers`)
    if (llm.some((p) => p.config?.apiKey)) throw new Error('llm api key leaked to client')
    const ids = llm.map((p) => p.id)
    if (!ids.includes('anthropic') || !ids.includes('openai')) throw new Error('missing core llm providers')
    return `${llm.length} llm providers, no keys leaked`
  }},

  // ── /api/v1 (agent-facing) ──────────────────────────────────────────────────
  { group: 'api/v1', path: '/api/v1/', name: 'v1 discovery', quick: true, check: (j, s, h) => {
    if (!Array.isArray(j.endpoints)) throw new Error('no endpoints')
    if (h.get('access-control-allow-origin') !== '*') throw new Error('missing CORS header')
    return `${j.endpoints.length} endpoints, CORS ok`
  }},

  { group: 'api/v1', path: '/api/v1/prices?coins=btc,eth', name: 'v1 prices', check: (j) => {
    const obj = j.prices ?? j.data ?? {}
    const n = Object.keys(obj).length
    if (n < 1) throw new Error('no prices')
    return `${n} coins`
  }},

  { group: 'api/v1', path: '/api/v1/exchanges', name: 'v1 exchanges', check: (j) => {
    const arr = j.exchanges ?? j.data ?? []
    if (arr.length < 10) throw new Error(`only ${arr.length} exchanges`)
    return `${arr.length} exchanges`
  }},

  { group: 'api/v1', path: '/api/v1/network-fees', name: 'v1 network-fees', check: (j) => {
    const n = Object.keys(j.fees ?? {}).length
    if (n < 10) throw new Error(`only ${n} networks`)
    return `${n} networks`
  }},

  { group: 'api/v1', path: '/api/v1/staking/opportunities?coin=eth', name: 'v1 staking (taxonomy)', check: (j) => {
    const arr = j.opportunities ?? []
    if (arr.length === 0) throw new Error('no opportunities')
    const aprs = arr.map((i) => i.apr ?? i.apy).filter(Number.isFinite)
    if (!aprs.every((a) => a >= 0 && a < 100)) throw new Error(`APR out of range: ${aprs.join(',')}`)
    const leak = arr.filter((i) => i.stakesQueriedAsset === false)
    if (leak.length) throw new Error(`governance/lending leaked into default ETH staking: ${leak.map((i) => i.provider).join(',')}`)
    return `${arr.length} ETH options, APR ${Math.min(...aprs).toFixed(1)}–${Math.max(...aprs).toFixed(1)}%`
  }},

  { group: 'api/v1', path: '/api/v1/staking/opportunities?coin=eth&include_adjacent=true', name: 'v1 staking (include_adjacent)', check: (j) => {
    const arr = j.opportunities ?? []
    const adj = arr.filter((i) => i.stakesQueriedAsset === false)
    if (adj.length === 0) throw new Error('include_adjacent surfaced nothing')
    return `${adj.length} adjacent yield products surfaced`
  }},

  { group: 'api/v1', path: '/api/v1/news?coin=btc&limit=5', name: 'v1 news', check: (j) => {
    const arr = j.articles ?? j.news ?? []
    if (arr.length === 0) throw new Error('no articles')
    return `${arr.length} articles`
  }},

  { group: 'api/v1', path: '/api/v1/transfer/routes?from=binance&to=coinbase&coin=usdt&amount=1000', name: 'v1 transfer routes', check: (j) => {
    const arr = j.routes ?? []
    if (!Array.isArray(arr)) throw new Error('no routes array')
    return `${arr.length} routes`
  }},

  { group: 'api/v1', path: '/api/v1/transfer/routes', name: 'v1 transfer (missing params → 400)', check: (j, s) => {
    if (s !== 400) throw new Error(`expected 400, got ${s}`)
    return 'correctly rejected'
  }},

  { group: 'api/v1', path: '/api/v1/openapi.json', name: 'v1 openapi', check: (j) => {
    if (!j.openapi || !j.paths) throw new Error('not a valid openapi doc')
    return `openapi ${j.openapi}, ${Object.keys(j.paths).length} paths`
  }},

  { group: 'agents', path: '/api/agents/prompts', name: 'agent prompts list', check: (j, s, h) => {
    // Keep in sync with AGENT_DEFAULTS in src/lib/agents/prompts.ts
    const expected = ['app-assistant', 'research-analyst', 'data-scraper', 'pump-report-investigator', 'pump-report-chat',
      'equity-research', 'equity-data-scraper', 'equity-diligence', 'equity-screener']
    if (!Array.isArray(j.agents)) throw new Error('no agents array')
    const ids = j.agents.map((a) => a.id)
    const missing = expected.filter((id) => !ids.includes(id))
    if (missing.length > 0) throw new Error(`missing agents: ${missing.join(', ')}`)
    if (h.get('access-control-allow-origin') !== '*') throw new Error('missing CORS header')
    return `${j.agents.length} agents, CORS ok`
  }},
]

// ── Cross-layer consistency ───────────────────────────────────────────────────
// Folded in from the former scripts/smoke.mjs. /live-data/network-fees and
// /api/v1/network-fees read the same shared module, so a divergence means one
// layer grew its own gas assumptions. The static gas amount must match exactly;
// the USD figure gets a small tolerance for price movement between the two
// requests.
//
// This is also a regression guard for the harness itself: the old smoke test
// counted `j.networks ?? j.fees ?? j` and, because /live-data returns neither
// key, silently fell through to counting the 5 TOP-LEVEL keys of the envelope
// and reported "5 networks" as a pass. Both layers really carry 18.
async function crossLayerChecks() {
  const out = []
  try {
    const [ld, v1] = await Promise.all([
      getJson('/live-data/network-fees'),
      getJson('/api/v1/network-fees'),
    ])
    const a = ld.json?.networkFees ?? {}
    const b = v1.json?.fees ?? {}

    const aKeys = Object.keys(a).length
    const bKeys = Object.keys(b).length
    out.push(aKeys === bKeys && aKeys >= 10
      ? { name: 'network count matches across layers', verdict: REAL, detail: `${aKeys} networks both layers`, ms: ld.ms + v1.ms, group: 'cross-layer' }
      : { name: 'network count matches across layers', verdict: FAIL, detail: `live=${aKeys} v1=${bKeys}`, ms: ld.ms + v1.ms, group: 'cross-layer' })

    for (const net of ['erc20', 'bitcoin']) {
      const an = a[net], bn = b[net]
      const near = an && bn && Math.abs(an.feeUsd - bn.feeUsd) <= Math.abs(bn.feeUsd) * 0.02
      out.push({
        name: `${net} feeUsd agrees across layers (≤2%)`,
        verdict: near ? REAL : FAIL,
        detail: `live=${an?.feeUsd} v1=${bn?.feeUsd}`, ms: 0, group: 'cross-layer',
      })
      const exact = an && bn && an.feeNative === bn.feeNative
      out.push({
        name: `${net} feeNative identical (static gas, no drift)`,
        verdict: exact ? REAL : FAIL,
        detail: `live=${an?.feeNative} v1=${bn?.feeNative}`, ms: 0, group: 'cross-layer',
      })
    }

    out.push({
      name: 'bitcoin fee is live (mempool.space)',
      verdict: a.bitcoin?.source === 'live' ? REAL : FALLBACK,
      detail: `source=${a.bitcoin?.source}`, ms: 0, group: 'cross-layer',
    })
  } catch (e) {
    out.push({ name: 'cross-layer network-fees', verdict: FAIL, detail: String(e), ms: 0, group: 'cross-layer' })
  }
  return out
}

// ── Runner ────────────────────────────────────────────────────────────────────
const run = async () => {
  const selected = QUICK ? tests.filter((t) => t.quick) : tests

  for (const t of selected) {
    try {
      const { status, json, headers, ms } = await getJson(t.path)
      const expectsError = /→ 4\d\d/.test(t.name)
      if (json === null && status >= 400 && !expectsError) {
        results.push({ ...t, verdict: FAIL, detail: `HTTP ${status}, non-JSON body`, ms })
        continue
      }
      if (status >= 500) {
        results.push({ ...t, verdict: FAIL, detail: `HTTP ${status}: ${json?.error ?? 'server error'}`, ms })
        continue
      }
      const r = t.check(json ?? {}, status, headers)
      if (typeof r === 'object' && r?.verdict) {
        results.push({ ...t, verdict: r.verdict, detail: r.detail, ms })
      } else {
        results.push({ ...t, verdict: REAL, detail: typeof r === 'string' ? r : `HTTP ${status}`, ms })
      }
    } catch (e) {
      results.push({ ...t, verdict: FAIL, detail: e.message, ms: 0 })
    }
  }

  if (!QUICK) results.push(...await crossLayerChecks())

  const by = (v) => results.filter((r) => r.verdict === v)
  const fails = by(FAIL)
  const fallbacks = by(FALLBACK)
  const unconf = by(UNCONFIGURED)
  const empties = by(EMPTY)

  if (JSON_OUT) {
    console.log(JSON.stringify({
      base: BASE, mode: QUICK ? 'quick' : 'full', ranAt: new Date().toISOString(),
      counts: { real: by(REAL).length, fallback: fallbacks.length, unconfigured: unconf.length, empty: empties.length, fail: fails.length },
      results: results.map((r) => ({ name: r.name, group: r.group, path: r.path, verdict: r.verdict, detail: r.detail, ms: r.ms })),
    }, null, 2))
    process.exit(fails.length === 0 && (!STRICT || fallbacks.length + empties.length === 0) ? 0 : 1)
  }

  console.log(`\n══════════ FINANCE NOW LIVE-DATA AUDIT ${QUICK ? '(quick)' : '(full)'} → ${BASE} ══════════\n`)
  let lastGroup = ''
  for (const r of results) {
    if (r.group !== lastGroup) { console.log(`\n── ${r.group} ──`); lastGroup = r.group }
    const lat = r.ms ? String(r.ms).padStart(5) + 'ms' : '       '
    console.log(`${ICON[r.verdict]} ${r.verdict.padEnd(12)} ${lat}  ${r.name.padEnd(42)} ${r.detail ?? ''}`)
  }

  console.log('\n────────────────────────── SUMMARY ──────────────────────────')
  console.log(`🟢 REAL          ${by(REAL).length}`)
  console.log(`🟡 FALLBACK      ${fallbacks.length}   (HTTP 200 but NOT the intended live source)`)
  console.log(`🔑 UNCONFIGURED  ${unconf.length}   (key-gated, honestly reported)`)
  console.log(`⚪ EMPTY         ${empties.length}`)
  console.log(`🔴 FAIL          ${fails.length}`)

  if (fallbacks.length) {
    console.log('\n⚠  SILENT DEGRADATION — these return 200 and look healthy:')
    for (const r of fallbacks) console.log(`   • ${r.name}: ${r.detail}`)
  }
  if (empties.length) {
    console.log('\n⚪ EMPTY responses:')
    for (const r of empties) console.log(`   • ${r.name}: ${r.detail}`)
  }
  if (fails.length) {
    console.log('\n🔴 FAILURES:')
    for (const r of fails) console.log(`   • ${r.name}: ${r.detail}`)
  }

  const slow = results.filter((r) => r.ms > 3000).sort((a, b) => b.ms - a.ms)
  if (slow.length) {
    console.log('\n🐢 SLOW (>3s):')
    for (const r of slow) console.log(`   • ${r.name}: ${(r.ms / 1000).toFixed(1)}s`)
  }

  console.log('')
  const bad = fails.length + (STRICT ? fallbacks.length + empties.length : 0)
  process.exit(bad === 0 ? 0 : 1)
}

run().catch((e) => {
  console.error('Audit run crashed:', e)
  process.exit(1)
})
