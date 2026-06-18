import type { RetailerProduct, RetailerPlugin } from '@/types';

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&#38;': '&',
  '&apos;': "'", '&#39;': "'",
  '&quot;': '"', '&#34;': '"',
  '&lt;': '<', '&#60;': '<',
  '&gt;': '>', '&#62;': '>',
};

function decodeHtmlEntities(str: string): string {
  return str.replace(/&#?[a-z0-9]+;/gi, (entity) => HTML_ENTITIES[entity] ?? entity);
}

export abstract class BaseRetailer implements RetailerPlugin {
  abstract name: string;
  abstract baseUrl: string;
  abstract supportsApi: boolean;

  abstract search(query: string, category?: string): Promise<RetailerProduct[]>;
  abstract getProduct(url: string): Promise<RetailerProduct | null>;

  protected normalize(raw: Partial<RetailerProduct>): RetailerProduct {
    return {
      title:    raw.title    ? decodeHtmlEntities(raw.title) : '',
      brand:    raw.brand,
      upc:      raw.upc,
      ean:      raw.ean,
      model:    raw.model,
      category:  raw.category,
      price:     raw.price    ?? 0,
      listPrice: raw.listPrice,
      onSale:    raw.onSale,
      inStock:   raw.inStock  ?? false,
      url:       raw.url      ?? '',
      retailer:  this.name,
      imageUrl:  raw.imageUrl,
    };
  }
}
