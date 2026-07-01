'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, LineSeries, HistogramSeries, AreaSeries, BarSeries, BaselineSeries,
  LineType, createSeriesMarkers,
  type IChartApi, type ISeriesApi, type Time, LineStyle, type SeriesMarker,
} from 'lightweight-charts'
import { type OhlcvCandle, type DetectedPattern } from '@/lib/utils/indicators'
import { INDICATOR_RENDER, type RenderSpec } from './indicatorRegistry'

export type ChartType =
  | 'candlestick'
  | 'hollow'
  | 'heikin-ashi'
  | 'bars'
  | 'line'
  | 'step-line'
  | 'area'
  | 'baseline'

// ── Drawing types ──────────────────────────────────────────────────────────────

export type DrawingTool = 'none' | 'trendline' | 'hray' | 'rectangle' | 'fib' | 'measure'

export interface DrawingPoint { time: Time; price: number }

export interface TrendlineDrawing { id: string; kind: 'trendline'; p1: DrawingPoint; p2: DrawingPoint }
export interface HRayDrawing      { id: string; kind: 'hray';      p1: DrawingPoint }
export interface RectDrawing      { id: string; kind: 'rectangle'; p1: DrawingPoint; p2: DrawingPoint }
export interface FibDrawing       { id: string; kind: 'fib';       p1: DrawingPoint; p2: DrawingPoint }
export interface MeasureDrawing   { id: string; kind: 'measure';   p1: DrawingPoint; p2: DrawingPoint }
export type Drawing = TrendlineDrawing | HRayDrawing | RectDrawing | FibDrawing | MeasureDrawing

const DRAW_COLORS: Record<Exclude<DrawingTool, 'none'>, string> = {
  trendline: '#3b82f6',
  hray:      '#10b981',
  rectangle: '#8b5cf6',
  fib:       '#f59e0b',
  measure:   '#eab308',
}

// Growth stats for the measure tool: % change, absolute change, elapsed time,
// and a CAGR-style annualized rate (only meaningful once the span is a few days).
interface MeasureStats {
  pctChange: number
  absChange: number
  days: number
  annualizedPct: number | null
}

function computeMeasureStats(p1: DrawingPoint, p2: DrawingPoint): MeasureStats {
  const t1 = typeof p1.time === 'number' ? p1.time : new Date(p1.time as string).getTime() / 1000
  const t2 = typeof p2.time === 'number' ? p2.time : new Date(p2.time as string).getTime() / 1000
  const [startPrice, endPrice, days] = t2 >= t1
    ? [p1.price, p2.price, (t2 - t1) / 86400]
    : [p2.price, p1.price, (t1 - t2) / 86400]

  const pctChange = startPrice !== 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0
  const absChange = endPrice - startPrice
  const annualizedPct = days >= 2 && startPrice > 0 && endPrice > 0
    ? (Math.pow(endPrice / startPrice, 365 / days) - 1) * 100
    : null

  return { pctChange, absChange, days, annualizedPct }
}

