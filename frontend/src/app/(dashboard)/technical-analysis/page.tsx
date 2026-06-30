'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown,
  Activity, Filter, X, SlidersHorizontal,
  CandlestickChart as CandlestickIcon, AreaChart, BarChart2,
  LineChart, GitBranch, Layers,
  MousePointer2, PenLine, MoveHorizontal, Square, Hash, Trash2,
  Compass, Gauge, Waves, Target, ShieldAlert,
  Newspaper, CircleDollarSign, Scale, FlaskConical, ExternalLink, MinusCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { ChartType, DrawingTool, Drawing, ChartEventMarker } from './CandlestickChart'
import type { LucideIcon } from 'lucide-react'
import { runBacktest, STRATEGIES } from '@/lib/utils/backtest'
import {
  rsi, macd, bollingerBands, ema, sma, stochasticRsi, atr, obv, vwap,
  ichimoku, fibRetracement, computeSignalSummary, detectPatterns,
  buildTechnicalRead, detectSupportResistance, patternProjection,
  type OhlcvCandle, type Signal, type SignalSummary, type DetectedPattern,
} from '@/lib/utils/indicators'
import { DataBadge } from '@/components/ui/DataBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { useThesisStore, computeRiskReward } from '@/store/useThesisStore'
import { COINGECKO_IDS } from '@/lib/api/live/coingeckoIds'
import type { CoinListResponse } from '@/lib/types/coinList'

const CandlestickChart = dynamic(() => import('./CandlestickChart'), { ssr: false })

// ─── Constants ────────────────────────────────────────────────────────────────

// All OHLCV-supported coin IDs (keyed by internal id, e.g. "btc", "eth")
const SUPPORTED_IDS = Object.keys(COINGECKO_IDS)

// Curated list for the screener — parallel OHLCV fetches, so keep bounded to ~30
const SCREENER_ASSETS = [
  { id: 'btc',  label: 'Bitcoin',       symbol: 'BTC'  },
  { id: 'eth',  label: 'Ethereum',      symbol: 'ETH'  },
  { id: 'sol',  label: 'Solana',        symbol: 'SOL'  },
  { id: 'bnb',  label: 'BNB',           symbol: 'BNB'  },
  { id: 'xrp',  label: 'XRP',           symbol: 'XRP'  },
  { id: 'ada',  label: 'Cardano',       symbol: 'ADA'  },
  { id: 'doge', label: 'Dogecoin',      symbol: 'DOGE' },
  { id: 'avax', label: 'Avalanche',     symbol: 'AVAX' },
  { id: 'dot',  label: 'Polkadot',      symbol: 'DOT'  },
  { id: 'near', label: 'NEAR',          symbol: 'NEAR' },
  { id: 'link', label: 'Chainlink',     symbol: 'LINK' },
  { id: 'atom', label: 'Cosmos',        symbol: 'ATOM' },
  { id: 'ltc',  label: 'Litecoin',      symbol: 'LTC'  },
  { id: 'apt',  label: 'Aptos',         symbol: 'APT'  },
  { id: 'arb',  label: 'Arbitrum',      symbol: 'ARB'  },
  { id: 'op',   label: 'Optimism',      symbol: 'OP'   },
  { id: 'inj',  label: 'Injective',     symbol: 'INJ'  },
  { id: 'sui',  label: 'Sui',           symbol: 'SUI'  },
  { id: 'trx',  label: 'TRON',          symbol: 'TRX'  },
  { id: 'ton',  label: 'TON',           symbol: 'TON'  },
  { id: 'hype', label: 'Hyperliquid',   symbol: 'HYPE' },
  { id: 'kas',  label: 'Kaspa',         symbol: 'KAS'  },
  { id: 'tao',  label: 'Bittensor',     symbol: 'TAO'  },
  { id: 'icp',  label: 'Internet Computer', symbol: 'ICP' },
  { id: 'fil',  label: 'Filecoin',      symbol: 'FIL'  },
]

