'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Warehouse, Link2, CheckCircle2, AlertCircle, Loader2,
  RefreshCw, ExternalLink, ChevronDown, ChevronUp,
  Package, ArrowDownToLine, Clock, XCircle, Info,
  Eye, EyeOff,
} from 'lucide-react';
import { formatNumber, truncate } from '@/lib/utils';
import type { InventoryItem } from '@/services/amazon/inventory';

const MARKETPLACES = [
  { id: 'ATVPDKIKX0DER', label: 'Amazon.com (US)' },
  { id: 'A2EUQ1WTGCTBG2', label: 'Amazon.ca (Canada)' },
  { id: 'A1AM78C64UM0Y8', label: 'Amazon.com.mx (Mexico)' },
  { id: 'A1F83G8C2ARO7P', label: 'Amazon.co.uk (UK)' },
  { id: 'A1PA6795UKMFR9', label: 'Amazon.de (Germany)' },
];

interface Credentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  marketplaceId: string;
}

const STORAGE_KEY = 'amz_inventory_creds';

function loadCreds(): Credentials | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCreds(creds: Credentials) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

function clearCreds() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// ─────────────────────────────────────────────
// Summary card
// ─────────────────────────────────────────────
function SummaryCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  const colors: Record<string, string> = {
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className={`w-9 h-9 rounded-xl ${colors[color]} flex items-center justify-center mb-3`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="text-2xl font-bold text-gray-900">{formatNumber(value)}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────
// Quantity pill
// ─────────────────────────────────────────────
function Qty({ value, label, color }: { value: number; label: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    blue: 'bg-blue-100 text-blue-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-600',
    yellow: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <div className="text-center">
      <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors[color]}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Connect form
// ─────────────────────────────────────────────
function ConnectForm({ onConnect }: { onConnect: (creds: Credentials) => void }) {
  const [form, setForm] = useState<Credentials>({
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    marketplaceId: 'ATVPDKIKX0DER',
  });
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function update(k: keyof Credentials, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
    setTestResult(null);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setTestResult({ ok: data.success, msg: data.message ?? data.error ?? 'Unknown' });
    } catch {
      setTestResult({ ok: false, msg: 'Network error' });
    }
    setTesting(false);
  }

  function handleConnect() {
    saveCreds(form);
    onConnect(form);
  }

  const filled = form.clientId && form.clientSecret && form.refreshToken;

  return (
    <div className="max-w-2xl">
      {/* How to get credentials */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 space-y-1">
            <p className="font-semibold">How to get your SP-API credentials</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700">
              <li>Go to <strong>sellercentral.amazon.com</strong> → Apps &amp; Services → Develop Apps</li>
              <li>Create a new app and note your <strong>Client ID</strong> and <strong>Client Secret</strong></li>
              <li>Under Authorize, generate a <strong>Refresh Token</strong> for your selling account</li>
              <li>Required SP-API roles: <em>Amazon Fulfillment Network</em></li>
            </ol>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Client ID (LWA)
          </label>
          <input
            value={form.clientId}
            onChange={(e) => update('clientId', e.target.value)}
            placeholder="amzn1.application-oa2-client.xxxxxxxx"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Client Secret
          </label>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={form.clientSecret}
              onChange={(e) => update('clientSecret', e.target.value)}
              placeholder="••••••••••••••••••••••••••••••••"
              className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Refresh Token
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={form.refreshToken}
              onChange={(e) => update('refreshToken', e.target.value)}
              placeholder="Atzr|IwEBIxxxxxxxx…"
              className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Marketplace
          </label>
          <select
            value={form.marketplaceId}
            onChange={(e) => update('marketplaceId', e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {MARKETPLACES.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
            testResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {testResult.msg}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleTest}
            disabled={!filled || testing}
            className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {testing && <Loader2 className="w-4 h-4 animate-spin" />}
            Test Connection
          </button>
          <button
            onClick={handleConnect}
            disabled={!filled}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors shadow-md shadow-green-200"
          >
            <Link2 className="w-4 h-4" />
            Connect &amp; Load Inventory
          </button>
        </div>

        <p className="text-xs text-gray-400 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Credentials are stored only in your browser session and never saved to our servers.
          They are sent directly to Amazon&apos;s API each time you load inventory.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
export default function InventoryPage() {
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Load saved session credentials on mount
  useEffect(() => {
    const saved = loadCreds();
    if (saved) {
      setCreds(saved);
    }
  }, []);

  const fetchInventory = useCallback(async (conn: Credentials | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = conn
        ? `?clientId=${encodeURIComponent(conn.clientId)}&clientSecret=${encodeURIComponent(conn.clientSecret)}&refreshToken=${encodeURIComponent(conn.refreshToken)}&marketplaceId=${conn.marketplaceId}`
        : '';
      const res = await fetch(`/api/inventory${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setItems(data.data);
      setIsDemo(data.demo);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory');
    }
    setLoading(false);
  }, []);

  // Auto-load when credentials are set
  useEffect(() => {
    if (creds) fetchInventory(creds);
  }, [creds, fetchInventory]);

  // Load demo on first visit (no creds)
  useEffect(() => {
    if (!loadCreds()) fetchInventory(null);
  }, [fetchInventory]);

  function handleConnect(newCreds: Credentials) {
    setCreds(newCreds);
  }

  function handleDisconnect() {
    clearCreds();
    setCreds(null);
    fetchInventory(null);
  }

  // Derived totals
  const totals = items.reduce(
    (acc, item) => {
      acc.fulfillable += item.inventoryDetails.fulfillableQuantity;
      acc.inbound += item.inventoryDetails.inboundWorkingQuantity + item.inventoryDetails.inboundShippedQuantity + item.inventoryDetails.inboundReceivingQuantity;
      acc.reserved += item.inventoryDetails.reservedQuantity.totalReservedQuantity;
      acc.unfulfillable += item.inventoryDetails.unfulfillableQuantity;
      acc.total += item.totalQuantity;
      return acc;
    },
    { fulfillable: 0, inbound: 0, reserved: 0, unfulfillable: 0, total: 0 },
  );

  const filtered = items.filter(
    (i) =>
      !search ||
      i.productName.toLowerCase().includes(search.toLowerCase()) ||
      i.asin.toLowerCase().includes(search.toLowerCase()) ||
      i.sellerSku.toLowerCase().includes(search.toLowerCase()),
  );

  const connected = !!creds && !isDemo;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Amazon FBA Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Live view of your FBA inventory from Amazon SP-API
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border ${
            connected
              ? 'bg-green-50 border-green-200 text-green-700'
              : isDemo
              ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
              : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}>
            {connected
              ? <><CheckCircle2 className="w-3.5 h-3.5" /> Connected — Live Data</>
              : <><AlertCircle className="w-3.5 h-3.5" /> Demo Mode</>
            }
          </div>

          {connected && (
            <button
              onClick={handleDisconnect}
              className="text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-xl border border-gray-200 transition-colors"
            >
              Disconnect
            </button>
          )}

          <button
            onClick={() => fetchInventory(creds)}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Last refreshed */}
      {lastRefreshed && (
        <p className="text-xs text-gray-400 -mt-2">
          Last updated: {lastRefreshed.toLocaleTimeString()}
          {isDemo && ' · '}
          {isDemo && <span className="text-yellow-600 font-medium">Showing demo data — connect your account to see live inventory</span>}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-0.5">Failed to load inventory</div>
            <div className="text-red-600">{error}</div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <SummaryCard label="Total Units" value={totals.total} icon={Warehouse} color="blue" sub={`${items.length} SKUs`} />
          <SummaryCard label="Fulfillable" value={totals.fulfillable} icon={CheckCircle2} color="green" sub="Ready to ship" />
          <SummaryCard label="Inbound" value={totals.inbound} icon={ArrowDownToLine} color="purple" sub="En route to FBA" />
          <SummaryCard label="Reserved" value={totals.reserved} icon={Clock} color="orange" sub="Pending orders" />
          <SummaryCard label="Unfulfillable" value={totals.unfulfillable} icon={XCircle} color="red" sub="Needs action" />
        </div>
      )}

      {/* Connect form (shown when not connected) */}
      {!connected && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-sm font-medium text-gray-400 px-3">Connect your Amazon account</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <ConnectForm onConnect={handleConnect} />
        </div>
      )}

      {/* Inventory table */}
      {items.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* Table header with search */}
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-100">
            <div className="relative w-72">
              <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search SKU, ASIN, or product name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <span className="text-sm text-gray-400">
              <span className="font-semibold text-gray-700">{filtered.length}</span> SKUs
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-7 h-7 animate-spin text-green-500" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80">
                    {['Product', 'ASIN / SKU', 'Fulfillable', 'Inbound', 'Reserved', 'Unfulfillable', 'Total', 'Updated', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((item) => {
                    const expanded = expandedSku === item.fnSku;
                    const lowStock = item.inventoryDetails.fulfillableQuantity <= 3;
                    const outOfStock = item.inventoryDetails.fulfillableQuantity === 0;

                    return (
                      <React.Fragment key={item.fnSku}>
                        <tr
                          className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                          onClick={() => setExpandedSku(expanded ? null : item.fnSku)}
                        >
                          {/* Product */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              {outOfStock ? (
                                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" title="Out of stock" />
                              ) : lowStock ? (
                                <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" title="Low stock" />
                              ) : (
                                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" title="In stock" />
                              )}
                              <div>
                                <div className="font-medium text-gray-900 leading-tight">
                                  {truncate(item.productName, 40)}
                                </div>
                                <div className="text-xs text-gray-400 mt-0.5">{item.condition}</div>
                              </div>
                            </div>
                          </td>

                          {/* ASIN / SKU */}
                          <td className="px-4 py-3.5">
                            <a
                              href={`https://www.amazon.com/dp/${item.asin}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-mono text-xs"
                            >
                              {item.asin} <ExternalLink className="w-3 h-3" />
                            </a>
                            <div className="text-xs text-gray-400 font-mono mt-0.5">{item.sellerSku}</div>
                          </td>

                          {/* Fulfillable */}
                          <td className="px-4 py-3.5 text-center">
                            <span className={`inline-block text-sm font-bold px-2.5 py-0.5 rounded-full ${
                              outOfStock ? 'bg-red-100 text-red-700'
                              : lowStock ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-green-100 text-green-700'
                            }`}>
                              {item.inventoryDetails.fulfillableQuantity}
                            </span>
                          </td>

                          {/* Inbound */}
                          <td className="px-4 py-3.5 text-center">
                            <span className={`text-sm font-semibold ${
                              (item.inventoryDetails.inboundWorkingQuantity + item.inventoryDetails.inboundShippedQuantity + item.inventoryDetails.inboundReceivingQuantity) > 0
                                ? 'text-purple-600' : 'text-gray-300'
                            }`}>
                              {item.inventoryDetails.inboundWorkingQuantity +
                               item.inventoryDetails.inboundShippedQuantity +
                               item.inventoryDetails.inboundReceivingQuantity}
                            </span>
                          </td>

                          {/* Reserved */}
                          <td className="px-4 py-3.5 text-center">
                            <span className={`text-sm font-semibold ${
                              item.inventoryDetails.reservedQuantity.totalReservedQuantity > 0 ? 'text-orange-600' : 'text-gray-300'
                            }`}>
                              {item.inventoryDetails.reservedQuantity.totalReservedQuantity}
                            </span>
                          </td>

                          {/* Unfulfillable */}
                          <td className="px-4 py-3.5 text-center">
                            <span className={`text-sm font-semibold ${
                              item.inventoryDetails.unfulfillableQuantity > 0 ? 'text-red-600' : 'text-gray-300'
                            }`}>
                              {item.inventoryDetails.unfulfillableQuantity}
                            </span>
                          </td>

                          {/* Total */}
                          <td className="px-4 py-3.5 text-center">
                            <span className="text-sm font-bold text-gray-900">{item.totalQuantity}</span>
                          </td>

                          {/* Updated */}
                          <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                            {new Date(item.lastUpdatedTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>

                          {/* Expand toggle */}
                          <td className="px-4 py-3.5 text-gray-400">
                            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </td>
                        </tr>

                        {/* Expanded detail */}
                        {expanded && (
                          <tr className="bg-green-50/20">
                            <td colSpan={9} className="px-6 py-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                                <Qty value={item.inventoryDetails.fulfillableQuantity} label="Fulfillable" color="green" />
                                <Qty value={item.inventoryDetails.inboundWorkingQuantity} label="Working" color="purple" />
                                <Qty value={item.inventoryDetails.inboundShippedQuantity} label="Shipped" color="blue" />
                                <Qty value={item.inventoryDetails.inboundReceivingQuantity} label="Receiving" color="blue" />
                                <Qty value={item.inventoryDetails.reservedQuantity.pendingCustomerOrderQuantity} label="Pending Order" color="orange" />
                                <Qty value={item.inventoryDetails.reservedQuantity.fcProcessingQuantity} label="FC Processing" color="yellow" />
                                <Qty value={item.inventoryDetails.unfulfillableQuantity} label="Unfulfillable" color="red" />
                              </div>
                              <div className="mt-3 flex items-center gap-4">
                                <div className="text-xs text-gray-500">
                                  <span className="font-medium text-gray-700">FN SKU:</span>{' '}
                                  <span className="font-mono">{item.fnSku}</span>
                                </div>
                                <div className="text-xs text-gray-500">
                                  <span className="font-medium text-gray-700">Seller SKU:</span>{' '}
                                  <span className="font-mono">{item.sellerSku}</span>
                                </div>
                                <a
                                  href={`https://keepa.com/#!product/1-${item.asin}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-purple-600 hover:underline flex items-center gap-1"
                                >
                                  Keepa History <ExternalLink className="w-3 h-3" />
                                </a>
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
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-5 text-xs text-gray-400">
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />In stock</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />Low stock (≤3 units)</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Out of stock</div>
      </div>
    </div>
  );
}
