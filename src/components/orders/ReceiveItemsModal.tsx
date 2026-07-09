'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackageCheck, X, Loader2, CheckCircle2, Info } from 'lucide-react';

interface POItem {
  id:               string;
  productName:      string;
  asin?:            string | null;
  quantityOrdered:  number;
  quantityReceived: number;
  status:           string;
}

interface Props {
  poId:  string;
  items: POItem[];
}

export function ReceiveItemsModal({ poId, items }: Props) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [feedback, setFeedback] = useState<{
    totalReceived: number;
    inventoryUpdated: boolean;
    unitCostSet: boolean;
    purchasedAtSet: boolean;
    costBasisSet: boolean;
  } | null>(null);

  const receivableItems = items.filter(
    (i) => i.status !== 'CANCELLED' && i.status !== 'RECEIVED',
  );

  // qty inputs keyed by item id
  const [qtys, setQtys] = useState<Record<string, string>>(() =>
    Object.fromEntries(receivableItems.map((i) => [i.id, String(i.quantityOrdered - i.quantityReceived)])),
  );

  function close() { setOpen(false); setError(''); setFeedback(null); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Only include items where qty > 0
    const receiveItems = receivableItems
      .map((item) => ({ itemId: item.id, quantityToReceive: parseInt(qtys[item.id] ?? '0') }))
      .filter((r) => r.quantityToReceive > 0);

    if (receiveItems.length === 0) {
      setError('Enter a quantity greater than 0 for at least one item.');
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/purchase-orders/${poId}/receive`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ items: receiveItems }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.details) {
        setError(data.details.map((d: { error: string }) => d.error).join('; '));
      } else {
        setError(data.error ?? 'Failed to receive items.');
      }
      return;
    }

    const data = await res.json().catch(() => null);
    setFeedback(data?.summary ?? null);
    router.refresh();
  }

  if (receivableItems.length === 0) return null;

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-sm">
        <PackageCheck className="w-4 h-4" />
        Receive Items
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-semibold">
                <PackageCheck className="w-4 h-4 text-green-400" />
                Receive Items
              </div>
              <button onClick={close} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            {feedback ? (
              <div className="px-6 py-5 space-y-4">
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-semibold">Receipt confirmed</span>
                </div>
                <ul className="space-y-1.5 text-sm text-slate-300">
                  <li>• {feedback.totalReceived} unit{feedback.totalReceived !== 1 ? 's' : ''} received</li>
                  {feedback.inventoryUpdated && (
                    <li>• Inventory updated</li>
                  )}
                  {feedback.unitCostSet && (
                    <li>• Unit cost set from PO</li>
                  )}
                  {!feedback.unitCostSet && feedback.inventoryUpdated && (
                    <li className="text-slate-500">• Unit cost preserved (already set)</li>
                  )}
                  {feedback.purchasedAtSet && (
                    <li>• Purchase date set from PO</li>
                  )}
                  {feedback.costBasisSet && (
                    <li>• Repricing cost basis set from PO</li>
                  )}
                  {!feedback.costBasisSet && feedback.inventoryUpdated && (
                    <li className="text-slate-500">• Repricing cost basis preserved (already set or no rule)</li>
                  )}
                </ul>
                <div className="flex justify-end pt-1">
                  <button onClick={close} className="btn-primary text-sm">Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                {/* Inventory effect warnings */}
                <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-xs text-slate-400 space-y-1">
                  <div className="flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>
                      Receiving increases available inventory quantities. If no unit cost is set on the
                      matching inventory item, the PO unit cost will be applied. Existing unit costs are not overwritten.
                    </span>
                  </div>
                  <p className="pl-5 text-slate-500">
                    You can receive fewer than the full quantity — the order stays open until all items are received.
                  </p>
                </div>

                <p className="text-sm text-slate-400">
                  Enter how many units arrived for each item. Leave 0 to skip an item.
                </p>

                <div className="space-y-3">
                  {receivableItems.map((item) => {
                    const remaining = item.quantityOrdered - item.quantityReceived;
                    return (
                      <div key={item.id} className="bg-slate-800/60 rounded-xl p-3">
                        <div className="text-sm text-white font-medium mb-1 truncate">{item.productName}</div>
                        {item.asin && <div className="text-xs text-slate-500 mb-2">{item.asin}</div>}
                        <div className="flex items-center gap-3">
                          <div className="text-xs text-slate-400 flex-1">
                            {item.quantityReceived} / {item.quantityOrdered} received · {remaining} remaining
                          </div>
                          <input
                            type="number"
                            min={0}
                            max={remaining}
                            step={1}
                            value={qtys[item.id] ?? ''}
                            onChange={(e) => setQtys((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            className="input-field w-20 text-right text-sm"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <div className="flex justify-end gap-3 pt-1">
                  <button type="button" onClick={close} className="btn-secondary text-sm">Cancel</button>
                  <button type="submit" disabled={loading} className="btn-primary text-sm">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                    Confirm Receipt
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
