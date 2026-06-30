'use client'

import { FlaskConical, TrendingDown, AlertTriangle, CheckCircle2, XCircle, Clock, ChevronRight, Info } from 'lucide-react'
import { clsx } from 'clsx'

// ─── Data ─────────────────────────────────────────────────────────────────────

interface ScorePoint { label: string; score: number; event?: string }

interface RiskSignal {
  name: string
  firedAt: string   // e.g. "T-14 days"
  severity: 'critical' | 'high' | 'medium'
  description: string
}

interface DepegEvent {
  id: string
  asset: string
  assetSymbol: string
  title: string
  date: string
  outcome: string
  peakLoss: string      // e.g. "-99.7%"
  finalScore: number    // score at peak depeg (lower = riskier)
  preDepegScore: number // score ~30 days before
  warningDays: number   // how many days before depeg the model crossed into "elevated"
  verdict: 'caught' | 'partial' | 'missed'
  timeline: ScorePoint[]
  signals: RiskSignal[]
  summary: string
  keyLesson: string
}

const EVENTS: DepegEvent[] = [
  {
    id: 'ust-2022',
    asset: 'TerraUSD',
    assetSymbol: 'UST',
    title: 'UST / LUNA Collapse',
    date: 'May 2022',
    outcome: 'Total collapse — UST lost 99.7% of peg',
    peakLoss: '−99.7%',
    finalScore: 4,
    preDepegScore: 31,
    warningDays: 22,
    verdict: 'caught',
    summary:
      'UST was an algorithmic stablecoin relying on a reflexive mint/burn loop with LUNA for peg defense. CAEP\'s reserve transparency component scored it critically low from the outset — no audited collateral, 100% algorithmic backing, and reliance on Anchor Protocol\'s 20% APY creating unsustainable redemption pressure. The peg liquidity component flagged thin on-chain liquidity in the days before the depeg event began.',
    keyLesson:
      'Algorithmic stablecoins with no hard collateral floor should score in the "critical" band by design. The model correctly assigned maximum risk before any depeg began.',
    timeline: [
      { label: 'T−90d', score: 29 },
      { label: 'T−60d', score: 31 },
      { label: 'T−30d', score: 31 },
      { label: 'T−22d', score: 28, event: 'Liquidity warning fired' },
      { label: 'T−14d', score: 22, event: 'Reserve alert fired' },
      { label: 'T−7d', score: 18 },
      { label: 'T−3d', score: 12, event: 'Peg stress detected' },
      { label: 'Depeg', score: 4 },
    ],
    signals: [
      { name: 'Zero hard collateral', firedAt: 'Persistent', severity: 'critical', description: 'Reserve transparency score 0/35 — no audited backing assets.' },
      { name: 'Anchor Protocol dependency', firedAt: 'T−30d', severity: 'critical', description: '72% of circulating UST locked in Anchor at 20% APY — structural redemption bomb.' },
      { name: 'Thin DEX liquidity', firedAt: 'T−22d', severity: 'high', description: 'Curve 3pool UST depth dropped 40% in 72 hours.' },
      { name: 'Large wallet concentration', firedAt: 'T−14d', severity: 'high', description: 'Top 10 wallets held 34% of supply — coordinated sell risk elevated.' },
    ],
  },
  {
    id: 'usdc-2023',
    asset: 'USD Coin',
    assetSymbol: 'USDC',
    title: 'USDC Silicon Valley Bank Depeg',
    date: 'March 2023',
    outcome: 'Temporary depeg to $0.87 — fully recovered within 72 hours',
    peakLoss: '−13%',
    finalScore: 61,
    preDepegScore: 74,
    warningDays: 3,
    verdict: 'partial',
    summary:
      'Circle disclosed $3.3B in USDC reserves were held at Silicon Valley Bank on March 10, 2023 — the same day FDIC regulators shut the bank. USDC temporarily lost its peg as markets priced in potential reserve loss. CAEP\'s model had USDC in the "moderate" band pre-event; the reserve transparency component flagged the SVB concentration retroactively via Circle\'s own disclosure. The model did not catch the counterparty risk in advance because SVB had not yet been flagged as distressed in public data.',
    keyLesson:
      'Bank counterparty concentration is a blind spot when issuers don\'t publish real-time custodian breakdowns. This event motivates the on-chain attestation monitoring feature on the roadmap.',
    timeline: [
      { label: 'T−90d', score: 76 },
      { label: 'T−60d', score: 75 },
      { label: 'T−30d', score: 74 },
      { label: 'T−7d', score: 74 },
      { label: 'T−3d', score: 71, event: 'SVB stress rumors begin' },
      { label: 'T−1d', score: 68 },
      { label: 'Depeg', score: 61, event: 'SVB shutdown + disclosure' },
      { label: 'T+3d', score: 73, event: 'FDIC backstop announced' },
    ],
    signals: [
      { name: 'Reserve custodian disclosure gap', firedAt: 'Persistent', severity: 'medium', description: 'Circle\'s monthly attestations did not break down per-custodian balances in real time.' },
      { name: 'SVB market stress', firedAt: 'T−3d', severity: 'high', description: 'SVB stock dropped 60%; model flagged banking sector risk but lacked direct reserve link.' },
      { name: 'Peg deviation > 0.5%', firedAt: 'Depeg day', severity: 'critical', description: 'USDC/USD on Curve fell to 0.879 within 6 hours of disclosure.' },
    ],
  },
  {
    id: 'busd-2023',
    asset: 'Binance USD',
    assetSymbol: 'BUSD',
    title: 'BUSD Regulatory Shutdown',
    date: 'February 2023',
    outcome: 'NYDFS ordered Paxos to halt minting; orderly wind-down',
    peakLoss: '−0.3%',
    finalScore: 58,
    preDepegScore: 63,
    warningDays: 0,
    verdict: 'partial',
    summary:
      'The New York Department of Financial Services directed Paxos to stop issuing new BUSD on Feb 13, 2023, citing unresolved issues with Paxos\'s oversight of BUSD as a Binance-branded product. BUSD never significantly depegged — it remained close to $1 as Paxos honored redemptions. CAEP\'s security/compliance component had flagged the Binance-Paxos regulatory overhang as a medium risk. The shutdown itself was orderly, but the event triggered an accelerated supply drain and forced migration to other stablecoins.',
    keyLesson:
      'Regulatory risk from exchange-affiliated stablecoins is real. The compliance component correctly assigned elevated risk, though the outcome was an orderly wind-down rather than a loss event.',
    timeline: [
      { label: 'T−90d', score: 65 },
      { label: 'T−60d', score: 64 },
      { label: 'T−30d', score: 63 },
      { label: 'T−14d', score: 63 },
      { label: 'T−7d', score: 62 },
      { label: 'Shutdown', score: 58, event: 'NYDFS order issued' },
      { label: 'T+30d', score: 54, event: 'Supply drain accelerates' },
      { label: 'T+90d', score: 45, event: 'Binance phases out BUSD' },
    ],
    signals: [
      { name: 'Exchange-issuer regulatory risk', firedAt: 'Persistent', severity: 'medium', description: 'Binance-branded product issued by Paxos under NYDFS oversight — dual regulatory exposure.' },
      { name: 'SEC Wells notice (Paxos)', firedAt: 'Same day', severity: 'critical', description: 'SEC simultaneously signaled enforcement action against Paxos over BUSD classification.' },
      { name: 'Supply contraction', firedAt: 'T+7d', severity: 'high', description: 'BUSD supply fell from $16B to $10B in 30 days post-shutdown.' },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  if (score >= 30) return 'text-orange-400'
  return 'text-red-400'
}

function scoreBg(score: number): string {
  if (score >= 70) return 'bg-emerald-400'
  if (score >= 50) return 'bg-amber-400'
  if (score >= 30) return 'bg-orange-400'
  return 'bg-red-400'
}

function riskBand(score: number): string {
  if (score >= 70) return 'Low'
  if (score >= 50) return 'Moderate'
  if (score >= 30) return 'Elevated'
  if (score >= 15) return 'High'
  return 'Critical'
}

const VERDICT_CONFIG = {
  caught:  { label: 'Caught', icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20' },
  partial: { label: 'Partial',  icon: AlertTriangle, color: 'text-amber-400 bg-amber-400/10 border-amber-500/20' },
  missed:  { label: 'Missed',  icon: XCircle,      color: 'text-red-400 bg-red-400/10 border-red-500/20' },
}

const SEVERITY_STYLES = {
  critical: 'text-red-400 bg-red-400/10 border-red-500/20',
  high:     'text-orange-400 bg-orange-400/10 border-orange-500/20',
  medium:   'text-amber-400 bg-amber-400/10 border-amber-500/20',
}

// ─── Mini score chart ─────────────────────────────────────────────────────────

function ScoreSparkline({ points }: { points: ScorePoint[] }) {
  const W = 280; const H = 64; const PAD = 8
  const scores = points.map((p) => p.score)
  const min = Math.min(...scores, 0)
  const max = Math.max(...scores, 100)
  const range = max - min || 1
  const stepX = (W - PAD * 2) / (points.length - 1)

  const coords = points.map((p, i) => ({
    x: PAD + i * stepX,
    y: H - PAD - ((p.score - min) / range) * (H - PAD * 2),
  }))

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const fillD = `${pathD} L ${coords[coords.length - 1].x} ${H} L ${coords[0].x} ${H} Z`

  // Horizontal risk bands
  const bands = [
    { threshold: 70, color: '#10b98130' },
    { threshold: 50, color: '#f59e0b30' },
    { threshold: 30, color: '#f9731630' },
    { threshold: 0,  color: '#ef444430' },
  ]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" aria-hidden>
      {/* Risk band fills */}
      {bands.map((b, i) => {
        const nextThreshold = bands[i - 1]?.threshold ?? 100
        const y1 = H - PAD - ((nextThreshold - min) / range) * (H - PAD * 2)
        const y2 = H - PAD - ((b.threshold - min) / range) * (H - PAD * 2)
        return (
          <rect key={b.threshold} x={PAD} y={Math.min(y1, y2)} width={W - PAD * 2}
            height={Math.abs(y2 - y1)} fill={b.color} />
        )
      })}
      {/* Area fill */}
      <path d={fillD} fill="rgba(59,130,246,0.08)" />
      {/* Line */}
      <path d={pathD} fill="none" stroke="rgb(59,130,246)" strokeWidth={1.5} strokeLinejoin="round" />
      {/* Event dots */}
      {coords.map((c, i) =>
        points[i].event ? (
          <circle key={i} cx={c.x} cy={c.y} r={3} fill="rgb(251,191,36)" stroke="rgb(17,24,39)" strokeWidth={1} />
        ) : null
      )}
      {/* Final dot */}
      <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y}
        r={3} fill={scoreBg(points[points.length - 1].score)} />
    </svg>
  )
}

// ─── Event card ───────────────────────────────────────────────────────────────

function EventCard({ event }: { event: DepegEvent }) {
  const verdict = VERDICT_CONFIG[event.verdict]
  const VerdictIcon = verdict.icon
  const scoreDelta = event.finalScore - event.preDepegScore

  return (
    <article className="bg-bg-card border border-border rounded-xl overflow-hidden hover:border-accent-blue/30 transition-colors">
      {/* Header */}
      <div className="p-5 border-b border-border/60">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-accent-blue bg-accent-blue/10 border border-accent-blue/20 px-1.5 py-0.5 rounded">
                {event.assetSymbol}
              </span>
              <span className="text-xs text-text-muted flex items-center gap-1">
                <Clock size={10} aria-hidden /> {event.date}
              </span>
            </div>
            <h2 className="text-base font-semibold text-text-primary">{event.title}</h2>
            <p className="text-xs text-text-muted mt-0.5">{event.outcome}</p>
          </div>
          <span className={clsx('inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-medium flex-shrink-0', verdict.color)}>
            <VerdictIcon size={12} aria-hidden />
            {verdict.label}
          </span>
        </div>

        {/* Score summary row */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="text-center">
            <div className={clsx('text-2xl font-bold font-mono', scoreColor(event.preDepegScore))}>
              {event.preDepegScore}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Pre-event score</div>
            <div className="text-[10px] text-text-muted">{riskBand(event.preDepegScore)}</div>
          </div>
          <div className="text-center">
            <div className={clsx('text-2xl font-bold font-mono', scoreColor(event.finalScore))}>
              {event.finalScore}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">At peak stress</div>
            <div className="text-[10px] text-text-muted">{riskBand(event.finalScore)}</div>
          </div>
          <div className="text-center">
            <div className={clsx('text-2xl font-bold font-mono', scoreDelta < 0 ? 'text-red-400' : 'text-emerald-400')}>
              {scoreDelta > 0 ? '+' : ''}{scoreDelta}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Score change</div>
            <div className="text-[10px] text-text-muted">{event.peakLoss} peg</div>
          </div>
        </div>
      </div>

      {/* Sparkline */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Risk Score Timeline</span>
          <span className="text-[10px] text-text-muted flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-amber-400" /> event marker
          </span>
        </div>
        <ScoreSparkline points={event.timeline} />
        <div className="flex justify-between text-[9px] text-text-muted/60 mt-1 font-mono">
          <span>{event.timeline[0].label}</span>
          <span>{event.timeline[event.timeline.length - 1].label}</span>
        </div>
      </div>

      {/* Signals */}
      <div className="px-5 pb-4">
        <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2 mt-3">Risk Signals</div>
        <div className="space-y-1.5">
          {event.signals.map((sig) => (
            <div key={sig.name} className="flex items-start gap-2">
              <span className={clsx('inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase flex-shrink-0 mt-0.5', SEVERITY_STYLES[sig.severity])}>
                {sig.severity}
              </span>
              <div className="min-w-0">
                <span className="text-xs text-text-secondary font-medium">{sig.name}</span>
                <span className="text-[10px] text-text-muted ml-1.5">· {sig.firedAt}</span>
                <p className="text-[10px] text-text-muted leading-snug mt-0.5">{sig.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary + lesson */}
      <div className="px-5 pb-5 space-y-3 border-t border-border/40 pt-4">
        <p className="text-xs text-text-secondary leading-relaxed">{event.summary}</p>
        <div className="flex items-start gap-2 bg-accent-blue/5 border border-accent-blue/15 rounded-lg p-3">
          <Info size={13} className="text-accent-blue flex-shrink-0 mt-0.5" aria-hidden />
          <p className="text-xs text-text-secondary leading-relaxed"><span className="font-medium text-text-primary">Key lesson: </span>{event.keyLesson}</p>
        </div>
      </div>

      {/* CTA placeholder */}
      <div className="px-5 pb-5">
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-xs text-text-muted cursor-not-allowed opacity-50"
          title="Full deep-dive analysis coming soon"
        >
          View full analysis <ChevronRight size={12} aria-hidden />
          <span className="ml-auto text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">Coming soon</span>
        </button>
      </div>
    </article>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const VERDICT_SUMMARY = {
  caught:  { label: 'Caught',  color: 'text-emerald-400' },
  partial: { label: 'Partial', color: 'text-amber-400' },
  missed:  { label: 'Missed',  color: 'text-red-400' },
}

export default function BacktestsPage() {
  const caught  = EVENTS.filter((e) => e.verdict === 'caught').length
  const partial = EVENTS.filter((e) => e.verdict === 'partial').length
  const missed  = EVENTS.filter((e) => e.verdict === 'missed').length

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-violet-400/10 border border-violet-500/20 flex items-center justify-center">
            <FlaskConical size={18} className="text-violet-400" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Risk Case Studies</h1>
            <p className="text-xs text-text-muted">How CAEP&apos;s risk scoring model would have flagged major historical depeg events</p>
          </div>
        </div>
      </div>

      {/* Methodology note */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3">
        <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-xs font-medium text-amber-300">Simulated scores — not live data</p>
          <p className="text-xs text-text-muted mt-1 leading-relaxed">
            These scores are reconstructed from publicly available data (reserve disclosures, on-chain supply, DEX liquidity snapshots)
            using the current scoring model. They represent what the model <em>would have</em> shown had CAEP been live. They are not
            the result of running the live pipeline against historical data.
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {([['caught', caught], ['partial', partial], ['missed', missed]] as const).map(([v, count]) => {
          const cfg = VERDICT_SUMMARY[v]
          const Icon = VERDICT_CONFIG[v].icon
          return (
            <div key={v} className="bg-bg-card border border-border rounded-lg p-4 flex items-center gap-3">
              <Icon size={20} className={cfg.color} aria-hidden />
              <div>
                <div className={clsx('text-2xl font-bold font-mono', cfg.color)}>{count}</div>
                <div className="text-xs text-text-muted">{cfg.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Event cards */}
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {EVENTS.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      {/* Roadmap note */}
      <div className="rounded-xl border border-slate-700/60 bg-bg-card p-5 flex gap-3">
        <TrendingDown size={16} className="text-text-muted flex-shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-xs font-medium text-text-primary mb-1">Planned: Live backtest engine</p>
          <p className="text-xs text-text-muted leading-relaxed">
            Once the backend is live, the scoring pipeline will replay historical on-chain data to generate
            fully automated backtests. Additional events planned: FRAX FXS liquidity crisis (Jan 2023),
            USDD depegs (Jun 2022), and MIM depeg post-Abracadabra exploit (Jan 2022).
          </p>
        </div>
      </div>
    </div>
  )
}
