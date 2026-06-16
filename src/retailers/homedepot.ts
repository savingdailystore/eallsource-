import { BaseRetailer } from './base';
import { runApifyActor } from '@/lib/apify';
import type { RetailerProduct } from '@/types';

// Apify actor handles Home Depot's bot-detection/proxy rotation for us.
// https://apify.com/crawlerbros/homedepot-scraper
const ACTOR_ID = 'crawlerbros/homedepot-scraper';

interface ApifyHomeDepotItem {
  title?: string;
  brand?: string;
  price?: number;
  url?: string;
  imageUrl?: string;
}

export class HomeDepotRetailer extends BaseRetailer {
  name         = 'Home Depot';
  baseUrl      = 'https://www.homedepot.com';
  supportsApi  = false;

  async search(query: string, category?: string): Promise<RetailerProduct[]> {
    try {
      const term = category ? `${query} ${category}` : query;
      const items = await runApifyActor<ApifyHomeDepotItem>(ACTOR_ID, {
        searchQuery: term,
        maxItems: 50,
      });

      return items
        .filter((item) => item.title && typeof item.price === 'number' && item.url)
        .map((item) =>
          this.normalize({
            title: item.title,
            brand: item.brand,
            price: item.price,
            inStock: true,
            url: item.url,
            imageUrl: item.imageUrl,
          })
        );
    } catch (err) {
      console.error('[homedepot] search error:', err);
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
