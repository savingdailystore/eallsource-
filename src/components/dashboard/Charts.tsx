'use client';

import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const COLORS = ['#16a34a', '#2563eb', '#9333ea', '#ea580c', '#0891b2', '#dc2626', '#d97706', '#7c3aed'];

interface ChartData {
  [key: string]: string | number;
}

interface ChartsProps {
  roiDistribution: { range: string; count: number }[];
  categoryDistribution: { category: string; count: number }[];
  buyBoxDistribution: { owner: string; count: number }[];
  retailerDistribution: { retailer: string; count: number }[];
}

const CUSTOM_TOOLTIP = ({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-sm">
      <div className="font-medium text-gray-700 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="text-gray-600">
          {p.name}: <span className="font-semibold text-gray-900">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export function RoiDistributionChart({ data }: { data: { range: string; count: number }[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <h3 className="font-semibold text-gray-900 mb-1">ROI Distribution</h3>
      <p className="text-sm text-gray-400 mb-5">Products by ROI range</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barSize={32}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <Tooltip content={<CUSTOM_TOOLTIP />} />
          <Bar dataKey="count" name="Products" fill="#16a34a" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryDistributionChart({ data }: { data: { category: string; count: number }[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <h3 className="font-semibold text-gray-900 mb-1">Category Distribution</h3>
      <p className="text-sm text-gray-400 mb-5">Products by Amazon category</p>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="category"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={3}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [value, name]}
            contentStyle={{ borderRadius: 12, border: '1px solid #f3f4f6', fontSize: 12 }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(v) => <span className="text-xs text-gray-600">{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BuyBoxChart({ data }: { data: { owner: string; count: number }[] }) {
  const formatted = data.map((d) => ({
    ...d,
    owner: d.owner.replace('_', ' '),
  }));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <h3 className="font-semibold text-gray-900 mb-1">Buy Box Ownership</h3>
      <p className="text-sm text-gray-400 mb-5">Who owns the Buy Box</p>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={formatted}
            dataKey="count"
            nameKey="owner"
            cx="50%"
            cy="50%"
            outerRadius={90}
            paddingAngle={3}
          >
            {formatted.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f3f4f6', fontSize: 12 }} />
          <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-gray-600">{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RetailerChart({ data }: { data: { retailer: string; count: number }[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <h3 className="font-semibold text-gray-900 mb-1">Source Retailers</h3>
      <p className="text-sm text-gray-400 mb-5">Products by source store</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" barSize={18}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="retailer" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={80} />
          <Tooltip content={<CUSTOM_TOOLTIP />} />
          <Bar dataKey="count" name="Products" fill="#2563eb" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
