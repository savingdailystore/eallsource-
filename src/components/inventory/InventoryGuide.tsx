'use client';

import { useState, useEffect } from 'react';
import { BookOpen, ChevronDown, ChevronUp, RefreshCw, PlusCircle, Boxes, RefreshCcwDot } from 'lucide-react';

const STORAGE_KEY = 'inventory-guide-collapsed';

const STEPS = [
  {
    icon:  RefreshCw,
    title: '1. Sync from Amazon',
    body:  'Click "Sync from Amazon" to pull your live FBA stock — quantities and SKUs come straight from Seller Central. Items you sold off long ago (zero on-hand, reserved, and inbound) are skipped so the list stays clean.',
  },
  {
    icon:  PlusCircle,
    title: '2. Or add items yourself',
    body:  'Not on FBA yet, or tracking something by hand? Use "Add item" for a single product or "Import CSV" to bring in many at once.',
  },
  {
    icon:  Boxes,
    title: '3. Read the columns',
    body:  'Available = ready to sell, Reserved = held by Amazon for pending orders, Inbound = on its way to a warehouse, Total = all three combined. The cards up top sum these across everything.',
  },
  {
    icon:  RefreshCcwDot,
    title: '4. Want to reprice these?',
    body:  'Head to the Repricing page. Each stocked item becomes a rule there — set your Unit Cost (what you paid) so it can protect your margin, then let it recommend and push prices to Amazon for you.',
  },
];

export function InventoryGuide() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  }

  return (
    <div className="card overflow-hidden border-blue-500/20">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-400" />
          <h2 className="font-semibold text-slate-50">How inventory works</h2>
          <span className="text-xs text-slate-500">— getting started</span>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronUp className="w-4 h-4 text-slate-500" />}
      </button>

      {!collapsed && (
        <div className="px-5 pb-5">
          <p className="text-sm text-slate-400 mb-4">
            Inventory tracks what you’ve purchased and listed. Pull it from Amazon automatically, or add items yourself —
            then use it to drive <span className="text-slate-200 font-medium">repricing</span>.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {STEPS.map((s) => (
              <div key={s.title} className="bg-slate-800/40 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <s.icon className="w-4 h-4 text-blue-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100">{s.title}</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
