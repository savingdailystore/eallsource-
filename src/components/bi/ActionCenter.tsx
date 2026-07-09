import Link from 'next/link';
import { ArrowRight, AlertTriangle, Clock, Info } from 'lucide-react';
import type { ActionItem } from '@/engines/businessIntelligence';

const PRIORITY_CONFIG = {
  high:   { color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: AlertTriangle },
  medium: { color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: Clock },
  low:    { color: 'text-slate-400',  bg: 'bg-slate-800',     border: 'border-slate-700/50',  icon: Info },
};

interface Props {
  actions: ActionItem[];
}

export function ActionCenter({ actions }: Props) {
  if (actions.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-sm font-medium text-slate-200">All clear</div>
        <div className="text-xs text-slate-500 mt-1">No actions needed right now.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {actions.map((action, i) => {
        const cfg = PRIORITY_CONFIG[action.priority];
        const Icon = cfg.icon;
        return (
          <Link
            key={i}
            href={action.href}
            className={`flex items-start gap-3 p-3 rounded-xl border ${cfg.bg} ${cfg.border} hover:opacity-90 transition-opacity group`}
          >
            <div className="flex-shrink-0 mt-0.5">
              <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${cfg.color}`}>{action.label}</div>
              <div className="text-xs text-slate-500 mt-0.5 leading-snug">{action.description}</div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0 mt-0.5 group-hover:text-slate-400 transition-colors" />
          </Link>
        );
      })}
    </div>
  );
}
