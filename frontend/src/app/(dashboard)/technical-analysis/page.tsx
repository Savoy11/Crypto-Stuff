'use client'

import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown,
  Activity, Filter, X, SlidersHorizontal,
  CandlestickChart as CandlestickIcon, AreaChart, BarChart2,
  LineChart, GitBranch, Layers,
  MousePointer2, PenLine, MoveHorizontal, Square, Hash, Trash2,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { ChartType, DrawingTool, Drawing } from '@/components/charts/CandlestickChart'
import type { LucideIcon } from 'lucide-react'
import {
  rsi, macd, bollingerBands, ema, sma, stochasticRsi, atr, obv, vwap,
  ichimoku, fibRetracement, computeSignalSummary, detectPatterns,
  type OhlcvCandle, type Signal, type SignalSummary, type DetectedPattern,
} from '@/lib/utils/indicators'
import { PageHeader } from '@/components/ui/PageHeader'
import { COINGECKO_IDS } from '@/lib/api/live/coingeckoIds'
import type { CoinListResponse } from '@/lib/types/coinList'

const CandlestickChart = dynamic(() => import('@/components/charts/CandlestickChart'), { ssr: false })

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

function PatternsPanel({ patterns }: { patterns: DetectedPattern[] }) {
  if (patterns.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
        <Activity size={28} className="mx-auto mb-2 text-text-muted/40" />
        <p className="text-xs text-text-muted">No clear patterns detected</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Detected Patterns</span>
      {patterns.map((p, i) => (
        <div key={i} className={clsx('rounded-lg border p-3 flex flex-col gap-1', p.type === 'bullish' ? 'border-emerald-500/20 bg-emerald-500/5' : p.type === 'bearish' ? 'border-red-500/20 bg-red-500/5' : 'border-border bg-bg-elevated')}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-text-primary">{p.name}</span>
            <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded', p.type === 'bullish' ? 'text-emerald-400 bg-emerald-400/10' : p.type === 'bearish' ? 'text-red-400 bg-red-400/10' : 'text-slate-400 bg-slate-400/10')}>
              {(p.confidence * 100).toFixed(0)}% conf.
            </span>
          </div>
          <p className="text-[11px] text-text-muted">{p.description}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Screener ─────────────────────────────────────────────────────────────────

interface ScreenerRow {
  assetId: string
  label: string
  symbol: string
  summary: SignalSummary | null
  loading: boolean
}

function ScreenerPanel() {
  const [rows, setRows] = useState<ScreenerRow[]>(
    SCREENER_ASSETS.map((a) => ({ assetId: a.id, label: a.label, symbol: a.symbol, summary: null, loading: true })),
  )
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell'>('all')

  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      await Promise.all(SCREENER_ASSETS.map(async (asset) => {
        try {
          const res = await fetch(`/live-data/ohlcv?id=${asset.id}&timeframe=1D`)
          const json = await res.json()
          const candles: OhlcvCandle[] = json.candles ?? []
          const summary = candles.length >= 50 ? computeSignalSummary(candles) : null
          if (!cancelled) {
            setRows((prev) => prev.map((r) => r.assetId === asset.id ? { ...r, summary, loading: false } : r))
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

  const filtered = rows.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'buy') return r.summary?.overall === 'buy' || r.summary?.overall === 'strong_buy'
    if (filter === 'sell') return r.summary?.overall === 'sell' || r.summary?.overall === 'strong_sell'
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Filter size={13} className="text-text-muted" />
        <span className="text-xs text-text-muted">Filter:</span>
        {(['all', 'buy', 'sell'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', filter === f ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30' : 'text-text-muted border border-border hover:text-text-secondary hover:bg-bg-elevated')}
          >
            {f === 'all' ? 'All' : f === 'buy' ? 'Bullish' : 'Bearish'}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-bg-elevated">
              <th className="text-left px-4 py-2.5 text-text-muted font-medium">Asset</th>
              <th className="text-center px-3 py-2.5 text-text-muted font-medium">Signal</th>
              <th className="text-center px-3 py-2.5 text-text-muted font-medium">Buy</th>
              <th className="text-center px-3 py-2.5 text-text-muted font-medium">Neutral</th>
              <th className="text-center px-3 py-2.5 text-text-muted font-medium">Sell</th>
              <th className="px-4 py-2.5 text-text-muted font-medium">Indicator Bar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((row) => (
              <tr key={row.assetId} className="hover:bg-bg-elevated transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-text-primary">{row.symbol}</span>
                    <span className="text-text-muted">{row.label}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  {row.loading ? (
                    <span className="text-text-muted animate-pulse">—</span>
                  ) : row.summary ? (
                    <SignalBadge signal={row.summary.overall} />
                  ) : (
                    <span className="text-text-muted text-[10px]">N/A</span>
                  )}
                </td>
                <td className="px-3 py-3 text-center text-emerald-400 font-mono">{row.summary?.buy ?? '—'}</td>
                <td className="px-3 py-3 text-center text-text-muted font-mono">{row.summary?.neutral ?? '—'}</td>
                <td className="px-3 py-3 text-center text-red-400 font-mono">{row.summary?.sell ?? '—'}</td>
                <td className="px-4 py-3">
                  {row.summary ? (
                    <div className="h-2 w-full max-w-32 rounded-full overflow-hidden flex gap-px">
                      <div className="bg-emerald-500" style={{ width: `${(row.summary.buy / (row.summary.buy + row.summary.neutral + row.summary.sell)) * 100}%` }} />
                      <div className="bg-slate-600" style={{ width: `${(row.summary.neutral / (row.summary.buy + row.summary.neutral + row.summary.sell)) * 100}%` }} />
                      <div className="bg-red-500" style={{ width: `${(row.summary.sell / (row.summary.buy + row.summary.neutral + row.summary.sell)) * 100}%` }} />
                    </div>
                  ) : (
                    <div className="h-2 w-full max-w-32 rounded-full bg-bg-elevated animate-pulse" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'chart' | 'screener' | 'patterns'

// useSearchParams() forces a CSR bailout, so the page body must sit inside a
// Suspense boundary for `next build` prerendering to succeed.
export default function TechnicalAnalysisPage() {
  return (
    <Suspense>
      <TechnicalAnalysisContent />
    </Suspense>
  )
}

function TechnicalAnalysisContent() {
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
      return res.json() as Promise<{ ok: boolean; candles: OhlcvCandle[] }>
    },
    staleTime: range === '1H' ? 60_000 : range === '4H' || range === '1M' ? 300_000 : 900_000,
  })

  const candles: OhlcvCandle[] = data?.candles ?? []

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
          {([['chart', 'Chart'], ['screener', 'Screener'], ['patterns', 'Patterns']] as [Tab, string][]).map(([t, label]) => (
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
                />
              ) : (
                <div className="flex items-center justify-center h-full text-text-muted text-sm">
                  No data available
                </div>
              )}
            </div>

            {/* Right panel */}
            <div className="flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: 520 }}>
              {summary && <SignalSummaryPanel summary={summary} />}
              {candles.length > 0 && <KeyLevelsPanel candles={candles} />}
            </div>
          </div>

          {/* Multi-timeframe confluence */}
          <MultiTimeframeGrid assetId={assetId} />
        </div>
      )}

      {/* ── Screener Tab ── */}
      {tab === 'screener' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-muted">Scanning all tracked assets using 1D OHLCV data. Signals update with each page load.</p>
          <ScreenerPanel />
        </div>
      )}

      {/* ── Patterns Tab ── */}
      {tab === 'patterns' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-4">
            <PatternsPanel patterns={patterns} />
          </div>
          <div className="flex flex-col gap-4">
            {candles.length > 0 && <KeyLevelsPanel candles={candles} />}
            {summary && <SignalSummaryPanel summary={summary} />}
          </div>
        </div>
      )}
    </div>
  )
}
