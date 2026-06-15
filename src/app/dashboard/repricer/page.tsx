'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Zap, Settings2, Play, Pause,
  RefreshCw, ChevronDown, ChevronUp, Package, Trophy, AlertTriangle,
  CheckCircle2, Loader2, Eye, EyeOff, Clock, ArrowUpDown, X,
} from 'lucide-react';
import type { SellerListing, RepricerRule, RepricerLog, RepricingStrategy, PricingDecision } from '@/types';

// ─── constants ─────────────────────────────────────────────────────────────────

const STRATEGIES: { value: RepricingStrategy; label: string; desc: string; color: string }[] = [
  { value: 'WIN_BUY_BOX',      label: 'Win Buy Box',      desc: 'Undercut to own the Buy Box',         color: 'bg-blue-100 text-blue-700'   },
  { value: 'MAXIMIZE_PROFIT',  label: 'Maximize Profit',  desc: 'AI-optimized margin vs velocity',     color: 'bg-purple-100 text-purple-700' },
  { value: 'STAY_COMPETITIVE', label: 'Stay Competitive', desc: 'Match lowest FBA price',              color: 'bg-green-100 text-green-700'  },
  { value: 'FLOOR_PRICE',      label: 'Floor Price',      desc: 'Hold minimum price floor',            color: 'bg-orange-100 text-orange-700'},
];

const BUY_BOX_CONFIG = {
  SELF:      { label: 'You',       cls: 'bg-green-100 text-green-700',  icon: '🏆' },
  AMAZON:    { label: 'Amazon',    cls: 'bg-orange-100 text-orange-700', icon: '📦' },
  OTHER_FBA: { label: 'FBA Rival', cls: 'bg-blue-100 text-blue-700',    icon: '🔵' },
  OTHER_FBM: { label: 'FBM Rival', cls: 'bg-yellow-100 text-yellow-700', icon: '🟡' },
  NONE:      { label: 'No Box',    cls: 'bg-gray-100 text-gray-500',    icon: '—'  },
};

// ─── sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, highlight }: {
  label: string; value: string; sub?: string; icon: React.ElementType; highlight?: 'green' | 'blue' | 'purple';
}) {
  const iconColor = highlight === 'green' ? 'text-green-600' : highlight === 'blue' ? 'text-blue-600' : highlight === 'purple' ? 'text-purple-600' : 'text-gray-400';
  const valColor  = highlight === 'green' ? 'text-green-700' : highlight === 'blue' ? 'text-blue-700' : highlight === 'purple' ? 'text-purple-700' : 'text-gray-900';
  const bg        = highlight ? (highlight === 'green' ? 'border-green-200 bg-green-50' : highlight === 'blue' ? 'border-blue-200 bg-blue-50' : 'border-purple-200 bg-purple-50') : 'border-gray-100 bg-white';
  return (
    <div className={`rounded-2xl border p-5 ${bg}`}>
      <Icon className={`w-5 h-5 mb-2 ${iconColor}`} />
      <div className={`text-2xl font-bold ${valColor}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  if (action === 'INCREASE') return <span className="flex items-center gap-1 text-xs font-semibold text-green-600"><TrendingUp className="w-3 h-3" />Raised</span>;
  if (action === 'DECREASE') return <span className="flex items-center gap-1 text-xs font-semibold text-red-500"><TrendingDown className="w-3 h-3" />Lowered</span>;
  return <span className="flex items-center gap-1 text-xs font-semibold text-gray-400"><Minus className="w-3 h-3" />Held</span>;
}

function StrategyBadge({ strategy }: { strategy: RepricingStrategy }) {
  const cfg = STRATEGIES.find((s) => s.value === strategy);
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg?.color ?? 'bg-gray-100 text-gray-600'}`}>{cfg?.label ?? strategy}</span>;
}

function ProductThumb({ imageUrl, name }: { imageUrl?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !imageUrl) return <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><Package className="w-5 h-5 text-gray-300" /></div>;
  return (
    <div className="w-10 h-10 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden shrink-0">
      <img src={imageUrl} alt={name} className="w-full h-full object-contain" onError={() => setFailed(true)} />
    </div>
  );
}

// ─── connect form ──────────────────────────────────────────────────────────────

interface Creds { clientId: string; clientSecret: string; refreshToken: string; sellerId: string; }

function ConnectForm({ onConnect }: { onConnect: (c: Creds) => void }) {
  const [form, setForm] = useState<Creds>({ clientId: '', clientSecret: '', refreshToken: '', sellerId: '' });
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle');

  async function handleTest() {
    setTesting(true); setStatus('idle');
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form }),
      });
      setStatus(res.ok ? 'ok' : 'err');
    } catch { setStatus('err'); } finally { setTesting(false); }
  }

  function handleConnect() {
    sessionStorage.setItem('repricer_creds', JSON.stringify(form));
    onConnect(form);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-lg mx-auto mt-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <ArrowUpDown className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900">Connect Seller Central</h2>
          <p className="text-sm text-gray-400">Link your SP-API credentials to enable live repricing</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-xs text-blue-700">
        Credentials are stored only in your browser session and never sent to our servers unencrypted.
      </div>

      <div className="space-y-3">
        {(['clientId', 'clientSecret', 'refreshToken', 'sellerId'] as const).map((key) => {
          const labels: Record<string, string> = { clientId: 'LWA Client ID', clientSecret: 'LWA Client Secret', refreshToken: 'SP-API Refresh Token', sellerId: 'Seller ID (Merchant Token)' };
          const sensitive = key !== 'clientId' && key !== 'sellerId';
          return (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{labels[key]}</label>
              <div className="relative">
                <input
                  type={sensitive && !show ? 'password' : 'text'}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={sensitive ? '••••••••••••' : key === 'sellerId' ? 'A2EXA...' : 'amzn1.application-oa2-client...'}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                />
              </div>
            </div>
          );
        })}
        <button type="button" onClick={() => setShow(!show)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {show ? 'Hide' : 'Show'} credentials
        </button>
      </div>

      {status === 'ok' && <p className="text-xs text-green-600 flex items-center gap-1 mt-3"><CheckCircle2 className="w-3.5 h-3.5" />Credentials verified</p>}
      {status === 'err' && <p className="text-xs text-red-500 flex items-center gap-1 mt-3"><AlertTriangle className="w-3.5 h-3.5" />Could not verify — check credentials</p>}

      <div className="flex gap-2 mt-5">
        <button onClick={handleTest} disabled={testing || !form.clientId} className="flex items-center gap-2 text-sm border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-40">
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Test Connection
        </button>
        <button onClick={handleConnect} className="flex-1 flex items-center justify-center gap-2 text-sm bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors font-medium">
          <ArrowUpDown className="w-4 h-4" /> Connect & Load Listings
        </button>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 text-center">
        <button onClick={() => onConnect({ clientId: '', clientSecret: '', refreshToken: '', sellerId: '' })} className="text-xs text-gray-400 hover:text-gray-600 underline">
          Continue in demo mode (mock data)
        </button>
      </div>
    </div>
  );
}

