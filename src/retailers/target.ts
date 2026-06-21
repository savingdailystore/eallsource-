import { BaseRetailer } from './base';
import { runApifyActor } from '@/lib/apify';
import type { RetailerProduct } from '@/types';

// Apify actor handles Target's Akamai bot-detection/proxy rotation for us.
// https://apify.com/kawsar/target-product-search-scraper
const ACTOR_ID = 'kawsar/target-product-search-scraper';

// UPC enrichment: the search actor returns no UPC, so we enrich the top
// products via a detail actor that reads Target's RedSky API and returns the
// barcode. Exact UPC matching against Amazon is far more reliable than fuzzy
// title matching — this is what makes Target produce leads like Walmart does.
// https://apify.com/elliotpadfield/target-scraper  (accepts tcins / productUrls)
const UPC_ACTOR        = 'elliotpadfield/target-scraper';
const UPC_ENRICH_LIMIT = 12;     // cap products enriched per search (bounds time + cost)
const UPC_TIMEOUT_MS   = 60_000; // one batched call for all TCINs

// Hard cap on products handed to the pipeline per search. Each product costs
// several Amazon SP-API calls, so this bounds total run time on serverless.
// Mirrors the Walmart retailer's cap.
const MAX_PRODUCTS = 18;

interface ApifyTargetItem {
  productTitle?: string;
  brand?: string;
  currentPrice?: number;
  url?: string;
  imageUrl?: string;
  availableOnline?: boolean;
}

// Detail-actor item — field names are mapped defensively since the actor's
// exact schema can vary; anything missing simply leaves the product on the
// title-matching fallback.
interface TargetDetailItem {
  tcin?:    string | number;
  url?:     string;
  upc?:     string | number;
  gtin?:    string | number;
  barcode?: string | number;
}

// Target product URLs end in `/-/A-<TCIN>`. The TCIN is Target's stable item id,
// which the detail actor uses to look up the barcode.
function tcinFromUrl(url: string): string | undefined {
  return url.match(/\/A-(\d+)/)?.[1];
}

// Best-effort UPC enrichment for the top N products in a single batched call.
// Failures are swallowed so each product simply falls back to title matching —
// Target can never end up worse than the search-only behavior.
async function enrichUpc(products: RetailerProduct[], limit: number): Promise<void> {
  const byTcin = new Map<string, RetailerProduct>();
  for (const p of products.slice(0, limit)) {
    if (!p.url) continue;
    const tcin = tcinFromUrl(p.url);
    if (tcin) byTcin.set(tcin, p);
  }
  if (byTcin.size === 0) return;

  try {
    const items = await runApifyActor<TargetDetailItem>(
      UPC_ACTOR,
      { tcins: [...byTcin.keys()], includeProductDetails: true },
      UPC_TIMEOUT_MS,
    );
    for (const it of items) {
      // Match the returned item back to a product by TCIN (directly or via URL).
      const tcin = it.tcin != null ? String(it.tcin) : (it.url ? tcinFromUrl(it.url) : undefined);
      if (!tcin) continue;
      const p   = byTcin.get(tcin);
      const upc = it.upc ?? it.gtin ?? it.barcode;
      if (p && upc) p.upc = String(upc);
    }
  } catch { /* best effort — fall back to title matching */ }
}

export class TargetRetailer extends BaseRetailer {
  name         = 'Target';
  baseUrl      = 'https://www.target.com';
  supportsApi  = false;

  async search(query: string, category?: string): Promise<RetailerProduct[]> {
    try {
      const term = category ? `${query} ${category}` : query;
      const items = await runApifyActor<ApifyTargetItem>(ACTOR_ID, {
        queries: [term],
        maxItems: 50,
      });

      const products = items
        .filter((item) => item.productTitle && typeof item.currentPrice === 'number' && item.url)
        .map((item) =>
          this.normalize({
            title: item.productTitle,
            brand: item.brand,
            price: item.currentPrice,
            inStock: item.availableOnline ?? true,
            url: item.url,
            imageUrl: item.imageUrl,
          })
        );

      // Cap to the best candidates so the downstream Amazon pipeline (several
      // SP-API calls per product) stays within the serverless time limit.
      const top = products.slice(0, MAX_PRODUCTS);

      // Enrich with UPC so matching can use exact barcodes.
      await enrichUpc(top, UPC_ENRICH_LIMIT);
      return top;
    } catch (err) {
      console.error('[target] search error:', err);
      return [];
    }
  }

  async getProduct(): Promise<RetailerProduct | null> {
    // Not used by the current pipeline — search() returns enough data to
    // create leads. Add a detail-page actor call here if per-product lookups
    // (UPC, stock detail) become necessary.
    return null;
  }
}
