# Unified Risk Framework

**Status:** v1 core implemented (`frontend/src/lib/risk/`) · profiles: staking (adapter), equities, options trades
**Date:** 2026-07-03

## Why

The suite vision is one platform family — crypto (CAEP today), equities, ETF/mutual
funds, bonds, commodities — sellable together or separately, sharing a home shell and
a set of common services. Risk scoring is CAEP's identity feature, so it must become
a **shared service with one vocabulary**, not a per-app reinvention.

The codebase already has **three inconsistent risk systems**:

| System | Location | Scale | Polarity | Bands |
|---|---|---|---|---|
| Backend scoring engine | `backend/app/scoring/` | 0–100 | higher = safer | low ≥80, moderate ≥65, elevated ≥50, high ≥30 |
| Frontend risk utils | `frontend/src/lib/utils/risk.ts` | 0–100 | higher = safer | low ≥80, moderate ≥60, elevated ≥40, high ≥20 |
| Staking providers | `frontend/src/lib/data/stakingProviders.ts` | 1–10 | higher = riskier | low ≤3, **medium** ≤5.5, high ≤7.5, critical |

Same product, three scales, two polarities, two band vocabularies, and thresholds
that disagree even where the vocabulary matches. Every new asset class would have
multiplied this. The unified framework fixes the vocabulary before that happens.

## Research grounding

Institutional multi-asset risk systems (Bloomberg [MAC3](https://professional.bloomberg.com/products/risk/mac3/),
MSCI [BarraOne](https://www.msci.com/data-and-analytics/factor-investing/multi-asset-class-factor-models))
converge on the same architecture: a **single factor/dimension engine** with
**per-asset-class factor catalogs** — equities modeled by return factors, fixed
income by duration/convexity/spread, derivatives by Greeks and implied volatility
([overview](https://www.landytech.com/blog/managing-risk-with-multi-asset-factor-models),
[Nasdaq](https://www.nasdaq.com/articles/risk-modeling-assumptions-and-techniques-for-multi-asset-portfolios)).
That is exactly the shape of CAEP's existing backend engine (weighted components +
confidence), generalized. The framework keeps that architecture and makes it
asset-class-neutral.

For the options profile, calibration anchors follow practitioner liquidity
heuristics — open interest ≥ 100 contracts and tight bid/ask spreads as the
liquidity floor ([TradingBlock](https://www.tradingblock.com/blog/options-liquidity),
[Tackle Trading](https://tackletrading.com/options-101-bidask-open-interest-and-volume/),
[Option Samurai](https://optionsamurai.com/blog/options-liquidity-tips-to-identify-the-best-opportunities-with-real-market-example/)) —
plus IV-rank direction fit and IV-crush exposure around earnings.

## Canonical conventions

1. **Scores are 0–100, higher = safer** — at both dimension and composite level.
   Matches the backend engine and the risk-scores UI users already know.
2. **Bands:** `low ≥80 · moderate ≥60 · elevated ≥40 · high ≥20 · critical <20`
   (the frontend thresholds). One vocabulary: `low | moderate | elevated | high | critical`.
3. **Missing data lowers confidence, never the score.** Dimensions without data are
   excluded and remaining weights renormalize; `coverage` reports how much of the
   profile's weight had data, and `confidence = weighted dimension confidence × coverage`.
   (Same philosophy as the backend engine's completeness-based confidence.)
4. **Profiles are versioned recipes.** Weights or semantics change → version bump,
   so stored scores remain comparable (mirrors backend `model_version`).
5. **Every score carries evidence** — the raw metrics that produced it. Scores are
   explainable or they're not trustworthy, and "research tool, not advice" framing
   depends on showing the math.
6. **The core is pure TypeScript** — no React, Next, or API imports — so it lifts
   into a shared `@suite/core` package unchanged when the multi-app suite lands.

## Architecture

```
frontend/src/lib/risk/
├── types.ts          # RiskBand, RiskProfileSpec, DimensionScore, CompositeRisk …
├── normalize.ts      # piecewise/linear normalizers, volatility, drawdown, scale converters
├── engine.ts         # validateProfile, composeRisk — profile-agnostic composite math
├── profiles/
│   ├── equity.ts          # EQUITY_RISK_PROFILE + scoreEquity()
│   ├── optionsTrade.ts    # OPTIONS_TRADE_RISK_PROFILE + scoreOptionsTrade()
│   └── stakingAdapter.ts  # existing staking model expressed in the framework
└── __tests__/        # vitest — engine math, normalizers, profile behavior (44 tests)
```

A **profile** declares weighted dimensions; a **scorer** turns raw inputs into
per-dimension scores with evidence; the **engine** composes them into one
`CompositeRisk` with band, confidence, coverage, and warnings. Adding an asset
class = adding a profile module; the engine, bands, and UI treatment come free.

## Profiles

### Staking provider (crypto) — adapter, v1.0.0
Wraps the existing six-dimension editorial model with the **same weights** as
`computeOverallRisk()` (counterparty 25%, custody 20%, liquidity 20%, contract 15%,
slashing 10%, regulatory 10%), converted to the canonical scale. Tests verify the
legacy ordering is preserved exactly (the conversion is linear). The staking page
keeps using the legacy functions for now — migration is a UI change for later.

### Equity — v1.0.0
| Dimension | Weight | Inputs |
|---|---|---|
| Volatility | 25% | annualized vol from daily closes; beta as evidence |
| Drawdown | 20% | max peak-to-trough over supplied history |
| Liquidity | 20% | avg daily dollar volume; spread caps the score |
| Size | 15% | market-cap tier (nano → mega) |
| Fundamentals | 20% | debt/equity, net margin |

All inputs available from FMP-class providers. Calibration points are v1
heuristics encoded as `piecewise()` anchors — deliberately easy to re-tune.

### Options trade — v1.0.0 (the options-helper differentiator)
| Dimension | Weight | Inputs |
|---|---|---|
| Liquidity | 30% | per-leg OI, volume, spread% — worst leg governs |
| IV environment | 20% | IV rank fit for trade direction; earnings-before-expiry penalty |
| Assignment | 15% | short-leg moneyness/delta; ex-div penalty for short calls |
| Time decay | 15% | DTE vs net premium side; deep-OTM long premium floor |
| Defined risk | 20% | bounded vs unbounded max loss; loss:profit ratio |

Scores single- and multi-leg positions. Output is explanatory (evidence + warnings),
never a recommendation — keeps the product on the research/education side of the
investment-advice line.

## Roadmap

1. **Wire into UI** — risk breakdown component (dimension bars + evidence tooltip)
   reusable across staking, assets, and the future options helper.
2. **Expose to the suite** — `/api/v1/risk/*` endpoints + `score_options_trade` /
   `score_equity` MCP tools, making risk scoring part of the sellable connector surface.
3. **ETF/fund profile** — expense ratio, AUM, tracking error, concentration.
4. **Bond profile** — duration, credit rating, spread (pending data sourcing).
5. **Crypto token profile** — port the backend's four components so frontend
   mock-mode and backend produce identical shapes.
6. **Calibration pass** — replace v1 anchors with percentile-derived thresholds once
   real distributions are available per asset class.
