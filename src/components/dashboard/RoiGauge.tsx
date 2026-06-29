'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatPercent } from '@/lib/utils';

// Donut gauge: clamp the filled slice to 100% of whatever ceiling the data
// implies, so a 189% ROI still reads as "mostly full" rather than wrapping
// the chart around multiple times.
export function RoiGauge({ avgRoi }: { avgRoi: number }) {
  const ceiling  = Math.max(100, Math.ceil(avgRoi / 50) * 50);
  const filled   = Math.max(0, Math.min(avgRoi, ceiling));
  const data     = [
    { name: 'roi',  value: filled },
    { name: 'rest', value: ceiling - filled },
  ];

  return (
    <div className="relative w-full h-40">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            cx="50%"
            cy="50%"
            startAngle={90}
            endAngle={-270}
            innerRadius="70%"
            outerRadius="100%"
            stroke="none"
          >
            <Cell fill="#34d399" />
            <Cell fill="#1e293b" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-2xl font-semibold text-slate-50">{formatPercent(avgRoi)}</div>
        <div className="text-xs text-slate-400">Avg ROI</div>
      </div>
    </div>
  );
}
