import { BaseRetailer } from './base';
import { runApifyActor } from '@/lib/apify';
import type { RetailerProduct } from '@/types';

// Primary search actor: reads Target's RedSky API and returns the UPC inline in
// the search response (one fast call — no slow per-product detail round-trip).
// Exact UPC matching against Amazon is far more reliable than fuzzy title
// matching, and is what lets Target produce leads like Walmart.
// https://apify.com/makework36/target-scraper
const SEARCH_ACTOR     = 'makework36/target-scraper';
const SEARCH_TIMEOUT_MS = 90_000;

// Fallback search actor (title/price only, no UPC). Used only if the primary
// actor errors or returns nothing, so Target can never regress below the
// previous title-matching behavior.
// https://apify.com/kawsar/target-product-search-scraper
const FALLBACK_ACTOR = 'kawsar/target-product-search-scraper';

// Hard cap on products handed to the pipeline per search. Each product costs
// several Amazon SP-API calls, so this bounds total run time on serverless.
const MAX_PRODUCTS = 18;

// makework36 (RedSky) — UPC arrives inline when fetchProductDetails is on.
interface MakeworkTargetItem {
  title?:        string;
  brand?:        string;
  price?:        number;
  regularPrice?: number;
  salePrice?:    number;
  url?:          string;
  imageUrl?:     string;
  upc?:          string | number;
  gtin?:         string | number;
}

// kawsar fallback — search-only fields, no identifiers.
interface ApifyTargetItem {
  productTitle?:    string;
  brand?:           string;
  currentPrice?:    number;
  url?:             string;
  imageUrl?:        string;
  availableOnline?: boolean;
}

export class TargetRetailer extends BaseRetailer {
  name         = 'Target';
  baseUrl      = 'https://www.target.com';
  supportsApi  = false;

  async search(query: string, category?: string): Promise<RetailerProduct[]> {
    const term = category ? `${query} ${category}` : query;

    // Primary: RedSky actor with UPCs inline.
    try {
      const items = await runApifyActor<MakeworkTargetItem>(
        SEARCH_ACTOR,
        { searchQueries: [term], maxProducts: 50, fetchProductDetails: true },
        SEARCH_TIMEOUT_MS,
      );

      const products = items
        .filter((item) => item.title && item.url && typeof (item.price ?? item.salePrice) === 'number')
        .map((item) => {
          const price        = (item.price ?? item.salePrice) as number;
          const regularPrice = item.regularPrice;
          const onSale       = typeof regularPrice === 'number' && regularPrice > price;
          const upc          = item.upc ?? item.gtin;
          return this.normalize({
            title:     item.title,
            brand:     item.brand,
            upc:       upc != null ? String(upc) : undefined,
            price,
            listPrice: onSale ? regularPrice : undefined,
            onSale,
            inStock:   true,
            url:       item.url,
            imageUrl:  item.imageUrl,
          });
        });

      if (products.length > 0) {
        const withUpc = products.filter((p) => p.upc).length;
        console.log(`[target] RedSky search: ${products.length} products, ${withUpc} with a UPC`);
        // Prioritise on-sale items — that's where arbitrage margin lives.
        products.sort((a, b) => Number(b.onSale ?? false) - Number(a.onSale ?? false));
        return products.slice(0, MAX_PRODUCTS);
      }
      console.warn('[target] RedSky search returned 0 products — falling back to kawsar');
    } catch (err) {
      console.error('[target] RedSky search failed — falling back to kawsar:', err);
    }

    // Fallback: title-only search (no UPC).
    return this.fallbackSearch(term);
  }

  private async fallbackSearch(term: string): Promise<RetailerProduct[]> {
    try {
      const items = await runApifyActor<ApifyTargetItem>(FALLBACK_ACTOR, {
        queries: [term],
        maxItems: 50,
      });

      return items
        .filter((item) => item.productTitle && typeof item.currentPrice === 'number' && item.url)
        .map((item) =>
          this.normalize({
            title:    item.productTitle,
            brand:    item.brand,
            price:    item.currentPrice,
            inStock:  item.availableOnline ?? true,
            url:      item.url,
            imageUrl: item.imageUrl,
          })
        )
        .slice(0, MAX_PRODUCTS);
    } catch (err) {
      console.error('[target] fallback search error:', err);
      return [];
    }
  }

  async getProduct(): Promise<RetailerProduct | null> {
    // Not used by the current pipeline — search() returns enough data to
    // create leads.
    return null;
  }
}
