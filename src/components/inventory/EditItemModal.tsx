'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X, Loader2 } from 'lucide-react';

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
}

export function EditItemModal({ item }: { item: Item }) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [form, setForm] = useState({
    sku:               item.sku ?? '',
    fnsku:             item.fnsku ?? '',
    asin:              item.asin,
    productName:       item.productName,
    availableQuantity: String(item.availableQuantity),
    reservedQuantity:  String(item.reservedQuantity),
    inboundQuantity:   String(item.inboundQuantity),
    totalQuantity:     String(item.totalQuantity),
  });

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function close() { setOpen(false); setError(''); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch(`/api/inventory/${item.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku:               form.sku.trim() || null,
        fnsku:             form.fnsku.trim() || null,
        asin:              form.asin.trim().toUpperCase(),
        productName:       form.productName.trim(),
        availableQuantity: parseInt(form.availableQuantity, 10) || 0,
        reservedQuantity:  parseInt(form.reservedQuantity, 10) || 0,
        inboundQuantity:   parseInt(form.inboundQuantity, 10) || 0,
        totalQuantity:     parseInt(form.totalQuantity, 10) || 0,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Failed to save changes.');
    } else {
      close();
      router.refresh();
    }
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
