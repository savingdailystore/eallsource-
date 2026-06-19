import { BaseRetailer } from './base';
import { runApifyActor } from '@/lib/apify';
import type { RetailerProduct } from '@/types';

// Apify actor handles Walmart's PerimeterX bot-detection/proxy rotation for us.
// https://apify.com/automation-lab/walmart-scraper
const ACTOR_ID = 'automation-lab/walmart-scraper';

// UPC enrichment: the search actor returns no UPC (it's only on detail pages),
// so we enrich the top products via a per-URL detail scraper (pay-per-event).
// Exact UPC matching is far more reliable than fuzzy title matching.
// https://apify.com/pratikdani/walmart-product-scraper
const UPC_ACTOR        = 'pratikdani/walmart-product-scraper';
const UPC_ENRICH_LIMIT = 12;     // cap products enriched per search (bounds time + cost)
const UPC_CONCURRENCY  = 5;      // parallel detail fetches
const UPC_TIMEOUT_MS   = 25_000; // per-detail-fetch cap so one stuck call can't blow the budget

// Hard cap on products handed to the pipeline per search. Each product costs
// several Amazon SP-API calls, so this bounds total run time on serverless.
const MAX_PRODUCTS = 18;

interface ApifyWalmartItem {
  name?: string;
  brand?: string;
  price?: number;
  wasPrice?: number;
  onSale?: boolean;
  url?: string;
  thumbnail?: string;
  seller?: string;
}

interface PratikItem {
  upc?: string | number;
  model?: string | number;
  product_identifiers?: { upc?: string | number; model?: string | number };
}

// Best-effort UPC/model enrichment for the top N products, in parallel batches.
// Failures are swallowed so the product simply falls back to title matching.
async function enrichUpc(products: RetailerProduct[], limit: number): Promise<void> {
  const targets = products.slice(0, limit).filter((p) => p.url);
  for (let i = 0; i < targets.length; i += UPC_CONCURRENCY) {
    const batch = targets.slice(i, i + UPC_CONCURRENCY);
    await Promise.all(batch.map(async (p) => {
      try {
        const url   = p.url.split('?')[0]; // pratikdani fails on URL query params
        const items = await runApifyActor<PratikItem>(UPC_ACTOR, { url }, UPC_TIMEOUT_MS);
        const it    = items[0];
        const upc   = it?.upc   ?? it?.product_identifiers?.upc;
        const model = it?.model ?? it?.product_identifiers?.model;
        if (upc)            p.upc   = String(upc);
        if (model && !p.model) p.model = String(model);
      } catch { /* best effort — fall back to title matching */ }
    }));
  }
}

export class WalmartRetailer extends BaseRetailer {
  name         = 'Walmart';
  baseUrl      = 'https://www.walmart.com';
  supportsApi  = false;

  async search(query: string, category?: string): Promise<RetailerProduct[]> {
    try {
      const term = category ? `${query} ${category}` : query;
      const items = await runApifyActor<ApifyWalmartItem>(ACTOR_ID, {
        searchQueries: [term],
        maxProductsPerSearch: 50,
        maxSearchPages: 2,
      });

      const products = items
        .filter((item) => item.name && typeof item.price === 'number' && item.url)
        .map((item) => {
          const onSale = item.onSale ?? (typeof item.wasPrice === 'number' && item.wasPrice > (item.price ?? 0));
          return this.normalize({
            title:     item.name,
            brand:     item.brand || undefined,
            price:     item.price,
            listPrice: typeof item.wasPrice === 'number' && item.wasPrice > (item.price ?? 0) ? item.wasPrice : undefined,
            onSale,
            inStock:   true,
            url:       item.url,
            imageUrl:  item.thumbnail,
          });
        });

      // Prioritise on-sale items — that's where arbitrage margin lives.
      products.sort((a, b) => Number(b.onSale ?? false) - Number(a.onSale ?? false));

      // Cap to the best candidates so the downstream Amazon pipeline (several
      // SP-API calls per product) stays within the serverless time limit.
      const top = products.slice(0, MAX_PRODUCTS);

      // Enrich with UPC so matching can use exact barcodes.
      await enrichUpc(top, UPC_ENRICH_LIMIT);
      return top;
    } catch (err) {
      console.error('[walmart] search error:', err);
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
