'use client';

import { useState } from 'react';
import { Package } from 'lucide-react';

// Product image for detail pages. Tries the stored image, then Amazon's
// ASIN-based image, then a placeholder — so leads without a retailer thumbnail
// (e.g. manual entries) still show a photo.
export function ProductHero({ asin, imageUrl, title }: { asin: string; imageUrl?: string | null; title: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="w-20 h-20 rounded-xl border border-slate-800 bg-slate-800/40 flex items-center justify-center flex-shrink-0">
        <Package className="w-8 h-8 text-slate-600" />
      </div>
    );
  }

  return (
    <div className="w-20 h-20 rounded-xl border border-slate-800 bg-slate-900 flex items-center justify-center flex-shrink-0 overflow-hidden">
      <img
        src={imageUrl ?? `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL160_.jpg`}
        alt={title}
        className="w-20 h-20 object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
