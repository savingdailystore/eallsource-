'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X, Loader2 } from 'lucide-react';

interface Item {
  id:           string;
  title:        string;
  asin:         string;
  retailer:     string | null;
  costBasis:    number;
  quantity:     number;
  purchaseDate: Date | string;
  listedPrice:  number | null;
  status:       'IN_STOCK' | 'LISTED' | 'SOLD';
}

export function EditItemModal({ item }: { item: Item }) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [form, setForm] = useState({
    asin:         item.asin,
    title:        item.title,
    retailer:     item.retailer ?? '',
    costBasis:    String(item.costBasis),
    quantity:     String(item.quantity),
    purchaseDate: new Date(item.purchaseDate).toISOString().split('T')[0],
    listedPrice:  item.listedPrice != null ? String(item.listedPrice) : '',
    status:       item.status,
  });

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
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
        asin:         form.asin.trim().toUpperCase(),
        title:        form.title.trim(),
        retailer:     form.retailer.trim() || null,
        costBasis:    parseFloat(form.costBasis),
        quantity:     parseInt(form.quantity, 10),
        purchaseDate: form.purchaseDate,
        listedPrice:  form.listedPrice ? parseFloat(form.listedPrice) : null,
        status:       form.status,
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
      <button
        onClick={() => setOpen(true)}
        title="Edit item"
        className="p-1.5 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Edit Inventory Item</h2>
              <button onClick={close} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">ASIN <span className="text-red-500">*</span></label>
                  <input value={form.asin} onChange={set('asin')} type="text" required className="input" />
                </div>
                <div>
                  <label className="label">Retailer</label>
                  <input value={form.retailer} onChange={set('retailer')} type="text" className="input" placeholder="Walmart, Target…" />
                </div>
              </div>

              <div>
                <label className="label">Product Title <span className="text-red-500">*</span></label>
                <input value={form.title} onChange={set('title')} type="text" required className="input" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Cost Basis ($) <span className="text-red-500">*</span></label>
                  <input value={form.costBasis} onChange={set('costBasis')} type="number" step="0.01" min="0" required className="input" />
                </div>
                <div>
                  <label className="label">Qty</label>
                  <input value={form.quantity} onChange={set('quantity')} type="number" min="1" className="input" />
                </div>
                <div>
                  <label className="label">Listed Price ($)</label>
                  <input value={form.listedPrice} onChange={set('listedPrice')} type="number" step="0.01" min="0" className="input" placeholder="0.00" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Purchase Date <span className="text-red-500">*</span></label>
                  <input value={form.purchaseDate} onChange={set('purchaseDate')} type="date" required className="input" />
                </div>
                <div>
                  <label className="label">Status</label>
                  <select value={form.status} onChange={set('status')} className="input">
                    <option value="IN_STOCK">In Stock</option>
                    <option value="LISTED">Listed</option>
                    <option value="SOLD">Sold</option>
                  </select>
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

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
