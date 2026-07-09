import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock     = vi.fn();
const invFindMany  = vi.fn();
const saleFindMany = vi.fn();
const saleUpdate   = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    inventoryItem: { findMany: (...a: unknown[]) => invFindMany(...a) },
    saleRecord: {
      findMany: (...a: unknown[]) => saleFindMany(...a),
      update:   (...a: unknown[]) => saleUpdate(...a),
    },
  },
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/sales/recalculate-costs/apply', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

const OWNER_SESSION = { user: { orgId: 'org_1', role: 'OWNER' } };
const GOOD_ITEM     = { id: 'inv_1', sku: 'SKU-A', unitCost: 12.09 };

const GOOD_SALE = {
  id: 'sale_1', sku: 'SKU-A', asin: 'B001', quantitySold: 2,
  netRevenue: 39.98, totalFees: null, unitCostUsed: null,
  orderStatus: 'Shipped',
};

describe('POST /api/sales/recalculate-costs/apply', () => {
  beforeEach(() => {
    authMock.mockReset();
    invFindMany.mockReset();
    saleFindMany.mockReset();
    saleUpdate.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
    invFindMany.mockResolvedValue([GOOD_ITEM]);
    saleFindMany.mockResolvedValue([GOOD_SALE]);
    saleUpdate.mockResolvedValue({});
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeReq({ sku: 'SKU-A', confirmed: true }));
    expect(res.status).toBe(401);
    expect(saleUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 for VIEWER role', async () => {
    authMock.mockResolvedValue({ user: { orgId: 'org_1', role: 'VIEWER' } });
    const res = await POST(makeReq({ sku: 'SKU-A', confirmed: true }));
    expect(res.status).toBe(403);
    expect(saleUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when sku is missing', async () => {
    const res = await POST(makeReq({ confirmed: true }));
    expect(res.status).toBe(400);
    expect(saleUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when confirmed is not true', async () => {
    const res = await POST(makeReq({ sku: 'SKU-A', confirmed: false }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('confirmed must be true');
    expect(saleUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when confirmed is missing', async () => {
    const res = await POST(makeReq({ sku: 'SKU-A' }));
    expect(res.status).toBe(400);
    expect(saleUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when no inventory item found', async () => {
    invFindMany.mockResolvedValue([]);
    const res = await POST(makeReq({ sku: 'SKU-MISSING', confirmed: true }));
    expect(res.status).toBe(400);
    expect(saleUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 when multiple inventory items for SKU', async () => {
    invFindMany.mockResolvedValue([GOOD_ITEM, { ...GOOD_ITEM, id: 'inv_2' }]);
    const res = await POST(makeReq({ sku: 'SKU-A', confirmed: true }));
    expect(res.status).toBe(409);
    expect(saleUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when inventory unitCost is null', async () => {
    invFindMany.mockResolvedValue([{ ...GOOD_ITEM, unitCost: null }]);
    const res = await POST(makeReq({ sku: 'SKU-A', confirmed: true }));
    expect(res.status).toBe(400);
    expect(saleUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when inventory unitCost is 0', async () => {
    invFindMany.mockResolvedValue([{ ...GOOD_ITEM, unitCost: 0 }]);
    const res = await POST(makeReq({ sku: 'SKU-A', confirmed: true }));
    expect(res.status).toBe(400);
    expect(saleUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when inventory unitCost is negative', async () => {
    invFindMany.mockResolvedValue([{ ...GOOD_ITEM, unitCost: -3 }]);
    const res = await POST(makeReq({ sku: 'SKU-A', confirmed: true }));
    expect(res.status).toBe(400);
    expect(saleUpdate).not.toHaveBeenCalled();
  });

  it('returns 200 and updates eligible records', async () => {
    const res  = await POST(makeReq({ sku: 'SKU-A', confirmed: true }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updatedCount).toBe(1);
    expect(data.skippedCount).toBe(0);
    expect(saleUpdate).toHaveBeenCalledTimes(1);
  });

  it('writes only allowed fields — never fees or revenue', async () => {
    await POST(makeReq({ sku: 'SKU-A', confirmed: true }));
    const updateCall = saleUpdate.mock.calls[0][0];
    const written = updateCall.data;

    // Fields that MUST be written
    expect(written).toHaveProperty('unitCostUsed');
    expect(written).toHaveProperty('costSource', 'INVENTORY');
    expect(written).toHaveProperty('cogs');
    expect(written).toHaveProperty('grossProfitBeforeFees');
    expect(written).toHaveProperty('grossRoiBeforeFees');
    expect(written).toHaveProperty('realizedProfit');
    expect(written).toHaveProperty('roi');

    // Fields that must NOT be written
    expect(written).not.toHaveProperty('grossRevenue');
    expect(written).not.toHaveProperty('netRevenue');
    expect(written).not.toHaveProperty('totalFees');
    expect(written).not.toHaveProperty('referralFee');
    expect(written).not.toHaveProperty('fbaFee');
    expect(written).not.toHaveProperty('otherFees');
    expect(written).not.toHaveProperty('rawPayload');
    expect(written).not.toHaveProperty('sku');
    expect(written).not.toHaveProperty('asin');
    expect(written).not.toHaveProperty('orderStatus');
  });

  it('is idempotent — skips rows that already have unitCostUsed', async () => {
    saleFindMany.mockResolvedValue([
      { ...GOOD_SALE, unitCostUsed: 12.09 },  // already filled
    ]);
    const res  = await POST(makeReq({ sku: 'SKU-A', confirmed: true }));
    const data = await res.json();
    expect(data.updatedCount).toBe(0);
    expect(data.skippedCount).toBe(1);
    expect(saleUpdate).not.toHaveBeenCalled();
  });

  it('does not update a row with existing unitCostUsed even in a mixed set', async () => {
    saleFindMany.mockResolvedValue([
      GOOD_SALE,
      { ...GOOD_SALE, id: 'sale_2', unitCostUsed: 12.09 },
    ]);
    const res  = await POST(makeReq({ sku: 'SKU-A', confirmed: true }));
    const data = await res.json();
    expect(data.updatedCount).toBe(1);
    expect(data.skippedCount).toBe(1);
    expect(saleUpdate).toHaveBeenCalledTimes(1);
    expect(saleUpdate.mock.calls[0][0].where.id).toBe('sale_1');
  });

  it('does not update Cancelled records', async () => {
    saleFindMany.mockResolvedValue([
      { ...GOOD_SALE, orderStatus: 'Cancelled' },
    ]);
    const res  = await POST(makeReq({ sku: 'SKU-A', confirmed: true }));
    const data = await res.json();
    expect(data.updatedCount).toBe(0);
    expect(saleUpdate).not.toHaveBeenCalled();
  });
});