const RANGES = ['1H', '4H', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', '10Y', 'MAX'] as const
type Range = typeof RANGES[number]

const CHART_TYPES: { type: ChartType; label: string; desc: string; Icon: LucideIcon }[] = [
  { type: 'candlestick', label: 'Candlestick',  desc: 'Standard OHLC candles',                 Icon: CandlestickIcon },
  { type: 'hollow',      label: 'Hollow',        desc: 'Up candles outlined, down candles filled', Icon: CandlestickIcon },
  { type: 'heikin-ashi', label: 'Heikin Ashi',  desc: 'Smoothed candles that filter noise',    Icon: Activity },
  { type: 'bars',        label: 'OHLC Bars',    desc: 'Traditional open/high/low/close bars',  Icon: BarChart2 },
  { type: 'line',        label: 'Line',          desc: 'Simple close-price line',               Icon: LineChart },
  { type: 'step-line',   label: 'Step Line',     desc: 'Stepped close-price line',              Icon: GitBranch },
  { type: 'area',        label: 'Area',          desc: 'Filled area under close price',         Icon: AreaChart },
  { type: 'baseline',    label: 'Baseline',      desc: 'Green/red vs. first period close',      Icon: Layers },
]

const INDICATORS = [
  // Overlays
  { key: 'ema20',    label: 'EMA 20',           group: 'overlay', tip: 'Exponential Moving Average (20). Weights recent prices more heavily than older ones. Price above EMA → uptrend; below → downtrend. Faster to react than SMA.' },
  { key: 'ema50',    label: 'EMA 50',           group: 'overlay', tip: 'Exponential Moving Average (50). Mid-term trend line. Crossover with EMA20 signals momentum shifts; holding above EMA50 is a bullish structure.' },
  { key: 'ema200',   label: 'EMA 200',          group: 'overlay', tip: 'Exponential Moving Average (200). The gold standard long-term trend indicator. Price above EMA200 = bull market; below = bear market. Watch for the Golden/Death Cross with EMA50.' },
  { key: 'sma20',    label: 'SMA 20',           group: 'overlay', tip: 'Simple Moving Average (20). Equal weight to each of the last 20 closes. Slower than EMA — good for spotting support/resistance and as the midline of Bollinger Bands.' },
  { key: 'wma20',    label: 'WMA 20',           group: 'overlay', tip: 'Weighted Moving Average (20). Linearly weights recent candles higher. More responsive than SMA, less "jumpy" than EMA. Use like EMA20 for trend direction.' },
  { key: 'hma20',    label: 'HMA 20',           group: 'overlay', tip: 'Hull Moving Average (20). Uses WMA of WMAs to nearly eliminate lag while staying smooth. Excellent for spotting trend changes early — direction of the HMA is the signal.' },
  { key: 'bb',       label: 'Bollinger Bands',  group: 'overlay', tip: 'Bollinger Bands (20, ±2σ). Upper/lower bands are 2 standard deviations from SMA20. Price touching the lower band = oversold; upper band = overbought. Bands squeezing = breakout imminent.' },
  { key: 'vwap',     label: 'VWAP',             group: 'overlay', tip: 'Volume Weighted Average Price. Resets daily. The "fair value" anchor used by institutional traders. Price above VWAP = buyers in control; below = sellers. Best on intraday timeframes.' },
  { key: 'keltner',  label: 'Keltner Channels', group: 'overlay', tip: 'Keltner Channels (EMA20 ± 2×ATR10). Volatility-based envelopes. Smoother than Bollinger Bands — less susceptible to short spikes. Useful for spotting breakouts when price exits the channel.' },
  { key: 'donchian', label: 'Donchian (20)',    group: 'overlay', tip: 'Donchian Channels (20-period high/low). Upper band = highest high; lower = lowest low. Price breaking above the upper band is a new 20-period high — a classic breakout signal used by trend-followers.' },
  { key: 'psar',     label: 'Parabolic SAR',    group: 'overlay', tip: 'Parabolic Stop and Reverse. Dots appear above price in a downtrend and below in an uptrend. When price crosses the dots, the trend may be reversing. Best used in trending markets — noisy in sideways chop.' },
  { key: 'linreg',   label: 'Linear Reg (20)',  group: 'overlay', tip: 'Linear Regression line (20 periods). A best-fit line through recent closes. Shows the statistically "ideal" trend direction. Price deviating far from the line tends to revert back toward it.' },
  // Panels — Momentum
  { key: 'rsi',      label: 'RSI (14)',          group: 'panel', tip: 'Relative Strength Index (14). Oscillates 0–100. Below 30 = oversold (look for buy); above 70 = overbought (look for sell). Divergence between RSI and price is one of the strongest signals in TA.' },
  { key: 'macd',     label: 'MACD',              group: 'panel', tip: 'Moving Average Convergence/Divergence (12,26,9). The MACD line crossing above the signal line is bullish; crossing below is bearish. Histogram growing in the positive = accelerating momentum.' },
  { key: 'stochrsi', label: 'Stoch RSI',         group: 'panel', tip: 'Stochastic RSI (14,14,3,3). RSI applied to RSI — more sensitive than RSI alone. K line below 20 = deeply oversold; above 80 = deeply overbought. K crossing above D is a buy signal.' },
  { key: 'williamsr',label: 'Williams %R',       group: 'panel', tip: 'Williams %R (14). Oscillates -100 to 0. Above -20 = overbought; below -80 = oversold. Similar to Stochastic but inverted. Use for identifying short-term turning points and confirming reversals.' },
  { key: 'cci',      label: 'CCI (20)',          group: 'panel', tip: 'Commodity Channel Index (20). Measures how far price is from its statistical average. Above +100 = overbought / strong uptrend; below -100 = oversold / strong downtrend. Works well for spotting cyclical turns.' },
  { key: 'roc',      label: 'ROC (12)',          group: 'panel', tip: 'Rate of Change (12). The % change from 12 periods ago. Positive = upward momentum; negative = downward. Crossing zero is a trend signal. Useful for spotting divergence and momentum exhaustion.' },
  { key: 'mom',      label: 'Momentum (10)',     group: 'panel', tip: 'Momentum (10). Raw difference between current close and close 10 periods ago. Rising = accelerating; falling = decelerating. Simple but effective for confirming trend strength. Cross above zero = bullish.' },
  { key: 'cmo',      label: 'CMO (14)',          group: 'panel', tip: 'Chande Momentum Oscillator (14). Oscillates -100 to +100. Above +50 = strong bullish momentum; below -50 = strong bearish. Zero-line crossovers signal trend changes. Less whipsaw than RSI in trending markets.' },
  { key: 'uo',       label: 'Ultimate Osc',      group: 'panel', tip: 'Ultimate Oscillator (7,14,28). Combines three timeframes into one oscillator to reduce false divergence signals. Above 70 = overbought; below 30 = oversold. Divergence + breakout from the overbought/oversold zone is the key setup.' },
  // Panels — Trend
  { key: 'adx',      label: 'ADX (14)',          group: 'panel', tip: 'Average Directional Index (14). ADX measures trend strength (not direction) — above 25 = trending, above 40 = strongly trending. +DI above -DI = uptrend; -DI above +DI = downtrend. Best for filtering out choppy markets.' },
  { key: 'aroon',    label: 'Aroon (25)',        group: 'panel', tip: 'Aroon (25). Measures how recently the highest high and lowest low occurred. Oscillator above +50 = uptrend strengthening; below -50 = downtrend strengthening. Aroon Up crossing above Aroon Down is a bullish signal.' },
  { key: 'trix',     label: 'TRIX (15)',         group: 'panel', tip: 'TRIX (15). 1-period % change of a triple-smoothed EMA. Filters out market noise effectively. Signal line crossovers and zero-line crossovers are the main signals. Especially good for medium-term trends.' },
  { key: 'kst',      label: 'KST',              group: 'panel', tip: 'Know Sure Thing. A weighted sum of four ROCs at different lengths, smoothed. Designed to clearly show cyclical momentum at multiple timeframes simultaneously. KST crossing its signal line is the key trade trigger.' },
  { key: 'dpo',      label: 'DPO (20)',          group: 'panel', tip: 'Detrended Price Oscillator (20). Removes the long-term trend so you can see price cycles clearly. Oscillates around zero — peaks/troughs of the DPO mark peaks/troughs of the price cycle. Not for trend-following.' },
  // Panels — Volume / Money Flow
  { key: 'volume',   label: 'Volume',            group: 'panel', tip: 'Raw trading volume per candle (USD millions). High volume on breakouts = conviction; low volume = suspect. A price move on expanding volume is more reliable than one on declining volume.' },
  { key: 'obv',      label: 'OBV',              group: 'panel', tip: 'On-Balance Volume. Adds volume on up days, subtracts on down days. OBV rising ahead of price = smart money accumulating (bullish). OBV diverging from price often leads the next price move.' },
  { key: 'mfi',      label: 'MFI (14)',          group: 'panel', tip: 'Money Flow Index (14). Volume-weighted RSI — considers both price and volume. Below 20 = oversold with selling pressure drying up (bullish); above 80 = overbought. Divergence with price is a high-conviction signal.' },
  { key: 'cmf',      label: 'Chaikin MF (20)',   group: 'panel', tip: 'Chaikin Money Flow (20). Measures buying vs selling pressure by comparing close position within the candle\'s range, weighted by volume. Above 0.1 = buying pressure; below -0.1 = selling pressure. Zero-line crossovers signal trend shifts.' },
  { key: 'accDist',  label: 'A/D Line',         group: 'panel', tip: 'Accumulation/Distribution Line. Cumulative volume indicator based on close position within each candle\'s range. Rising A/D while price falls = accumulation (bullish divergence). Falling A/D while price rises = distribution (bearish).' },
  { key: 'volosc',   label: 'Volume Osc',       group: 'panel', tip: 'Volume Oscillator (fast 5, slow 10). Difference between a fast and slow volume moving average. Positive = volume expanding; negative = contracting. Rising volume oscillator during a price move confirms the trend.' },
  { key: 'fi',       label: 'Force Index (13)',  group: 'panel', tip: 'Force Index (13). Combines price change and volume into a single momentum measure. Strong positive readings = powerful buying force; strong negative = powerful selling. Zero crossovers and divergence are the key signals.' },
  { key: 'eom',      label: 'Ease of Move',     group: 'panel', tip: 'Ease of Movement. Measures how efficiently price moves relative to volume. High positive value = price rising easily on low volume (bullish); high negative = falling easily. Hovering near zero = price struggling to move.' },
  { key: 'elderray', label: 'Elder Ray (13)',    group: 'panel', tip: 'Elder Ray Index (EMA 13). Bull Power = high minus EMA (positive = buyers driving price above average). Bear Power = low minus EMA (negative = sellers pushing below). Buy when Bear Power is negative but rising; sell when Bull Power is positive but falling.' },
  // Panels — Volatility
  { key: 'atr',      label: 'ATR (14)',          group: 'panel', tip: 'Average True Range (14). Measures average volatility (typical daily price swing). Not directional — use for position sizing and stop placement. High ATR = high volatility; low ATR = consolidation, potential breakout building.' },
  { key: 'chop',     label: 'Choppiness',       group: 'panel', tip: 'Choppiness Index (14). Measures whether the market is trending or ranging. Above 61.8 = choppy/sideways (avoid trend strategies); below 38.2 = strongly trending (use trend-following strategies). Great for filtering other signals.' },
  { key: 'bbpctb',   label: 'BB %B',            group: 'panel', tip: 'Bollinger %B. Shows where price is within the Bollinger Bands as a percentage. 1.0 = at upper band; 0 = at lower band; 0.5 = at midline. Below 0 or above 1 = price outside the bands — extreme reading, potential reversal.' },
  { key: 'massidx',  label: 'Mass Index',       group: 'panel', tip: 'Mass Index (25). Uses the high-low range to identify reversals — regardless of direction. When it rises above 27 then falls below 26.5 ("reversal bulge"), a trend reversal is likely. Direction confirmed by a separate trend indicator.' },
  { key: 'stddev',   label: 'Std Deviation',    group: 'panel', tip: 'Standard Deviation (20). Measures the statistical dispersion of closing prices around their mean. High StdDev = high volatility / trending; low StdDev = compression. Low readings often precede explosive moves.' },
  // Panels — Momentum (additional)
  { key: 'stoch',    label: 'Stochastic',       group: 'panel', tip: 'Classic Stochastic Oscillator (14,3,3). %K crossing above %D below 20 = buy; crossing below above 80 = sell. The original oscillator developed by George Lane — more stable than Stoch RSI.' },
  { key: 'tsi',      label: 'TSI (25,13)',       group: 'panel', tip: 'True Strength Index. Double-smoothed price momentum oscillator. Above zero = bullish; below zero = bearish. Crossing zero or the signal line are the key signals. Less whipsaw than RSI thanks to double smoothing.' },
  { key: 'ppo',      label: 'PPO (12,26,9)',     group: 'panel', tip: 'Percentage Price Oscillator. MACD expressed as a percentage of the slow EMA, making it comparable across different price levels. Use exactly like MACD: signal line crossovers and histogram direction.' },
  { key: 'fisher',   label: 'Fisher Transform', group: 'panel', tip: 'Fisher Transform (9). Converts prices into a near-Gaussian distribution. Sharp reversals at extreme peaks/troughs signal turning points. Zero-line crossovers signal trend changes. Particularly effective for identifying cycle tops and bottoms.' },
  { key: 'crsi',     label: 'Connors RSI',      group: 'panel', tip: 'Connors RSI (3,2,100). Composite of 3-period RSI, RSI of the current price streak, and a percentile rank. Below 10 = strong buy; above 90 = strong sell. More precise than standard RSI for short-term reversals.' },
  // Panels — Trend (additional)
  { key: 'vortex',   label: 'Vortex (14)',      group: 'panel', tip: 'Vortex Indicator (14). VI+ measures upward movement; VI− measures downward. VI+ crossing above VI− = bullish; VI− crossing above VI+ = bearish. Both lines rising above 1.0 confirms a strong trend.' },
  { key: 'coppock',  label: 'Coppock Curve',    group: 'panel', tip: 'Coppock Curve. A long-term momentum oscillator originally designed for monthly charts. Crossing above zero from below = major buy signal. Rare but high-conviction — especially reliable after prolonged downtrends.' },
  // Panels — Volume (additional)
  { key: 'klinger',  label: 'Klinger Vol Osc',  group: 'panel', tip: 'Klinger Volume Oscillator (34,55). Combines price direction, magnitude, and volume. Designed to detect long-term money flow while staying sensitive to short-term fluctuations. Signal line crossovers are the key signals.' },
  { key: 'bop',      label: 'Balance of Power', group: 'panel', tip: 'Balance of Power (smoothed 14). Measures the strength of buyers vs sellers by comparing where the candle closes within its range. Above zero = buyers winning; below zero = sellers winning. Divergence with price is a powerful signal.' },
  { key: 'chaikin',  label: 'Chaikin Osc',      group: 'panel', tip: 'Chaikin Oscillator (3,10). An EMA of the Accumulation/Distribution line — measures momentum of money flow. Crossing above zero = buying pressure accelerating (bullish); crossing below = selling pressure building (bearish).' },
  { key: 'disparity',label: 'Disparity Index',  group: 'panel', tip: 'Disparity Index (14). Percentage deviation of price from its 14-period EMA. High positive values = overbought/extended; high negative = oversold/stretched. Useful for mean-reversion setups — price tends to snap back.' },
  // Overlays — additional MAs
  { key: 'ema9',     label: 'EMA 9',            group: 'overlay', tip: 'Exponential Moving Average (9). Ultra-short-term trend — commonly used for intraday and swing trade entries. Price pulling back to EMA9 and bouncing is a classic continuation entry. Very reactive to price changes.' },
  { key: 'ema21',    label: 'EMA 21',           group: 'overlay', tip: 'Exponential Moving Average (21). Fibonacci-based short-term MA widely used in crypto. Acts as dynamic support in uptrends. Crossing above EMA50 signals a potential trend shift.' },
  { key: 'ema100',   label: 'EMA 100',          group: 'overlay', tip: 'Exponential Moving Average (100). Mid-to-long-term trend indicator. Often acts as a key support/resistance in bull markets. Price reclaiming EMA100 after a correction is a bullish reentry signal.' },
  { key: 'sma50',    label: 'SMA 50',           group: 'overlay', tip: 'Simple Moving Average (50). The most widely watched medium-term MA by institutional traders. Holding above SMA50 is bullish structure; losing SMA50 often triggers selling. Part of the Golden/Death Cross setup with SMA200.' },
  { key: 'sma100',   label: 'SMA 100',          group: 'overlay', tip: 'Simple Moving Average (100). Intermediate-term trend benchmark. Less commonly cited than SMA50/200 but useful as a confirmation level. Price bouncing from SMA100 = bullish; failing it = bearish.' },
  { key: 'sma200',   label: 'SMA 200',          group: 'overlay', tip: 'Simple Moving Average (200). The ultimate long-term trend gauge — defines the bull/bear market boundary for most market participants. Trading above SMA200 = macro bullish; below = macro bearish.' },
  { key: 'dema',     label: 'DEMA 20',          group: 'overlay', tip: 'Double Exponential Moving Average (20). Reduces EMA lag by applying EMA twice. More responsive than EMA with less noise than raw price. Direction and slope of DEMA is the primary signal.' },
  { key: 'tema',     label: 'TEMA 20',          group: 'overlay', tip: 'Triple Exponential Moving Average (20). Even lower lag than DEMA. Extremely responsive — good for catching early trend changes. Can produce false signals in choppy markets; best combined with ADX to confirm trending conditions.' },
  { key: 'kama',     label: 'KAMA (10)',         group: 'overlay', tip: 'Kaufman Adaptive MA (10). Automatically adjusts its speed based on market noise — moves quickly in trending markets, slowly in ranging ones. A flattening KAMA signals chop; a steep KAMA signals strong trend.' },
  { key: 'mcginley', label: 'McGinley Dyn',     group: 'overlay', tip: 'McGinley Dynamic (14). A self-adjusting MA that corrects for slow/fast EMA movement by adjusting its speed based on the price ratio. More accurate than EMA in both fast and slow markets — stays closer to actual price.' },
  { key: 'ichimoku', label: 'Ichimoku Cloud',   group: 'overlay', tip: 'Ichimoku Cloud (9,26,52). An all-in-one indicator: Tenkan (conversion), Kijun (base), Senkou A/B (cloud), Chikou (lagging). Price above the cloud = bullish; below = bearish. Cloud thickness shows support/resistance strength.' },
] as const
type IndicatorKey = typeof INDICATORS[number]['key']

// ─── Signal UI helpers ─────────────────────────────────────────────────────────

const SIGNAL_META: Record<Signal, { label: string; color: string; icon: React.ReactNode }> = {
  strong_buy:  { label: 'Strong Buy',  color: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/30', icon: <TrendingUp size={13} /> },
  buy:         { label: 'Buy',         color: 'text-green-400 bg-green-400/10 border-green-500/30',       icon: <TrendingUp size={13} /> },
  neutral:     { label: 'Neutral',     color: 'text-slate-400 bg-slate-400/10 border-slate-500/30',       icon: <Minus size={13} /> },
  sell:        { label: 'Sell',        color: 'text-orange-400 bg-orange-400/10 border-orange-500/30',    icon: <TrendingDown size={13} /> },
  strong_sell: { label: 'Strong Sell', color: 'text-red-400 bg-red-400/10 border-red-500/30',             icon: <TrendingDown size={13} /> },
}

function SignalBadge({ signal }: { signal: Signal }) {
  const meta = SIGNAL_META[signal]
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold', meta.color)}>
      {meta.icon}{meta.label}
    </span>
  )
}

// ─── Technical Read panel (plain-English summary) ───────────────────────────────

function TechnicalReadPanel({ candles, summary }: { candles: OhlcvCandle[]; summary: SignalSummary }) {
  const read = useMemo(() => buildTechnicalRead(candles, summary), [candles, summary])

  const trendColor = read.trendBias.state === 'bullish' ? 'text-emerald-400'
    : read.trendBias.state === 'bearish' ? 'text-red-400' : 'text-slate-400'
  const momColor = read.momentum.state === 'overbought' ? 'text-red-400'
    : read.momentum.state === 'oversold' ? 'text-emerald-400'
    : read.momentum.state === 'strengthening' ? 'text-emerald-400'
    : read.momentum.state === 'weakening' ? 'text-amber-400' : 'text-slate-400'
  const volColor = read.volatility.state === 'expanding' ? 'text-amber-400'
    : read.volatility.state === 'contracting' ? 'text-blue-400' : 'text-slate-400'

  const rows: { icon: React.ReactNode; label: string; state: string; color: string; detail: string }[] = [
    { icon: <Compass size={13} />,    label: 'Trend bias',  state: read.trendBias.state,  color: trendColor, detail: read.trendBias.detail },
    { icon: <Gauge size={13} />,      label: 'Momentum',    state: read.momentum.state,   color: momColor,   detail: read.momentum.detail },
    { icon: <Waves size={13} />,      label: 'Volatility',  state: read.volatility.state, color: volColor,   detail: read.volatility.detail },
    { icon: <Target size={13} />,     label: 'Key level',   state: '',                    color: 'text-slate-400', detail: read.srProximity.detail },
  ]

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Technical Read</span>
        <div className="flex items-center gap-1.5" title="Agreement-weighted conviction across the indicator stack">
          <span className="text-[10px] text-text-muted">Confidence</span>
          <span className={clsx('text-xs font-bold font-mono', read.confidence >= 60 ? 'text-emerald-400' : read.confidence >= 30 ? 'text-amber-400' : 'text-slate-400')}>
            {read.confidence}%
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-2.5">
            <span className={clsx('mt-0.5 shrink-0', r.color)}>{r.icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-text-primary">{r.label}</span>
                {r.state && <span className={clsx('text-[10px] font-semibold uppercase tracking-wide', r.color)}>{r.state}</span>}
              </div>
              <p className="text-[11px] text-text-muted leading-snug">{r.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-text-muted/70 border-t border-border pt-2 leading-snug">{read.sourceExplanation}</p>
    </div>
  )
}

// ─── Auto Support / Resistance panel ────────────────────────────────────────────

function SupportResistancePanel({ candles }: { candles: OhlcvCandle[] }) {
  const levels = useMemo(() => detectSupportResistance(candles), [candles])
  if (levels.length === 0) return null
  const last = candles[candles.length - 1].close

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Support / Resistance</span>
        <span className="text-[10px] text-text-muted">auto-detected from swings</span>
      </div>
      <div className="space-y-1">
        {levels.map((l, i) => {
          const isRes = l.type === 'resistance'
          return (
            <div key={i} className="flex items-center justify-between px-2 py-1 rounded hover:bg-bg-elevated text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className={clsx('px-1 py-0.5 rounded text-[9px] font-semibold uppercase', isRes ? 'bg-red-400/10 text-red-400' : 'bg-emerald-400/10 text-emerald-400')}>
                  {isRes ? 'R' : 'S'}
                </span>
                {/* strength dots */}
                <span className="flex gap-0.5" title={`${l.strength} swing touches`}>
                  {Array.from({ length: Math.min(l.strength, 4) }).map((_, d) => (
                    <span key={d} className={clsx('inline-block size-1 rounded-full', isRes ? 'bg-red-400/60' : 'bg-emerald-400/60')} />
                  ))}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx('text-[10px]', l.distancePct >= 0 ? 'text-red-400/80' : 'text-emerald-400/80')}>
                  {l.distancePct >= 0 ? '+' : ''}{l.distancePct.toFixed(1)}%
                </span>
                <span className="font-mono font-semibold text-text-primary">
                  ${l.price.toLocaleString(undefined, { maximumFractionDigits: l.price > 100 ? 2 : 4 })}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-text-muted/70">Current ${last.toLocaleString(undefined, { maximumFractionDigits: last > 100 ? 2 : 4 })} · letters mark support (S) / resistance (R); dots = touch count.</p>
    </div>
  )
}

// ─── Signal Summary panel ──────────────────────────────────────────────────────

function SignalSummaryPanel({ summary }: { summary: SignalSummary }) {
  const total = summary.buy + summary.neutral + summary.sell
  const buyPct = total > 0 ? (summary.buy / total) * 100 : 0
  const sellPct = total > 0 ? (summary.sell / total) * 100 : 0
  const neuPct = total > 0 ? (summary.neutral / total) * 100 : 0

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Signal Summary</span>
        <SignalBadge signal={summary.overall} />
      </div>

      {/* Gauge bar */}
      <div className="space-y-1.5">
        <div className="h-2.5 rounded-full overflow-hidden flex gap-px">
          <div className="bg-emerald-500 transition-all" style={{ width: `${buyPct}%` }} />
          <div className="bg-slate-600 transition-all" style={{ width: `${neuPct}%` }} />
          <div className="bg-red-500 transition-all" style={{ width: `${sellPct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-text-muted">
          <span className="text-emerald-400">{summary.buy} Buy</span>
          <span>{summary.neutral} Neutral</span>
          <span className="text-red-400">{summary.sell} Sell</span>
        </div>
      </div>

      {/* Individual signals */}
      <div className="space-y-2">
        {summary.signals.map((sig) => (
          <div key={sig.name} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-text-primary">{sig.name}</p>
              <p className="text-[10px] text-text-muted truncate">{sig.description}</p>
            </div>
            <SignalBadge signal={sig.signal} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Patterns panel ────────────────────────────────────────────────────────────

function PatternsPanel({ patterns, candles }: { patterns: DetectedPattern[]; candles: OhlcvCandle[] }) {
  if (patterns.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
        <Activity size={28} className="mx-auto mb-2 text-text-muted/40" />
        <p className="text-xs text-text-muted">No clear patterns detected</p>
      </div>
    )
  }

  const fmt = (v: number) => '$' + v.toLocaleString(undefined, { maximumFractionDigits: v > 100 ? 2 : 4 })

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Detected Patterns</span>
      {patterns.map((p, i) => {
        const proj = patternProjection(p, candles)
        const last = candles[candles.length - 1].close
        const movePct = proj ? ((proj.measuredMoveTarget - last) / last) * 100 : null
        return (
          <div key={i} className={clsx('rounded-lg border p-3 flex flex-col gap-1.5', p.type === 'bullish' ? 'border-emerald-500/20 bg-emerald-500/5' : p.type === 'bearish' ? 'border-red-500/20 bg-red-500/5' : 'border-border bg-bg-elevated')}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text-primary">{p.name}</span>
              <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded', p.type === 'bullish' ? 'text-emerald-400 bg-emerald-400/10' : p.type === 'bearish' ? 'text-red-400 bg-red-400/10' : 'text-slate-400 bg-slate-400/10')}>
                {(p.confidence * 100).toFixed(0)}% conf.
              </span>
            </div>
            <p className="text-[11px] text-text-muted">{p.description}</p>
            {proj && (
              <div className="grid grid-cols-2 gap-1.5 mt-1 pt-1.5 border-t border-border/60">
                <div className="flex items-center gap-1.5" title="Measured-move target — pattern height projected from the break level">
                  <Target size={11} className="text-emerald-400 shrink-0" />
                  <span className="text-[10px] text-text-muted">Target</span>
                  <span className="text-[10px] font-mono font-semibold text-text-primary">{fmt(proj.measuredMoveTarget)}</span>
                  {movePct !== null && <span className={clsx('text-[9px]', movePct >= 0 ? 'text-emerald-400' : 'text-red-400')}>({movePct >= 0 ? '+' : ''}{movePct.toFixed(1)}%)</span>}
                </div>
                <div className="flex items-center gap-1.5" title="Invalidation — a close past this level voids the pattern">
                  <ShieldAlert size={11} className="text-amber-400 shrink-0" />
                  <span className="text-[10px] text-text-muted">Invalid</span>
                  <span className="text-[10px] font-mono font-semibold text-text-primary">{fmt(proj.invalidationLevel)}</span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Scanner (multi-asset setup detection) ──────────────────────────────────────

type SetupKey = 'breakout' | 'oversold_bounce' | 'ma_cross' | 'volume_spike' | 'volatility_compression'

const SETUP_META: Record<SetupKey, { label: string; tone: string }> = {
  breakout:               { label: 'Breakout',        tone: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  oversold_bounce:        { label: 'Oversold bounce', tone: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ma_cross:               { label: 'MA cross',        tone: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  volume_spike:           { label: 'Volume spike',    tone: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  volatility_compression: { label: 'Vol. squeeze',    tone: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
}

interface DetectedSetup { key: SetupKey; detail: string }

/** Detect named technical setups on a daily candle series. Pure derivation. */
function detectSetups(candles: OhlcvCandle[]): DetectedSetup[] {
  const n = candles.length
  if (n < 55) return []
  const closes = candles.map(c => c.close)
  const highs = candles.map(c => c.high)
  const vols = candles.map(c => c.volume)
  const last = closes[n - 1]
  const prev = closes[n - 2]
  const setups: DetectedSetup[] = []

  // Breakout — close above the prior 20-bar high
  const priorHigh = Math.max(...highs.slice(n - 21, n - 1))
  if (last > priorHigh) setups.push({ key: 'breakout', detail: `Closed above 20-bar high $${priorHigh.toLocaleString(undefined, { maximumFractionDigits: 2 })}` })

  // Oversold bounce — RSI < 38 and turning up
  const rsiVals = rsi(closes, 14)
  const rsiNow = rsiVals[n - 1]; const rsiPrev = rsiVals[n - 2]
  if (rsiNow !== null && rsiNow < 38 && last > prev && (rsiPrev === null || rsiNow > rsiPrev)) {
    setups.push({ key: 'oversold_bounce', detail: `RSI ${rsiNow.toFixed(0)} turning up off oversold` })
  }

  // MA cross — EMA20/EMA50 crossed within the last ~2 bars
  const e20 = ema(closes, 20); const e50 = ema(closes, 50)
  const a20 = e20[n - 1], a50 = e50[n - 1], b20 = e20[n - 3], b50 = e50[n - 3]
  if (a20 !== null && a50 !== null && b20 !== null && b50 !== null) {
    if (b20 <= b50 && a20 > a50) setups.push({ key: 'ma_cross', detail: 'EMA20 crossed above EMA50 (golden)' })
    else if (b20 >= b50 && a20 < a50) setups.push({ key: 'ma_cross', detail: 'EMA20 crossed below EMA50 (death)' })
  }

  // Volume spike — last bar > 2× the 20-bar average
  const avgVol = vols.slice(n - 21, n - 1).reduce((a, b) => a + b, 0) / 20
  if (avgVol > 0 && vols[n - 1] > avgVol * 2) setups.push({ key: 'volume_spike', detail: `Volume ${(vols[n - 1] / avgVol).toFixed(1)}× its 20-bar average` })

  // Volatility compression — Bollinger width near its 50-bar minimum (squeeze)
  const bb = bollingerBands(closes, 20, 2)
  const widths: number[] = []
  for (let i = Math.max(0, n - 50); i < n; i++) {
    const u = bb.upper[i], l = bb.lower[i], m = bb.middle[i]
    if (u !== null && l !== null && m !== null && m !== 0) widths.push((u - l) / m)
  }
  if (widths.length > 10) {
    const cur = widths[widths.length - 1]
    const min = Math.min(...widths)
    if (cur <= min * 1.1) setups.push({ key: 'volatility_compression', detail: 'Bollinger bands at a 50-bar squeeze' })
  }

  return setups
}

interface ScanRow {
  assetId: string
  label: string
  symbol: string
  setups: DetectedSetup[]
  signal: SignalSummary | null
  loading: boolean
}

function formatPrice(price: number): string {
  if (price >= 1000) return '$' + price.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (price >= 1)    return '$' + price.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return '$' + price.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

function ScannerPanel() {
  const [rows, setRows] = useState<ScanRow[]>(
    SCREENER_ASSETS.map((a) => ({ assetId: a.id, label: a.label, symbol: a.symbol, setups: [], signal: null, loading: true })),
  )
  const [activeScan, setActiveScan] = useState<SetupKey | 'all'>('all')

  const { data: marketsData } = useQuery({
    queryKey: ['scanner-prices'],
    queryFn: () => fetch('/live-data/markets').then(r => r.json()),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      await Promise.all(SCREENER_ASSETS.map(async (asset) => {
        try {
          const res = await fetch(`/live-data/ohlcv?id=${asset.id}&range=1Y`)
          const json = await res.json()
          const candles: OhlcvCandle[] = json.candles ?? []
          const setups = detectSetups(candles)
          const signal = candles.length >= 50 ? computeSignalSummary(candles) : null
          if (!cancelled) {
            setRows((prev) => prev.map((r) => r.assetId === asset.id ? { ...r, setups, signal, loading: false } : r))
          }
        } catch {
          if (!cancelled) {
            setRows((prev) => prev.map((r) => r.assetId === asset.id ? { ...r, loading: false } : r))
          }
        }
      }))
    }
    loadAll()
    return () => { cancelled = true }
  }, [])

  const loading = rows.some(r => r.loading)
  const counts = (Object.keys(SETUP_META) as SetupKey[]).reduce<Record<string, number>>((acc, k) => {
    acc[k] = rows.filter(r => r.setups.some(s => s.key === k)).length
    return acc
  }, {})

  const filtered = rows.filter(r =>
    activeScan === 'all' ? r.setups.length > 0 : r.setups.some(s => s.key === activeScan),
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Scan-type filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={13} className="text-text-muted" />
        <button
          onClick={() => setActiveScan('all')}
          className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border', activeScan === 'all' ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
        >
          All setups
        </button>
        {(Object.keys(SETUP_META) as SetupKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setActiveScan(k)}
            className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border flex items-center gap-1.5', activeScan === k ? SETUP_META[k].tone : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
          >
            {SETUP_META[k].label}
            <span className="text-[10px] opacity-70">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <RefreshCw size={12} className="animate-spin" /> Scanning {SCREENER_ASSETS.length} assets…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          <Activity size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs">No assets currently match {activeScan === 'all' ? 'any setup' : SETUP_META[activeScan].label}.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-bg-elevated">
                <th className="text-left px-4 py-2.5 text-text-muted font-medium">Asset</th>
                <th className="text-right px-3 py-2.5 text-text-muted font-medium">Price</th>
                <th className="text-center px-3 py-2.5 text-text-muted font-medium">Signal</th>
                <th className="text-left px-4 py-2.5 text-text-muted font-medium">Detected setups</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => (
                <tr key={row.assetId} className="hover:bg-bg-elevated transition-colors align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-text-primary">{row.symbol}</span>
                      <span className="text-text-muted">{row.label}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sm text-text-primary whitespace-nowrap">
                    {(() => {
                      const price = marketsData?.quotes?.[row.assetId]?.price
                      return typeof price === 'number' ? formatPrice(price) : <span className="text-text-muted text-xs">—</span>
                    })()}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {row.signal ? <SignalBadge signal={row.signal.overall} /> : <span className="text-text-muted text-[10px]">N/A</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      {row.setups
                        .filter(s => activeScan === 'all' || s.key === activeScan)
                        .map((s, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className={clsx('px-1.5 py-0.5 rounded border text-[10px] font-medium shrink-0', SETUP_META[s.key].tone)}>
                              {SETUP_META[s.key].label}
                            </span>
                            <span className="text-[11px] text-text-muted">{s.detail}</span>
                          </div>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Key Levels panel ─────────────────────────────────────────────────────────

function KeyLevelsPanel({ candles }: { candles: OhlcvCandle[] }) {
  if (candles.length < 20) return null
  const fib = fibRetracement(candles, Math.min(candles.length, 100))
  const last = candles[candles.length - 1].close
  const ema20Now = ema(candles.map((c) => c.close), 20)[candles.length - 1]
  const ema50Now = ema(candles.map((c) => c.close), 50)[candles.length - 1]
  const ema200Now = ema(candles.map((c) => c.close), 200)[candles.length - 1]

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Key Levels</span>

      {/* Fibonacci */}
      <div>
        <p className="text-[10px] text-text-muted mb-2 uppercase tracking-wide">Fibonacci Retracement ({candles.length < 100 ? candles.length : 100} candles)</p>
        <div className="space-y-1">
          {fib.levels.map((l) => {
            const isAbove = l.price > last
            const isCurrent = Math.abs(l.price - last) / last < 0.005
            return (
              <div key={l.ratio} className={clsx('flex items-center justify-between px-2 py-1 rounded text-[11px]', isCurrent ? 'bg-accent-blue/10 border border-accent-blue/30' : 'hover:bg-bg-elevated')}>
                <span className={clsx('font-mono text-text-muted', isCurrent && 'text-accent-blue')}>{l.label}</span>
                <span className={clsx('font-mono font-semibold', isAbove ? 'text-red-400' : 'text-emerald-400', isCurrent && 'text-accent-blue')}>
                  ${l.price.toLocaleString(undefined, { maximumFractionDigits: l.price > 100 ? 2 : 4 })}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Moving Average levels */}
      <div>
        <p className="text-[10px] text-text-muted mb-2 uppercase tracking-wide">Moving Averages</p>
        <div className="space-y-1">
          {[
            { label: 'EMA 20', value: ema20Now, color: '#f59e0b' },
            { label: 'EMA 50', value: ema50Now, color: '#8b5cf6' },
            { label: 'EMA 200', value: ema200Now, color: '#ec4899' },
          ].map(({ label, value, color }) => value !== null && (
            <div key={label} className="flex items-center justify-between px-2 py-1 rounded hover:bg-bg-elevated text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full" style={{ background: color }} />
                <span className="text-text-muted">{label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx('text-[10px]', last > value ? 'text-emerald-400' : 'text-red-400')}>
                  {last > value ? '▲' : '▼'} {((last - value) / value * 100).toFixed(2)}%
                </span>
                <span className="font-mono font-semibold text-text-primary">
                  ${value.toLocaleString(undefined, { maximumFractionDigits: value > 100 ? 2 : 4 })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Multi-Timeframe Confluence Grid ──────────────────────────────────────────

const TF_ROWS = [
  { label: '15m', range: '15m' },
  { label: '1H',  range: '1H'  },
  { label: '4H',  range: '4H'  },
  { label: '1D',  range: '1Y'  },
  { label: '1W',  range: '3Y'  },
] as const

interface TFRow {
  label: string
  range: string
  summary: SignalSummary | null
  loading: boolean
}

function MultiTimeframeGrid({ assetId }: { assetId: string }) {
  const [rows, setRows] = useState<TFRow[]>(
    TF_ROWS.map(r => ({ ...r, summary: null, loading: true })),
  )

  useEffect(() => {
    setRows(TF_ROWS.map(r => ({ ...r, summary: null, loading: true })))
    let cancelled = false

    Promise.all(TF_ROWS.map(async (tf) => {
      try {
        const res  = await fetch(`/live-data/ohlcv?id=${assetId}&range=${tf.range}`)
        const json = await res.json()
        const candles: OhlcvCandle[] = json.candles ?? []
        const summary = candles.length >= 50 ? computeSignalSummary(candles) : null
        if (!cancelled)
          setRows(prev => prev.map(r => r.range === tf.range ? { ...r, summary, loading: false } : r))
      } catch {
        if (!cancelled)
          setRows(prev => prev.map(r => r.range === tf.range ? { ...r, loading: false } : r))
      }
    }))

    return () => { cancelled = true }
  }, [assetId])

  // Confluence: count loaded rows and how many agree
  const loaded  = rows.filter(r => !r.loading && r.summary)
  const bullish = loaded.filter(r => r.summary!.overall === 'buy' || r.summary!.overall === 'strong_buy').length
  const bearish = loaded.filter(r => r.summary!.overall === 'sell' || r.summary!.overall === 'strong_sell').length

  function confluenceLabel() {
    if (loaded.length < 3) return null
    if (bullish >= 4) return { text: `${bullish}/${loaded.length} timeframes bullish — strong confluence`, color: 'text-emerald-400' }
    if (bearish >= 4) return { text: `${bearish}/${loaded.length} timeframes bearish — strong confluence`, color: 'text-red-400' }
    if (bullish >= 3) return { text: `${bullish}/${loaded.length} timeframes bullish — moderate confluence`, color: 'text-green-400' }
    if (bearish >= 3) return { text: `${bearish}/${loaded.length} timeframes bearish — moderate confluence`, color: 'text-orange-400' }
    return { text: 'Mixed signals across timeframes — no clear confluence', color: 'text-text-muted' }
  }

  const confluence = confluenceLabel()

  // Plain-English per-timeframe agreement, e.g. "1D bullish · 4H overbought · 1H weakening"
  function tfPhrase(summary: SignalSummary): { word: string; color: string } {
    const rsiSig = summary.signals.find(s => s.name.startsWith('RSI'))
    const rsiVal = rsiSig?.value ?? null
    if (rsiVal !== null && rsiVal > 70) return { word: 'overbought', color: 'text-red-400' }
    if (rsiVal !== null && rsiVal < 30) return { word: 'oversold', color: 'text-emerald-400' }
    switch (summary.overall) {
      case 'strong_buy':  return { word: 'strong bull', color: 'text-emerald-400' }
      case 'buy':         return { word: 'bullish', color: 'text-emerald-400' }
      case 'sell':        return { word: 'bearish', color: 'text-red-400' }
      case 'strong_sell': return { word: 'strong bear', color: 'text-red-400' }
      default:            return { word: 'neutral', color: 'text-slate-400' }
    }
  }
  const agreement = loaded.length >= 2
    ? [...loaded].reverse().map(r => ({ label: r.label, ...tfPhrase(r.summary!) }))
    : null

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Multi-Timeframe Confluence
        </span>
        {confluence && (
          <span className={clsx('text-[11px] font-medium', confluence.color)}>
            {confluence.text}
          </span>
        )}
      </div>

      {/* Plain-English agreement line */}
      {agreement && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] -mt-1">
          {agreement.map((a, i) => (
            <span key={a.label} className="flex items-center gap-1.5">
              <span className="font-mono font-semibold text-text-secondary">{a.label}</span>
              <span className={clsx('font-medium', a.color)}>{a.word}</span>
              {i < agreement.length - 1 && <span className="text-text-muted/40">·</span>}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-5 gap-2">
        {rows.map((row) => {
          const total = row.summary ? row.summary.buy + row.summary.neutral + row.summary.sell : 0
          return (
            <div
              key={row.label}
              className="flex flex-col items-center gap-2 rounded-lg border border-border bg-bg-elevated p-3"
            >
              <span className="text-[11px] font-mono font-bold text-text-secondary">{row.label}</span>

              {row.loading ? (
                <div className="h-5 w-16 rounded-full bg-bg-card animate-pulse" />
              ) : row.summary ? (
                <>
                  <SignalBadge signal={row.summary.overall} />
                  <div className="h-1.5 w-full rounded-full overflow-hidden flex gap-px">
                    <div className="bg-emerald-500 transition-all" style={{ width: `${(row.summary.buy    / total) * 100}%` }} />
                    <div className="bg-slate-600 transition-all"   style={{ width: `${(row.summary.neutral / total) * 100}%` }} />
                    <div className="bg-red-500 transition-all"     style={{ width: `${(row.summary.sell   / total) * 100}%` }} />
                  </div>
                  <div className="flex gap-2 text-[10px]">
                    <span className="text-emerald-400">{row.summary.buy}B</span>
                    <span className="text-text-muted">{row.summary.neutral}N</span>
                    <span className="text-red-400">{row.summary.sell}S</span>
                  </div>
                </>
              ) : (
                <span className="text-[10px] text-text-muted">N/A</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Thesis Builder (save chart setups) ─────────────────────────────────────────

function ThesisBuilderPanel({ assetId, symbol, range, price, signal }: {
  assetId: string; symbol: string; range: string; price: number | null; signal: string | null
}) {
  const { theses, addThesis, removeThesis } = useThesisStore()
  const [open, setOpen] = useState(false)
  const [entryThesis, setEntryThesis] = useState('')
  const [target, setTarget] = useState('')
  const [invalidation, setInvalidation] = useState('')
  const [notes, setNotes] = useState('')

  const rr = price != null ? computeRiskReward(String(price), target, invalidation) : null
  const canSave = entryThesis.trim().length > 0

  function save() {
    if (!canSave) return
    addThesis({ assetId, symbol, range, priceAtSave: price, signalAtSave: signal, entryThesis: entryThesis.trim(), target: target.trim(), invalidation: invalidation.trim(), notes: notes.trim() })
    setEntryThesis(''); setTarget(''); setInvalidation(''); setNotes(''); setOpen(false)
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Chart Notes / Thesis</span>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-xs text-text-secondary hover:bg-bg-elevated transition-colors"
        >
          <PenLine size={12} /> {open ? 'Cancel' : `New thesis for ${symbol}`}
        </button>
      </div>

      {open && (
        <div className="rounded-lg border border-border bg-bg-elevated/40 p-3 flex flex-col gap-2.5">
          <div className="text-[10px] text-text-muted">
            Snapshot: {symbol} · {range} · {price != null ? '$' + price.toLocaleString(undefined, { maximumFractionDigits: price > 100 ? 2 : 4 }) : 'n/a'} · signal {signal ?? 'n/a'}
          </div>
          <textarea
            value={entryThesis} onChange={e => setEntryThesis(e.target.value)}
            placeholder="Entry thesis — why this setup? (required)"
            rows={2}
            className="w-full text-xs bg-bg-card border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue resize-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Target (e.g. 75000)" className="text-xs bg-bg-card border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue" />
            <input value={invalidation} onChange={e => setInvalidation(e.target.value)} placeholder="Invalidation (e.g. 58000)" className="text-xs bg-bg-card border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue" />
          </div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" className="text-xs bg-bg-card border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-muted">
              {rr != null ? <>Risk/Reward <span className={clsx('font-semibold', rr >= 2 ? 'text-emerald-400' : rr >= 1 ? 'text-amber-400' : 'text-red-400')}>{rr.toFixed(2)}:1</span></> : 'Enter numeric target + invalidation for R/R'}
            </span>
            <button
              onClick={save} disabled={!canSave}
              className="px-3 py-1.5 rounded-lg bg-accent-blue text-white text-xs font-medium disabled:opacity-40 hover:bg-blue-600 transition-colors"
            >
              Save thesis
            </button>
          </div>
        </div>
      )}

      {theses.length === 0 ? (
        <p className="text-[11px] text-text-muted text-center py-2">No saved theses yet. Saved locally in your browser.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {theses.map((t) => {
            const tRr = computeRiskReward(String(t.priceAtSave ?? ''), t.target, t.invalidation)
            return (
              <div key={t.id} className="rounded-lg border border-border bg-bg-elevated/40 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-bold text-xs text-text-primary">{t.symbol}</span>
                    <span className="text-[10px] text-text-muted">{t.range}</span>
                    {t.priceAtSave != null && <span className="text-[10px] text-text-muted">@ ${t.priceAtSave.toLocaleString(undefined, { maximumFractionDigits: t.priceAtSave > 100 ? 2 : 4 })}</span>}
                    {tRr != null && <span className={clsx('text-[10px] font-semibold', tRr >= 2 ? 'text-emerald-400' : tRr >= 1 ? 'text-amber-400' : 'text-red-400')}>{tRr.toFixed(1)}:1</span>}
                  </div>
                  <button onClick={() => removeThesis(t.id)} className="text-text-muted hover:text-red-400 transition-colors shrink-0" title="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
                <p className="text-[11px] text-text-secondary mt-1">{t.entryThesis}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-text-muted">
                  {t.target && <span><Target size={9} className="inline mb-0.5 text-emerald-400" /> {t.target}</span>}
                  {t.invalidation && <span><ShieldAlert size={9} className="inline mb-0.5 text-amber-400" /> {t.invalidation}</span>}
                  <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
                {t.notes && <p className="text-[10px] text-text-muted italic mt-1">{t.notes}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Market Structure panel (crypto-native overlays, feature #3) ─────────────────

function MarketStructurePanel({ symbol }: { symbol: string }) {
  const { data: funding } = useQuery({
    queryKey: ['ms-funding'],
    queryFn: () => fetch('/live-data/funding-rates').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
  const { data: reserves } = useQuery({
    queryKey: ['ms-reserves'],
    queryFn: () => fetch('/live-data/reserves').then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  })

  const row = (funding?.rates ?? []).find((r: { symbol: string }) => r.symbol?.toUpperCase() === symbol.toUpperCase())
  const stableTotal: number | null = reserves?.assets
    ? reserves.assets.reduce((a: number, s: { circulatingUsd?: number }) => a + (s.circulatingUsd ?? 0), 0)
    : null

  const fmtUsd = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toLocaleString()}`

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Market Structure</span>
        <DataBadge status={row || stableTotal ? 'live' : 'unavailable'} source="OKX · DefiLlama" />
      </div>

      <div className="space-y-2">
        {/* Funding rate */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-text-muted"><Gauge size={12} /> Funding (annualized)</span>
          {row ? (
            <span className={clsx('font-mono font-semibold', row.annualized >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {row.annualized >= 0 ? '+' : ''}{row.annualized.toFixed(2)}% <span className="text-text-muted font-normal">({row.exchange})</span>
            </span>
          ) : <span className="text-text-muted">n/a</span>}
        </div>
        {/* Open interest */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-text-muted"><Scale size={12} /> Open interest</span>
          {row?.openInterestUsd ? <span className="font-mono font-semibold text-text-primary">{fmtUsd(row.openInterestUsd)}</span> : <span className="text-text-muted">n/a</span>}
        </div>
        {/* Long/short ratio */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-text-muted"><Compass size={12} /> Long/short ratio</span>
          {row?.longShortRatio != null ? <span className="font-mono font-semibold text-text-primary">{row.longShortRatio.toFixed(2)}</span> : <span className="text-text-muted">n/a — not provided</span>}
        </div>
        {/* Stablecoin supply (market-wide) */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-text-muted"><CircleDollarSign size={12} /> Total stablecoin supply</span>
          {stableTotal ? <span className="font-mono font-semibold text-text-primary">{fmtUsd(stableTotal)}</span> : <span className="text-text-muted">n/a</span>}
        </div>
      </div>

      {/* Honest unavailable markers — no free real-time source */}
      <div className="border-t border-border pt-2 space-y-1">
        {['Liquidation heatmap', 'Exchange in/out-flows'].map((label) => (
          <div key={label} className="flex items-center justify-between text-[10px] text-text-muted/70">
            <span className="flex items-center gap-1.5"><MinusCircle size={11} /> {label}</span>
            <span>not available (paid feed)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Events panel (event markers, feature #4) ───────────────────────────────────

function EventsPanel({ events }: { events: { time: number; label: string; sentiment?: string; url?: string }[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
        <Newspaper size={24} className="mx-auto mb-2 text-text-muted/40" />
        <p className="text-xs text-text-muted">No recent events for this asset.</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Events</span>
        <span className="text-[10px] text-text-muted">news markers on chart ↑</span>
      </div>
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
        {events.slice(0, 25).map((e, i) => {
          const dot = e.sentiment === 'positive' ? 'bg-emerald-400' : e.sentiment === 'negative' ? 'bg-red-400' : 'bg-slate-400'
          return (
            <a key={i} href={e.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 group">
              <span className={clsx('mt-1 size-1.5 rounded-full shrink-0', dot)} />
              <div className="min-w-0">
                <p className="text-[11px] text-text-secondary group-hover:text-accent-blue transition-colors leading-snug flex items-start gap-1">
                  {e.label}
                  {e.url && <ExternalLink size={9} className="text-text-muted shrink-0 mt-0.5" />}
                </p>
                <span className="text-[10px] text-text-muted">{new Date(e.time * 1000).toLocaleDateString()}</span>
              </div>
            </a>
          )
        })}
      </div>
      <p className="text-[10px] text-text-muted/70 border-t border-border pt-2">
        Sourced from the live news feed. Token unlocks &amp; CPI/FOMC require a paid calendar feed — not shown.
      </p>
    </div>
  )
}

// ─── Strategy Backtest panel (feature #7) ───────────────────────────────────────

function BacktestPanel({ assetId, symbol }: { assetId: string; symbol: string }) {
  // Backtests use their own dedicated long DAILY series (range=BT, ~1000 bars)
  // rather than the chart's selected range. A 200-period MA needs 200 bars of
  // warm-up; on the chart's default 1Y (365 daily) that leaves only ~165 usable
  // bars, which is too short for the trend strategies to ever trigger.
  const { data, isFetching } = useQuery({
    queryKey: ['ta-backtest-ohlcv', assetId],
    queryFn: async () => {
      const res = await fetch(`/live-data/ohlcv?id=${assetId}&range=BT`)
      if (!res.ok) throw new Error('fetch failed')
      return res.json() as Promise<{ ok: boolean; candles: OhlcvCandle[]; source?: string }>
    },
    staleTime: 60 * 60 * 1000,
  })
  const candles = useMemo<OhlcvCandle[]>(() => data?.candles ?? [], [data])

  // Results for every strategy, so we can both render the active one and
  // auto-select a strategy that actually produced trades on first load.
  const allResults = useMemo(
    () => Object.fromEntries(STRATEGIES.map(s => [s.key, candles.length > 0 ? runBacktest(candles, s.key) : null])),
    [candles],
  )

  // null = "not yet chosen by the user"; we pick a sensible default once data lands.
  const [strategyKey, setStrategyKey] = useState<string | null>(null)
  useEffect(() => {
    if (strategyKey !== null || candles.length === 0) return
    const firstWithTrades = STRATEGIES.find(s => (allResults[s.key]?.metrics.sampleCount ?? 0) > 0)
    setStrategyKey((firstWithTrades ?? STRATEGIES[0]).key)
  }, [allResults, candles.length, strategyKey])

  const activeKey = strategyKey ?? STRATEGIES[0].key
  const result = allResults[activeKey] ?? null
  const strat = STRATEGIES.find(s => s.key === activeKey)!

  const metricCard = (label: string, value: string, tone?: string) => (
    <div className="rounded-lg border border-border bg-bg-card px-3 py-2.5 text-center">
      <div className={clsx('text-lg font-bold font-mono', tone ?? 'text-text-primary')}>{value}</div>
      <div className="text-[10px] text-text-muted mt-0.5">{label}</div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Strategy selector */}
      <div className="flex flex-wrap items-center gap-2">
        <FlaskConical size={14} className="text-accent-blue" />
        {STRATEGIES.map(s => {
          const tradeCount = allResults[s.key]?.metrics.sampleCount
          return (
            <button
              key={s.key}
              onClick={() => setStrategyKey(s.key)}
              className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors', activeKey === s.key ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
            >
              {s.name}
              {tradeCount != null && <span className="ml-1 text-[10px] opacity-70">({tradeCount})</span>}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-text-muted">{strat.description} · Backtested on {symbol} over {candles.length} daily candles (~{(candles.length / 365).toFixed(1)}y). Long-only, full position, one trade at a time.</p>

      {isFetching && candles.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-8 text-center text-text-muted text-sm">
          Loading {symbol} daily history…
        </div>
      ) : !result ? (
        <div className="rounded-xl border border-border bg-bg-card p-8 text-center text-text-muted text-sm">
          Not enough price history for this strategy — it needs ≥{strat.minBars} daily candles and only {candles.length} are
          available for {symbol}. The Bollinger-bounce strategy works on shorter histories; the 200-period trend strategies
          need roughly two or more years of daily data.
        </div>
      ) : result.metrics.sampleCount === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-8 text-center text-text-muted text-sm">
          There was enough data, but this strategy&apos;s entry conditions never triggered for {symbol} over the last{' '}
          {(candles.length / 365).toFixed(1)} years — so it took no trades. Try another strategy above (trade counts are shown in parentheses).
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {metricCard('Win rate', `${result.metrics.winRate.toFixed(0)}%`, result.metrics.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400')}
            {metricCard('Avg return', `${result.metrics.averageReturn >= 0 ? '+' : ''}${result.metrics.averageReturn.toFixed(1)}%`, result.metrics.averageReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}
            {metricCard('Total return', `${result.metrics.totalReturn >= 0 ? '+' : ''}${result.metrics.totalReturn.toFixed(1)}%`, result.metrics.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}
            {metricCard('Max drawdown', `-${result.metrics.maxDrawdown.toFixed(1)}%`, 'text-red-400')}
            {metricCard('Trades', `${result.metrics.sampleCount}`)}
            {metricCard('Avg hold', `${result.metrics.averageHoldingPeriod.toFixed(0)} bars`)}
          </div>

          {/* Trades table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-bg-elevated">
                  <th className="text-left px-4 py-2 text-text-muted font-medium">#</th>
                  <th className="text-right px-3 py-2 text-text-muted font-medium">Entry</th>
                  <th className="text-right px-3 py-2 text-text-muted font-medium">Exit</th>
                  <th className="text-right px-3 py-2 text-text-muted font-medium">Return</th>
                  <th className="text-right px-4 py-2 text-text-muted font-medium">Bars held</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.trades.map((t, i) => (
                  <tr key={i} className="hover:bg-bg-elevated transition-colors">
                    <td className="px-4 py-2 text-text-muted">{i + 1}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-secondary">${t.entryPrice.toLocaleString(undefined, { maximumFractionDigits: t.entryPrice > 100 ? 2 : 4 })}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-secondary">${t.exitPrice.toLocaleString(undefined, { maximumFractionDigits: t.exitPrice > 100 ? 2 : 4 })}</td>
                    <td className={clsx('px-3 py-2 text-right font-mono font-semibold', t.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>{t.returnPct >= 0 ? '+' : ''}{t.returnPct.toFixed(2)}%</td>
                    <td className="px-4 py-2 text-right font-mono text-text-muted">{t.bars}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-text-muted/70">
            Hypothetical, no fees or slippage; past performance does not predict future results. Not financial advice.
          </p>
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'chart' | 'patterns' | 'scanner' | 'backtest'

export default function TechnicalAnalysisPage() {
  const searchParams = useSearchParams()

  // Fetch live coin list to enrich OHLCV-supported assets with names + ranks
  const { data: coinListData } = useQuery<CoinListResponse>({
    queryKey: ['coin-list'],
    queryFn: () => fetch('/live-data/coin-list').then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  })

  // Build chart asset list: all COINGECKO_IDS-supported ids, enriched with live names
  const chartAssets = useMemo(() => {
    const coinMap = new Map(
      (coinListData?.coins ?? []).map(c => [c.symbol.toUpperCase(), c])
    )
    return SUPPORTED_IDS.map(id => {
      const sym = id.toUpperCase()
      const live = coinMap.get(sym)
      return {
        id,
        symbol: sym,
        label: live?.name ?? sym,
        rank: live?.rank ?? 9999,
      }
    }).sort((a, b) => a.rank - b.rank)
  }, [coinListData])

  const [tab, setTab] = useState<Tab>('chart')
  const [assetId, setAssetId] = useState(() => {
    const p = searchParams.get('asset')
    return SUPPORTED_IDS.includes(p ?? '') ? p! : 'btc'
  })
  const [range, setRange] = useState<Range>('1Y')
  const [chartType, setChartType] = useState<ChartType>('candlestick')
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(
    new Set(['ema20', 'ema50', 'volume', 'rsi']),
  )
  const [indicatorMenuOpen, setIndicatorMenuOpen] = useState(false)
  const indicatorMenuRef = useRef<HTMLDivElement>(null)
  const [chartTypeMenuOpen, setChartTypeMenuOpen] = useState(false)
  const chartTypeMenuRef = useRef<HTMLDivElement>(null)
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('none')
  const [drawings, setDrawings] = useState<Drawing[]>([])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (indicatorMenuRef.current && !indicatorMenuRef.current.contains(e.target as Node)) {
        setIndicatorMenuOpen(false)
      }
      if (chartTypeMenuRef.current && !chartTypeMenuRef.current.contains(e.target as Node)) {
        setChartTypeMenuOpen(false)
      }
    }
    if (indicatorMenuOpen || chartTypeMenuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [indicatorMenuOpen, chartTypeMenuOpen])

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['ta-ohlcv', assetId, range],
    queryFn: async () => {
      const res = await fetch(`/live-data/ohlcv?id=${assetId}&range=${range}`)
      if (!res.ok) throw new Error('fetch failed')
      return res.json() as Promise<{ ok: boolean; candles: OhlcvCandle[]; source?: string; granularity?: string }>
    },
    staleTime: range === '1H' ? 60_000 : range === '4H' || range === '1M' ? 300_000 : 900_000,
  })

  const ohlcvSource = data?.source === 'binance' ? 'Binance' : data?.source === 'coingecko' ? 'CoinGecko' : undefined

  // News-derived event markers for the chart (feature #4)
  const [showEvents, setShowEvents] = useState(true)
  const { data: newsData } = useQuery({
    queryKey: ['ta-news', assetId],
    queryFn: () => fetch(`/live-data/news?asset=${assetId}&limit=40`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })
  const eventsList = useMemo(() => {
    return (newsData?.articles ?? []).map((a: { headline: string; publishedAt: string; sentiment?: string; url?: string }) => ({
      time: Math.floor(new Date(a.publishedAt).getTime() / 1000),
      label: a.headline,
      sentiment: a.sentiment,
      url: a.url,
    }))
  }, [newsData])

  const candles = useMemo<OhlcvCandle[]>(() => data?.candles ?? [], [data])

  const chartEvents = useMemo<ChartEventMarker[]>(() => {
    if (!showEvents || candles.length === 0) return []
    const firstTime = candles[0].time as number
    const lastTime = candles[candles.length - 1].time as number
    return (newsData?.articles ?? [])
      .map((a: { headline: string; publishedAt: string; sentiment?: string }) => ({
        time: Math.floor(new Date(a.publishedAt).getTime() / 1000),
        label: a.headline,
        sentiment: (a.sentiment === 'positive' || a.sentiment === 'negative' ? a.sentiment : 'neutral') as ChartEventMarker['sentiment'],
      }))
      .filter((e: ChartEventMarker) => e.time >= firstTime && e.time <= lastTime)
  }, [newsData, showEvents, candles])

  const summary = useMemo(() => candles.length >= 50 ? computeSignalSummary(candles) : null, [candles])
  const patterns = useMemo(() => candles.length >= 20 ? detectPatterns(candles) : [], [candles])

  function toggleIndicator(key: IndicatorKey) {
    setActiveIndicators((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const asset = chartAssets.find((a) => a.id === assetId) ?? { id: assetId, symbol: assetId.toUpperCase(), label: assetId.toUpperCase(), rank: 9999 }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-screen-2xl mx-auto w-full">
      <PageHeader
        title="Technical Analysis"
        subtitle="Professional-grade charting, indicators, and pattern recognition"
        icon={<Activity size={18} className="text-accent-blue" />}
        description="A full TA suite combining the best of TradingView, Coinigy, and TrendSpider — candlestick charts with 60+ indicators, automated pattern detection, and a multi-asset screener."
        details={[
          { label: 'Indicators', text: 'RSI, MACD, Bollinger Bands, EMA/SMA stack, Stochastic RSI, ATR, OBV, VWAP — toggle any combination on the chart.' },
          { label: 'Signal Summary', text: 'Each indicator votes buy/sell/neutral; aggregate score produces an overall signal (Strong Buy → Strong Sell).' },
          { label: 'Pattern Recognition', text: 'Automated detection of Double Top/Bottom, Head & Shoulders, Triangles, Engulfing candles, Golden/Death Cross.' },
          { label: 'Screener', text: 'Scans all tracked assets simultaneously using 1D OHLCV data and ranks them by bullish/bearish signal strength.' },
        ]}
      />

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Asset selector */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="appearance-none bg-bg-secondary border border-border rounded-lg pl-3 pr-7 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue/60 cursor-pointer"
            >
              {chartAssets.map((a) => (
                <option key={a.id} value={a.id}>{a.symbol} — {a.label}{a.rank < 9999 ? ` (#${a.rank})` : ''}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
          {candles.length > 0 && (() => {
            const lastClose = candles[candles.length - 1].close
            const prevClose = candles[candles.length - 2]?.close
            const pct = prevClose ? ((lastClose - prevClose) / prevClose) * 100 : null
            return (
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-2xl text-text-primary">{formatPrice(lastClose)}</span>
                {pct !== null && (
                  <span className={clsx('text-base font-semibold', pct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                  </span>
                )}
              </div>
            )
          })()}
        </div>

        {/* Range selector */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={clsx('px-2.5 py-1.5 text-xs font-medium transition-colors', range === r ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated')}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Chart type dropdown */}
        <div className="relative" ref={chartTypeMenuRef}>
          {(() => {
            const current = CHART_TYPES.find((c) => c.type === chartType) ?? CHART_TYPES[0]
            return (
              <button
                onClick={() => setChartTypeMenuOpen((v) => !v)}
                className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                  chartTypeMenuOpen ? 'border-accent-blue/60 bg-accent-blue/10 text-accent-blue' : 'border-border text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                )}
              >
                <current.Icon size={12} />
                {current.label}
                <ChevronDown size={11} className={clsx('transition-transform', chartTypeMenuOpen && 'rotate-180')} />
              </button>
            )
          })()}
          {chartTypeMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 z-50 bg-bg-card border border-border rounded-xl shadow-2xl w-56 p-1.5">
              {CHART_TYPES.map(({ type, label, desc, Icon }) => (
                <button
                  key={type}
                  onClick={() => { setChartType(type); setChartTypeMenuOpen(false) }}
                  className={clsx('w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
                    chartType === type ? 'bg-accent-blue/10 text-accent-blue' : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                  )}
                >
                  <Icon size={13} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-medium">{label}</div>
                    <div className="text-[10px] text-text-muted leading-tight mt-0.5">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Refresh */}
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors disabled:opacity-50"
        >
          <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>

        {/* Tabs */}
        <div className="ml-auto flex items-center rounded-lg border border-border overflow-hidden">
          {([['chart', 'Chart'], ['patterns', 'Patterns'], ['scanner', 'Scanner'], ['backtest', 'Backtest']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx('px-3 py-1.5 text-xs font-medium transition-colors', tab === t ? 'bg-bg-elevated text-text-primary' : 'text-text-muted hover:text-text-secondary')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart Tab ── */}
      {tab === 'chart' && (
        <div className="flex flex-col gap-3">
          {/* Indicator dropdown */}
          <div className="flex flex-wrap items-start gap-2">
            <div className="relative" ref={indicatorMenuRef}>
              <button
                onClick={() => setIndicatorMenuOpen((v) => !v)}
                className={clsx(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                  indicatorMenuOpen
                    ? 'border-accent-blue/60 bg-accent-blue/10 text-accent-blue'
                    : 'border-border text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
                )}
              >
                <SlidersHorizontal size={12} />
                Indicators
                {activeIndicators.size > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-accent-blue/20 text-accent-blue text-[10px] font-bold">
                    {activeIndicators.size}
                  </span>
                )}
                <ChevronDown size={11} className={clsx('transition-transform', indicatorMenuOpen && 'rotate-180')} />
              </button>

              {indicatorMenuOpen && (
                <div className="absolute top-full left-0 mt-1.5 z-50 bg-bg-card border border-border rounded-xl shadow-2xl w-[560px] max-h-[460px] overflow-y-auto">
                  <div className="p-3 space-y-4">
                    {/* Overlays */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-wider">Overlays</span>
                        <span className="text-[10px] text-text-muted">— rendered on the price chart</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {INDICATORS.filter((i) => i.group === 'overlay').map(({ key, label, tip }) => (
                          <button
                            key={key}
                            title={tip}
                            onClick={() => toggleIndicator(key as IndicatorKey)}
                            className={clsx(
                              'px-2 py-0.5 rounded border text-[11px] font-medium transition-colors',
                              activeIndicators.has(key as IndicatorKey)
                                ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                                : 'border-border text-text-muted hover:text-text-secondary hover:bg-bg-elevated',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Panels */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-semibold text-violet-400/80 uppercase tracking-wider">Panels</span>
                        <span className="text-[10px] text-text-muted">— shown in signal summary</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {INDICATORS.filter((i) => i.group === 'panel').map(({ key, label, tip }) => (
                          <button
                            key={key}
                            title={tip}
                            onClick={() => toggleIndicator(key as IndicatorKey)}
                            className={clsx(
                              'px-2 py-0.5 rounded border text-[11px] font-medium transition-colors',
                              activeIndicators.has(key as IndicatorKey)
                                ? 'border-violet-500/40 bg-violet-500/10 text-violet-400'
                                : 'border-border text-text-muted hover:text-text-secondary hover:bg-bg-elevated',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Clear all */}
                    {activeIndicators.size > 0 && (
                      <div className="pt-2 border-t border-border flex justify-end">
                        <button
                          onClick={() => setActiveIndicators(new Set())}
                          className="text-[11px] text-text-muted hover:text-red-400 transition-colors"
                        >
                          Clear all
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Active indicator chips */}
            {Array.from(activeIndicators).map((key) => {
              const ind = INDICATORS.find((i) => i.key === key)
              if (!ind) return null
              return (
                <span
                  key={key}
                  className={clsx(
                    'inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded border text-[11px] font-medium',
                    ind.group === 'overlay'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                      : 'border-violet-500/40 bg-violet-500/10 text-violet-400',
                  )}
                >
                  {ind.label}
                  <button
                    onClick={() => toggleIndicator(key as IndicatorKey)}
                    className="opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <X size={9} />
                  </button>
                </span>
              )
            })}
          </div>

          {/* Drawing toolbar */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-muted uppercase tracking-wider mr-1">Draw</span>
            {([
              { tool: 'none' as DrawingTool,      icon: MousePointer2,    label: 'Select' },
              { tool: 'trendline' as DrawingTool, icon: PenLine,          label: 'Trendline' },
              { tool: 'hray' as DrawingTool,      icon: MoveHorizontal,   label: 'H. Ray' },
              { tool: 'rectangle' as DrawingTool, icon: Square,           label: 'Rectangle' },
              { tool: 'fib' as DrawingTool,       icon: Hash,             label: 'Fibonacci' },
            ]).map(({ tool, icon: Icon, label }) => (
              <button
                key={tool}
                onClick={() => setDrawingTool(t => t === tool ? 'none' : tool)}
                title={label}
                className={clsx(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                  drawingTool === tool
                    ? 'border-accent-blue/60 bg-accent-blue/10 text-accent-blue'
                    : 'border-border text-text-muted hover:text-text-secondary hover:bg-bg-elevated',
                )}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
            {drawings.length > 0 && (
              <button
                onClick={() => { setDrawings([]); setDrawingTool('none') }}
                title="Clear all drawings"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-red-400 hover:border-red-400/30 transition-colors ml-1"
              >
                <Trash2 size={12} />
                Clear ({drawings.length})
              </button>
            )}

            {/* Event markers toggle */}
            <button
              onClick={() => setShowEvents(v => !v)}
              title="Plot news events on the chart"
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ml-auto',
                showEvents ? 'border-accent-blue/60 bg-accent-blue/10 text-accent-blue' : 'border-border text-text-muted hover:text-text-secondary hover:bg-bg-elevated',
              )}
            >
              <Newspaper size={12} />
              Events {chartEvents.length > 0 && <span className="opacity-70">({chartEvents.length})</span>}
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
            {/* Chart */}
            <div className="rounded-xl border border-border bg-bg-card overflow-hidden" style={{ height: 520 }}>
              {isFetching && candles.length === 0 ? (
                <div className="flex items-center justify-center h-full gap-2 text-text-muted">
                  <RefreshCw size={16} className="animate-spin" />
                  <span className="text-sm">Loading {asset?.symbol} {range} data…</span>
                </div>
              ) : candles.length > 0 ? (
                <CandlestickChart
                  candles={candles}
                  activeIndicators={activeIndicators}
                  chartType={chartType}
                  drawingTool={drawingTool}
                  drawings={drawings}
                  onDrawingComplete={(d) => {
                    setDrawings(prev => [...prev, d])
                    setDrawingTool('none')
                  }}
                  patterns={patterns}
                  events={chartEvents}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-text-muted text-sm">
                  No data available
                </div>
              )}
            </div>

            {/* Right panel */}
            <div className="flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: 520 }}>
              {/* Provenance for the price series + derived signals */}
              {candles.length > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg-card px-3 py-2">
                  <DataBadge
                    status={ohlcvSource ? 'live' : 'unavailable'}
                    source={ohlcvSource ? `${ohlcvSource} OHLCV` : undefined}
                  />
                  <span className="text-[10px] text-text-muted">
                    {candles.length} candles · indicators derived
                  </span>
                </div>
              )}
              {summary && <TechnicalReadPanel candles={candles} summary={summary} />}
              <MarketStructurePanel symbol={asset.symbol} />
              {summary && <SignalSummaryPanel summary={summary} />}
              {candles.length > 0 && <SupportResistancePanel candles={candles} />}
              {showEvents && <EventsPanel events={eventsList} />}
              {candles.length > 0 && <KeyLevelsPanel candles={candles} />}
            </div>
          </div>

          {/* Multi-timeframe confluence */}
          <MultiTimeframeGrid assetId={assetId} />

          {/* Chart notes / thesis builder */}
          <ThesisBuilderPanel
            assetId={assetId}
            symbol={asset.symbol}
            range={range}
            price={candles.length > 0 ? candles[candles.length - 1].close : null}
            signal={summary?.overall ?? null}
          />
        </div>
      )}

      {/* ── Patterns Tab ── */}
      {tab === 'patterns' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-4">
            <PatternsPanel patterns={patterns} candles={candles} />
          </div>
          <div className="flex flex-col gap-4">
            {candles.length > 0 && <SupportResistancePanel candles={candles} />}
            {candles.length > 0 && <KeyLevelsPanel candles={candles} />}
            {summary && <SignalSummaryPanel summary={summary} />}
          </div>
        </div>
      )}

      {/* ── Scanner Tab ── */}
      {tab === 'scanner' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-muted">
            Scans all tracked assets on 1D OHLCV for technical setups — breakouts, oversold bounces,
            moving-average crosses, volume spikes, and volatility compression. Updates on each load.
          </p>
          <ScannerPanel />
        </div>
      )}

      {/* ── Backtest Tab ── */}
      {tab === 'backtest' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-muted">
            Backtest a preset technical strategy on {asset.symbol}, using a dedicated multi-year daily
            history (independent of the chart range) so the trend strategies have enough warm-up data.
          </p>
          <BacktestPanel assetId={assetId} symbol={asset.symbol} />
        </div>
      )}
    </div>
  )
}
