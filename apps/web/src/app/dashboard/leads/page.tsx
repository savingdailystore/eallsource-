'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Flame, ExternalLink, TrendingUp, Filter, RefreshCw,
  Play, CheckCircle, Eye, XCircle, Loader2, Clock,
  ShieldCheck, ShieldAlert, ShieldX, ChevronDown, ChevronUp,
  AlertCircle, Search,
} from 'lucide-react';
import { formatCurrency } from '@lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  asin: string;
  title: string;
  category?: string;
  imageUrl?: string;
  sourceRetailer: string;
  sourcePrice: number;
  sourceUrl: string;
  amazonPrice: number;
  amazonUrl: string;
  finalCost: number;
  netProfit: number;
  roi: number;
  score: number;
  bsr?: number;
  fbaSellers: number;
  status: string;
  alertSent: boolean;
  createdAt: string;
  scoreBreakdown: {
    roi?: number;
    profit?: number;
    velocity?: number;
    competition?: number;
    risk?: number;
  };
}

interface ScrapeJob {
  id: string;
  query?: string;
  status: string;
  itemsFound: number;
  leadsCreated: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-green-100 text-green-700 border-green-200' :
    score >= 60 ? 'bg-blue-100 text-blue-700 border-blue-200' :
    score >= 40 ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-gray-100 text-gray-500 border-gray-200';
  const tier =
    score >= 80 ? '🔥 HOT' :
    score >= 60 ? '✅ GOOD' :
    score >= 40 ? '⚠️ MAR' : '⛔ SKIP';
  return (
    <div className={`inline-flex flex-col items-center px-2.5 py-1 rounded-xl border text-xs font-bold ${color}`}>
      <span>{score}</span>
      <span className="text-[9px] font-medium opacity-80">{tier}</span>
    </div>
  );
}

