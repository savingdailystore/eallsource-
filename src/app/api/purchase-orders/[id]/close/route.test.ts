import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock      = vi.fn();
const findFirstMock = vi.fn();
const updateMock    = vi.fn();

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    purchaseOrder: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      update:    (...args: unknown[]) => updateMock(...args),
    },
  },
}));

import { POST } from './route';

const OWNER_SESSION   = { user: { orgId: 'org_1', role: 'OWNER'   } };
const ANALYST_SESSION = { user: { orgId: 'org_1', role: 'ANALYST' } };
const VIEWER_SESSION  = { user: { orgId: 'org_1', role: 'VIEWER'  } };

const ORDERED_PO = {
  id:     'po_1',
  orgId:  'org_1',
  status: 'ORDERED',
};

const CLOSED_RESULT = {
  ...ORDERED_PO,
  status:      'CLOSED',
  closedAt:    new Date(),
  closeReason: null,
  items:       [],
};

function makeRequest(body: unknown = {}, id = 'po_1') {
  return {
    json:    async () => body,
    url:     `http://localhost/api/purchase-orders/${id}/close`,
    nextUrl: new URL(`http://localhost/api/purchase-orders/${id}/close`),
  } as unknown as import('next/server').NextRequest;
}

function params(id = 'po_1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/purchase-orders/[id]/close', () => {
  beforeEach(() => {
    authMock.mockReset();
    findFirstMock.mockReset();
    updateMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
    findFirstMock.mockResolvedValue(ORDERED_PO);
    updateMock.mockResolvedValue(CLOSED_RESULT);
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 403 for VIEWER', async () => {
    authMock.mockResolvedValue(VIEWER_SESSION);
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 404 when PO not found', async () => {
    findFirstMock.mockResolvedValue(null);
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('closes an ORDERED PO and returns 200', async () => {
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CLOSED' }),
      }),
    );
  });

  it('closes a PARTIALLY_RECEIVED PO and returns 200', async () => {
    findFirstMock.mockResolvedValue({ ...ORDERED_PO, status: 'PARTIALLY_RECEIVED' });
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CLOSED' }),
      }),
    );
  });

  it('sets closedAt on close', async () => {
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(200);
    const callData = updateMock.mock.calls[0][0].data;
    expect(callData.closedAt).toBeInstanceOf(Date);
  });

  it('stores closeReason when provided', async () => {
    updateMock.mockResolvedValue({ ...CLOSED_RESULT, closeReason: 'Items consumed before tracking.' });
    const res = await POST(makeRequest({ closeReason: 'Items consumed before tracking.' }), params());
    expect(res.status).toBe(200);
    const callData = updateMock.mock.calls[0][0].data;
    expect(callData.closeReason).toBe('Items consumed before tracking.');
  });

  it('allows missing closeReason (stores null)', async () => {
    const res = await POST(makeRequest({}), params());
    expect(res.status).toBe(200);
    const callData = updateMock.mock.calls[0][0].data;
    expect(callData.closeReason).toBeNull();
  });

  it('does not modify PurchaseOrderItem statuses', async () => {
    await POST(makeRequest(), params());
    // Only purchaseOrder.update should be called — no item updates
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).not.toHaveProperty('where.purchaseOrderItem');
  });

  it('does not touch inventory (no inventoryItem calls)', async () => {
    // The prisma mock only exposes purchaseOrder — if the route tried to call
    // prisma.inventoryItem it would throw, failing the test.
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(200);
  });

  it('cannot close a RECEIVED PO — returns 422', async () => {
    findFirstMock.mockResolvedValue({ ...ORDERED_PO, status: 'RECEIVED' });
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(422);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('cannot close a CANCELLED PO — returns 422', async () => {
    findFirstMock.mockResolvedValue({ ...ORDERED_PO, status: 'CANCELLED' });
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(422);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('cannot close an already CLOSED PO — returns 422', async () => {
    findFirstMock.mockResolvedValue({ ...ORDERED_PO, status: 'CLOSED' });
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(422);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('ANALYST role is allowed to close', async () => {
    authMock.mockResolvedValue(ANALYST_SESSION);
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(200);
  });
});
