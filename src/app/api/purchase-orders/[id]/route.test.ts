import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock        = vi.fn();
const findFirstMock   = vi.fn();
const findManyMock    = vi.fn();
const updateMock      = vi.fn();
const updateManyMock  = vi.fn();
const transactionMock = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    purchaseOrder: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      update:    (...args: unknown[]) => updateMock(...args),
    },
    purchaseOrderItem: {
      findMany:    (...args: unknown[]) => findManyMock(...args),
      updateMany:  (...args: unknown[]) => updateManyMock(...args),
    },
    $transaction: (arr: unknown) => transactionMock(arr),
  },
}));

import { PATCH, DELETE } from './route';

const OWNER_SESSION   = { user: { orgId: 'org_1', role: 'OWNER'   } };
const ADMIN_SESSION   = { user: { orgId: 'org_1', role: 'ADMIN'   } };
const VIEWER_SESSION  = { user: { orgId: 'org_1', role: 'VIEWER'  } };
const ANALYST_SESSION = { user: { orgId: 'org_1', role: 'ANALYST' } };

const BASE_PO = {
  id:             'po_1',
  orgId:          'org_1',
  status:         'ORDERED',
  supplierName:   'Acme Co',
  shippingCost:   10,
  tax:            5,
  totalCost:      115,
  orderDate:      new Date('2024-06-01'),
  items:          [],
};

function makeRequest(body: unknown, id = 'po_1') {
  return {
    json: async () => body,
    url:  `http://localhost/api/purchase-orders/${id}`,
  } as unknown as import('next/server').NextRequest;
}

function params(id = 'po_1') {
  return { params: Promise.resolve({ id }) };
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

describe('PATCH /api/purchase-orders/[id]', () => {
  beforeEach(() => {
    authMock.mockReset();
    findFirstMock.mockReset();
    findManyMock.mockReset();
    updateMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
    findFirstMock.mockResolvedValue(BASE_PO);
    updateMock.mockResolvedValue({ ...BASE_PO, items: [] });
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ supplierName: 'Test' }), params());
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is VIEWER', async () => {
    authMock.mockResolvedValue(VIEWER_SESSION);
    const res = await PATCH(makeRequest({ supplierName: 'Test' }), params());
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 404 when PO not found', async () => {
    findFirstMock.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ supplierName: 'Test' }), params());
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 422 when editing a CANCELLED PO', async () => {
    findFirstMock.mockResolvedValue({ ...BASE_PO, status: 'CANCELLED' });
    const res = await PATCH(makeRequest({ supplierName: 'New Name' }), params());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/cancelled/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('updates header fields and returns 200', async () => {
    updateMock.mockResolvedValue({ ...BASE_PO, supplierName: 'New Supplier', items: [] });
    const res = await PATCH(makeRequest({ supplierName: 'New Supplier' }), params());
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ supplierName: 'New Supplier' }),
      }),
    );
  });

  it('recalculates totalCost when shippingCost changes', async () => {
    // Items subtotal: 100; newShipping: 20; existing tax: 5 → totalCost = 125
    findManyMock.mockResolvedValue([{ totalCost: 100 }]);
    updateMock.mockResolvedValue({ ...BASE_PO, shippingCost: 20, totalCost: 125, items: [] });

    const res = await PATCH(makeRequest({ shippingCost: 20 }), params());
    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalCost: 125, shippingCost: 20 }),
      }),
    );
  });

  it('ANALYST role is allowed to edit', async () => {
    authMock.mockResolvedValue(ANALYST_SESSION);
    const res = await PATCH(makeRequest({ notes: 'updated' }), params());
    expect(res.status).toBe(200);
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe('DELETE /api/purchase-orders/[id]', () => {
  beforeEach(() => {
    authMock.mockReset();
    findFirstMock.mockReset();
    updateMock.mockReset();
    updateManyMock.mockReset();
    transactionMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
    findFirstMock.mockResolvedValue({ ...BASE_PO, items: [] });
    updateManyMock.mockResolvedValue({ count: 0 });
    updateMock.mockResolvedValue({ ...BASE_PO, status: 'CANCELLED' });
    transactionMock.mockImplementation(async (arr: Promise<unknown>[]) => Promise.all(arr));
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(makeRequest({}), params());
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is ANALYST (not OWNER or ADMIN)', async () => {
    authMock.mockResolvedValue(ANALYST_SESSION);
    const res = await DELETE(makeRequest({}), params());
    expect(res.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('returns 422 when cancelling a fully RECEIVED PO', async () => {
    findFirstMock.mockResolvedValue({ ...BASE_PO, status: 'RECEIVED', items: [] });
    const res = await DELETE(makeRequest({}), params());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/received/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('returns 422 when cancelling a CLOSED PO', async () => {
    findFirstMock.mockResolvedValue({ ...BASE_PO, status: 'CLOSED', items: [] });
    const res = await DELETE(makeRequest({}), params());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/closed/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('cancels an ORDERED PO and returns success', async () => {
    const res = await DELETE(makeRequest({}), params());
    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalled();
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('ADMIN role is allowed to cancel', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await DELETE(makeRequest({}), params());
    expect(res.status).toBe(200);
  });
});
