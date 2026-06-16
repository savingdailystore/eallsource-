'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, X, Loader2 } from 'lucide-react';

const today = new Date().toISOString().split('T')[0];

export function AddItemModal() {
  const router = useRouter();
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const [form, setForm] = useState({
    asin: '', title: '', retailer: '', costBasis: '',
    quantity: '1', purchaseDate: today, listedPrice: '', status: 'IN_STOCK',
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

    const res = await fetch('/api/inventory/add', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Failed to add item.');
    } else {
      close();
      setForm({ asin: '', title: '', retailer: '', costBasis: '', quantity: '1', purchaseDate: today, listedPrice: '', status: 'IN_STOCK' });
      router.refresh();
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-sm">
        <Package className="w-4 h-4" />Add Item
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Add Inventory Item</h2>
              <button onClick={close} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">ASIN <span className="text-red-500">*</span></label>
                  <input value={form.asin} onChange={set('asin')} type="text" required className="input" placeholder="B08N5WRWNW" />
                </div>
                <div>
                  <label className="label">Retailer</label>
                  <input value={form.retailer} onChange={set('retailer')} type="text" className="input" placeholder="Walmart, Target…" />
                </div>
              </div>

              <div>
                <label className="label">Product Title <span className="text-red-500">*</span></label>
                <input value={form.title} onChange={set('title')} type="text" required className="input" placeholder="Product name" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Cost Basis ($) <span className="text-red-500">*</span></label>
                  <input value={form.costBasis} onChange={set('costBasis')} type="number" step="0.01" min="0" required className="input" placeholder="0.00" />
                </div>
                <div>
                  <label className="label">Qty</label>
                  <input value={form.quantity} onChange={set('quantity')} type="number" min="1" className="input" placeholder="1" />
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
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
