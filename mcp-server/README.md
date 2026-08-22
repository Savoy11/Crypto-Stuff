# Finance Now MCP Server

A standalone [Model Context Protocol](https://modelcontextprotocol.io) server exposing
Finance Now's data tools to Claude and any MCP-compatible agent. It calls the running
frontend's `/api/v1/*` endpoints — **Finance Now must be running** (default
`http://localhost:3000`).

This README existed only as a dangling reference until 2026-08-16 (review finding A7);
the canonical, always-current documentation is the **"MCP Server" section of the repo
root `CLAUDE.md`** — if this file and that section disagree, trust CLAUDE.md.

## Setup

```bash
npm install
npm run build
```

## Configuration

One environment variable:

| Variable | Meaning | Default |
|---|---|---|
| `FN_BASE_URL` | Base URL of the running Finance Now frontend (legacy `CAEP_BASE_URL` still honored) | `http://localhost:3000` |

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "finance-now": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": { "FN_BASE_URL": "http://localhost:3000" }
    }
  }
}
```

### Claude Code

```bash
claude mcp add finance-now node /absolute/path/to/mcp-server/dist/index.js
```

## Tools (12)

Market data — crypto: `get_coin_prices`, `list_exchanges`,
`get_network_fees`, `get_staking_opportunities`, `compare_staking_risk`,
`get_crypto_news`. Securities & macro: `get_security_quotes`, `get_security_history`,
`get_yield_curve`, `get_fx_rates`. Analysis: `score_options_trade` (computes from
caller-supplied figures — there is no options chain feed, by decision).

⚠ **`find_transfer_routes` is withheld** (2026-08-22, owner decision): the Transfer
Fee Calculator is kept but held out of the initial rollout while its fee table
completes verification, so the tool is commented out in `src/index.ts` and
`/api/v1/transfer/routes` answers 503. An agent relaying a 447-day-old withdrawal
fee to a user is the same harm as the app's own page showing it. Un-comment the
tool block to restore.

⚠ **`run_audit`** is a dev/maintenance tool, not market data: it shells out
(`npx tsc`), probes live-data routes, and walks the frontend source tree. Whether it
ships in any externally distributed build is an open owner decision (P3 review D5) —
do not distribute this server outside the development machine before that decision
is made.

## Conventions the tools follow

- Staking results lead with the canonical **Safety Score (0–100, higher = safer)**
  and its band; the legacy 1–10 risk score is returned but deprecated.
- `aprSource` distinguishes `live` (provider-published feed), `derived` (our estimate
  anchored to the Lido feed), and `estimate` (curated catalog).
- Reference (non-live) security quotes are flagged, never silently mixed with live.
