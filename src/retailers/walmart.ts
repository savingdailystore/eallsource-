import { BaseRetailer } from './base';
import type { RetailerProduct } from '@/types';

export class WalmartRetailer extends BaseRetailer {
  name         = 'Walmart';
  baseUrl      = 'https://www.walmart.com';
  supportsApi  = false; // Walmart Open API requires approval

  async search(query: string, category?: string): Promise<RetailerProduct[]> {
    // TODO: Implement via Walmart Affiliate API or Playwright browser scraping
    // API endpoint: https://developer.walmart.com/api/us/mp/items
    // Scraping: https://www.walmart.com/search?q={query}
    console.log('[walmart] search:', query, category);
    return [];
  }

  async getProduct(url: string): Promise<RetailerProduct | null> {
    // TODO: Parse product page via Playwright
    // Extract: title, price, UPC (from structured data), inventory status
    console.log('[walmart] getProduct:', url);
    return null;
  }
}
