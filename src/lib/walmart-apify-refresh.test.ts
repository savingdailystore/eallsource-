import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { refreshWalmartProductUrlViaApify, PRATIKDANI_ACTOR } from './walmart-apify-refresh';

// ---------------------------------------------------------------------------
// Mock runApifyActor — no live Apify calls in tests
// ---------------------------------------------------------------------------

const mockRunApifyActor = vi.fn();

vi.mock('@/lib/apify', () => ({
  runApifyActor: (...args: unknown[]) => mockRunApifyActor(...args),
}));

const WALMART_URL = 'https://www.walmart.com/ip/Some-Product/10804596';

// ---------------------------------------------------------------------------
// Fixture: full realistic actor response (modelled on Phase 19.5A real output)
// ---------------------------------------------------------------------------

const FULL_ACTOR_RESPONSE = {
  product_name:    'POND\'S Dry Skin Cream, Moisturizing Face Cream for Deep Hydration – 10.1 oz',
  final_price:     8.84,
  initial_price:   8.84,
  sale_price:      null,
  price:           '$8.84',
  is_available:    true,
  availability:    'in_stock',
  availability_text: 'In stock',
  product_id:      '10804596',
  upc:             '305211793049',
  gtin:            '305211793049',
  brand:           "POND'S",
  main_image:      'https://i5.walmartimages.com/seo/ponds-cream.jpg',
  seller:          'Walmart.com',
  seller_id:       'F55CDC31AB754BB68FE0B39041159D63',
  rating:          4.6,
  review_count:    3425,
  input:           { url: 'https://www.walmart.com/ip/Some-Product/10804596' },
  timestamp:       '2026-07-27T22:00:00.000Z',
};

