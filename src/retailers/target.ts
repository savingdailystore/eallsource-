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
const UPC_TIMEOUT_MS   = 90_000; // per-batch cap
const UPC_BATCH_SIZE   = 6;      // URLs per actor run — one 18-URL run exceeded
                                 // the timeout, so smaller parallel runs finish
                                 // faster and one slow batch can't sink the rest

// Hard cap on products handed to the pipeline per search. Each product costs
// several Amazon SP-API calls, so this bounds total run time on serverless.
// Mirrors the Walmart retailer's cap.
const MAX_PRODUCTS = 18;

// Enrich every product we hand to the pipeline. Enrichment is a single batched
// actor call (not one per product), so enriching fewer saves nothing — and an
// un-enriched product falls back to weak title matching (the old behavior).
const UPC_ENRICH_LIMIT = MAX_PRODUCTS;

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

// Target product URLs end in `/-/A-<TCIN>`. The TCIN is Target's stable item id.
function tcinFromUrl(url?: string): string | undefined {
  return url?.match(/\/A-(\d+)/)?.[1];
}

const normUrl = (url: string) => url.split('?')[0].replace(/\/$/, '');

// Best-effort UPC enrichment in a single batched call. We pass the raw product
// URLs (not a parsed TCIN) so the actor does its own id extraction — more robust
// than depending on the search actor's URL format. Results are matched back by
// URL or TCIN. Errors are logged but never thrown: a product simply falls back
// to title matching, so Target can't end up worse than search-only.
async function enrichUpc(products: RetailerProduct[], limit: number): Promise<void> {
  const targets = products.slice(0, limit).filter((p) => p.url);
  if (targets.length === 0) return;

  const byUrl = new Map<string, RetailerProduct>();
  for (const p of targets) byUrl.set(normUrl(p.url), p);

  // Split into small batches run concurrently. A single 18-URL synchronous actor
  // run exceeds the timeout; smaller parallel runs each finish faster, and a
  // slow/failed batch only loses its own products (the rest still get a UPC).
  const batches: RetailerProduct[][] = [];
  for (let i = 0; i < targets.length; i += UPC_BATCH_SIZE) batches.push(targets.slice(i, i + UPC_BATCH_SIZE));

  let found = 0;
  await Promise.all(batches.map(async (batch) => {
    try {
      const items = await runApifyActor<TargetDetailItem>(
        UPC_ACTOR,
        { productUrls: batch.map((p) => p.url), includeProductDetails: true },
        UPC_TIMEOUT_MS,
      );
      for (const it of items) {
        const upc = it.upc ?? it.gtin ?? it.barcode;
        if (!upc) continue;
        // Map the returned item back to a product by URL, then by TCIN.
        const tcin = it.tcin != null ? String(it.tcin) : undefined;
        const p =
          (it.url && byUrl.get(normUrl(it.url))) ||
          (tcin ? targets.find((t) => tcinFromUrl(t.url) === tcin) : undefined);
        if (p) { p.upc = String(upc); found++; }
      }
    } catch (err) {
      console.error('[target] UPC enrichment batch failed (those fall back to title matching):', err);
    }
  }));
  console.log(`[target] UPC enrichment: ${found}/${targets.length} products matched a UPC`);
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
