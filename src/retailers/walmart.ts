import { BaseRetailer } from './base';
import { runApifyActor } from '@/lib/apify';
import type { RetailerProduct } from '@/types';

// Apify actor handles Walmart's PerimeterX bot-detection/proxy rotation for us.
// https://apify.com/automation-lab/walmart-scraper
const ACTOR_ID = 'automation-lab/walmart-scraper';

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
      return products;
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