// ─── rule editor ───────────────────────────────────────────────────────────────

interface RuleEditorProps {
  listing: SellerListing;
  existingRule?: RepricerRule;
  onSave: (rule: Partial<RepricerRule>) => Promise<void>;
  onClose: () => void;
}

function RuleEditor({ listing, existingRule, onSave, onClose }: RuleEditorProps) {
  const [strategy, setStrategy] = useState<RepricingStrategy>(existingRule?.strategy ?? 'WIN_BUY_BOX');
  const [minPrice, setMinPrice] = useState(existingRule?.minPrice ?? Math.round(listing.currentPrice * 0.85 * 100) / 100);
  const [maxPrice, setMaxPrice] = useState(existingRule?.maxPrice ?? Math.round(listing.currentPrice * 1.15 * 100) / 100);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({ asin: listing.asin, sku: listing.sku, productName: listing.productName, strategy, minPrice, maxPrice });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900">Repricing Rule</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[280px]">{listing.productName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Strategy</label>
            <div className="grid grid-cols-2 gap-2">
              {STRATEGIES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStrategy(s.value)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${strategy === s.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="text-xs font-semibold text-gray-900">{s.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Min Price ($)</label>
              <input type="number" step="0.01" value={minPrice} onChange={(e) => setMinPrice(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Max Price ($)</label>
              <input type="number" step="0.01" value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
            <div className="flex justify-between"><span>Current price</span><span className="font-medium">${listing.currentPrice.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Buy Box price</span><span className="font-medium">{listing.buyBoxPrice ? `$${listing.buyBoxPrice.toFixed(2)}` : '—'}</span></div>
            <div className="flex justify-between"><span>Lowest FBA</span><span className="font-medium">{listing.lowestFbaPrice ? `$${listing.lowestFbaPrice.toFixed(2)}` : '—'}</span></div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 text-sm border border-gray-200 text-gray-600 py-2.5 rounded-xl hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving || minPrice >= maxPrice} className="flex-1 flex items-center justify-center gap-2 text-sm bg-blue-600 text-white py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-40 font-medium">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {existingRule ? 'Update Rule' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── main page ─────────────────────────────────────────────────────────────────

export default function RepricerPage() {
  const [connected, setConnected] = useState(false);
  const [creds, setCreds] = useState<Creds | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [rules, setRules] = useState<RepricerRule[]>([]);
  const [history, setHistory] = useState<RepricerLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [repricingId, setRepricingId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, PricingDecision>>({});
  const [tab, setTab] = useState<'listings' | 'history' | 'settings'>('listings');
  const [editListing, setEditListing] = useState<SellerListing | null>(null);
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

  // Restore saved creds on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('repricer_creds');
    if (saved) {
      try { setCreds(JSON.parse(saved)); setConnected(true); } catch { /* ignore */ }
    }
  }, []);

  const fetchListings = useCallback(async (c: Creds) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (c.clientId) { params.set('clientId', c.clientId); params.set('clientSecret', c.clientSecret); params.set('refreshToken', c.refreshToken); params.set('sellerId', c.sellerId); }
      const res = await fetch(`/api/repricer/listings?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setListings(data.data ?? []);
      setIsDemo(data.demo ?? true);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/repricer/rules');
      if (!res.ok) return;
      const data = await res.json();
      setRules(data.data ?? []);
    } catch { /* ignore */ }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/repricer/history?limit=50');
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data.data ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (connected && creds) {
      fetchListings(creds);
      fetchRules();
      fetchHistory();
    }
  }, [connected, creds, fetchListings, fetchRules, fetchHistory]);

  function handleConnect(c: Creds) {
    setCreds(c);
    setConnected(true);
    setIsDemo(!c.clientId);
  }

  async function handleReprice(listing: SellerListing) {
    setRepricingId(listing.sku);
    try {
      const rule = rules.find((r) => r.sku === listing.sku);
      const res = await fetch('/api/repricer/reprice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing,
          ruleId: rule?.id,
          demo: isDemo,
          ...(creds?.clientId ? creds : {}),
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.data?.decision) {
        setDecisions((prev) => ({ ...prev, [listing.sku]: data.data.decision }));
        // Update listing's currentPrice to reflect applied price
        setListings((prev) => prev.map((l) =>
          l.sku === listing.sku ? { ...l, currentPrice: data.data.decision.recommendedPrice } : l
        ));
        fetchHistory();
      }
    } catch { /* ignore */ } finally { setRepricingId(null); }
  }

  async function handleRepriceAll() {
    for (const listing of listings) {
      const rule = rules.find((r) => r.sku === listing.sku);
      if (rule?.enabled !== false) await handleReprice(listing);
    }
  }

  async function handleSaveRule(ruleData: Partial<RepricerRule>) {
    try {
      const res = await fetch('/api/repricer/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData),
      });
      if (!res.ok) return;
      await fetchRules();
    } catch { /* ignore */ }
    setEditListing(null);
  }

  async function handleToggleRule(rule: RepricerRule) {
    try {
      const res = await fetch('/api/repricer/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      if (!res.ok) return;
      await fetchRules();
    } catch { /* ignore */ }
  }

  // ── stats ──────────────────────────────────────────────────────────────────
  const activeRulesCount = rules.filter((r) => r.enabled).length;
  const changesCount = history.filter((h) => {
    const d = new Date(h.createdAt);
    const now = new Date();
    return now.getTime() - d.getTime() < 86400000;
  }).length;
  const buyBoxWins = listings.filter((l) => l.buyBoxStatus === 'SELF').length;
  const buyBoxRate = listings.length > 0 ? Math.round((buyBoxWins / listings.length) * 100) : 0;
  const revenueImpact = history.reduce((sum, h) => sum + (h.newPrice - h.oldPrice), 0);

  if (!connected) {
    return (
      <div className="p-6 lg:p-8 max-w-[700px]">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Repricer</h1>
          <p className="text-sm text-gray-500 mt-0.5">Automatically optimize your Amazon prices using AI — powered by real-time competitive data</p>
        </div>
        <ConnectForm onConnect={handleConnect} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">AI Repricer</h1>
            {isDemo && <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full font-medium">Demo mode</span>}
            {!isDemo && <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium"><CheckCircle2 className="w-3 h-3" />Live</span>}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{listings.length} active listings · AI pricing strategies</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => creds && fetchListings(creds)} className="flex items-center gap-2 text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" />Refresh
          </button>
          <button
            onClick={handleRepriceAll}
            disabled={!!repricingId || listings.length === 0}
            className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-40"
          >
            {repricingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Run AI Reprice All
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Rules"      value={String(activeRulesCount)}           icon={Settings2}   highlight="blue"   sub={`${rules.length} total rules`} />
        <StatCard label="Repriced Today"    value={String(changesCount)}                icon={Zap}         highlight="purple" sub="price changes in 24h" />
        <StatCard label="Buy Box Win Rate"  value={`${buyBoxRate}%`}                   icon={Trophy}      highlight="green"  sub={`${buyBoxWins} of ${listings.length} listings`} />
        <StatCard label="Revenue Impact"    value={`${revenueImpact >= 0 ? '+' : ''}$${Math.abs(revenueImpact).toFixed(2)}`} icon={TrendingUp} sub="vs. previous prices" />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-100">
        <div className="flex gap-1">
          {([['listings', 'Listings'], ['history', 'Activity Log'], ['settings', 'Settings']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Listings Tab */}
      {tab === 'listings' && (
        loading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : listings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No listings found</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Price</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Buy Box</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lowest FBA</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rivals</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Strategy</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Decision</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {listings.map((listing) => {
                  const rule = rules.find((r) => r.sku === listing.sku);
                  const decision = decisions[listing.sku];
                  const bbCfg = BUY_BOX_CONFIG[listing.buyBoxStatus];
                  const isExpanded = expandedSku === listing.sku;
                  const isRunning = repricingId === listing.sku;

                  return (
                    <React.Fragment key={listing.sku}>
                      <tr className="hover:bg-gray-50/50 cursor-pointer" onClick={() => setExpandedSku(isExpanded ? null : listing.sku)}>
                        {/* Product */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <ProductThumb imageUrl={listing.imageUrl} name={listing.productName} />
                            <div>
                              <div className="font-medium text-gray-900 text-sm max-w-[220px] truncate">{listing.productName}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-gray-400 font-mono">{listing.sku}</span>
                                <span className="text-xs text-gray-300">·</span>
                                <span className="text-xs text-gray-400">{listing.asin}</span>
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">{listing.fulfillableQty} units · {listing.fulfillmentChannel}</div>
                            </div>
                          </div>
                        </td>

                        {/* Your Price */}
                        <td className="px-3 py-3 text-right">
                          <div className="font-bold text-gray-900">${listing.currentPrice.toFixed(2)}</div>
                          {rule && <div className="text-xs text-gray-400">${rule.minPrice.toFixed(2)} – ${rule.maxPrice.toFixed(2)}</div>}
                        </td>

                        {/* Buy Box */}
                        <td className="px-3 py-3 text-right">
                          <div className="font-medium text-gray-900">{listing.buyBoxPrice ? `$${listing.buyBoxPrice.toFixed(2)}` : '—'}</div>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${bbCfg.cls}`}>{bbCfg.icon} {bbCfg.label}</span>
                        </td>

                        {/* Lowest FBA */}
                        <td className="px-3 py-3 text-right">
                          <div className="text-gray-700">{listing.lowestFbaPrice ? `$${listing.lowestFbaPrice.toFixed(2)}` : '—'}</div>
                          {listing.lowestFbmPrice && <div className="text-xs text-gray-400">FBM: ${listing.lowestFbmPrice.toFixed(2)}</div>}
                        </td>

                        {/* Rivals */}
                        <td className="px-3 py-3 text-center">
                          <span className="text-gray-700 font-medium">{listing.competitorCount}</span>
                        </td>

                        {/* Strategy */}
                        <td className="px-3 py-3">
                          {rule ? <StrategyBadge strategy={rule.strategy as RepricingStrategy} /> : <span className="text-xs text-gray-300 italic">No rule</span>}
                          {rule && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <button onClick={(e) => { e.stopPropagation(); handleToggleRule(rule); }}
                                className={`w-7 h-4 rounded-full transition-colors relative ${rule.enabled ? 'bg-blue-500' : 'bg-gray-200'}`}>
                                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm ${rule.enabled ? 'left-3.5' : 'left-0.5'}`} />
                              </button>
                              <span className="text-[10px] text-gray-400">{rule.enabled ? 'On' : 'Off'}</span>
                            </div>
                          )}
                        </td>

                        {/* AI Decision */}
                        <td className="px-3 py-3 text-center">
                          {decision ? (
                            <div>
                              <ActionBadge action={decision.action} />
                              <div className="text-xs font-bold text-gray-900 mt-0.5">${decision.recommendedPrice.toFixed(2)}</div>
                              <div className="text-[10px] text-gray-400">{decision.confidence}% conf.</div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleReprice(listing)}
                              disabled={isRunning}
                              title="Run AI reprice"
                              className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-40"
                            >
                              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setEditListing(listing)} title="Edit rule" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                              <Settings2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => setExpandedSku(isExpanded ? null : listing.sku)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <tr className="bg-blue-50/30">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                              <div><div className="text-gray-400 font-medium mb-0.5">Sales Rank</div><div className="text-gray-700 font-medium">{listing.salesRank ? `#${listing.salesRank.toLocaleString()}` : '—'}</div></div>
                              <div><div className="text-gray-400 font-medium mb-0.5">Fulfillable Qty</div><div className="text-gray-700 font-medium">{listing.fulfillableQty} units</div></div>
                              <div><div className="text-gray-400 font-medium mb-0.5">Condition</div><div className="text-gray-700 font-medium">{listing.condition}</div></div>
                              <div><div className="text-gray-400 font-medium mb-0.5">Channel</div><div className="text-gray-700 font-medium">{listing.fulfillmentChannel}</div></div>
                              {decision && (
                                <div className="col-span-2 md:col-span-4 bg-white rounded-xl border border-blue-100 p-3">
                                  <div className="flex items-start gap-2">
                                    <Zap className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                                    <div>
                                      <div className="font-semibold text-gray-800 text-xs mb-1">AI Reasoning</div>
                                      <div className="text-gray-600">{decision.reason}</div>
                                      <div className="flex items-center gap-4 mt-2">
                                        <span>Confidence: <strong>{decision.confidence}%</strong></span>
                                        <span>Buy Box odds: <strong>{decision.estimatedBuyBoxOdds}%</strong></span>
                                        <span>New price: <strong>${decision.recommendedPrice.toFixed(2)}</strong></span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {history.length === 0 ? (
            <div className="p-16 text-center">
              <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No activity yet</p>
              <p className="text-sm text-gray-400 mt-1">Run AI Reprice to see pricing decisions here</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Old Price</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">New Price</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Strategy</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-sm max-w-[200px] truncate">{log.productName}</div>
                      <div className="text-xs text-gray-400 font-mono">{log.sku}</div>
                    </td>
                    <td className="px-3 py-3 text-center"><ActionBadge action={log.action} /></td>
                    <td className="px-3 py-3 text-right text-gray-500 line-through">${log.oldPrice.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right font-bold text-gray-900">${log.newPrice.toFixed(2)}</td>
                    <td className="px-3 py-3"><StrategyBadge strategy={log.strategy as RepricingStrategy} /></td>
                    <td className="px-3 py-3 text-xs text-gray-500 max-w-[240px]">{log.reason}</td>
                    <td className="px-3 py-3 text-right text-xs text-gray-400">
                      {new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {tab === 'settings' && (
        <div className="max-w-lg space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Connection</h3>
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <div>
                <div className="text-sm font-medium text-gray-900">Amazon Seller Central</div>
                <div className="text-xs text-gray-400 mt-0.5">{isDemo ? 'Demo mode — connect SP-API for live data' : 'Connected via SP-API'}</div>
              </div>
              {isDemo ? (
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">Demo</span>
              ) : (
                <span className="text-xs bg-green-100 text-green-700 flex items-center gap-1 px-2 py-1 rounded-full"><CheckCircle2 className="w-3 h-3" />Live</span>
              )}
            </div>
            <button onClick={() => { sessionStorage.removeItem('repricer_creds'); setConnected(false); setCreds(null); }}
              className="text-sm text-red-500 hover:text-red-700">
              Disconnect account
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-3">
            <h3 className="font-semibold text-gray-900">Repricing Rules</h3>
            <p className="text-sm text-gray-500">{rules.length} rules configured across {listings.length} listings</p>
            {rules.length > 0 && (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="text-sm font-medium text-gray-900 truncate max-w-[240px]">{rule.productName}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StrategyBadge strategy={rule.strategy as RepricingStrategy} />
                        <span className="text-xs text-gray-400">${rule.minPrice.toFixed(2)}–${rule.maxPrice.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleToggleRule(rule)} className={`w-8 h-5 rounded-full relative transition-colors ${rule.enabled ? 'bg-blue-500' : 'bg-gray-200'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${rule.enabled ? 'left-3.5' : 'left-0.5'}`} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rule editor modal */}
      {editListing && (
        <RuleEditor
          listing={editListing}
          existingRule={rules.find((r) => r.sku === editListing.sku)}
          onSave={handleSaveRule}
          onClose={() => setEditListing(null)}
        />
      )}
    </div>
  );
}
