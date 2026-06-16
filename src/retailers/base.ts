import type { RetailerProduct, RetailerPlugin } from '@/types';

export abstract class BaseRetailer implements RetailerPlugin {
  abstract name: string;
  abstract baseUrl: string;
  abstract supportsApi: boolean;

  abstract search(query: string, category?: string): Promise<RetailerProduct[]>;
  abstract getProduct(url: string): Promise<RetailerProduct | null>;

  protected normalize(raw: Partial<RetailerProduct>): RetailerProduct {
    return {
      title:    raw.title    ?? '',
      brand:    raw.brand,
      upc:      raw.upc,
      ean:      raw.ean,
      model:    raw.model,
      category: raw.category,
      price:    raw.price    ?? 0,
      inStock:  raw.inStock  ?? false,
      url:      raw.url      ?? '',
      retailer: this.name,
      imageUrl: raw.imageUrl,
    };
  }

  protected async fetchWithRetry(url: string, options?: RequestInit, retries = 3): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(url, {
          ...options,
          headers: {
            'User-Agent': this.randomUserAgent(),
            'Accept': 'application/json, text/html, */*',
            ...options?.headers,
          },
        });
        if (res.ok) return res;
        throw new Error(`HTTP ${res.status} from ${url}`);
      } catch (err) {
        lastError = err as Error;
        if (attempt < retries - 1) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }
    throw lastError;
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private randomUserAgent(): string {
    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
    ];
    return agents[Math.floor(Math.random() * agents.length)];
  }
}
