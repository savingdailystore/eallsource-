'use client';

import { RefreshCw, PlusCircle, Boxes, RefreshCcwDot } from 'lucide-react';
import { PageGuide } from '@/components/ui/PageGuide';

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
  return (
    <PageGuide
      storageKey="inventory-guide-collapsed"
      title="How inventory works"
      subtitle="Inventory tracks what you've purchased and listed. Pull it from Amazon automatically, or add items yourself — then use it to drive repricing."
      steps={STEPS}
      columns={2}
      defaultOpen={true}
    />
  );
}
