import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isWalmartProductUrl,
  normalizeWalmartProductUrl,
  extractWalmartItemId,
  parseWalmartProductHtml,
  refreshWalmartProductUrl,
} from './walmart-product-refresh';

// ---------------------------------------------------------------------------
// HTML fixture builders
// ---------------------------------------------------------------------------

function makeNextDataHtml(product: Record<string, unknown>): string {
  const nextData = {
    props: {
      pageProps: {
        initialData: {
          data: { product },
        },
      },
    },
  };
  return `<html><head></head><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
</body></html>`;
}

function makeJsonLdHtml(ld: unknown): string {
  return `<html><head>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head><body></body></html>`;
}

function makeMetaHtml(metas: Record<string, string>): string {
  const tags = Object.entries(metas)
    .map(([k, v]) => `<meta property="${k}" content="${v}">`)
    .join('\n');
  return `<html><head>${tags}</head><body></body></html>`;
}

const WALMART_URL = 'https://www.walmart.com/ip/Some-Product/123456789';

// ---------------------------------------------------------------------------
// 1. isWalmartProductUrl
// ---------------------------------------------------------------------------

describe('isWalmartProductUrl', () => {
  it('accepts a standard Walmart /ip/ product URL', () => {
    expect(isWalmartProductUrl('https://www.walmart.com/ip/Widget/123456789')).toBe(true);
  });

  it('accepts URL without www', () => {
    expect(isWalmartProductUrl('https://walmart.com/ip/Widget/123456789')).toBe(true);
  });

  it('accepts URL with query string', () => {
    expect(isWalmartProductUrl('https://www.walmart.com/ip/Widget/123456789?athbdg=L1200')).toBe(true);
  });

  // Test 2: non-Walmart URL rejected
  it('rejects a non-Walmart URL', () => {
    expect(isWalmartProductUrl('https://www.amazon.com/dp/B0TEST1234')).toBe(false);
  });

  it('rejects a Walmart non-product URL (category page)', () => {
    expect(isWalmartProductUrl('https://www.walmart.com/browse/electronics')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isWalmartProductUrl('')).toBe(false);
  });

  it('rejects a Walmart search URL', () => {
    expect(isWalmartProductUrl('https://www.walmart.com/search?q=widgets')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. normalizeWalmartProductUrl
// ---------------------------------------------------------------------------

describe('normalizeWalmartProductUrl', () => {
  it('strips query string from a Walmart product URL', () => {
    const result = normalizeWalmartProductUrl(
      'https://www.walmart.com/ip/Some-Product/123456789?athbdg=L1200&from=/search',
    );
    expect(result).toBe('https://www.walmart.com/ip/123456789');
  });

  it('strips hash fragment', () => {
    const result = normalizeWalmartProductUrl(
      'https://www.walmart.com/ip/Some-Product/123456789#reviews',
    );
    expect(result).toBe('https://www.walmart.com/ip/123456789');
  });

  it('strips slug but keeps item ID', () => {
    const result = normalizeWalmartProductUrl(
      'https://www.walmart.com/ip/Very-Long-Slug-Here/987654321',
    );
    expect(result).toBe('https://www.walmart.com/ip/987654321');
  });

  it('returns original URL unchanged if not a Walmart product URL', () => {
    const url = 'https://www.target.com/p/something/-/A-12345';
    expect(normalizeWalmartProductUrl(url)).toBe(url);
  });
});

// ---------------------------------------------------------------------------
// 4. extractWalmartItemId
// ---------------------------------------------------------------------------

describe('extractWalmartItemId', () => {
  it('extracts numeric item ID from standard /ip/Slug/ID URL', () => {
    expect(extractWalmartItemId('https://www.walmart.com/ip/Some-Product/123456789')).toBe('123456789');
  });

  it('extracts numeric item ID from /ip/ID URL (no slug)', () => {
    expect(extractWalmartItemId('https://www.walmart.com/ip/123456789')).toBe('123456789');
  });

  it('returns null for a non-product Walmart URL', () => {
    expect(extractWalmartItemId('https://www.walmart.com/browse/electronics')).toBeNull();
  });

  it('returns null for a non-Walmart URL', () => {
    expect(extractWalmartItemId('https://www.amazon.com/dp/B0TEST1234')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5–7. parseWalmartProductHtml — __NEXT_DATA__ parsing
// ---------------------------------------------------------------------------

describe('parseWalmartProductHtml — __NEXT_DATA__', () => {
  it('parses price from __NEXT_DATA__', () => {
    const html = makeNextDataHtml({
      name: 'Test Widget',
      priceInfo: { currentPrice: { price: 24.97 } },
      availabilityStatus: 'IN_STOCK',
    });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.price).toBe(24.97);
    expect(result.parseSource).toBe('NEXT_DATA');
  });

  it('parses availability from __NEXT_DATA__ as true when IN_STOCK', () => {
    const html = makeNextDataHtml({
      name: 'Test Widget',
      priceInfo: { currentPrice: { price: 19.99 } },
      availabilityStatus: 'IN_STOCK',
    });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.available).toBe(true);
  });

  it('parses availability from __NEXT_DATA__ as false when OUT_OF_STOCK', () => {
    const html = makeNextDataHtml({
      name: 'Test Widget',
      priceInfo: { currentPrice: { price: 19.99 } },
      availabilityStatus: 'OUT_OF_STOCK',
    });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.available).toBe(false);
  });

  it('parses title from __NEXT_DATA__', () => {
    const html = makeNextDataHtml({
      name: 'Amazing Bluetooth Speaker',
      priceInfo: { currentPrice: { price: 49.99 } },
      availabilityStatus: 'IN_STOCK',
    });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.title).toBe('Amazing Bluetooth Speaker');
  });

  it('returns retailer = Walmart', () => {
    const html = makeNextDataHtml({ name: 'Widget', priceInfo: { currentPrice: { price: 9.99 } } });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.retailer).toBe('Walmart');
  });

  it('populates normalizedUrl and retailerItemId', () => {
    const html = makeNextDataHtml({ name: 'Widget', priceInfo: { currentPrice: { price: 9.99 } } });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.retailerItemId).toBe('123456789');
    expect(result.normalizedUrl).toBe('https://www.walmart.com/ip/123456789');
  });
});

// ---------------------------------------------------------------------------
// 8. Falls back to JSON-LD when __NEXT_DATA__ missing
// ---------------------------------------------------------------------------

describe('parseWalmartProductHtml — JSON-LD fallback', () => {
  it('falls back to JSON-LD when __NEXT_DATA__ is absent', () => {
    const html = makeJsonLdHtml({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'JSON-LD Widget',
      offers: {
        '@type': 'Offer',
        price: '34.99',
        availability: 'https://schema.org/InStock',
      },
    });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.parseSource).toBe('JSON_LD');
    expect(result.title).toBe('JSON-LD Widget');
    expect(result.price).toBe(34.99);
    expect(result.available).toBe(true);
  });

  it('parses OutOfStock availability from JSON-LD', () => {
    const html = makeJsonLdHtml({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'OOS Widget',
      offers: {
        '@type': 'Offer',
        price: '22.50',
        availability: 'https://schema.org/OutOfStock',
      },
    });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.available).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. Falls back to meta tags when JSON-LD missing
// ---------------------------------------------------------------------------

describe('parseWalmartProductHtml — meta tag fallback', () => {
  it('falls back to og:title and product:price:amount meta tags', () => {
    const html = makeMetaHtml({
      'og:title': 'Meta Widget',
      'product:price:amount': '12.49',
      'og:image': 'https://i5.walmartimages.com/image.jpg',
    });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.parseSource).toBe('META');
    expect(result.title).toBe('Meta Widget');
    expect(result.price).toBe(12.49);
  });

  it('leaves available as null when only meta tags are available', () => {
    const html = makeMetaHtml({
      'og:title': 'Meta Widget',
      'product:price:amount': '12.49',
    });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.available).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. Multiple JSON-LD blocks handled safely
// ---------------------------------------------------------------------------

describe('parseWalmartProductHtml — multiple JSON-LD blocks', () => {
  it('handles multiple JSON-LD blocks without throwing', () => {
    const html = `<html><head>
<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
<script type="application/ld+json">{"@type":"Product","name":"Multi Block Widget","offers":{"@type":"Offer","price":"55.00","availability":"https://schema.org/InStock"}}</script>
</head><body></body></html>`;
    expect(() => parseWalmartProductHtml(html, WALMART_URL)).not.toThrow();
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.title).toBe('Multi Block Widget');
    expect(result.price).toBe(55.0);
  });

  it('skips malformed JSON-LD blocks and continues to next', () => {
    const html = `<html><head>
<script type="application/ld+json">THIS IS NOT JSON{{{</script>
<script type="application/ld+json">{"@type":"Product","name":"Valid Block","offers":{"@type":"Offer","price":"10.00","availability":"https://schema.org/InStock"}}</script>
</head><body></body></html>`;
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.parseSource).toBe('JSON_LD');
    expect(result.title).toBe('Valid Block');
  });
});

// ---------------------------------------------------------------------------
// 11. Out-of-stock only when explicit
// ---------------------------------------------------------------------------

describe('OOS signal — only explicit signals set available=false', () => {
  it('returns available=null when availability field is ambiguous', () => {
    const html = makeNextDataHtml({
      name: 'Widget',
      priceInfo: { currentPrice: { price: 9.99 } },
      availabilityStatus: 'UNKNOWN_STATUS',
    });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.available).toBeNull();
  });

  it('returns available=null when availability field is absent', () => {
    const html = makeNextDataHtml({
      name: 'Widget',
      priceInfo: { currentPrice: { price: 9.99 } },
    });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.available).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 12. Missing price returns null, not 0
// ---------------------------------------------------------------------------

describe('price — missing returns null not zero', () => {
  it('returns price=null when priceInfo is absent from __NEXT_DATA__', () => {
    const html = makeNextDataHtml({
      name: 'No Price Widget',
      availabilityStatus: 'IN_STOCK',
    });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.price).toBeNull();
    expect(result.price).not.toBe(0);
  });

  it('returns price=null when JSON-LD offer price is empty string', () => {
    const html = makeJsonLdHtml({
      '@type': 'Product',
      name: 'No Price',
      offers: { '@type': 'Offer', price: '', availability: 'https://schema.org/InStock' },
    });
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.price).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 13. Parse failure returns unknown (null), not out of stock
// ---------------------------------------------------------------------------

describe('parse failure safety', () => {
  it('returns available=null (not false) when HTML has no parseable product data', () => {
    const html = '<html><body><p>Access Denied</p></body></html>';
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.available).toBeNull();
    expect(result.available).not.toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('sets parseSource=null on total parse failure', () => {
    const html = '<html><body></body></html>';
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(result.parseSource).toBeNull();
  });

  it('includes an error message on parse failure', () => {
    const html = '<html><body><p>Robot check</p></body></html>';
    const result = parseWalmartProductHtml(html, WALMART_URL);
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 14. No DB writes — refreshWalmartProductUrl does not import prisma
// ---------------------------------------------------------------------------

describe('no DB writes', () => {
  it('walmart-product-refresh module does not import prisma', async () => {
    // Verify by checking the module's source has no prisma import
    const src = await import('fs').then(fs =>
      fs.readFileSync(
        new URL('./walmart-product-refresh.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
        'utf8',
      ),
    );
    expect(src).not.toMatch(/from ['"]@\/lib\/prisma['"]/);
    expect(src).not.toMatch(/prisma\.(product|lead|sourceCandidate)\.(create|update|upsert)/);
  });
});

// ---------------------------------------------------------------------------
// 15. No Apify/SP-API/Keepa calls
// ---------------------------------------------------------------------------

describe('no external service calls', () => {
  it('walmart-product-refresh module does not import SP-API, Keepa, or Apify clients', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync(
        new URL('./walmart-product-refresh.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
        'utf8',
      ),
    );
    // Check import statements only (not comments)
    const importLines = src.split('\n').filter(l => /^import\s/.test(l.trim())).join('\n');
    expect(importLines).not.toMatch(/apify/i);
    expect(importLines).not.toMatch(/keepa/i);
    expect(importLines).not.toMatch(/sp-api/i);
    expect(importLines).not.toMatch(/amazon-sp/i);
  });
});

// ---------------------------------------------------------------------------
// refreshWalmartProductUrl — fetch wrapper (mocked)
// ---------------------------------------------------------------------------

describe('refreshWalmartProductUrl', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.stubGlobal('fetch', originalFetch);
    vi.restoreAllMocks();
  });

  it('returns error result for non-Walmart URL without fetching', async () => {
    const result = await refreshWalmartProductUrl('https://www.target.com/p/widget/-/A-12345');
    expect(result.error).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns available=null (not false) on HTTP 429 response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => '',
    });
    const result = await refreshWalmartProductUrl(WALMART_URL);
    expect(result.available).toBeNull();
    expect(result.error).toMatch(/429/);
  });

  it('returns available=null on network error', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network timeout'));
    const result = await refreshWalmartProductUrl(WALMART_URL);
    expect(result.available).toBeNull();
    expect(result.error).toMatch(/network timeout/);
  });

  it('parses a successful response using the HTML parser', async () => {
    const html = makeNextDataHtml({
      name: 'Fetched Widget',
      priceInfo: { currentPrice: { price: 29.97 } },
      availabilityStatus: 'IN_STOCK',
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => html,
    });
    const result = await refreshWalmartProductUrl(WALMART_URL);
    expect(result.title).toBe('Fetched Widget');
    expect(result.price).toBe(29.97);
    expect(result.available).toBe(true);
    expect(result.parseSource).toBe('NEXT_DATA');
    expect(result.retailer).toBe('Walmart');
  });

  it('includes checkedAt ISO timestamp', async () => {
    const html = makeNextDataHtml({ name: 'W', priceInfo: { currentPrice: { price: 5 } } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => html,
    });
    const result = await refreshWalmartProductUrl(WALMART_URL);
    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
