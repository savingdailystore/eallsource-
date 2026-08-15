'use client';

import { resolveFeeFreshnessStatus, type FeeFreshnessDisplay } from './feeFreshnessStatus';

const CONFIG: Record<FeeFreshnessDisplay, { label: string; cls: string }> = {
  FRESH:         { label: 'Amazon fees fresh',        cls: 'bg-green-500/15 text-green-400' },
  NEEDS_RECHECK: { label: 'Amazon fees need recheck', cls: 'bg-amber-500/15 text-amber-400' },
  STALE:         { label: 'Amazon fees stale',        cls: 'bg-orange-500/15 text-orange-400' },
  VERY_STALE:    { label: 'Amazon fees very stale',   cls: 'bg-red-500/15 text-red-400' },
  UNAVAILABLE:   { label: 'Amazon fees unavailable',  cls: 'bg-slate-700/60 text-slate-400' },
};

interface FeeFreshnessBadgeProps {
  feeEstimateSource?:  string | null;
  feeEstimatedAt?:     Date | string | null;
  feeEstimatePrice?:   number | null;
  currentResellPrice?: number | null;
}

export function FeeFreshnessBadge({
  feeEstimateSource,
  feeEstimatedAt,
  feeEstimatePrice,
  currentResellPrice,
}: FeeFreshnessBadgeProps) {
  const status = resolveFeeFreshnessStatus({
    feeEstimateSource,
    feeEstimatedAt,
    feeEstimatePrice,
    currentResellPrice,
  });
  const { label, cls } = CONFIG[status];
  return (
    <span className={`badge text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}