beforeEach(() => {
  mockRunApifyActor.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Calls pratikdani actor with normalized Walmart URL
// ---------------------------------------------------------------------------

describe('actor invocation', () => {
  it('calls pratikdani actor with the correct actor ID and normalized URL', async () => {
    mockRunApifyActor.mockResolvedValueOnce([FULL_ACTOR_RESPONSE]);
    const urlWithQuery = 'https://www.walmart.com/ip/Some-Product/10804596?classType=VARIANT&athbdg=L1300';

    await refreshWalmartProductUrlViaApify(urlWithQuery);

    expect(mockRunApifyActor).toHaveBeenCalledOnce();
    const [actorId, input] = mockRunApifyActor.mock.calls[0];
    expect(actorId).toBe(PRATIKDANI_ACTOR);
    // Normalized URL strips query params
    expect(input.url).toBe('https://www.walmart.com/ip/10804596');
    expect(input.url).not.toContain('classType');
  });

  it('uses 90s default timeout when none provided', async () => {
    mockRunApifyActor.mockResolvedValueOnce([FULL_ACTOR_RESPONSE]);
    await refreshWalmartProductUrlViaApify(WALMART_URL);
    const [, , timeout] = mockRunApifyActor.mock.calls[0];
    expect(timeout).toBe(90_000);
  });

  it('passes custom timeout to the actor', async () => {
    mockRunApifyActor.mockResolvedValueOnce([FULL_ACTOR_RESPONSE]);
    await refreshWalmartProductUrlViaApify(WALMART_URL, 45_000);
    const [, , timeout] = mockRunApifyActor.mock.calls[0];
    expect(timeout).toBe(45_000);
  });
});

// ---------------------------------------------------------------------------
// 2. Maps final_price number to price
// ---------------------------------------------------------------------------

describe('price mapping', () => {
  it('maps final_price number directly to price', async () => {
    mockRunApifyActor.mockResolvedValueOnce([{ ...FULL_ACTOR_RESPONSE, final_price: 24.97 }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.price).toBe(24.97);
  });

  // 3. Falls back to price string if final_price missing
  it('falls back to price string when final_price is absent', async () => {
    const { final_price: _removed, ...noFinalPrice } = FULL_ACTOR_RESPONSE;
    mockRunApifyActor.mockResolvedValueOnce([{ ...noFinalPrice, price: '$19.99' }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.price).toBe(19.99);
  });

  it('falls back to price when it is already a number', async () => {
    const { final_price: _removed, ...noFinalPrice } = FULL_ACTOR_RESPONSE;
    mockRunApifyActor.mockResolvedValueOnce([{ ...noFinalPrice, price: 14.88 }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.price).toBe(14.88);
  });

  // 14. Missing price returns null, not 0
  it('returns price=null when both final_price and price are absent', async () => {
    const { final_price: _fp, price: _p, ...noPriceFields } = FULL_ACTOR_RESPONSE;
    mockRunApifyActor.mockResolvedValueOnce([{ ...noPriceFields }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.price).toBeNull();
    expect(result.price).not.toBe(0);
  });

  it('returns price=null when price string is empty', async () => {
    const { final_price: _fp, ...noFinalPrice } = FULL_ACTOR_RESPONSE;
    mockRunApifyActor.mockResolvedValueOnce([{ ...noFinalPrice, price: '' }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.price).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Maps is_available true to available true
// ---------------------------------------------------------------------------

describe('availability mapping', () => {
  it('maps is_available=true to available=true', async () => {
    mockRunApifyActor.mockResolvedValueOnce([{ ...FULL_ACTOR_RESPONSE, is_available: true }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.available).toBe(true);
  });

  // 5. Maps is_available false to available false
  it('maps is_available=false to available=false', async () => {
    mockRunApifyActor.mockResolvedValueOnce([{ ...FULL_ACTOR_RESPONSE, is_available: false }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.available).toBe(false);
  });

  // 6. Falls back to availability string
  it('falls back to availability string "in_stock" when is_available absent', async () => {
    const { is_available: _removed, ...noIsAvailable } = FULL_ACTOR_RESPONSE;
    mockRunApifyActor.mockResolvedValueOnce([{ ...noIsAvailable, availability: 'in_stock' }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.available).toBe(true);
  });

  it('maps availability "out_of_stock" to available=false when is_available absent', async () => {
    const { is_available: _removed, ...noIsAvailable } = FULL_ACTOR_RESPONSE;
    mockRunApifyActor.mockResolvedValueOnce([{ ...noIsAvailable, availability: 'out_of_stock' }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.available).toBe(false);
  });

  it('returns available=null for ambiguous availability string', async () => {
    const { is_available: _removed, ...noIsAvailable } = FULL_ACTOR_RESPONSE;
    mockRunApifyActor.mockResolvedValueOnce([{ ...noIsAvailable, availability: 'UNKNOWN_STATUS' }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.available).toBeNull();
  });

  it('returns available=null when both is_available and availability are absent', async () => {
    const { is_available: _ia, availability: _av, ...noAvailability } = FULL_ACTOR_RESPONSE;
    mockRunApifyActor.mockResolvedValueOnce([{ ...noAvailability }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.available).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7–12. Field mapping
// ---------------------------------------------------------------------------

describe('field mapping', () => {
  it('maps product_name to title', async () => {
    mockRunApifyActor.mockResolvedValueOnce([{ ...FULL_ACTOR_RESPONSE, product_name: 'Test Widget' }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.title).toBe('Test Widget');
  });

  it('maps main_image to imageUrl', async () => {
    mockRunApifyActor.mockResolvedValueOnce([{ ...FULL_ACTOR_RESPONSE, main_image: 'https://i5.walmartimages.com/test.jpg' }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.imageUrl).toBe('https://i5.walmartimages.com/test.jpg');
  });

  it('maps seller to sellerName', async () => {
    mockRunApifyActor.mockResolvedValueOnce([{ ...FULL_ACTOR_RESPONSE, seller: 'Third Party Seller' }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.sellerName).toBe('Third Party Seller');
  });

  it('maps product_id to retailerItemId', async () => {
    mockRunApifyActor.mockResolvedValueOnce([{ ...FULL_ACTOR_RESPONSE, product_id: '10804596' }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.retailerItemId).toBe('10804596');
  });

  it('maps product_id as number to retailerItemId string', async () => {
    mockRunApifyActor.mockResolvedValueOnce([{ ...FULL_ACTOR_RESPONSE, product_id: 10804596 }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.retailerItemId).toBe('10804596');
  });

  it('maps upc field', async () => {
    mockRunApifyActor.mockResolvedValueOnce([{ ...FULL_ACTOR_RESPONSE, upc: '305211793049', gtin: undefined }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.upc).toBe('305211793049');
  });

  it('falls back to gtin when upc absent', async () => {
    const { upc: _removed, ...noUpc } = FULL_ACTOR_RESPONSE;
    mockRunApifyActor.mockResolvedValueOnce([{ ...noUpc, gtin: '305211793049' }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.upc).toBe('305211793049');
  });

  it('maps brand field', async () => {
    mockRunApifyActor.mockResolvedValueOnce([{ ...FULL_ACTOR_RESPONSE, brand: "POND'S" }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.brand).toBe("POND'S");
  });

  it('sets parseSource to "apify-pratikdani" on success', async () => {
    mockRunApifyActor.mockResolvedValueOnce([FULL_ACTOR_RESPONSE]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.parseSource).toBe('apify-pratikdani');
  });

  it('sets retailer to "Walmart"', async () => {
    mockRunApifyActor.mockResolvedValueOnce([FULL_ACTOR_RESPONSE]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.retailer).toBe('Walmart');
  });

  it('sets checkedAt to a valid ISO timestamp', async () => {
    mockRunApifyActor.mockResolvedValueOnce([FULL_ACTOR_RESPONSE]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(() => new Date(result.checkedAt)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 13. Silent failure returns available null and error
// ---------------------------------------------------------------------------

describe('silent failure handling', () => {
  it('returns available=null and error when actor returns only input/timestamp', async () => {
    const silentResponse = {
      input:     { url: WALMART_URL },
      timestamp: '2026-07-27T22:00:00.000Z',
    };
    mockRunApifyActor.mockResolvedValueOnce([silentResponse]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.available).toBeNull();
    expect(result.available).not.toBe(false);
    expect(result.error).toBe('Actor returned no product data');
    expect(result.price).toBeNull();
    expect(result.title).toBeNull();
  });

  it('returns error string on silent failure', async () => {
    mockRunApifyActor.mockResolvedValueOnce([{ input: { url: WALMART_URL }, timestamp: '2026-07-27T22:00:00.000Z' }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });

  it('returns error when actor returns empty array', async () => {
    mockRunApifyActor.mockResolvedValueOnce([]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.available).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('sets parseSource to "apify-pratikdani" even on silent failure', async () => {
    mockRunApifyActor.mockResolvedValueOnce([{ input: {}, timestamp: '' }]);
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.parseSource).toBe('apify-pratikdani');
  });
});

// ---------------------------------------------------------------------------
// 15. Non-Walmart URL rejected before Apify call
// ---------------------------------------------------------------------------

describe('URL validation', () => {
  it('rejects a non-Walmart URL without calling the actor', async () => {
    const result = await refreshWalmartProductUrlViaApify('https://www.target.com/p/widget/-/A-12345');
    expect(result.error).toBeTruthy();
    expect(mockRunApifyActor).not.toHaveBeenCalled();
    expect(result.available).toBeNull();
  });

  it('rejects a Walmart non-product URL without calling the actor', async () => {
    const result = await refreshWalmartProductUrlViaApify('https://www.walmart.com/browse/electronics');
    expect(result.error).toBeTruthy();
    expect(mockRunApifyActor).not.toHaveBeenCalled();
  });

  it('accepts a Walmart product URL with query params and strips them', async () => {
    mockRunApifyActor.mockResolvedValueOnce([FULL_ACTOR_RESPONSE]);
    await refreshWalmartProductUrlViaApify('https://www.walmart.com/ip/Widget/10804596?foo=bar');
    expect(mockRunApifyActor).toHaveBeenCalledOnce();
    expect(mockRunApifyActor.mock.calls[0][1].url).not.toContain('foo=bar');
  });
});

// ---------------------------------------------------------------------------
// 16. Actor timeout/error returns safe unknown result
// ---------------------------------------------------------------------------

describe('actor error handling', () => {
  it('returns available=null (not false) on actor timeout error', async () => {
    mockRunApifyActor.mockRejectedValueOnce(new Error('The operation was aborted due to timeout'));
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.available).toBeNull();
    expect(result.available).not.toBe(false);
    expect(result.error).toMatch(/timeout/i);
  });

  it('returns available=null on actor HTTP error', async () => {
    mockRunApifyActor.mockRejectedValueOnce(new Error('Apify actor pratikdani/walmart-product-scraper failed: HTTP 429'));
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.available).toBeNull();
    expect(result.error).toMatch(/429/);
  });

  it('does not throw on actor rejection — returns error object instead', async () => {
    mockRunApifyActor.mockRejectedValueOnce(new Error('network failure'));
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.price).toBeNull();
    expect(result.available).toBeNull();
    expect(result.error).toContain('network failure');
  });

  it('includes error message on actor rejection', async () => {
    mockRunApifyActor.mockRejectedValueOnce(new Error('actor crashed unexpectedly'));
    const result = await refreshWalmartProductUrlViaApify(WALMART_URL);
    expect(result.error).toContain('actor crashed unexpectedly');
  });
});

// ---------------------------------------------------------------------------
// 17. No Prisma imports
// ---------------------------------------------------------------------------

describe('no DB writes', () => {
  it('walmart-apify-refresh module does not import prisma', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync(
        new URL('./walmart-apify-refresh.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
        'utf8',
      ),
    );
    expect(src).not.toMatch(/from ['"]@\/lib\/prisma['"]/);
    expect(src).not.toMatch(/prisma\.(product|lead|sourceCandidate)\.(create|update|upsert|delete)/);
  });

  // 18. No Product/Lead writes
  it('does not contain any freshnessStatus write patterns', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync(
        new URL('./walmart-apify-refresh.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
        'utf8',
      ),
    );
    expect(src).not.toMatch(/freshnessStatus.*=/);
    expect(src).not.toMatch(/priceCheckedAt.*=/);
    expect(src).not.toMatch(/sourceCheckedAt.*=/);
  });
});

// ---------------------------------------------------------------------------
// 19. No SP-API or Keepa imports
// ---------------------------------------------------------------------------

describe('no external service imports', () => {
  it('walmart-apify-refresh module does not import SP-API or Keepa', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync(
        new URL('./walmart-apify-refresh.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
        'utf8',
      ),
    );
    // Check negative assertions on import lines only (not comments)
    const importLines = src.split('\n').filter(l => /^import\s/.test(l.trim())).join('\n');
    expect(importLines).not.toMatch(/keepa/i);
    expect(importLines).not.toMatch(/sp-api/i);
    expect(importLines).not.toMatch(/amazon-sp/i);
    // Full source must contain both import statements
    expect(src).toMatch(/from ['"]@\/lib\/apify['"]/);
    expect(src).toMatch(/from ['"]@\/lib\/walmart-product-refresh['"]/)
  });
});