function fmtDuration(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`
  if (days < 30) return `${Math.round(days)}d`
  if (days < 365) return `${(days / 30).toFixed(1)}mo`
  return `${(days / 365).toFixed(1)}y`
}

// Magnitude-aware absolute-change formatter so low-priced coins keep precision
// instead of collapsing tiny deltas to "0.0000".
function fmtDelta(v: number): string {
  const a = Math.abs(v)
  if (a >= 100)  return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (a >= 1)    return v.toFixed(2)
  if (a >= 0.01) return v.toFixed(4)
  if (a === 0)   return '0'
  return v.toPrecision(2)
}

// Nearest candle to a unix time (candles are sorted ascending). Used by the
// measure tool to snap clicks to a real candle's close — keeps growth
// close-to-close and correct on every chart type, including the transformed
// Heikin-Ashi view (candles here are always the real, untransformed series).
function nearestCandleByTime(candles: OhlcvCandle[], time: number): OhlcvCandle | null {
  const n = candles.length
  if (n === 0) return null
  if (time <= candles[0].time) return candles[0]
  if (time >= candles[n - 1].time) return candles[n - 1]
  let lo = 0, hi = n - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const t = candles[mid].time
    if (t === time) return candles[mid]
    if (t < time) lo = mid + 1
    else hi = mid - 1
  }
  const prev = candles[Math.max(0, lo - 1)]
  const next = candles[Math.min(n - 1, lo)]
  return Math.abs(prev.time - time) <= Math.abs(next.time - time) ? prev : next
}

const FIB_RATIOS  = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
const FIB_COLORS  = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ChartEventMarker {
  time: number        // UNIX seconds
  label: string
  sentiment?: 'positive' | 'negative' | 'neutral'
}

interface Props {
  candles: OhlcvCandle[]
  activeIndicators: Set<string>
  chartType?: ChartType
  drawingTool?: DrawingTool
  drawings?: Drawing[]
  onDrawingComplete?: (d: Drawing) => void
  patterns?: DetectedPattern[]
  events?: ChartEventMarker[]
}

// ── Heikin Ashi transformation ─────────────────────────────────────────────────

function toHeikinAshi(candles: OhlcvCandle[]): OhlcvCandle[] {
  const result: OhlcvCandle[] = []
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const haClose = (c.open + c.high + c.low + c.close) / 4
    const haOpen = i === 0
      ? (c.open + c.close) / 2
      : (result[i - 1].open + result[i - 1].close) / 2
    const haHigh = Math.max(c.high, haOpen, haClose)
    const haLow  = Math.min(c.low,  haOpen, haClose)
    result.push({ time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose, volume: c.volume })
  }
  return result
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CandlestickChart({
  candles, activeIndicators, chartType = 'candlestick',
  drawingTool = 'none', drawings = [], onDrawingComplete,
  patterns = [], events = [],
}: Props) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const chartRef        = useRef<IChartApi | null>(null)
  const mainSeriesRef   = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Bar'> | ISeriesApi<'Line'> | ISeriesApi<'Area'> | ISeriesApi<'Baseline'> | null>(null)
  const drawingToolRef  = useRef(drawingTool)
  const onCompleteRef   = useRef(onDrawingComplete)
  const inProgressRef   = useRef<{ p1: DrawingPoint } | null>(null)
  const mouseRef        = useRef<{ x: number; y: number } | null>(null)
  const candlesRef      = useRef(candles)

  // svgTick forces SVG to re-render when the chart pans/zooms or user moves mouse
  const [svgTick, setSvgTick] = useState(0)

  // Crosshair data window
  interface CrosshairValue { label: string; value: number; color: string }
  interface CrosshairIndicator { name: string; values: CrosshairValue[] }
  interface CrosshairData {
    time: string
    candle: OhlcvCandle
    indicators: CrosshairIndicator[]
  }
  const [crosshairData, setCrosshairData] = useState<CrosshairData | null>(null)

  // Keep refs in sync with props (avoids stale closures in event handlers)
  useEffect(() => { drawingToolRef.current = drawingTool }, [drawingTool])
  useEffect(() => { onCompleteRef.current = onDrawingComplete }, [onDrawingComplete])
  useEffect(() => { candlesRef.current = candles }, [candles])

  // Cancel in-progress drawing when tool changes
  useEffect(() => {
    inProgressRef.current = null
    setSvgTick(t => t + 1)
  }, [drawingTool])

  // ── Chart creation ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return

    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
      mainSeriesRef.current = null
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.07)' },
        horzLines: { color: 'rgba(148,163,184,0.07)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: 'rgba(148,163,184,0.15)',
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: { borderColor: 'rgba(148,163,184,0.15)', timeVisible: true, secondsVisible: false },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })
    chartRef.current = chart

    const closes = candles.map((c) => c.close)
    const toSeries = (vals: (number | null)[]) =>
      vals
        .map((v, i) => (v !== null && isFinite(v) ? { time: candles[i].time as Time, value: v } : null))
        .filter((x): x is { time: Time; value: number } => x !== null)

    // ── Main price series ─────────────────────────────────────────────────────

    if (chartType === 'candlestick') {
      const cs = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981', downColor: '#ef4444',
        borderUpColor: '#10b981', borderDownColor: '#ef4444',
        wickUpColor: '#10b981', wickDownColor: '#ef4444',
      })
      cs.setData(candles.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })))
      mainSeriesRef.current = cs

    } else if (chartType === 'hollow') {
      const cs = chart.addSeries(CandlestickSeries, {
        upColor: 'transparent', downColor: '#ef4444',
        borderUpColor: '#10b981', borderDownColor: '#ef4444',
        wickUpColor: '#10b981', wickDownColor: '#ef4444',
      })
      cs.setData(candles.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })))
      mainSeriesRef.current = cs

    } else if (chartType === 'heikin-ashi') {
      const ha = toHeikinAshi(candles)
      const cs = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981', downColor: '#ef4444',
        borderUpColor: '#10b981', borderDownColor: '#ef4444',
        wickUpColor: '#10b981', wickDownColor: '#ef4444',
      })
      cs.setData(ha.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })))
      mainSeriesRef.current = cs

    } else if (chartType === 'bars') {
      const bs = chart.addSeries(BarSeries, { upColor: '#10b981', downColor: '#ef4444' })
      bs.setData(candles.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })))
      mainSeriesRef.current = bs

    } else if (chartType === 'line') {
      const ls = chart.addSeries(LineSeries, {
        color: '#3b82f6', lineWidth: 2, priceLineVisible: false, crosshairMarkerVisible: true,
      })
      ls.setData(candles.map((c) => ({ time: c.time as Time, value: c.close })))
      mainSeriesRef.current = ls as unknown as ISeriesApi<'Line'>

    } else if (chartType === 'step-line') {
      const sl = chart.addSeries(LineSeries, {
        color: '#8b5cf6', lineWidth: 2, lineType: LineType.WithSteps,
        priceLineVisible: false, crosshairMarkerVisible: true,
      })
      sl.setData(candles.map((c) => ({ time: c.time as Time, value: c.close })))
      mainSeriesRef.current = sl as unknown as ISeriesApi<'Line'>

    } else if (chartType === 'area') {
      const as_ = chart.addSeries(AreaSeries, {
        lineColor: '#3b82f6',
        topColor: 'rgba(59,130,246,0.25)',
        bottomColor: 'rgba(59,130,246,0.02)',
        lineWidth: 2, priceLineVisible: false, crosshairMarkerVisible: true,
      })
      as_.setData(candles.map((c) => ({ time: c.time as Time, value: c.close })))
      mainSeriesRef.current = as_ as unknown as ISeriesApi<'Area'>

    } else if (chartType === 'baseline') {
      const baseValue = candles[0].close
      const bl = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: baseValue },
        topLineColor: '#10b981', topFillColor1: 'rgba(16,185,129,0.2)', topFillColor2: 'rgba(16,185,129,0.02)',
        bottomLineColor: '#ef4444', bottomFillColor1: 'rgba(239,68,68,0.02)', bottomFillColor2: 'rgba(239,68,68,0.2)',
        lineWidth: 2, priceLineVisible: false, crosshairMarkerVisible: true,
      })
      bl.setData(candles.map((c) => ({ time: c.time as Time, value: c.close })))
      mainSeriesRef.current = bl as unknown as ISeriesApi<'Baseline'>
    }

    // ── Indicator rendering (registry-driven) ─────────────────────────────────

    const renderLines = (spec: RenderSpec, paneIndex: number): ISeriesApi<'Line'> | null => {
      let primary: ISeriesApi<'Line'> | null = null
      for (const l of spec.lines ?? []) {
        const s = chart.addSeries(LineSeries, {
          color: l.color,
          lineWidth: (l.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          lineStyle: l.lineStyle,
          priceLineVisible: false,
          lastValueVisible: paneIndex > 0,
          lineVisible: !l.dotted,
          pointMarkersVisible: l.dotted ?? false,
          crosshairMarkerVisible: true,
        }, paneIndex)
        s.setData(toSeries(l.data))
        if (!primary) primary = s
      }
      return primary
    }

    const renderHistograms = (spec: RenderSpec, paneIndex: number): ISeriesApi<'Histogram'> | null => {
      let primary: ISeriesApi<'Histogram'> | null = null
      for (const h of spec.histograms ?? []) {
        const s = chart.addSeries(HistogramSeries, {
          color: h.color ?? 'rgba(100,116,139,0.5)',
          priceLineVisible: false,
          lastValueVisible: false,
        }, paneIndex)
        s.setData(
          h.data
            .map((v, i) => (v !== null && isFinite(v)
              ? { time: candles[i].time as Time, value: v, color: h.colorFn ? h.colorFn(v) : h.color }
              : null))
            .filter((x): x is { time: Time; value: number; color: string | undefined } => x !== null),
        )
        if (!primary) primary = s
      }
      return primary
    }

    const activeSpecs = Object.keys(INDICATOR_RENDER)
      .filter((key) => activeIndicators.has(key))
      .map((key) => INDICATOR_RENDER[key](candles, closes))

    for (const spec of activeSpecs) {
      if (spec.kind !== 'overlay') continue
      renderLines(spec, 0)
      renderHistograms(spec, 0)
    }

    const panelSpecs = activeSpecs.filter((spec) => spec.kind === 'panel')
    panelSpecs.forEach((spec) => {
      const pane = chart.addPane()
      const paneIndex = pane.paneIndex()
      const primaryLine = renderLines(spec, paneIndex)
      const primaryHist = renderHistograms(spec, paneIndex)
      const refTarget = primaryLine ?? primaryHist
      if (refTarget && spec.refLines) {
        for (const r of spec.refLines) {
          refTarget.createPriceLine({
            price: r.value,
            color: r.color,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: false,
            title: r.title ?? '',
          })
        }
      }
      pane.setStretchFactor(1)
    })

    chart.panes()[0]?.setStretchFactor(panelSpecs.length > 0 ? 3 : 1)
    chart.timeScale().fitContent()

    // ── Crosshair data window ─────────────────────────────────────────────────

    function fmtPrice(v: number): string {
      if (v >= 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
      if (v >= 100)   return v.toFixed(2)
      if (v >= 1)     return v.toFixed(4)
      return v.toPrecision(4)
    }
    function fmtVol(v: number): string {
      if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`
      if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`
      if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
      return v.toFixed(0)
    }
    function fmtInd(v: number): string {
      const a = Math.abs(v)
      if (a >= 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
      if (a >= 100)   return v.toFixed(2)
      if (a >= 1)     return v.toFixed(3)
      return v.toPrecision(4)
    }
    function fmtTime(time: Time): string {
      const ms = typeof time === 'number' ? time * 1000 : new Date(time as string).getTime()
      return new Date(ms).toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    }

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) { setCrosshairData(null); return }

      const time = param.time as number
      const idx = candles.findIndex(c => c.time === time)
      if (idx === -1) { setCrosshairData(null); return }

      const c = candles[idx]
      const indicators: CrosshairIndicator[] = []

      for (const spec of activeSpecs) {
        const vals: CrosshairValue[] = []
        for (const line of spec.lines ?? []) {
          const v = line.data[idx]
          if (v != null && isFinite(v)) {
            vals.push({ label: line.title ?? spec.title, value: v, color: line.color })
          }
        }
        for (const hist of spec.histograms ?? []) {
          const v = hist.data[idx]
          if (v != null && isFinite(v)) {
            const color = hist.colorFn ? hist.colorFn(v) : (hist.color ?? '#64748b')
            vals.push({ label: spec.title, value: v, color })
          }
        }
        if (vals.length > 0) indicators.push({ name: spec.title, values: vals })
      }

      setCrosshairData({ time: fmtTime(c.time as Time), candle: c, indicators })
    })

    // ── Event markers ──────────────────────────────────────────────────────────
    // Snap each event to the candle whose time is the latest <= event time, so
    // markers land on real series points (required by lightweight-charts).
    if (events.length > 0 && mainSeriesRef.current && candles.length > 0) {
      const times = candles.map((c) => c.time as number)
      const snapped = new Map<number, ChartEventMarker[]>()
      for (const ev of events) {
        // binary-ish search for latest candle time <= ev.time
        let lo = 0, hi = times.length - 1, idx = -1
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          if (times[mid] <= ev.time) { idx = mid; lo = mid + 1 } else { hi = mid - 1 }
        }
        if (idx < 0) continue
        const t = times[idx]
        if (!snapped.has(t)) snapped.set(t, [])
        snapped.get(t)!.push(ev)
      }
      const markers: SeriesMarker<Time>[] = [...snapped.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([t, evs]) => {
          const sentiment = evs[0].sentiment ?? 'neutral'
          const color = sentiment === 'positive' ? '#10b981' : sentiment === 'negative' ? '#ef4444' : '#94a3b8'
          const text = evs.length > 1 ? `${evs.length} events` : evs[0].label.slice(0, 28)
          return { time: t as Time, position: 'aboveBar', color, shape: 'circle', text }
        })
      createSeriesMarkers(mainSeriesRef.current, markers)
    }

    // Trigger SVG re-render when chart pans/zooms
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => setSvgTick(t => t + 1))
    setSvgTick(t => t + 1)

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
        setSvgTick(t => t + 1)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      setCrosshairData(null)
      chartRef.current?.remove()
      chartRef.current = null
      mainSeriesRef.current = null
    }
  }, [candles, activeIndicators, chartType, events])

  // ── SVG drawing interaction ──────────────────────────────────────────────────

  // Convert chart data-space (time+price) → SVG pixel coords
  const toXY = useCallback((time: Time, price: number): [number, number] | null => {
    const x = chartRef.current?.timeScale().timeToCoordinate(time)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const y = (mainSeriesRef.current as any)?.priceToCoordinate?.(price)
    if (x == null || y == null || !isFinite(x as number) || !isFinite(y as number)) return null
    return [x as number, y as number]
  }, [])

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const tool = drawingToolRef.current
    if (tool === 'none') return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    const time = chartRef.current?.timeScale().coordinateToTime(px) as Time | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const price = (mainSeriesRef.current as any)?.coordinateToPrice?.(py) as number | null
    if (time == null || price == null) return

    let point: DrawingPoint = { time, price }
    // Measure snaps to the nearest candle's real close (see nearestCandleByTime).
    if (tool === 'measure') {
      const c = nearestCandleByTime(candlesRef.current, time as number)
      if (c) point = { time: c.time as Time, price: c.close }
    }

    if (tool === 'hray') {
      // Single-click tool
      onCompleteRef.current?.({ id: `d${Date.now()}`, kind: 'hray', p1: point })
      return
    }

    if (!inProgressRef.current) {
      inProgressRef.current = { p1: point }
    } else {
      const p1 = inProgressRef.current.p1
      const id = `d${Date.now()}`
      if (tool === 'trendline')  onCompleteRef.current?.({ id, kind: 'trendline',  p1, p2: point })
      if (tool === 'rectangle')  onCompleteRef.current?.({ id, kind: 'rectangle',  p1, p2: point })
      if (tool === 'fib')        onCompleteRef.current?.({ id, kind: 'fib',        p1, p2: point })
      if (tool === 'measure')    onCompleteRef.current?.({ id, kind: 'measure',    p1, p2: point })
      inProgressRef.current = null
    }
    setSvgTick(t => t + 1)
  }, [])

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    if (inProgressRef.current || drawingToolRef.current !== 'none') {
      setSvgTick(t => t + 1)
    }
  }, [])

  const handleSvgContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    inProgressRef.current = null
    setSvgTick(t => t + 1)
  }, [])

  // ── SVG element renderers ────────────────────────────────────────────────────

  const W = containerRef.current?.clientWidth ?? 800

  function renderDrawing(d: Drawing): React.ReactNode {
    if (d.kind === 'trendline') {
      const a = toXY(d.p1.time, d.p1.price)
      const b = toXY(d.p2.time, d.p2.price)
      if (!a || !b) return null
      // Extend line slightly beyond anchor points for visual clarity
      return (
        <g key={d.id}>
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={DRAW_COLORS.trendline} strokeWidth={1.5} />
          <circle cx={a[0]} cy={a[1]} r={3} fill={DRAW_COLORS.trendline} />
          <circle cx={b[0]} cy={b[1]} r={3} fill={DRAW_COLORS.trendline} />
        </g>
      )
    }

    if (d.kind === 'hray') {
      const a = toXY(d.p1.time, d.p1.price)
      if (!a) return null
      const fmtPrice = d.p1.price > 100
        ? d.p1.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : d.p1.price.toPrecision(5)
      return (
        <g key={d.id}>
          <line x1={a[0]} y1={a[1]} x2={W} y2={a[1]} stroke={DRAW_COLORS.hray} strokeWidth={1.5} />
          <circle cx={a[0]} cy={a[1]} r={3} fill={DRAW_COLORS.hray} />
          <text x={W - 6} y={a[1] - 4} fill={DRAW_COLORS.hray} fontSize={9} textAnchor="end" fontFamily="monospace">
            {fmtPrice}
          </text>
        </g>
      )
    }

    if (d.kind === 'rectangle') {
      const a = toXY(d.p1.time, d.p1.price)
      const b = toXY(d.p2.time, d.p2.price)
      if (!a || !b) return null
      const rx = Math.min(a[0], b[0]), ry = Math.min(a[1], b[1])
      const rw = Math.abs(b[0] - a[0]),   rh = Math.abs(b[1] - a[1])
      return (
        <rect key={d.id} x={rx} y={ry} width={rw} height={rh}
          stroke={DRAW_COLORS.rectangle} strokeWidth={1.5}
          fill={`${DRAW_COLORS.rectangle}18`} />
      )
    }

    if (d.kind === 'fib') {
      const priceRange = d.p2.price - d.p1.price
      return (
        <g key={d.id}>
          {FIB_RATIOS.map((ratio, i) => {
            const price = d.p1.price + ratio * priceRange
            const coords = toXY(d.p1.time, price)
            if (!coords) return null
            const fy = coords[1]
            const label = `${(ratio * 100).toFixed(1)}%`
            return (
              <g key={ratio}>
                <line x1={0} y1={fy} x2={W} y2={fy}
                  stroke={FIB_COLORS[i]} strokeWidth={1} strokeDasharray="4 2" opacity={0.85} />
                <text x={W - 6} y={fy - 3} fill={FIB_COLORS[i]} fontSize={9} textAnchor="end" fontFamily="monospace">
                  {label}
                </text>
              </g>
            )
          })}
        </g>
      )
    }

    if (d.kind === 'measure') {
      const a = toXY(d.p1.time, d.p1.price)
      const b = toXY(d.p2.time, d.p2.price)
      if (!a || !b) return null
      const stats = computeMeasureStats(d.p1, d.p2)
      const positive = stats.pctChange >= 0
      const color = positive ? '#10b981' : '#ef4444'
      return (
        <g key={d.id}>
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={1.5} strokeDasharray="5 3" />
          <circle cx={a[0]} cy={a[1]} r={3} fill={color} />
          <circle cx={b[0]} cy={b[1]} r={3} fill={color} />
          {renderMeasureBox(a, b, stats, color)}
        </g>
      )
    }

    return null
  }

  // Stats card for the measure tool — anchored to the MIDPOINT of the line so it
  // rides with the line as it is drawn, panned, or zoomed. Sits just above the
  // line's centre (flips below if that would clip the top), lightly clamped so it
  // stays on-screen without detaching from the line.
  function renderMeasureBox(a: [number, number], b: [number, number], stats: MeasureStats, color: string): React.ReactNode {
    const H = containerRef.current?.clientHeight ?? 500
    const boxW = 152
    const hasAnn = stats.annualizedPct != null
    const boxH = hasAnn ? 74 : 58
    const midX = (a[0] + b[0]) / 2
    const midY = (a[1] + b[1]) / 2
    const bx = Math.min(Math.max(midX - boxW / 2, 4), W - boxW - 4)
    let by = midY - boxH - 12
    if (by < 4) by = midY + 12
    by = Math.min(by, H - boxH - 4)
    const p = 8
    const rightX = bx + boxW - p
    const LBL = '#64748b'
    const VAL = '#cbd5e1'
    const pctSign = stats.pctChange >= 0 ? '+' : ''
    const absSign = stats.absChange >= 0 ? '+' : ''

    // Labeled metric row: caption on the left, value right-aligned.
    const row = (y: number, label: string, value: string, valueFill: string, size = 10, weight = '400') => (
      <>
        <text x={bx + p} y={y} fill={LBL} fontSize={8.5} fontFamily="system-ui, sans-serif" letterSpacing="0.04em">{label}</text>
        <text x={rightX} y={y} fill={valueFill} fontSize={size} fontWeight={weight} fontFamily="monospace" textAnchor="end">{value}</text>
      </>
    )

    return (
      <g style={{ pointerEvents: 'none' }}>
        <rect x={bx} y={by} width={boxW} height={boxH} rx={6}
          fill="rgba(15,23,42,0.94)" stroke={color} strokeWidth={1} strokeOpacity={0.5} />
        {row(by + 18, 'CHANGE',   `${pctSign}${stats.pctChange.toFixed(2)}%`, color, 13, '700')}
        {row(by + 34, '$ CHANGE', `${absSign}${fmtDelta(stats.absChange)}`, VAL)}
        {row(by + 48, 'PERIOD',   fmtDuration(stats.days), VAL)}
        {stats.annualizedPct != null &&
          row(by + 64, 'PER YEAR', `${stats.annualizedPct >= 0 ? '+' : ''}${stats.annualizedPct.toFixed(1)}%`, VAL)}
      </g>
    )
  }

  function renderInProgress(): React.ReactNode {
    if (!inProgressRef.current || !mouseRef.current) return null
    const tool = drawingToolRef.current
    const a = toXY(inProgressRef.current.p1.time, inProgressRef.current.p1.price)
    if (!a) return null
    const { x: mx, y: my } = mouseRef.current

    if (tool === 'trendline') {
      return (
        <g>
          <line x1={a[0]} y1={a[1]} x2={mx} y2={my}
            stroke={DRAW_COLORS.trendline} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7} />
          <circle cx={a[0]} cy={a[1]} r={3} fill={DRAW_COLORS.trendline} />
        </g>
      )
    }
    if (tool === 'rectangle') {
      const rx = Math.min(a[0], mx), ry = Math.min(a[1], my)
      const rw = Math.abs(mx - a[0]),   rh = Math.abs(my - a[1])
      return (
        <rect x={rx} y={ry} width={rw} height={rh}
          stroke={DRAW_COLORS.rectangle} strokeWidth={1.5} strokeDasharray="5 3"
          fill={`${DRAW_COLORS.rectangle}12`} />
      )
    }
    if (tool === 'measure') {
      // Snap the live endpoint to the nearest candle close so the preview matches
      // the final measurement (and stays correct on Heikin-Ashi / candle charts).
      const time = chartRef.current?.timeScale().coordinateToTime(mx) as Time | null
      const c = time != null ? nearestCandleByTime(candles, time as number) : null
      const snapped = c ? { time: c.time as Time, price: c.close } : null
      const end = snapped ? toXY(snapped.time, snapped.price) : null
      const [ex, ey] = end ?? [mx, my]
      const stats = snapped ? computeMeasureStats(inProgressRef.current.p1, snapped) : null
      const color = stats ? (stats.pctChange >= 0 ? '#10b981' : '#ef4444') : DRAW_COLORS.measure
      return (
        <g>
          <line x1={a[0]} y1={a[1]} x2={ex} y2={ey}
            stroke={color} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7} />
          <circle cx={a[0]} cy={a[1]} r={3} fill={color} />
          {end && <circle cx={ex} cy={ey} r={3} fill={color} />}
          {stats && renderMeasureBox(a, [ex, ey], stats, color)}
        </g>
      )
    }
    if (tool === 'fib') {
      return (
        <line x1={a[0]} y1={a[1]} x2={mx} y2={my}
          stroke={DRAW_COLORS.fib} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7} />
      )
    }
    return null
  }

  // Pattern annotation: dashed bounding box + label for each detected pattern
  function renderPattern(p: DetectedPattern, key: number): React.ReactNode {
    const startC = candles[p.startIndex]
    const endC   = candles[p.endIndex]
    if (!startC || !endC) return null

    const zone     = candles.slice(p.startIndex, p.endIndex + 1)
    const maxPrice = Math.max(...zone.map(c => c.high))
    const minPrice = Math.min(...zone.map(c => c.low))
    const pad      = (maxPrice - minPrice) * 0.12

    const tl = toXY(startC.time as Time, maxPrice + pad)
    const br = toXY(endC.time as Time,   minPrice - pad)
    if (!tl || !br) return null

    const [rx, ry] = tl
    const rw = br[0] - rx
    const rh = br[1] - ry
    if (rw < 4 || rh < 4) return null

    const color = p.type === 'bullish' ? '#10b981' : p.type === 'bearish' ? '#ef4444' : '#94a3b8'
    const labelW = Math.min(rw - 4, 130)
    const conf   = `${(p.confidence * 100).toFixed(0)}%`

    return (
      <g key={key} style={{ pointerEvents: 'none' }}>
        {/* Main bounding box */}
        <rect x={rx} y={ry} width={rw} height={rh}
          stroke={color} strokeWidth={1} strokeDasharray="5 3"
          fill={`${color}0d`} rx={3} />
        {/* Label pill */}
        <rect x={rx + 4} y={ry + 4} width={labelW} height={15}
          fill={`${color}30`} rx={3} />
        <text x={rx + 8} y={ry + 14}
          fill={color} fontSize={9.5} fontFamily="system-ui, sans-serif" fontWeight="700">
          {p.name}
        </text>
        <text x={rx + 8 + Math.min(p.name.length * 5.8, 90)} y={ry + 14}
          fill={color} fontSize={9} fontFamily="monospace" opacity={0.8}>
          {' '}{conf}
        </text>
        {/* Vertical marker lines at start & end */}
        <line x1={rx} y1={ry} x2={rx} y2={ry + rh}
          stroke={color} strokeWidth={1} opacity={0.4} />
        <line x1={rx + rw} y1={ry} x2={rx + rw} y2={ry + rh}
          stroke={color} strokeWidth={1} opacity={0.4} />
      </g>
    )
  }

  // Crosshair guide lines while hovering with a tool active
  function renderCrosshair(): React.ReactNode {
    const tool = drawingToolRef.current
    if (tool === 'none' || !mouseRef.current) return null
    const { x, y } = mouseRef.current
    const H = containerRef.current?.clientHeight ?? 500
    return (
      <g opacity={0.3}>
        <line x1={x} y1={0} x2={x} y2={H} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
        <line x1={0} y1={y} x2={W} y2={y} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
      </g>
    )
  }

  const isDrawing = drawingTool !== 'none'

  // ── Format helpers (used in JSX) ────────────────────────────────────────────
  function fmtPriceJsx(v: number): string {
    if (v >= 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
    if (v >= 100)   return v.toFixed(2)
    if (v >= 1)     return v.toFixed(4)
    return v.toPrecision(4)
  }
  function fmtVolJsx(v: number): string {
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`
    if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
    return v.toFixed(0)
  }
  function fmtIndJsx(v: number): string {
    const a = Math.abs(v)
    if (a >= 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
    if (a >= 100)   return v.toFixed(2)
    if (a >= 1)     return v.toFixed(3)
    return v.toPrecision(4)
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      <span style={{ display: 'none' }}>{svgTick}</span>

      {/* Crosshair data window */}
      {crosshairData && (
        <div className="absolute top-2 left-2 z-20 pointer-events-none select-none"
          style={{ background: 'rgba(15,23,42,0.88)', backdropFilter: 'blur(6px)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 8, padding: '8px 10px', minWidth: 152 }}>
          <div style={{ color: '#64748b', fontSize: 10, fontFamily: 'monospace', marginBottom: 5 }}>
            {crosshairData.time}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 2 }}>
            {([
              { lbl: 'O', val: fmtPriceJsx(crosshairData.candle.open),  color: '#94a3b8' },
              { lbl: 'H', val: fmtPriceJsx(crosshairData.candle.high),  color: '#10b981' },
              { lbl: 'L', val: fmtPriceJsx(crosshairData.candle.low),   color: '#ef4444' },
              { lbl: 'C', val: fmtPriceJsx(crosshairData.candle.close), color: '#e2e8f0' },
              { lbl: 'V', val: fmtVolJsx(crosshairData.candle.volume),  color: '#94a3b8' },
            ] as const).map(({ lbl, val, color }) => (
              <>
                <span key={`lbl-${lbl}`} style={{ color: '#475569', fontSize: 11 }}>{lbl}</span>
                <span key={`val-${lbl}`} style={{ color, fontSize: 11, fontFamily: 'monospace', textAlign: 'right' }}>{val}</span>
              </>
            ))}
          </div>
          {crosshairData.indicators.map(ind => (
            <div key={ind.name} style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid rgba(148,163,184,0.1)' }}>
              <div style={{ color: '#475569', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                {ind.name}
              </div>
              {ind.values.map((v, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: v.color, flexShrink: 0 }} />
                  <span style={{ color: v.color, fontSize: 11, fontFamily: 'monospace', lineHeight: 1.4 }}>
                    {fmtIndJsx(v.value)}
                  </span>
                  {ind.values.length > 1 && (
                    <span style={{ color: '#475569', fontSize: 9 }}>{v.label}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{
          pointerEvents: isDrawing ? 'auto' : 'none',
          cursor: isDrawing ? 'crosshair' : 'default',
          zIndex: 10,
        }}
        onClick={handleSvgClick}
        onMouseMove={handleSvgMouseMove}
        onContextMenu={handleSvgContextMenu}
      >
        {patterns.map((p, i) => renderPattern(p, i))}
        {drawings.map(renderDrawing)}
        {renderInProgress()}
        {renderCrosshair()}
      </svg>
    </div>
  )
}
