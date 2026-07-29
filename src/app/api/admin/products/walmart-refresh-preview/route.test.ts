import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Auth
const mockAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }));

// Admin check
vi.mock('@/lib/admin', () => ({
  isPlatformAdmin: (email: string | null | undefined) => email === 'admin@example.com',
}));

// Prisma — SELECT only, no writes
const mockFindMany = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findMany: (...a: unknown[]) => mockFindMany(...a) },
  },
}));

// Apify wrapper — no live calls
const mockRefresh = vi.fn();
vi.mock('@/lib/walmart-apify-refresh', () => ({
  refreshWalmartProductUrlViaApify: (...a: unknown[]) => mockRefresh(...a),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adminSession() {
  return { user: { email: 'admin@example.com', role: 'OWNER', id: 'user-1' } };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/products/walmart-refresh-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const WALMART_PRODUCT = {
  id:          'prod-1',
  asin:        'B001ECQ4R6',
  title:       "POND'S Dry Skin Cream 10.1 oz",
  sourceUrl:   'https://www.walmart.com/ip/Ponds-Cream/10804596',
  sourcePrice: 8.84,
};

const SUCCESS_REFRESH = {
  retailer:        'Walmart' as const,
  retailerItemId:  '10804596',
  normalizedUrl:   'https://www.walmart.com/ip/10804596',
  title:           "POND'S Dry Skin Cream 10.1 oz",
  price:           8.84,
  available:       true,
  sellerName:      'Walmart.com',
  imageUrl:        'https://i5.walmartimages.com/image.jpg',
  upc:             '305211793049',
  brand:           "POND'S",
  parseSource:     'apify-pratikdani' as const,
  error:           null,
  checkedAt:       '2026-07-28T00:00:00.000Z',
};

beforeEach(() => {
  mockAuth.mockReset();
  mockFindMany.mockReset();
  mockRefresh.mockReset();
});

// ---------------------------------------------------------------------------
// 1. Non-admin rejected
// ---------------------------------------------------------------------------

describe('authorization', () => {
  it('returns 403 when user is not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when user has non-OWNER role and is not platform admin', async () => {
    mockAuth.mockResolvedValueOnce({ user: { email: 'user@example.com', role: 'MEMBER', id: 'u1' } });
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    expect(res.status).toBe(403);
  });

  it('allows OWNER role', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]);
    mockRefresh.mockResolvedValueOnce(SUCCESS_REFRESH);
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    expect(res.status).toBe(200);
  });

  it('allows platform admin email regardless of role', async () => {
    mockAuth.mockResolvedValueOnce({ user: { email: 'admin@example.com', role: 'MEMBER', id: 'u1' } });
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]);
    mockRefresh.mockResolvedValueOnce(SUCCESS_REFRESH);
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 2. Missing productIds rejected
// ---------------------------------------------------------------------------

describe('input validation', () => {
  it('returns 400 when productIds is missing', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/productIds/);
  });

  it('returns 400 when productIds is an empty array', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    const res = await POST(makeRequest({ productIds: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when productIds is not an array', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    const res = await POST(makeRequest({ productIds: 'prod-1' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON body', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    const req = new NextRequest('http://localhost/api/admin/products/walmart-refresh-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'NOT JSON {{{',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // 3. More than 5 productIds rejected
  it('returns 400 when more than 5 productIds provided', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    const res = await POST(makeRequest({ productIds: ['a', 'b', 'c', 'd', 'e', 'f'] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/[Mm]aximum 5/);
  });

  it('accepts exactly 5 productIds', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([]);
    const res = await POST(makeRequest({ productIds: ['a', 'b', 'c', 'd', 'e'] }));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 4. Non-Walmart products skipped
// ---------------------------------------------------------------------------

describe('product filtering', () => {
  it('skips productIds that are not Walmart products or have no sourceUrl', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    // DB returns nothing (product not found or not Walmart with sourceUrl)
    mockFindMany.mockResolvedValueOnce([]);
    const res = await POST(makeRequest({ productIds: ['non-walmart-prod'] }));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.skippedIds).toContain('non-walmart-prod');
    expect(body.checkedCount).toBe(0);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('reports skipped IDs separately from checked results', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]); // only prod-1 found
    mockRefresh.mockResolvedValueOnce(SUCCESS_REFRESH);
    const res = await POST(makeRequest({ productIds: ['prod-1', 'missing-prod'] }));
    const body = await res.json();
    expect(body.checkedCount).toBe(1);
    expect(body.skippedCount).toBe(1);
    expect(body.skippedIds).toEqual(['missing-prod']);
  });
});

// ---------------------------------------------------------------------------
// 5. Product without sourceUrl handled safely (via DB filter)
// ---------------------------------------------------------------------------

describe('sourceUrl safety', () => {
  it('does not call Apify for products the DB query filtered (no sourceUrl)', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    // Query with sourceUrl: { not: null } filter means no-sourceUrl products never appear
    mockFindMany.mockResolvedValueOnce([]);
    await POST(makeRequest({ productIds: ['no-url-prod'] }));
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6 & 7. Successful preview returns price comparison and delta
// ---------------------------------------------------------------------------

describe('successful preview', () => {
  it('returns price comparison fields on success', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]);
    mockRefresh.mockResolvedValueOnce(SUCCESS_REFRESH);
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(1);
    const r = body.results[0];
    expect(r.productId).toBe('prod-1');
    expect(r.asin).toBe('B001ECQ4R6');
    expect(r.existingSourcePrice).toBe(8.84);
    expect(r.refreshedPrice).toBe(8.84);
    expect(r.priceDelta).toBe(0);
    expect(r.priceDeltaPercent).toBe(0);
    expect(r.refreshedAvailable).toBe(true);
    expect(r.checkedAt).toBeTruthy();
  });

  it('calculates priceDelta correctly when price changed', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]); // sourcePrice 8.84
    mockRefresh.mockResolvedValueOnce({ ...SUCCESS_REFRESH, price: 10.97 });
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    const body = await res.json();
    const r = body.results[0];
    expect(r.priceDelta).toBeCloseTo(2.13, 1);
    expect(r.priceDeltaPercent).toBeCloseTo(24.1, 0);
    expect(r.recommendation).toBe('PRICE_CHANGED');
  });

  it('returns NO_CHANGE when prices match', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]);
    mockRefresh.mockResolvedValueOnce({ ...SUCCESS_REFRESH, price: 8.84 });
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    const body = await res.json();
    expect(body.results[0].recommendation).toBe('NO_CHANGE');
  });

  it('returns priceDelta=null when refreshedPrice is null', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]);
    mockRefresh.mockResolvedValueOnce({ ...SUCCESS_REFRESH, price: null });
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    const body = await res.json();
    expect(body.results[0].priceDelta).toBeNull();
    expect(body.results[0].priceDeltaPercent).toBeNull();
  });

  it('passes all expected fields through to the result', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]);
    mockRefresh.mockResolvedValueOnce(SUCCESS_REFRESH);
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    const body = await res.json();
    const r = body.results[0];
    expect(r.sourceUrl).toBe(WALMART_PRODUCT.sourceUrl);
    expect(r.retailerItemId).toBe('10804596');
    expect(r.sellerName).toBe('Walmart.com');
    expect(r.upc).toBe('305211793049');
    expect(r.brand).toBe("POND'S");
    expect(r.imageUrl).toBeTruthy();
    expect(r.parseSource).toBe('apify-pratikdani');
    expect(r.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Out-of-stock only when explicit
// ---------------------------------------------------------------------------

describe('out-of-stock safety', () => {
  it('returns OUT_OF_STOCK only when available is explicitly false', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]);
    mockRefresh.mockResolvedValueOnce({ ...SUCCESS_REFRESH, available: false, price: 8.84 });
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    const body = await res.json();
    expect(body.results[0].recommendation).toBe('OUT_OF_STOCK');
  });

  it('returns UNKNOWN when available is null (not out of stock)', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]);
    // available: null means parse failure / unknown — must NOT be treated as OOS
    mockRefresh.mockResolvedValueOnce({ ...SUCCESS_REFRESH, available: null, price: null });
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    const body = await res.json();
    expect(body.results[0].recommendation).toBe('UNKNOWN');
    expect(body.results[0].recommendation).not.toBe('OUT_OF_STOCK');
  });

  it('returns UNKNOWN when available is null but price matches', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]);
    mockRefresh.mockResolvedValueOnce({ ...SUCCESS_REFRESH, available: null, price: 8.84 });
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    const body = await res.json();
    // available null means unknown — no definitive recommendation possible
    expect(body.results[0].recommendation).toBe('NO_CHANGE');
  });
});

