import { BaseRetailer } from './base';
import { runApifyActor } from '@/lib/apify';
import type { RetailerProduct } from '@/types';

// Apify actor handles Target's Akamai bot-detection/proxy rotation for us.
// https://apify.com/kawsar/target-product-search-scraper
const ACTOR_ID = 'kawsar/target-product-search-scraper';

interface ApifyTargetItem {
  productTitle?: string;
  brand?: string;
  currentPrice?: number;
  url?: string;
  imageUrl?: string;
  availableOnline?: boolean;
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

      return items
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
