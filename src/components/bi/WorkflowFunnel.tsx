import Link from 'next/link';
import { TrendingUp, ShoppingCart, Package, ArrowRight } from 'lucide-react';
import type { WorkflowFunnelSummary } from '@/engines/businessIntelligence';

interface Props {
  funnel: WorkflowFunnelSummary;
}

interface FunnelStep {
  label:    string;
  count:    number;
  sub?:     string;
  href:     string;
  icon:     React.ComponentType<{ className?: string }>;
  color:    string;
  bg:       string;
}

export function WorkflowFunnel({ funnel }: Props) {
  const steps: FunnelStep[] = [
    {
      label: 'Total Leads',
      count: funnel.totalLeads,
      sub:   funnel.savedLeads > 0 ? `${funnel.savedLeads} saved` : undefined,
      href:  '/dashboard/leads',
      icon:  TrendingUp,
      color: 'text-blue-400',
      bg:    'bg-blue-500/10',
    },
    {
      label: 'Purchased',
      count: funnel.purchasedLeads,
      sub:   funnel.purchasedLeads > 0 ? 'turned into orders' : undefined,
      href:  '/dashboard/leads',
      icon:  ShoppingCart,
      color: 'text-violet-400',
      bg:    'bg-violet-500/10',
    },
    {
      label: 'Purchase Orders',
      count: funnel.openPOs + funnel.receivedPOs,
      sub:   funnel.openPOs > 0
        ? `${funnel.openPOs} open · ${funnel.pendingUnits} unit${funnel.pendingUnits !== 1 ? 's' : ''} pending`
        : funnel.receivedPOs > 0 ? `${funnel.receivedPOs} received` : undefined,
      href:  '/dashboard/orders',
      icon:  ShoppingCart,
      color: 'text-amber-400',
      bg:    'bg-amber-500/10',
    },
    {
      label: 'Inventory Items',
      count: funnel.inventoryItems,
      sub:   funnel.inventoryItems > 0 ? 'in stock' : undefined,
      href:  '/dashboard/inventory',
      icon:  Package,
      color: 'text-emerald-400',
      bg:    'bg-emerald-500/10',
    },
  ];

  if (!funnel.hasData) {
    return (
      <div className="py-8 text-center text-sm text-slate-500">
        No workflow data yet — start by running a scan or adding leads.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2 flex-1 min-w-0">
          <Link
            href={step.href}
            className="flex-1 min-w-0 bg-slate-800/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all group"
          >
            <div className={`w-8 h-8 rounded-lg ${step.bg} flex items-center justify-center mb-3`}>
              <step.icon className={`w-4 h-4 ${step.color}`} />
            </div>
            <div className="text-2xl font-bold text-slate-50">{step.count.toLocaleString()}</div>
            <div className="text-xs font-medium text-slate-300 mt-0.5">{step.label}</div>
            {step.sub && (
              <div className="text-[11px] text-slate-500 mt-1 truncate">{step.sub}</div>
            )}
          </Link>
          {i < steps.length - 1 && (
            <ArrowRight className="w-4 h-4 text-slate-700 flex-shrink-0 hidden sm:block" />
          )}
        </div>
      ))}
    </div>
  );
}