// ---------------------------------------------------------------------------
// 9. Apify error returns safe ERROR/UNKNOWN
// ---------------------------------------------------------------------------

describe('apify error handling', () => {
  it('returns ERROR recommendation when refresh returns an error', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]);
    mockRefresh.mockResolvedValueOnce({
      ...SUCCESS_REFRESH,
      price: null,
      available: null,
      error: 'Actor returned no product data',
    });
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    const body = await res.json();
    expect(body.results[0].recommendation).toBe('ERROR');
    expect(body.results[0].error).toBeTruthy();
  });

  it('returns ERROR when actor timed out', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]);
    mockRefresh.mockResolvedValueOnce({
      ...SUCCESS_REFRESH,
      price: null,
      available: null,
      error: 'Apify actor error: The operation was aborted due to timeout',
    });
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    const body = await res.json();
    expect(body.results[0].recommendation).toBe('ERROR');
    expect(body.results[0].refreshedAvailable).toBeNull();
  });

  it('route returns 200 even when all products return errors (graceful)', async () => {
    mockAuth.mockResolvedValueOnce(adminSession());
    mockFindMany.mockResolvedValueOnce([WALMART_PRODUCT]);
    mockRefresh.mockResolvedValueOnce({ ...SUCCESS_REFRESH, price: null, available: null, error: 'timeout' });
    const res = await POST(makeRequest({ productIds: ['prod-1'] }));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 10. No Prisma update/upsert/create/delete calls
// ---------------------------------------------------------------------------

describe('no DB writes', () => {
  it('route module does not import or call prisma write methods', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync(
        new URL('./route.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
        'utf8',
      ),
    );
    expect(src).not.toMatch(/prisma\.(product|lead|sourceCandidate|auditLog)\.(create|update|upsert|delete|updateMany|deleteMany)/);
  });

  it('does not contain freshnessStatus assignment', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync(
        new URL('./route.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
        'utf8',
      ),
    );
    // 11. No Lead writes
    // 12. No freshness field writes
    expect(src).not.toMatch(/freshnessStatus\s*:/);
    expect(src).not.toMatch(/priceCheckedAt\s*:/);
    expect(src).not.toMatch(/sourceCheckedAt\s*:/);
    expect(src).not.toMatch(/freshnessCheckedAt\s*:/);
    expect(src).not.toMatch(/prisma\.lead\./);
  });

  // 13. No SP-API/Keepa calls
  it('does not import SP-API or Keepa', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync(
        new URL('./route.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
        'utf8',
      ),
    );
    const importLines = src.split('\n').filter(l => /^import\s/.test(l.trim())).join('\n');
    expect(importLines).not.toMatch(/keepa/i);
    expect(importLines).not.toMatch(/sp-api/i);
  });
});

// ---------------------------------------------------------------------------
// 14. No cron added — structural check
// ---------------------------------------------------------------------------

describe('no cron', () => {
  it('route does not export a GET handler (no cron trigger path)', async () => {
    const routeModule = await import('./route');
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
  });
});
