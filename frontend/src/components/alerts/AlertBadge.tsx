import { clsx } from 'clsx'
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  Zap,
  CheckCircle,
} from 'lucide-react'
import type { AlertSeverity } from '@/types/alert'

interface AlertBadgeProps {
  severity: AlertSeverity
  iconOnly?: boolean
  className?: string
}

const SEVERITY_CONFIG: Record<AlertSeverity, {
  label: string
  icon: typeof AlertOctagon
  classes: string
  iconClasses: string
  pulse?: boolean
}> = {
  critical: {
    label: 'Critical',
    icon: AlertOctagon,
    classes: 'bg-red-500/10 text-red-400 border border-red-500/30',
    iconClasses: 'text-red-400',
    pulse: true,
  },
  high: {
    label: 'High',
    icon: AlertTriangle,
    classes: 'bg-orange-500/10 text-orange-400 border border-orange-500/30',
    iconClasses: 'text-orange-400',
  },
  medium: {
    label: 'Medium',
    icon: Zap,
    classes: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
    iconClasses: 'text-amber-400',
  },
  low: {
    label: 'Low',
    icon: CheckCircle,
    classes: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
    iconClasses: 'text-blue-400',
  },
  info: {
    label: 'Info',
    icon: Info,
    classes: 'bg-slate-500/10 text-slate-400 border border-slate-500/30',
    iconClasses: 'text-slate-400',
  },
}

export function AlertBadge({ severity, iconOnly, className }: AlertBadgeProps) {
  const config = SEVERITY_CONFIG[severity]
  const Icon = config.icon

  if (iconOnly) {
    return (
      <div
        className={clsx(
          'size-6 rounded flex items-center justify-center',
          config.classes,
          config.pulse && 'animate-pulse-critical',
          className
        )}
        aria-label={`${config.label} severity alert`}
      >
        <Icon size={12} aria-hidden />
      </div>
    )
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium',
        config.classes,
        className
      )}
      aria-label={`Severity: ${config.label}`}
    >
      <Icon size={11} aria-hidden className={config.pulse ? 'animate-pulse' : undefined} />
      {config.label}
    </span>
  )
}
