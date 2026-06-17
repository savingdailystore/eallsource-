'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, X, Loader2 } from 'lucide-react';

export function AddItemModal() {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [form, setForm] = useState({
    sku: '', fnsku: '', asin: '', productName: '',
    availableQuantity: '0', reservedQuantity: '0', inboundQuantity: '0', totalQuantity: '0',
  });

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
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
      setForm({ sku: '', fnsku: '', asin: '', productName: '', availableQuantity: '0', reservedQuantity: '0', inboundQuantity: '0', totalQuantity: '0' });
      router.refresh();
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-sm">
        <Package className="w-4 h-4" />Add Item
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-zinc-900 rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="font-semibold text-zinc-50">Add Inventory Item</h2>
              <button onClick={close} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">SKU</label>
                  <input value={form.sku} onChange={set('sku')} type="text" className="input" placeholder="Seller SKU" />
                </div>
                <div>
                  <label className="label">FNSKU</label>
                  <input value={form.fnsku} onChange={set('fnsku')} type="text" className="input" placeholder="X00ABC1234" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">ASIN <span className="text-red-400">*</span></label>
                  <input value={form.asin} onChange={set('asin')} type="text" required className="input" placeholder="B08N5WRWNW" />
                </div>
                <div>
                  <label className="label">Total Quantity</label>
                  <input value={form.totalQuantity} onChange={set('totalQuantity')} type="number" min="0" className="input" />
                </div>
              </div>

              <div>
                <label className="label">Product Name <span className="text-red-400">*</span></label>
                <input value={form.productName} onChange={set('productName')} type="text" required className="input" placeholder="Product name" />
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
