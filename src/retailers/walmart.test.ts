import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const runApifyActor  = vi.fn();
const lookupUpcCache = vi.fn();
const writeUpcCache  = vi.fn();

vi.mock('@/lib/apify',     () => ({ runApifyActor:  (...a: unknown[]) => runApifyActor(...a)  }));
vi.mock('@/lib/upc-cache', () => ({
  lookupUpcCache: (...a: unknown[]) => lookupUpcCache(...a),
  writeUpcCache:  (...a: unknown[]) => writeUpcCache(...a),
  // normalizeSourceUrl and extractWalmartItemId are used internally by walmart.ts
  // but only indirectly via the cache helpers above — we don't need real impls here.
  normalizeSourceUrl:      (url: string) => url.split('?')[0].toLowerCase().replace(/\/+$/, ''),
  extractWalmartItemId:    (url: string) => {
    const seg = url.split('?')[0].split('/').filter(Boolean).pop() ?? '';
    return /^\d+$/.test(seg) ? seg : undefined;
  },
  isValidUpc: (v: unknown) => typeof v === 'string' && /^\d{8}$|^\d{12}$|^\d{13}$/.test(v),
}));

import { WalmartRetailer } from './walmart';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEARCH_RESULT = [{
  name: 'Test Product',
  brand: 'TestBrand',
  price: 20,
  url: 'https://www.walmart.com/ip/Test-Product/111111111',
  onSale: true,
}];

