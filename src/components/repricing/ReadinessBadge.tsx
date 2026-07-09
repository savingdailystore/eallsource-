import type { ReadinessResult, HealthResult } from '@/engines/repricingReadiness';

const SEVERITY_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  ok:      { bg: 'bg-green-500/10',  text: 'text-green-400',  dot: 'bg-green-400' },
  info:    { bg: 'bg-blue-500/10',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  warning: { bg: 'bg-amber-500/10',  text: 'text-amber-400',  dot: 'bg-amber-400' },
  error:   { bg: 'bg-red-500/10',    text: 'text-red-400',    dot: 'bg-red-400' },
  muted:   { bg: 'bg-slate-800',     text: 'text-slate-500',  dot: 'bg-slate-600' },
};

interface Props {
  readiness:  ReadinessResult;
  showTooltip?: boolean;
}

export function HealthBadge({ health }: { health: HealthResult }) {
  const s = SEVERITY_STYLE[health.severity] ?? SEVERITY_STYLE.muted;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text} whitespace-nowrap`}
      title={health.summary}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {health.label}
    </span>
  );
}

export function ReadinessBadge({ readiness, showTooltip = true }: Props) {
  const s = SEVERITY_STYLE[readiness.severity] ?? SEVERITY_STYLE.muted;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text} whitespace-nowrap`}
      title={showTooltip ? `${readiness.reason} ${readiness.action}` : undefined}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {readiness.label}
    </span>
  );
}
