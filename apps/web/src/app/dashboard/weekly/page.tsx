'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Package, CheckCircle2, Clock, XCircle, Loader2, Download, Ban } from 'lucide-react';
import { formatNumber } from '@lib/utils';

interface Batch {
  id: string;
  weekNumber: number;
  year: number;
  status: string;
  totalFound: number;
  totalPassed: number;
  createdAt: string;
  completedAt?: string;
  _count?: { products: number };
}

const STATUS_CONFIG = {
  COMPLETED: { label: 'Completed', icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
  RUNNING: { label: 'Running', icon: Clock, color: 'text-blue-600 bg-blue-50' },
  PENDING: { label: 'Pending', icon: Clock, color: 'text-gray-600 bg-gray-50' },
  FAILED: { label: 'Failed', icon: XCircle, color: 'text-red-600 bg-red-50' },
};

export default function WeeklyPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBatch, setActiveBatch] = useState<Batch | null>(null);

  useEffect(() => {
    fetch('/api/weekly')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setBatches(d.data ?? []);
        if (d.data?.length) setActiveBatch(d.data[0]);
      })
      .catch(() => setBatches([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Product Feed</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            40 curated, vetted opportunities delivered every week
          </p>
        </div>
        {activeBatch && (
          <button
            onClick={() => window.open(`/api/export?format=excel&type=products`, '_blank')}
            className="flex items-center gap-2 text-sm bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4" /> Export This Week
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Batch list */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Feed History</h3>
          {batches.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <CalendarDays className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No weekly feeds yet</p>
            </div>
          ) : (
            batches.map((batch) => {
              const cfg = STATUS_CONFIG[batch.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.PENDING;
              const StatusIcon = cfg.icon;
              const isActive = activeBatch?.id === batch.id;

              return (
                <button
                  key={batch.id}
                  onClick={() => setActiveBatch(batch)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${
                    isActive
                      ? 'border-green-300 bg-green-50 shadow-sm'
                      : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="font-semibold text-sm text-gray-900">
                      Week {batch.weekNumber}, {batch.year}
                    </div>
                    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {batch.totalPassed} qualified / {batch.totalFound} scanned
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(batch.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Batch detail */}
        {activeBatch && (
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <CalendarDays className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">
                    Week {activeBatch.weekNumber}, {activeBatch.year}
                  </h2>
                  <p className="text-sm text-gray-400">
                    {activeBatch.completedAt
                      ? `Completed ${new Date(activeBatch.completedAt).toLocaleDateString()}`
                      : 'In progress…'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <StatCard label="Products Scanned" value={formatNumber(activeBatch.totalFound)} icon={Package} />
                <StatCard label="Qualified" value={formatNumber(activeBatch.totalPassed)} icon={CheckCircle2} highlight />
                <StatCard
                  label="Pass Rate"
                  value={activeBatch.totalFound > 0 ? `${((activeBatch.totalPassed / activeBatch.totalFound) * 100).toFixed(0)}%` : '—'}
                  icon={CheckCircle2}
                />
                <StatCard
                  label="Status"
                  value={STATUS_CONFIG[activeBatch.status as keyof typeof STATUS_CONFIG]?.label ?? activeBatch.status}
                  icon={Clock}
                />
              </div>

              {/* Qualification criteria reminder */}
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Qualification Criteria Applied
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['ROI', '> 30% after all fees'],
                      ['IP Risk', 'Low only (50+ brands filtered)'],
                      ['BSR', 'Top 3% of category'],
                      ['FBA Sellers', '≤ 15 maximum'],
                      ['Total Sellers', '≤ 30 maximum'],
                      ['Category', 'Auto-ungated only'],
                      ['Duplicates', 'No repeat from last 90 days'],
                      ['Cashback', 'All 6 sources checked'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                        <div>
                          <span className="text-xs font-medium text-gray-700">{k}:</span>{' '}
                          <span className="text-xs text-gray-500">{v}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-red-50 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-semibold text-red-500 uppercase tracking-wider">
                    Automatically Excluded
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Brand Gating', 'Requires brand approval to sell'],
                      ['Counterfeit Risk', 'High counterfeit complaint history'],
                      ['Hazmat / Dangerous Goods', 'Flammable, pressurized, or restricted shipment'],
                      ['Restricted / Gated Category', 'Requires Amazon category approval'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-start gap-2">
                        <Ban className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                        <div>
                          <span className="text-xs font-medium text-red-700">{k}:</span>{' '}
                          <span className="text-xs text-red-400">{v}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, highlight }: { label: string; value: string; icon: React.ElementType; highlight?: boolean }) {
  return (
    <div className={`p-4 rounded-xl border ${highlight ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
      <Icon className={`w-4 h-4 mb-2 ${highlight ? 'text-green-600' : 'text-gray-400'}`} />
      <div className={`text-xl font-bold ${highlight ? 'text-green-700' : 'text-gray-900'}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}
