'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, X, Plus, Trash2, Loader2, Info } from 'lucide-react';

interface OrderItem {
  productName:     string;
  asin:            string;
  sku:             string;
  quantityOrdered: string;
  unitCost:        string;
  sourceUrl:       string;
}

const BLANK_ITEM: OrderItem = {
  productName: '', asin: '', sku: '', quantityOrdered: '1', unitCost: '', sourceUrl: '',
};

interface Props {
  /** Pre-populate from a lead. */
  prefill?: {
    leadId:      string;
    productName: string;
    asin:        string;
    sourceUrl?:  string;
    unitCost?:   number;
  };
  /** Label for the trigger button — overrides the default. */
  triggerLabel?: string;
}

export function CreateOrderModal({ prefill, triggerLabel }: Props) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [supplierName,    setSupplierName]    = useState('');
  const [supplierOrderId, setSupplierOrderId] = useState('');
  const [orderDate,       setOrderDate]       = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate,    setExpectedDate]    = useState('');
  const [shippingCost,    setShippingCost]    = useState('0');
  const [tax,             setTax]             = useState('0');
  const [notes,           setNotes]           = useState('');

  const initialItem: OrderItem = prefill
    ? {
        productName:     prefill.productName,
        asin:            prefill.asin,
        sku:             '',
        quantityOrdered: '1',
        unitCost:        prefill.unitCost != null ? String(prefill.unitCost) : '',
        sourceUrl:       prefill.sourceUrl ?? '',
      }
    : { ...BLANK_ITEM };

  const [items, setItems] = useState<OrderItem[]>([initialItem]);

  function close() { setOpen(false); setError(''); }

  function addItem()          { setItems((prev) => [...prev, { ...BLANK_ITEM }]); }
  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }
  function setItemField(i: number, field: keyof OrderItem, value: string) {
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate unit costs before submit — do not silently send $0
    const badCostIdx = items.findIndex((item) => {
      const cost = parseFloat(item.unitCost);
      return isNaN(cost) || cost <= 0;
    });
    if (badCostIdx !== -1) {
      setError(`Item ${badCostIdx + 1}: unit cost must be greater than $0.`);
      setLoading(false);
      return;
    }

    const payload = {
      supplierName,
      supplierOrderId: supplierOrderId || undefined,
      orderDate: new Date(orderDate).toISOString(),
      expectedDate: expectedDate ? new Date(expectedDate).toISOString() : undefined,
      shippingCost: parseFloat(shippingCost) || 0,
      tax:          parseFloat(tax)          || 0,
      notes:        notes || undefined,
      leadIds: prefill ? [prefill.leadId] : undefined,
      items: items.map((item) => ({
        productName:     item.productName,
        asin:            item.asin || undefined,
        sku:             item.sku  || undefined,
        sourceUrl:       item.sourceUrl || undefined,
        quantityOrdered: parseInt(item.quantityOrdered) || 1,
        unitCost:        parseFloat(item.unitCost),
      })),
    };

    const res = await fetch('/api/purchase-orders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to create order.');
      return;
    }

    const po = await res.json();
    close();
    router.push(`/dashboard/orders/${po.id}`);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-sm">
        <ShoppingCart className="w-4 h-4" />
        {triggerLabel ?? 'New Order'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-semibold">
                <ShoppingCart className="w-4 h-4 text-blue-400" />
                Create Purchase Order
              </div>
              <button onClick={close} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
              {/* Workflow info note */}
              <div className="flex items-start gap-2 bg-slate-800/60 rounded-xl px-3 py-2.5 text-xs text-slate-400">
                <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                <span>
                  Creating a purchase order records what you ordered.
                  Inventory quantities are not updated until you receive the items.
                </span>
              </div>

              {/* Supplier */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Supplier Name *</label>
                  <input
                    required
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Acme Wholesale"
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Supplier Order ID</label>
                  <input
                    value={supplierOrderId}
                    onChange={(e) => setSupplierOrderId(e.target.value)}
                    placeholder="PO-12345"
                    className="input-field w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Order Date *</label>
                  <input
                    required
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Expected Arrival</label>
                  <input
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="input-field w-full"
                  />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-300">Items</label>
                  <button type="button" onClick={addItem} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Item
                  </button>
                </div>
                <div className="space-y-3">
                  {items.map((item, i) => (
                    <div key={i} className="bg-slate-800/60 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-400">Item {i + 1}</span>
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(i)} className="text-slate-500 hover:text-red-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <input
                        required
                        value={item.productName}
                        onChange={(e) => setItemField(i, 'productName', e.target.value)}
                        placeholder="Product name *"
                        className="input-field w-full text-sm"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <input
                            value={item.asin}
                            onChange={(e) => setItemField(i, 'asin', e.target.value)}
                            placeholder="ASIN"
                            maxLength={10}
                            className="input-field w-full text-sm"
                          />
                          <p className="text-[10px] text-slate-600 mt-0.5 leading-tight">
                            Used to match received items to your inventory.
                          </p>
                        </div>
                        <div>
                          <input
                            value={item.sku}
                            onChange={(e) => setItemField(i, 'sku', e.target.value)}
                            placeholder="SKU"
                            className="input-field w-full text-sm"
                          />
                          <p className="text-[10px] text-slate-600 mt-0.5 leading-tight">
                            Helps match costs to sales.
                          </p>
                        </div>
                        <input
                          required
                          type="number"
                          min={1}
                          step={1}
                          value={item.quantityOrdered}
                          onChange={(e) => setItemField(i, 'quantityOrdered', e.target.value)}
                          placeholder="Qty *"
                          className="input-field w-full text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <input
                            required
                            type="number"
                            min={0.01}
                            step={0.01}
                            value={item.unitCost}
                            onChange={(e) => setItemField(i, 'unitCost', e.target.value)}
                            placeholder="Unit cost ($) *"
                            className="input-field w-full text-sm"
                          />
                          <p className="text-[10px] text-slate-600 mt-0.5 leading-tight">
                            Per-unit cost paid. Applied to inventory if no cost is set yet. Existing costs are not overwritten.
                          </p>
                        </div>
                        <input
                          value={item.sourceUrl}
                          onChange={(e) => setItemField(i, 'sourceUrl', e.target.value)}
                          placeholder="Source URL"
                          className="input-field w-full text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Costs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Shipping ($)</label>
                  <input type="number" min={0} step={0.01} value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} className="input-field w-full" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Tax ($)</label>
                  <input type="number" min={0} step={0.01} value={tax} onChange={(e) => setTax(e.target.value)} className="input-field w-full" />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="input-field w-full resize-none"
                  placeholder="Optional order notes…"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={close} className="btn-secondary text-sm">Cancel</button>
                <button type="submit" disabled={loading} className="btn-primary text-sm">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                  Create Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
