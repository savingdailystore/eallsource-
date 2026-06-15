'use client';

import { useEffect, useState } from 'react';
import { ScanLine, Play, CheckCircle2, XCircle, Clock, Loader2, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';

interface Batch {
  id: string;
  weekNumber: number;
  year: number;
  status: string;
  totalFound: number;
  totalPassed: number;
  createdAt: string;
  completedAt?: string;
}

interface ScanLog {
  id: string;
  retailer: string;
  status: string;
  productsFound: number;
  productsPassed: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

interface Source {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  lastScanned?: string;
}

export default function AdminScansPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    const [scanRes, sourcesRes] = await Promise.all([
      fetch('/api/scan'),
      fetch('/api/admin?resource=sources'),
    ]);
    const scanData = await scanRes.json();
    const sourcesData = await sourcesRes.json();

    if (scanData.data) {
      setBatches(scanData.data.batches ?? []);
      setLogs(scanData.data.logs ?? []);
    }
    if (sourcesData.data) setSources(sourcesData.data);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  async function handleRunScan() {
    setScanning(true);
    await fetch('/api/scan', { method: 'POST' });
    setTimeout(() => {
      fetchData();
      setScanning(false);
    }, 2000);
  }

  async function toggleSource(source: Source) {
    await fetch('/api/admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource: 'source', id: source.id, data: { enabled: !source.enabled } }),
    });
    setSources((prev) => prev.map((s) => s.id === source.id ? { ...s, enabled: !s.enabled } : s));
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScanLine className="w-6 h-6 text-gray-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scan Control</h1>
            <p className="text-sm text-gray-500">Manage product scans and retailer sources</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 border border-gray-200 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleRunScan}
            disabled={scanning}
            className="flex items-center gap-2 text-sm bg-green-600 text-white px-5 py-2.5 rounded-xl hover:bg-green-700 disabled:opacity-60 transition-colors font-medium"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {scanning ? 'Scanning…' : 'Run Weekly Scan'}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Retailer Sources */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Retailer Sources</h3>
          <div className="space-y-2">
            {sources.map((source) => (
              <div key={source.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div>
                  <div className="text-sm font-medium text-gray-900">{source.name}</div>
                  <div className="text-xs text-gray-400">{source.baseUrl}</div>
                </div>
                <button
                  onClick={() => toggleSource(source)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                    source.enabled
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {source.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {source.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Batch History */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Batch History</h3>
          <div className="space-y-2">
            {batches.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No batches yet</p>
            ) : batches.map((batch) => (
              <div key={batch.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    Week {batch.weekNumber} / {batch.year}
                  </div>
                  <div className="text-xs text-gray-400">
                    {batch.totalPassed} qualified · {new Date(batch.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <StatusBadge status={batch.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scan Logs */}
      {logs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Recent Scan Logs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Retailer', 'Status', 'Found', 'Passed', 'Started', 'Completed'].map((h) => (
                    <th key={h} className="text-left pb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/50">
                    <td className="py-3 pr-4 font-medium text-gray-900">{log.retailer}</td>
                    <td className="py-3 pr-4"><StatusBadge status={log.status} /></td>
                    <td className="py-3 pr-4 text-gray-600">{log.productsFound}</td>
                    <td className="py-3 pr-4 text-green-600 font-medium">{log.productsPassed}</td>
                    <td className="py-3 pr-4 text-gray-400 text-xs">{new Date(log.startedAt).toLocaleTimeString()}</td>
                    <td className="py-3 text-gray-400 text-xs">
                      {log.completedAt ? new Date(log.completedAt).toLocaleTimeString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ElementType; color: string }> = {
    COMPLETED: { icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
    RUNNING: { icon: Loader2, color: 'text-blue-600 bg-blue-50' },
    PENDING: { icon: Clock, color: 'text-gray-500 bg-gray-50' },
    FAILED: { icon: XCircle, color: 'text-red-600 bg-red-50' },
  };
  const cfg = map[status] ?? map.PENDING;
  const Icon = cfg.icon;

  return (
    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full w-fit ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}
