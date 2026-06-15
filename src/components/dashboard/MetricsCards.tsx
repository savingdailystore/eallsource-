'use client';

import { TrendingUp, DollarSign, Bookmark, Zap, Package, ArrowUpRight } from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/utils';

interface MetricsCardsProps {
  totalOpportunities: number;
  averageRoi: number;
  averageProfit: number;
  savedProducts: number;
  weeklyNewLeads: number;
}

export function MetricsCards({
  totalOpportunities,
  averageRoi,
  averageProfit,
  savedProducts,
  weeklyNewLeads,
}: MetricsCardsProps) {
  const cards = [
    {
      label: 'Total Opportunities',
      value: formatNumber(totalOpportunities),
      icon: Package,
      color: 'blue',
      trend: 'Active products',
    },
    {
      label: 'Average ROI',
      value: formatPercent(averageRoi),
      icon: TrendingUp,
      color: 'green',
      trend: 'After all fees',
    },
    {
      label: 'Average Profit',
      value: formatCurrency(averageProfit),
      icon: DollarSign,
      color: 'emerald',
      trend: 'Per unit',
    },
    {
      label: 'Saved Products',
      value: formatNumber(savedProducts),
      icon: Bookmark,
      color: 'purple',
      trend: 'In watchlist',
    },
    {
      label: 'Weekly New Leads',
      value: formatNumber(weeklyNewLeads),
      icon: Zap,
      color: 'orange',
      trend: 'This week',
    },
  ];

  const colorMap: Record<string, { bg: string; icon: string; badge: string }> = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', badge: 'bg-blue-100 text-blue-700' },
    green: { bg: 'bg-green-50', icon: 'text-green-600', badge: 'bg-green-100 text-green-700' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600', badge: 'bg-purple-100 text-purple-700' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600', badge: 'bg-orange-100 text-orange-700' },
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card) => {
        const colors = colorMap[card.color];
        return (
          <div
            key={card.label}
            className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl ${colors.bg} flex items-center justify-center`}>
                <card.icon className={`w-5 h-5 ${colors.icon}`} />
              </div>
              <ArrowUpRight className="w-4 h-4 text-gray-300" />
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">{card.value}</div>
            <div className="text-sm text-gray-500 mb-2">{card.label}</div>
            <div className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
              {card.trend}
            </div>
          </div>
        );
      })}
    </div>
  );
}
