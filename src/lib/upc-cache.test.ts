import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Prisma mock ───────────────────────────────────────────────────────────────
// Use vi.hoisted so the mock fns are available inside the vi.mock factory,
// which is hoisted to the top of the file by the transform.

const { findFirst, upsert } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  upsert:    vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    retailerUpcCache: { findFirst, upsert },
  },
}));

import {
  normalizeSourceUrl,
  extractWalmartItemId,
  isValidUpc,
  lookupUpcCache,
  writeUpcCache,
} from './upc-cache';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WALMART_URL = 'https://www.walmart.com/ip/Test-Product/123456789';
const WALMART_URL_QP = `${WALMART_URL}?ref=abc&athbdg=L1200`;

function freshRow(overrides: object = {}) {
  return {
    retailer:            'Walmart',
    retailerItemId:      '123456789',
    normalizedSourceUrl: 'https://www.walmart.com/ip/test-product/123456789',
    status:              'HIT',
    upc:                 '012345678901',
    ean:                 null,
    model:               null,
    brand:               null,
    title:               null,
    failureReason:       null,
    expiresAt:           new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    fetchedAt:           new Date(),
    ...overrides,
  };
}

function expiredRow(overrides: object = {}) {
  return freshRow({ expiresAt: new Date(Date.now() - 1000), ...overrides });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeSourceUrl', () => {
  it('strips query params', () => {
    expect(normalizeSourceUrl(WALMART_URL_QP)).toBe(
      'https://www.walmart.com/ip/test-product/123456789',
    );
  });

  it('lowercases the URL', () => {
    expect(normalizeSourceUrl('https://Walmart.com/ip/PRODUCT/123')).toBe(
      'https://walmart.com/ip/product/123',
    );
  });

  it('removes trailing slash', () => {
    expect(normalizeSourceUrl('https://www.walmart.com/ip/test/123/')).toBe(
      'https://www.walmart.com/ip/test/123',
    );
  });

  it('is idempotent on a clean URL', () => {
    const clean = 'https://www.walmart.com/ip/test/123';
    expect(normalizeSourceUrl(clean)).toBe(clean);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('extractWalmartItemId', () => {
  it('extracts numeric item ID from standard Walmart URL', () => {
    expect(extractWalmartItemId(WALMART_URL)).toBe('123456789');
  });

  it('ignores query params when extracting item ID', () => {
    expect(extractWalmartItemId(WALMART_URL_QP)).toBe('123456789');
  });

  it('returns undefined when last segment is non-numeric (slug-only URL)', () => {
    expect(extractWalmartItemId('https://www.walmart.com/ip/test-product')).toBeUndefined();
  });

  it('returns undefined for a non-Walmart-style URL with no numeric segment', () => {
    expect(extractWalmartItemId('https://www.target.com/p/test/-/A-12345')).toBeUndefined();
  });

  it('handles short numeric IDs', () => {
    expect(extractWalmartItemId('https://www.walmart.com/ip/product/1')).toBe('1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('isValidUpc', () => {
  it('accepts 8-digit UPC-E', () => expect(isValidUpc('01234567')).toBe(true));
  it('accepts 12-digit UPC-A', () => expect(isValidUpc('012345678901')).toBe(true));
  it('accepts 13-digit EAN',   () => expect(isValidUpc('0123456789012')).toBe(true));

  it('rejects empty string',    () => expect(isValidUpc('')).toBe(false));
  it('rejects null',            () => expect(isValidUpc(null)).toBe(false));
  it('rejects undefined',       () => expect(isValidUpc(undefined)).toBe(false));
  it('rejects "0" (too short)', () => expect(isValidUpc('0')).toBe(false));
  it('rejects non-numeric',     () => expect(isValidUpc('ABC-DEF-GHI')).toBe(false));
  it('rejects 11-digit',        () => expect(isValidUpc('01234567890')).toBe(false));
  it('rejects 14-digit',        () => expect(isValidUpc('01234567890123')).toBe(false));
  it('rejects mixed alpha',     () => expect(isValidUpc('01234567890A')).toBe(false));
});

// ─────────────────────────────────────────────────────────────────────────────
describe('lookupUpcCache', () => {
  beforeEach(() => {
    findFirst.mockReset();
    upsert.mockReset();
  });

  it('returns null when no cache record exists', async () => {
    findFirst.mockResolvedValue(null);
    expect(await lookupUpcCache('Walmart', WALMART_URL)).toBeNull();
  });

  it('returns HIT data when a fresh HIT exists', async () => {
    findFirst.mockResolvedValue(freshRow({ upc: '012345678901', model: 'MOD-1' }));
    const result = await lookupUpcCache('Walmart', WALMART_URL);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('HIT');
    expect(result!.upc).toBe('012345678901');
    expect(result!.model).toBe('MOD-1');
  });

  it('returns null for an expired HIT (expiresAt in the past)', async () => {
    // The where clause filters by expiresAt > now, so Prisma returns null
    findFirst.mockResolvedValue(null);
    expect(await lookupUpcCache('Walmart', WALMART_URL)).toBeNull();
  });

  it('returns MISS result when a fresh MISS entry exists', async () => {
    findFirst.mockResolvedValue(freshRow({ status: 'MISS', upc: null }));
    const result = await lookupUpcCache('Walmart', WALMART_URL);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('MISS');
    expect(result!.upc).toBeNull();
  });

  it('returns null for a fresh FAILED entry (caller should retry actor)', async () => {
    findFirst.mockResolvedValue(freshRow({ status: 'FAILED', upc: null }));
    expect(await lookupUpcCache('Walmart', WALMART_URL)).toBeNull();
  });

  it('returns null for a fresh TIMEOUT entry (caller should retry actor)', async () => {
    findFirst.mockResolvedValue(freshRow({ status: 'TIMEOUT', upc: null }));
    expect(await lookupUpcCache('Walmart', WALMART_URL)).toBeNull();
  });

  it('returns null on DB error (does not throw)', async () => {
    findFirst.mockRejectedValue(new Error('DB connection lost'));
    await expect(lookupUpcCache('Walmart', WALMART_URL)).resolves.toBeNull();
  });

  it('includes retailerItemId and normalizedSourceUrl in the OR query', async () => {
    findFirst.mockResolvedValue(null);
    await lookupUpcCache('Walmart', WALMART_URL);
    const callArg = findFirst.mock.calls[0][0];
    expect(callArg.where.OR).toEqual(
      expect.arrayContaining([
        { retailerItemId: '123456789' },
        { normalizedSourceUrl: 'https://www.walmart.com/ip/test-product/123456789' },
      ]),
    );
  });

  it('only uses normalizedSourceUrl in OR when item ID cannot be extracted', async () => {
    findFirst.mockResolvedValue(null);
    await lookupUpcCache('Walmart', 'https://www.walmart.com/ip/no-numeric-id');
    const callArg = findFirst.mock.calls[0][0];
    const keys = callArg.where.OR.map((o: object) => Object.keys(o)[0]);
    expect(keys).not.toContain('retailerItemId');
    expect(keys).toContain('normalizedSourceUrl');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('writeUpcCache', () => {
  beforeEach(() => {
    findFirst.mockReset();
    upsert.mockReset();
  });

  it('writes HIT with ~30-day expiresAt', async () => {
    findFirst.mockResolvedValue(null); // no fresh HIT to protect
    upsert.mockResolvedValue({});

    await writeUpcCache('Walmart', WALMART_URL, { status: 'HIT', upc: '012345678901' });

    const data = upsert.mock.calls[0][0].create;
    const diffMs = new Date(data.expiresAt).getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(diffMs).toBeLessThan(31 * 24 * 60 * 60 * 1000);
    expect(data.status).toBe('HIT');
    expect(data.upc).toBe('012345678901');
  });

  it('writes MISS with ~7-day expiresAt', async () => {
    findFirst.mockResolvedValue(null);
    upsert.mockResolvedValue({});

    await writeUpcCache('Walmart', WALMART_URL, { status: 'MISS' });

    const data = upsert.mock.calls[0][0].create;
    const diffMs = new Date(data.expiresAt).getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(diffMs).toBeLessThan(8 * 24 * 60 * 60 * 1000);
    expect(data.status).toBe('MISS');
    expect(data.upc).toBeNull();
  });

  it('writes FAILED with ~3-day expiresAt', async () => {
    findFirst.mockResolvedValue(null);
    upsert.mockResolvedValue({});

    await writeUpcCache('Walmart', WALMART_URL, { status: 'FAILED', failureReason: 'network error' });

    const data = upsert.mock.calls[0][0].create;
    const diffMs = new Date(data.expiresAt).getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(2 * 24 * 60 * 60 * 1000);
    expect(diffMs).toBeLessThan(4 * 24 * 60 * 60 * 1000);
    expect(data.status).toBe('FAILED');
  });

  it('writes TIMEOUT with ~3-day expiresAt', async () => {
    findFirst.mockResolvedValue(null);
    upsert.mockResolvedValue({});

    await writeUpcCache('Walmart', WALMART_URL, { status: 'TIMEOUT', failureReason: 'timeout' });

    const data = upsert.mock.calls[0][0].create;
    const diffMs = new Date(data.expiresAt).getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(2 * 24 * 60 * 60 * 1000);
    expect(diffMs).toBeLessThan(4 * 24 * 60 * 60 * 1000);
    expect(data.status).toBe('TIMEOUT');
  });

  it('uses itemId upsert key when retailerItemId is extractable', async () => {
    findFirst.mockResolvedValue(null);
    upsert.mockResolvedValue({});

    await writeUpcCache('Walmart', WALMART_URL, { status: 'MISS' });

    const callArg = upsert.mock.calls[0][0];
    expect(callArg.where).toHaveProperty('retailer_retailerItemId');
    expect(callArg.where.retailer_retailerItemId).toEqual({ retailer: 'Walmart', retailerItemId: '123456789' });
  });

  it('uses normalizedSourceUrl upsert key when itemId is not extractable', async () => {
    findFirst.mockResolvedValue(null);
    upsert.mockResolvedValue({});

    const noItemUrl = 'https://www.walmart.com/ip/no-id';
    await writeUpcCache('Walmart', noItemUrl, { status: 'MISS' });

    const callArg = upsert.mock.calls[0][0];
    expect(callArg.where).toHaveProperty('retailer_normalizedSourceUrl');
    expect(callArg.where.retailer_normalizedSourceUrl.normalizedSourceUrl).toBe(
      'https://www.walmart.com/ip/no-id',
    );
  });

  it('does NOT overwrite a fresh valid HIT with MISS', async () => {
    // findFirst returns a fresh HIT — write should be skipped
    findFirst.mockResolvedValue(freshRow({ status: 'HIT' }));

    const result = await writeUpcCache('Walmart', WALMART_URL, { status: 'MISS' });

    expect(result).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does NOT overwrite a fresh valid HIT with FAILED', async () => {
    findFirst.mockResolvedValue(freshRow({ status: 'HIT' }));

    const result = await writeUpcCache('Walmart', WALMART_URL, { status: 'FAILED' });

    expect(result).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does NOT overwrite a fresh valid HIT with TIMEOUT', async () => {
    findFirst.mockResolvedValue(freshRow({ status: 'HIT' }));

    const result = await writeUpcCache('Walmart', WALMART_URL, { status: 'TIMEOUT' });

    expect(result).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('can overwrite an existing entry with a new HIT (HIT → HIT)', async () => {
    // HIT writes skip the "protect existing HIT" check
    upsert.mockResolvedValue({});

    const result = await writeUpcCache('Walmart', WALMART_URL, { status: 'HIT', upc: '999999999999' });

    expect(result).toBe(true);
    expect(upsert).toHaveBeenCalled();
  });

  it('coerces malformed UPC to null before writing HIT', async () => {
    upsert.mockResolvedValue({});

    await writeUpcCache('Walmart', WALMART_URL, { status: 'HIT', upc: 'NOT-A-UPC' });

    const data = upsert.mock.calls[0][0].create;
    expect(data.upc).toBeNull();
    // Status is still written as HIT (actor succeeded, UPC just failed validation)
    expect(data.status).toBe('HIT');
  });

  it('does not throw on DB error during the protection check', async () => {
    findFirst.mockRejectedValue(new Error('DB exploded'));
    await expect(writeUpcCache('Walmart', WALMART_URL, { status: 'MISS' })).resolves.toBe(false);
  });

  it('does not throw on DB error during upsert', async () => {
    findFirst.mockResolvedValue(null);
    upsert.mockRejectedValue(new Error('upsert failed'));
    await expect(writeUpcCache('Walmart', WALMART_URL, { status: 'MISS' })).resolves.toBe(false);
  });

  it('returns true when upsert succeeds', async () => {
    findFirst.mockResolvedValue(null);
    upsert.mockResolvedValue({});

    const result = await writeUpcCache('Walmart', WALMART_URL, { status: 'MISS' });
    expect(result).toBe(true);
  });
});
