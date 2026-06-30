import { cn } from '@/lib/utils';
import type { HealthStatus } from '@/engines/inventoryHealth';

const STATUS_CONFIG: Record<HealthStatus, { label: string; className: string }> = {
  HEALTHY:      { label: 'Healthy',      className: 'bg-green-500/15  text-green-400  border-green-500/30'  },
  REORDER_SOON: { label: 'Reorder Soon', className: 'bg-amber-500/15  text-amber-400  border-amber-500/30'  },
  OVERSTOCKED:  { label: 'Overstocked',  className: 'bg-blue-500/15   text-blue-400   border-blue-500/30'   },
  AGING:        { label: 'Aging',        className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  LOW_MARGIN:   { label: 'Low Margin',   className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  AT_RISK:      { label: 'At Risk',      className: 'bg-red-500/15    text-red-400    border-red-500/30'    },
  UNKNOWN:      { label: 'No Data',      className: 'bg-slate-700/50  text-slate-500  border-slate-600/50'  },
};

export function InventoryHealthBadge({ status }: { status: HealthStatus }) {
  const { label, className } = STATUS_CONFIG[status];
  return (
    <span className={cn(
      'inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border tracking-wide whitespace-nowrap',
      className,
    )}>
      {label}
    </span>
  );
}
