# Finance Now — Multi-Asset Financial Analytics

**An AI-enhanced investment evaluator, and the flagship module of a growing suite of financial analysis tools.**

Finance Now evaluates crypto assets — stablecoins, Layer 1s, tokenized assets, and CBDCs — by combining live multi-provider market data, reserve transparency monitoring, regulatory news intelligence, and a configurable AI agent layer into a single Bloomberg-terminal-style workspace. It is built on a strict data-honesty principle: **every number is attributed to its source, estimates are labeled as estimates, and derived metrics with no reliable data source show "not available" rather than fabricated values.**

Finance Now is one module in a larger suite. The same shell hosts entitlement-gated modules for Equities, ETFs & Funds, and a Portfolio Builder, with personal-finance modules (budgeting, planning) on the roadmap — one application, one auth layer, individually licensable modules. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## The Suite

| Module | Scope | Status |
|---|---|---|
| **Crypto (Finance Now)** | 110 monitored assets: risk evaluation, reserves, peg tracking, fees, staking, TA, news | 🟢 Active — flagship |
| **Equities** | 79 large-caps across 11 sectors: live quotes, breadth, screener, TA, news, calendar | 🟢 Active |
| **ETFs & Funds** | Fund registry (118 ETFs/mutual funds) and per-symbol detail | 🟢 Active |
| **Macro Markets** | Commodities, currencies, bonds/rates: 45 instruments, official yield curve, two-tier FX converter | 🟢 Active |
| **Portfolio Builder** | Cross-module portfolio construction | 🟡 Early |
| Budgeting & Planning | Accounts, budgets, net worth, goals | ⚪ Planned |

Modules are declared in `src/lib/modules/registry.ts`; the sidebar renders from the registry and modules toggle in **Integrations → Suite Modules**.

---

## The AI Layer

Finance Now is agent-native, in two directions:

**AI working for you inside the app.** Eleven configurable agents (Settings → AI Agents / the AI Agents tab), each with an editable system prompt, model, and temperature — shared assistant, crypto research/scraper/pump-report pair, four equity agents, and two macro agents:

- **App Assistant** — platform-wide helper that navigates and interprets data
- **Research & Analysis** — deep dives on assets and markets
- **Data Scraper** — structured data gathering
- **Pump Report** — anomaly and momentum reporting

Plus a **Daily Brief** generated from your holdings, live prices, and headlines. All agents are **BYOK** (bring your own key) across 10 LLM providers — Anthropic, OpenAI, Google, Mistral, Groq, xAI, DeepSeek, Perplexity, Together, Cohere. Keys go in `frontend/.env.local`; nothing is proxied through third parties.

**The app working for AI.** The platform exposes a clean REST `/api/v1` surface with OpenAPI documentation and an **MCP server** (`mcp-server/`), so external AI agents — Claude, or anything MCP-capable — can query Finance Now's data directly. If you use AI to manage your research, Finance Now is built to be one of its tools.

---

## Feature Status (honest)

Verified against the running application, July 2026.

| Feature | State |
|---|---|
| Live market data | 🟢 110 crypto assets via CoinGecko + CoinMarketCap + Binance, 3-way fallback |
| Reserve Transparency Monitor | 🟢 Live DefiLlama supply + attestation metadata for 9 stablecoins |
| Transfer Fee Calculator | 🟢 750 coins, live BTC/gas fees, ranked cheapest routes, safety checklist |
| Staking Explorer | 🟢 55 providers, custody-risk taxonomy; live APRs from DefiLlama Yields + native sources, estimates labeled |
| Technical Analysis | 🟢 Live OHLCV, 25+ indicators, pattern scanner, backtester, drawing tools |
| News & Analysis | 🟢 7 providers with sentiment + asset tagging, incl. US Congress bill tracker |
| Equities & Funds | 🟢 Live quotes; screener runs on reference (static) fundamentals |
| AI agents + Daily Brief | 🟢 Working with any configured provider key |
| **Safety Score (composite risk)** | 🟢 **Live** since 2026-07-18. Five-pillar composites (reserve, peg, market, structure, news sentiment) on the canonical 0–100 higher-is-safer scale with a fatal-flaw override for stablecoins — see `docs/architecture/risk-scale-spec.md`. |
| Authentication / multi-tenancy | 🟡 Login scaffolded, deliberately disabled during single-user development |

---

## Running the Application

The frontend runs **live-only** against public data providers through its own server-side `/live-data/*` proxy routes (no API keys exposed to the browser, no mock/demo mode). Surfaces with no free real-time source say so explicitly.

### Frontend (recommended)

```bash
cd frontend
npm install
npm run dev
```

Create `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000

# Optional — unlock AI agents & Daily Brief (any one is enough)
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...

# Optional — richer data (higher rate limits, extra providers)
# COINMARKETCAP_API_KEY=...
# NEWSAPI_API_KEY=...
```

Open [http://localhost:3000](http://localhost:3000). Windows users: `start.bat` at the repo root.

### Full stack with Docker (optional backend)

The FastAPI + TimescaleDB + Redis backend supports auth and agent persistence; it is not required for the live dashboards.

```bash
cp infrastructure/docker/.env.example infrastructure/docker/.env   # fill in secrets
docker compose -f infrastructure/docker/docker-compose.yml up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API + Swagger | http://localhost:8000 · /docs |
| TimescaleDB | localhost:5432 |
| Redis | localhost:6379 |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript strict, Tailwind CSS, Recharts + lightweight-charts, Zustand, TanStack Query v5 |
| AI layer | Multi-provider LLM (BYOK), agent prompts in `src/lib/agents/prompts.ts`, MCP server in `mcp-server/` |
| Backend (optional) | FastAPI, SQLAlchemy async, Pydantic v2, TimescaleDB, Redis |
| Data providers | CoinGecko, CoinMarketCap, Binance, DefiLlama, mempool.space, NewsAPI, GNews, CoinDesk, Cointelegraph, Decrypt, Bitcoin.com, US Congress |
| Infrastructure | Docker Compose; Kubernetes/Terraform scaffolding for later scale |

---

## Data Honesty Principles

1. Every metric displays its source; provider utilization is inspectable in Integrations.
2. Estimates and reference values are labeled (`estimate`, `reference`) — never passed off as live.
3. Derived analytics without a trustworthy source display **N/A**, not simulated values.
4. Stale curated datasets carry dated low-confidence warnings.
5. Failed providers degrade honestly: hard failures return explicit `ok:false`/5xx envelopes, and routes with a reference catalog fall back to it **with provenance labeling** (`source` fields, amber `ref` tags, the REAL-vs-FALLBACK audit harness) rather than pretending to be live.

---

## Disclaimer

Finance Now is an information and research tool. Nothing it displays or generates — including AI agent output and risk evaluations — is financial, investment, or legal advice. Verify all fees, rates, and reserve claims with primary sources before transacting.
