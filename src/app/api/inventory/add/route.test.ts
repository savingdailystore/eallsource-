import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const upsert    = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { inventoryItem: { upsert: (...args: unknown[]) => upsert(...args) } },
}));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/inventory/add', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

describe('POST /api/inventory/add', () => {
  beforeEach(() => {
    authMock.mockReset();
    upsert.mockReset();
    authMock.mockResolvedValue({ user: { orgId: 'org_1' } });
    upsert.mockResolvedValue({ id: 'item_1' });
  });

  it('rejects when asin is missing', async () => {
    const res = await POST(makeRequest({ productName: 'Widget' }));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects when productName is missing', async () => {
    const res = await POST(makeRequest({ asin: 'B000123456' }));
    expect(res.status).toBe(400);
  });

  it('coerces numeric-string quantities and defaults missing ones to 0', async () => {
    await POST(makeRequest({ asin: 'b000123456', productName: 'Widget', availableQuantity: '7' }));
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          asin: 'B000123456',
          availableQuantity: 7,
          reservedQuantity: 0,
          inboundQuantity: 0,
          totalQuantity: 0,
        }),
      }),
    );
  });

  it('falls back to 0 for a quantity above the max bound instead of writing an arbitrary integer', async () => {
    await POST(makeRequest({ asin: 'B1', productName: 'Widget', availableQuantity: 99_999_999 }));
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ availableQuantity: 0 }) }),
    );
  });

  it('falls back to 0 for a non-numeric quantity, matching the previous toInt() behavior', async () => {
    await POST(makeRequest({ asin: 'B2', productName: 'Widget', availableQuantity: 'not-a-number' }));
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ availableQuantity: 0 }) }),
    );
  });
});
