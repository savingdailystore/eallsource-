import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock     = vi.fn();
const invFindMany  = vi.fn();
const saleFindMany = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    inventoryItem: { findMany: (...a: unknown[]) => invFindMany(...a) },
    saleRecord:    { findMany: (...a: unknown[]) => saleFindMany(...a) },
  },
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/sales/recalculate-costs/preview', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

const OWNER_SESSION = { user: { orgId: 'org_1', role: 'OWNER' } };
const ADMIN_SESSION = { user: { orgId: 'org_1', role: 'ADMIN' } };

const GOOD_ITEM = { id: 'inv_1', sku: 'SKU-A', unitCost: 12.09 };

const GOOD_SALE = {
  id: 'sale_1', sku: 'SKU-A', asin: 'B001', quantitySold: 2,
  netRevenue: 39.98, totalFees: null, unitCostUsed: null,
  orderStatus: 'Shipped', productName: 'Widget', saleDate: new Date('2026-06-01'),
};

describe('POST /api/sales/recalculate-costs/preview', () => {
  beforeEach(() => {
    authMock.mockReset();
    invFindMany.mockReset();
    saleFindMany.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
    invFindMany.mockResolvedValue([GOOD_ITEM]);
    saleFindMany.mockResolvedValue([GOOD_SALE]);
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeReq({ sku: 'SKU-A' }));
    expect(res.status).toBe(401);
    expect(invFindMany).not.toHaveBeenCalled();
  });

  it('returns 403 for VIEWER role', async () => {
    authMock.mockResolvedValue({ user: { orgId: 'org_1', role: 'VIEWER' } });
    const res = await POST(makeReq({ sku: 'SKU-A' }));
    expect(res.status).toBe(403);
  });

  it('allows ADMIN role', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makeReq({ sku: 'SKU-A' }));
    expect(res.status).toBe(200);
  });

  it('returns 400 when sku is missing', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/sku is required/i);
  });

  it('returns 400 when sku is empty string', async () => {
    const res = await POST(makeReq({ sku: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when no inventory item found', async () => {
    invFindMany.mockResolvedValue([]);
    const res = await POST(makeReq({ sku: 'SKU-MISSING' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('No inventory item found');
  });

  it('returns 409 when multiple inventory items found for same SKU', async () => {
    invFindMany.mockResolvedValue([GOOD_ITEM, { ...GOOD_ITEM, id: 'inv_2' }]);
    const res = await POST(makeReq({ sku: 'SKU-A' }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain('Multiple inventory items');
  });

  it('returns 400 when inventory unitCost is null', async () => {
    invFindMany.mockResolvedValue([{ ...GOOD_ITEM, unitCost: null }]);
    const res = await POST(makeReq({ sku: 'SKU-A' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('no valid unit cost');
  });

  it('returns 400 when inventory unitCost is 0', async () => {
    invFindMany.mockResolvedValue([{ ...GOOD_ITEM, unitCost: 0 }]);
    const res = await POST(makeReq({ sku: 'SKU-A' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when inventory unitCost is negative', async () => {
    invFindMany.mockResolvedValue([{ ...GOOD_ITEM, unitCost: -5 }]);
    const res = await POST(makeReq({ sku: 'SKU-A' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 with eligibleCount and warnings on a valid request', async () => {
    const res = await POST(makeReq({ sku: 'SKU-A' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.eligibleCount).toBe(1);
    expect(data.inventoryUnitCost).toBe(12.09);
    expect(Array.isArray(data.warnings)).toBe(true);
    expect(data.warnings.length).toBeGreaterThan(0);
  });

  it('does not write to the DB', async () => {
    await POST(makeReq({ sku: 'SKU-A' }));
    // Only reads — no update/create calls
    expect(invFindMany).toHaveBeenCalledTimes(1);
    expect(saleFindMany).toHaveBeenCalledTimes(1);
  });

  it('returns skippedCount for records that already have cost', async () => {
    saleFindMany.mockResolvedValue([
      GOOD_SALE,
      { ...GOOD_SALE, id: 'sale_2', unitCostUsed: 12.09 },
    ]);
    const res  = await POST(makeReq({ sku: 'SKU-A' }));
    const data = await res.json();
    expect(data.eligibleCount).toBe(1);
    expect(data.skippedCount).toBe(1);
  });
});