function freshHit(upc = '012345678901', model: string | null = null) {
  return { status: 'HIT' as const, upc, ean: null, model, brand: null, title: null };
}
function freshMiss() {
  return { status: 'MISS' as const, upc: null, ean: null, model: null, brand: null, title: null };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('WalmartRetailer.search — UPC enrichment cache integration', () => {
  let retailer: WalmartRetailer;

  beforeEach(() => {
    retailer = new WalmartRetailer();
    runApifyActor.mockReset();
    lookupUpcCache.mockReset();
    writeUpcCache.mockReset();
    writeUpcCache.mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('uses cached UPC and does NOT call pratikdani actor on cache HIT', async () => {
    // Search actor returns one product
    runApifyActor.mockResolvedValueOnce(SEARCH_RESULT);
    // Cache returns a fresh HIT
    lookupUpcCache.mockResolvedValue(freshHit('012345678901'));

    const products = await retailer.search('coffee maker');

    expect(products[0].upc).toBe('012345678901');

    // Only the search actor should have been called — not the detail actor (UPC_ACTOR)
    const detailActorCalls = runApifyActor.mock.calls.filter(
      ([actorId]) => actorId === 'pratikdani/walmart-product-scraper',
    );
    expect(detailActorCalls).toHaveLength(0);
  });

  it('increments upcCacheHits and upcActorCallsAvoided on cache HIT', async () => {
    runApifyActor.mockResolvedValueOnce(SEARCH_RESULT);
    lookupUpcCache.mockResolvedValue(freshHit());

    await retailer.search('coffee maker');

    expect(retailer.lastEnrichmentMetrics?.upcCacheHits).toBe(1);
    expect(retailer.lastEnrichmentMetrics?.upcActorCallsAvoided).toBe(1);
    expect(retailer.lastEnrichmentMetrics?.upcEnrichmentAttempted).toBe(0);
  });

  it('skips actor and increments upcCacheMisses + upcActorCallsAvoided on fresh MISS', async () => {
    runApifyActor.mockResolvedValueOnce(SEARCH_RESULT);
    lookupUpcCache.mockResolvedValue(freshMiss());

    const products = await retailer.search('coffee maker');

    expect(products[0].upc).toBeUndefined();
    expect(retailer.lastEnrichmentMetrics?.upcCacheMisses).toBe(1);
    expect(retailer.lastEnrichmentMetrics?.upcActorCallsAvoided).toBe(1);
    expect(retailer.lastEnrichmentMetrics?.upcEnrichmentAttempted).toBe(0);
  });

  it('calls actor on cache cold, writes HIT, increments upcEnrichmentSucceeded', async () => {
    runApifyActor.mockResolvedValueOnce(SEARCH_RESULT); // search actor
    lookupUpcCache.mockResolvedValue(null);              // cache cold
    runApifyActor.mockResolvedValueOnce([{ upc: '012345678901' }]); // detail actor

    const products = await retailer.search('coffee maker');

    expect(products[0].upc).toBe('012345678901');
    expect(retailer.lastEnrichmentMetrics?.upcEnrichmentSucceeded).toBe(1);
    expect(retailer.lastEnrichmentMetrics?.upcEnrichmentAttempted).toBe(1);
    expect(retailer.lastEnrichmentMetrics?.upcCacheWrites).toBe(1);

    // Verify writeUpcCache was called with HIT
    expect(writeUpcCache).toHaveBeenCalledWith(
      'Walmart',
      expect.stringContaining('walmart.com'),
      expect.objectContaining({ status: 'HIT', upc: '012345678901' }),
    );
  });

  it('writes MISS when actor returns no UPC and increments upcCacheMisses', async () => {
    runApifyActor.mockResolvedValueOnce(SEARCH_RESULT);
    lookupUpcCache.mockResolvedValue(null);
    runApifyActor.mockResolvedValueOnce([{ upc: null }]); // no UPC from actor

    await retailer.search('coffee maker');

    expect(retailer.lastEnrichmentMetrics?.upcCacheMisses).toBe(1);
    expect(writeUpcCache).toHaveBeenCalledWith(
      'Walmart',
      expect.any(String),
      expect.objectContaining({ status: 'MISS' }),
    );
  });

  it('writes FAILED and increments upcEnrichmentFailed on actor error', async () => {
    runApifyActor.mockResolvedValueOnce(SEARCH_RESULT);
    lookupUpcCache.mockResolvedValue(null);
    runApifyActor.mockRejectedValueOnce(new Error('Actor failed: rate limit'));

    await retailer.search('coffee maker');

    expect(retailer.lastEnrichmentMetrics?.upcEnrichmentFailed).toBe(1);
    expect(writeUpcCache).toHaveBeenCalledWith(
      'Walmart',
      expect.any(String),
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('writes TIMEOUT and increments upcEnrichmentTimedOut on timeout error', async () => {
    runApifyActor.mockResolvedValueOnce(SEARCH_RESULT);
    lookupUpcCache.mockResolvedValue(null);
    runApifyActor.mockRejectedValueOnce(new Error('Actor run timed out after 45000ms'));

    await retailer.search('coffee maker');

    expect(retailer.lastEnrichmentMetrics?.upcEnrichmentTimedOut).toBe(1);
    expect(writeUpcCache).toHaveBeenCalledWith(
      'Walmart',
      expect.any(String),
      expect.objectContaining({ status: 'TIMEOUT', failureReason: 'timeout' }),
    );
  });

  it('does not populate p.upc when cached UPC is invalid', async () => {
    runApifyActor.mockResolvedValueOnce(SEARCH_RESULT);
    // Cache returns HIT but with a malformed UPC — isValidUpc returns false
    lookupUpcCache.mockResolvedValue({ ...freshHit('NOT-A-UPC'), upc: 'NOT-A-UPC' });

    const products = await retailer.search('coffee maker');

    // Invalid UPC should not be written to the product
    expect(products[0].upc).toBeUndefined();
  });

  it('lastEnrichmentMetrics is reset to null before each search', async () => {
    retailer.lastEnrichmentMetrics = {
      upcCacheHits: 99, upcCacheMisses: 0, upcCacheWrites: 0, upcCacheFailures: 0,
      upcActorCallsAvoided: 0, upcEnrichmentAttempted: 0, upcEnrichmentSucceeded: 0,
      upcEnrichmentFailed: 0, upcEnrichmentTimedOut: 0,
    };
    // Make the search actor throw so we bail early (metrics stay null after reset)
    runApifyActor.mockRejectedValueOnce(new Error('search failed'));

    await retailer.search('coffee maker');

    expect(retailer.lastEnrichmentMetrics).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('WalmartRetailer — Target scraper isolation', () => {
  it('TargetRetailer does not import or call cache helpers', async () => {
    // The Target scraper is a separate class in target.ts which doesn't import
    // upc-cache. We verify lookupUpcCache was never called in a Target scenario
    // by checking the mock remains uncalled after a direct import of TargetRetailer.
    const { TargetRetailer } = await import('./target');
    const t = new TargetRetailer();
    // getProduct is the only cache-adjacent codepath; confirm it doesn't touch the mock
    lookupUpcCache.mockReset();
    // TargetRetailer.getProduct takes no args (not implemented)
    await (t as unknown as { getProduct(): Promise<unknown> }).getProduct().catch(() => {});
    expect(lookupUpcCache).not.toHaveBeenCalled();
  });
});