function StatusBadge({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const map: Record<string, { cls: string; label: string }> = {
    NEW:       { cls: 'bg-purple-100 text-purple-700', label: 'New' },
    REVIEWED:  { cls: 'bg-blue-100 text-blue-700',    label: 'Reviewed' },
    PURCHASED: { cls: 'bg-green-100 text-green-700',  label: 'Purchased' },
    PASSED:    { cls: 'bg-gray-100 text-gray-600',    label: 'Passed' },
    EXPIRED:   { cls: 'bg-red-100 text-red-600',      label: 'Expired' },
  };
  const cfg = map[status] ?? map.NEW;
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value)}
      className={`text-xs font-medium px-2 py-0.5 rounded-lg border-0 ${cfg.cls} focus:ring-2 focus:ring-purple-500 cursor-pointer`}
    >
      {Object.entries(map).map(([v, { label }]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}

function JobStatusChip({ status }: { status: string }) {
  const m: Record<string, string> = {
    PENDING:   'bg-gray-100 text-gray-500',
    RUNNING:   'bg-blue-100 text-blue-600',
    COMPLETED: 'bg-green-100 text-green-600',
    FAILED:    'bg-red-100 text-red-600',
  };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m[status] ?? m.PENDING}`}>{status}</span>;
}

function ScoreBar({ label, value }: { label: string; value?: number }) {
  const v = value ?? 0;
  const color = v >= 70 ? 'bg-green-500' : v >= 40 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
        <span>{label}</span><span>{Math.round(v)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function LeadRow({ lead, onStatusChange }: { lead: Lead; onStatusChange: (id: string, s: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-gray-50/60 dark:hover:bg-gray-800/60 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Score */}
        <td className="px-4 py-3 text-center">
          <ScoreBadge score={lead.score} />
        </td>

        {/* Product */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-3">
            {lead.imageUrl ? (
              <img src={lead.imageUrl} alt={lead.title} className="w-9 h-9 rounded-lg object-contain flex-shrink-0 border border-gray-100" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-1">{lead.title}</div>
              <div className="text-xs text-gray-400 font-mono">{lead.asin}</div>
            </div>
          </div>
        </td>

        {/* Source */}
        <td className="px-3 py-3">
          <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">
            {lead.sourceRetailer} <ExternalLink className="w-3 h-3" />
          </a>
          <div className="text-xs text-gray-500 mt-0.5">{formatCurrency(lead.sourcePrice)}</div>
        </td>

        {/* Amazon */}
        <td className="px-3 py-3">
          <a href={lead.amazonUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-xs text-orange-600 hover:underline font-medium">
            Amazon <ExternalLink className="w-3 h-3" />
          </a>
          <div className="text-xs text-gray-500 mt-0.5">{formatCurrency(lead.amazonPrice)}</div>
        </td>

        {/* Profit */}
        <td className="px-3 py-3 text-right">
          <div className={`text-sm font-bold ${lead.netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {formatCurrency(lead.netProfit)}
          </div>
          <div className="text-xs text-gray-400">{lead.roi.toFixed(1)}% ROI</div>
        </td>

        {/* BSR */}
        <td className="px-3 py-3 text-right">
          <div className="text-sm text-gray-700 dark:text-gray-300">{lead.bsr ? `#${lead.bsr.toLocaleString()}` : '—'}</div>
          <div className="text-xs text-gray-400">{lead.fbaSellers} FBA</div>
        </td>

        {/* Status */}
        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={lead.status} onChange={(s) => onStatusChange(lead.id, s)} />
        </td>

        {/* Expand toggle */}
        <td className="px-3 py-3">
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-purple-50/30 dark:bg-purple-900/10">
          <td colSpan={8} className="px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Score breakdown */}
              <div className="col-span-2 space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Score Breakdown</div>
                <ScoreBar label="ROI"         value={lead.scoreBreakdown.roi} />
                <ScoreBar label="Profit"      value={lead.scoreBreakdown.profit} />
                <ScoreBar label="Velocity"    value={lead.scoreBreakdown.velocity} />
                <ScoreBar label="Competition" value={lead.scoreBreakdown.competition} />
                <ScoreBar label="Risk"        value={lead.scoreBreakdown.risk} />
              </div>
              {/* Profit math */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Profit Math</div>
                <div className="space-y-1">
                  {[
                    ['Source Price',    formatCurrency(lead.sourcePrice)],
                    ['Final Cost',      formatCurrency(lead.finalCost)],
                    ['Amazon Sell',     formatCurrency(lead.amazonPrice)],
                    ['Amazon Fees',     formatCurrency(lead.amazonPrice - lead.netProfit - lead.finalCost)],
                    ['Net Profit',      formatCurrency(lead.netProfit)],
                    ['ROI',             `${lead.roi.toFixed(1)}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-gray-400">{k}</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Links */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Links</div>
                <div className="space-y-2">
                  <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <ExternalLink className="w-3 h-3" />{lead.sourceRetailer}
                  </a>
                  <a href={lead.amazonUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-orange-600 hover:underline">
                    <ExternalLink className="w-3 h-3" />Amazon
                  </a>
                  <a href={`https://keepa.com/#!product/1-${lead.asin}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-purple-600 hover:underline">
                    <TrendingUp className="w-3 h-3" />Keepa History
                  </a>
                </div>
                {lead.alertSent && (
                  <div className="mt-2 text-[10px] text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />Discord alert sent
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scrapeQuery, setScrapeQuery] = useState('');
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [minRoi, setMinRoi] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showJobs, setShowJobs] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '25',
        minScore: String(minScore),
        minRoi: String(minRoi),
        sortBy: 'score',
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      const res = await fetch(`/api/leads?${params}`);
      if (!res.ok) return;
      const data = await res.json() as { data: Lead[]; total: number };
      setLeads(data.data);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [page, minScore, minRoi, statusFilter]);

  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const res = await fetch('/api/scrape');
      if (!res.ok) return;
      const data = await res.json() as { jobs: ScrapeJob[] };
      setJobs(data.jobs);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  async function handleScrape(e: React.FormEvent) {
    e.preventDefault();
    if (!scrapeQuery.trim()) return;
    setScrapeLoading(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: scrapeQuery }),
      });
      if (res.ok) {
        setScrapeQuery('');
        setShowJobs(true);
        await fetchJobs();
      }
    } finally {
      setScrapeLoading(false);
    }
  }

  async function handleStatusChange(leadId: string, status: string) {
    await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: leadId, status }),
    });
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status } : l));
  }

  const hotCount   = leads.filter((l) => l.score >= 80).length;
  const goodCount  = leads.filter((l) => l.score >= 60 && l.score < 80).length;
  const newCount   = leads.filter((l) => l.status === 'NEW').length;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center shadow shadow-red-200">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Leads</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Scrape → Enrich → Score pipeline</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLeads} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Leads', value: total, icon: Flame, color: 'text-gray-700 dark:text-gray-200' },
          { label: 'HOT (80+)',   value: hotCount,  icon: Flame, color: 'text-red-500' },
          { label: 'New',         value: newCount,  icon: Clock, color: 'text-purple-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-3">
            <Icon className={`w-5 h-5 ${color}`} />
            <div>
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-400">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Scrape trigger */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Play className="w-4 h-4 text-purple-600" />
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Trigger Amazon Scrape</span>
          <button
            onClick={() => { setShowJobs(!showJobs); if (!showJobs) fetchJobs(); }}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
          >
            {showJobs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Job history
          </button>
        </div>
        <form onSubmit={handleScrape} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={scrapeQuery}
              onChange={(e) => setScrapeQuery(e.target.value)}
              placeholder="Search term to scrape on Amazon (e.g. 'electric toothbrush')"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <button
            type="submit"
            disabled={scrapeLoading || !scrapeQuery.trim()}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors"
          >
            {scrapeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {scrapeLoading ? 'Queuing…' : 'Scrape'}
          </button>
        </form>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Launches a Playwright browser, scrapes Amazon search results, enriches with Walmart pricing, scores each lead. Worker must be running.
        </p>

        {/* Job history */}
        {showJobs && (
          <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Recent Jobs</span>
              <button onClick={fetchJobs} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <RefreshCw className={`w-3 h-3 ${jobsLoading ? 'animate-spin' : ''}`} />Refresh
              </button>
            </div>
            {jobs.length === 0 ? (
              <p className="text-xs text-gray-400">No jobs yet — trigger a scrape above.</p>
            ) : (
              <div className="space-y-2">
                {jobs.slice(0, 5).map((job) => (
                  <div key={job.id} className="flex items-center gap-3 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                    <JobStatusChip status={job.status} />
                    <span className="text-gray-700 dark:text-gray-300 font-medium flex-1 truncate">"{job.query}"</span>
                    <span className="text-gray-400">{job.itemsFound} found · {job.leadsCreated} leads</span>
                    {job.error && <span title={job.error}><AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" /></span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 px-5 py-3 flex items-center gap-4 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400" />
        <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          Min Score
          <select value={minScore} onChange={(e) => { setMinScore(Number(e.target.value)); setPage(1); }}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500">
            {[0,40,60,70,80].map((v) => <option key={v} value={v}>{v}+</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          Min ROI
          <select value={minRoi} onChange={(e) => { setMinRoi(Number(e.target.value)); setPage(1); }}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500">
            {[0,25,30,40,50].map((v) => <option key={v} value={v}>{v}%+</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          Status
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500">
            <option value="">All</option>
            {['NEW','REVIEWED','PURCHASED','PASSED','EXPIRED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <span className="ml-auto text-xs text-gray-400">{total} leads total</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-16 text-center">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto" />
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-16 text-center">
          <Flame className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No leads yet</p>
          <p className="text-sm text-gray-400 mt-1">Trigger a scrape above — results appear here after the worker processes them</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/80">
                  {['Score','Product','Source','Amazon','Profit','BSR / FBA','Status',''].map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap first:px-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {leads.map((lead) => (
                  <LeadRow key={lead.id} lead={lead} onStatusChange={handleStatusChange} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {total > 25 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">{total} total leads</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Prev
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300">Page {page}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={page * 25 >= total}
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
