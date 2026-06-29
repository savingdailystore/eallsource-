'use client';

import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';

interface DayCount {
  label: string;
  count: number;
}

export function WeeklyLeadsChart({ data }: { data: DayCount[] }) {
  const todayLabel = data[data.length - 1]?.label;

  return (
    <div className="w-full h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: '#1e293b' }}
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.label === todayLabel ? '#3b82f6' : '#1e3a8a'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
