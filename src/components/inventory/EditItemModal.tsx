'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X, Loader2, AlertTriangle } from 'lucide-react';

interface Item {
  id:                string;
  sku:               string | null;
  fnsku:             string | null;
  asin:              string;
  productName:       string;
  availableQuantity: number;
  reservedQuantity:  number;
  inboundQuantity:   number;
  totalQuantity:     number;
  purchasedAt?:      string | null;
  unitCost?:         number | null;
}

export function EditItemModal({ item }: { item: Item }) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<{
    message: string;
    currentUnitCost: number;
    requestedUnitCost: number | null;
  } | null>(null);

  const [form, setForm] = useState({
    sku:               item.sku ?? '',
    fnsku:             item.fnsku ?? '',
    asin:              item.asin,
    productName:       item.productName,
    availableQuantity: String(item.availableQuantity),
    reservedQuantity:  String(item.reservedQuantity),
    inboundQuantity:   String(item.inboundQuantity),
    totalQuantity:     String(item.totalQuantity),
    // purchasedAt stored as YYYY-MM-DD for <input type="date">
    purchasedAt:       item.purchasedAt ? item.purchasedAt.slice(0, 10) : '',
    unitCost:          item.unitCost != null ? String(item.unitCost) : '',
  });

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function close() { setOpen(false); setError(''); setPendingConfirm(null); }

  function buildBody(confirmOverwrite = false) {
    return {
      sku:               form.sku.trim() || null,
      fnsku:             form.fnsku.trim() || null,
      asin:              form.asin.trim().toUpperCase(),
      productName:       form.productName.trim(),
      availableQuantity: parseInt(form.availableQuantity, 10) || 0,
      reservedQuantity:  parseInt(form.reservedQuantity, 10) || 0,
      inboundQuantity:   parseInt(form.inboundQuantity, 10) || 0,
      totalQuantity:     parseInt(form.totalQuantity, 10) || 0,
      purchasedAt: form.purchasedAt ? new Date(form.purchasedAt).toISOString() : null,
      unitCost: form.unitCost.trim() !== '' ? parseFloat(form.unitCost) : null,
      ...(confirmOverwrite ? { confirmOverwrite: true } : {}),
    };
  }

  async function doSave(confirmOverwrite = false) {
    setLoading(true);
    setError('');
    setPendingConfirm(null);

    const res = await fetch(`/api/inventory/${item.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(buildBody(confirmOverwrite)),
    });

    setLoading(false);

    if (res.status === 409) {
      const data = await res.json();
      setPendingConfirm({
        message:           data.error ?? 'Confirmation required.',
        currentUnitCost:   data.currentUnitCost,
        requestedUnitCost: data.requestedUnitCost,
      });
      return;
    }

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Failed to save changes.');
      return;
    }

    close();
    router.refresh();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSave(false);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} title="Edit item" className="p-1.5 rounded-lg text-slate-600 hover:text-blue-500 hover:bg-blue-500/10 transition-all">
        <Pencil className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 className="font-semibold text-slate-50">Edit Inventory Item</h2>
              <button onClick={close} className="text-slate-500 hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">SKU</label>
                  <input value={form.sku} onChange={set('sku')} type="text" className="input" />
                </div>
                <div>
                  <label className="label">FNSKU</label>
                  <input value={form.fnsku} onChange={set('fnsku')} type="text" className="input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">ASIN <span className="text-red-400">*</span></label>
                  <input value={form.asin} onChange={set('asin')} type="text" required className="input" />
                </div>
                <div>
                  <label className="label">Total Quantity</label>
                  <input value={form.totalQuantity} onChange={set('totalQuantity')} type="number" min="0" className="input" />
                </div>
              </div>

              <div>
                <label className="label">Product Name <span className="text-red-400">*</span></label>
                <input value={form.productName} onChange={set('productName')} type="text" required className="input" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Available</label>
                  <input value={form.availableQuantity} onChange={set('availableQuantity')} type="number" min="0" className="input" />
                </div>
                <div>
                  <label className="label">Reserved</label>
                  <input value={form.reservedQuantity} onChange={set('reservedQuantity')} type="number" min="0" className="input" />
                </div>
                <div>
                  <label className="label">Inbound</label>
                  <input value={form.inboundQuantity} onChange={set('inboundQuantity')} type="number" min="0" className="input" />
                </div>
              </div>

              {/* Phase 2.1: Cost & date fields — both optional */}
              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-slate-800">
                <div>
                  <label className="label">Purchase Date</label>
                  <input
                    value={form.purchasedAt}
                    onChange={set('purchasedAt')}
                    type="date"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Unit Cost ($)</label>
                  <input
                    value={form.unitCost}
                    onChange={set('unitCost')}
                    type="number"
                    min="0"
                    step="0.01"
                    className="input"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {item.unitCost != null && (
                <p className="text-xs text-slate-500">
                  Changing this unit cost affects future sales cost lookup only. Historical sales will not
                  change unless you run the historical cost recalculation workflow.
                </p>
              )}

              {pendingConfirm && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-200">{pendingConfirm.message}</p>
                  </div>
                  <p className="text-xs text-slate-400 pl-6">
                    Current: <strong className="text-slate-200">${pendingConfirm.currentUnitCost.toFixed(2)}</strong>
                    {' → '}
                    New: <strong className="text-slate-200">
                      {pendingConfirm.requestedUnitCost != null
                        ? `$${pendingConfirm.requestedUnitCost.toFixed(2)}`
                        : 'cleared'}
                    </strong>
                  </p>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => doSave(true)}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Confirm change'}
                    </button>
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={close} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
