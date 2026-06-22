import { BaseRetailer } from './base';
import { runApifyActor } from '@/lib/apify';
import type { RetailerProduct } from '@/types';

// Target search via Apify (handles Akamai bot-detection/proxy for us). With
// fetchProductDetails the actor returns regularPrice/onSale/brand/description —
// enough to detect clearance items (where the arbitrage margin is) and prioritise
// them. NOTE: Target exposes no UPC through any actor we can access — only a TCIN
// (Target's internal id), which Amazon can't match on — so Target matches by
// title. Direct actor testing (2026-06-21) confirmed the "UPC" actors are broken
// or paid; see memory note target-scraper-no-upc.
// https://apify.com/kawsar/target-product-search-scraper
const ACTOR_ID = 'kawsar/target-product-search-scraper';

// Cap items the actor details + we hand to the pipeline. fetchProductDetails
// fetches a detail page per item, so keep this tight to bound run time.
const MAX_ITEMS    = 20;
const MAX_PRODUCTS = 18;

interface ApifyTargetItem {
  productTitle?:    string;
  brand?:           string;
  currentPrice?:    number;
  regularPrice?:    number;
  onSale?:          boolean;
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

    // Prefer the detail-enriched call (gives sale data); fall back to the plain
    // search if it errors so Target never returns nothing on a transient issue.
    let items: ApifyTargetItem[];
    try {
      items = await runApifyActor<ApifyTargetItem>(ACTOR_ID, {
        queries: [term], maxItems: MAX_ITEMS, fetchProductDetails: true,
      });
    } catch (err) {
      console.error('[target] detail search failed, retrying plain search:', err);
      try {
        items = await runApifyActor<ApifyTargetItem>(ACTOR_ID, { queries: [term], maxItems: MAX_ITEMS });
      } catch (err2) {
        console.error('[target] search error:', err2);
        return [];
      }
    }

    const products = items
      .filter((item) => item.productTitle && typeof item.currentPrice === 'number' && item.url)
      .map((item) => {
        const price  = item.currentPrice as number;
        const onSale = item.onSale ?? (typeof item.regularPrice === 'number' && item.regularPrice > price);
        return this.normalize({
          title:     item.productTitle,
          brand:     item.brand,
          price,
          listPrice: typeof item.regularPrice === 'number' && item.regularPrice > price ? item.regularPrice : undefined,
          onSale,
          inStock:   item.availableOnline ?? true,
          url:       item.url,
          imageUrl:  item.imageUrl,
        });
      });

    // Prioritise on-sale items — that's where arbitrage margin lives — then cap.
    products.sort((a, b) => Number(b.onSale ?? false) - Number(a.onSale ?? false));
    return products.slice(0, MAX_PRODUCTS);
  }

  async getProduct(): Promise<RetailerProduct | null> {
    // Not used by the current pipeline — search() returns enough data to
    // create leads.
    return null;
  }
}
