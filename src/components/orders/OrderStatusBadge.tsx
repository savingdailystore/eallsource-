'use client';

import { cn } from '@/lib/utils';

type POStatus = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED' | 'CLOSED';

const STATUS_STYLES: Record<POStatus, { label: string; classes: string }> = {
  DRAFT:              { label: 'Draft',              classes: 'bg-slate-700 text-slate-300' },
  ORDERED:            { label: 'Ordered',            classes: 'bg-blue-900/60 text-blue-300' },
  PARTIALLY_RECEIVED: { label: 'Partial',            classes: 'bg-amber-900/60 text-amber-300' },
  RECEIVED:           { label: 'Received',           classes: 'bg-green-900/60 text-green-300' },
  CANCELLED:          { label: 'Cancelled',          classes: 'bg-slate-800 text-slate-500' },
  CLOSED:             { label: 'Closed',             classes: 'bg-slate-800 text-slate-400' },
};

export function OrderStatusBadge({ status }: { status: POStatus }) {
  const { label, classes } = STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT;
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold', classes)}>
      {label}
    </span>
  );
}
