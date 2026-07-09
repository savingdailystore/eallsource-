import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock        = vi.fn();
const findFirstMock   = vi.fn();
const transactionMock = vi.fn();

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    purchaseOrder: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
    },
    $transaction: (fn: unknown) => transactionMock(fn),
  },
}));

import { POST } from './route';

const OWNER_SESSION  = { user: { orgId: 'org_1', id: 'user_1', role: 'OWNER'  } };
const VIEWER_SESSION = { user: { orgId: 'org_1', id: 'user_1', role: 'VIEWER' } };

const ORDERED_PO = {
  id:      'po_1',
  orgId:   'org_1',
  status:  'ORDERED',
  orderDate: new Date('2024-06-01'),
  items: [
    {
      id:               'item_1',
      asin:             'B000000001',
      sku:              null,
      productName:      'Test Widget',
      quantityOrdered:  10,
      quantityReceived: 0,
      unitCost:         15,
      status:           'ORDERED',
      receivedAt:       null,
    },
  ],
};

function makeRequest(body: unknown, id = 'po_1') {
  return {
    json:    async () => body,
    url:     `http://localhost/api/purchase-orders/${id}/receive`,
    nextUrl: new URL(`http://localhost/api/purchase-orders/${id}/receive`),
  } as unknown as import('next/server').NextRequest;
}

function params(id = 'po_1') {
  return { params: { id } } as never;
}

describe('POST /api/purchase-orders/[id]/receive', () => {
  beforeEach(() => {
    authMock.mockReset();
    findFirstMock.mockReset();
    transactionMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
    findFirstMock.mockResolvedValue(ORDERED_PO);
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ items: [] }), params());
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER', async () => {
    authMock.mockResolvedValue(VIEWER_SESSION);
    const res = await POST(makeRequest({ items: [] }), params());
    expect(res.status).toBe(403);
  });

  it('returns 404 when PO not found', async () => {
    findFirstMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ items: [{ itemId: 'item_1', quantityToReceive: 5 }] }), params());
    expect(res.status).toBe(404);
  });

  it('returns 422 for CANCELLED PO', async () => {
    findFirstMock.mockResolvedValue({ ...ORDERED_PO, status: 'CANCELLED' });
    const res = await POST(makeRequest({ items: [{ itemId: 'item_1', quantityToReceive: 5 }] }), params());
    expect(res.status).toBe(422);
  });

  it('returns 422 for RECEIVED PO', async () => {
    findFirstMock.mockResolvedValue({ ...ORDERED_PO, status: 'RECEIVED' });
    const res = await POST(makeRequest({ items: [{ itemId: 'item_1', quantityToReceive: 5 }] }), params());
    expect(res.status).toBe(422);
  });

  it('returns 422 for CLOSED PO', async () => {
    findFirstMock.mockResolvedValue({ ...ORDERED_PO, status: 'CLOSED' });
    const res = await POST(makeRequest({ items: [{ itemId: 'item_1', quantityToReceive: 5 }] }), params());
    expect(res.status).toBe(422);
  });

  it('returns 400 when items array is empty', async () => {
    const res = await POST(makeRequest({ items: [] }), params());
    expect(res.status).toBe(400);
  });

  it('returns 422 when over-receiving', async () => {
    const res = await POST(
      makeRequest({ items: [{ itemId: 'item_1', quantityToReceive: 11 }] }),
      params(),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.details[0].error).toContain('Cannot receive');
  });

  it('returns 422 when itemId not found on PO', async () => {
    const res = await POST(
      makeRequest({ items: [{ itemId: 'item_xyz', quantityToReceive: 1 }] }),
      params(),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.details[0].error).toContain('not found');
  });

  it('runs transaction and returns updated PO with summary on valid receive', async () => {
    const updatedPO = { ...ORDERED_PO, status: 'PARTIALLY_RECEIVED' };

    // Execute the transaction callback so the route proceeds
    transactionMock.mockImplementation(async (fn: (tx: object) => Promise<unknown>) => {
      const fakeTx = {
        purchaseOrderItem: {
          update:    vi.fn().mockResolvedValue({}),
          findMany:  vi.fn().mockResolvedValue([
            { quantityOrdered: 10, quantityReceived: 5, status: 'PARTIALLY_RECEIVED' },
          ]),
        },
        inventoryItem: {
          findUnique: vi.fn().mockResolvedValue(null),
          create:     vi.fn().mockResolvedValue({}),
          update:     vi.fn().mockResolvedValue({}),
        },
        repricingRule: {
          findFirst: vi.fn().mockResolvedValue(null), // no repricing rule
          update:    vi.fn().mockResolvedValue({}),
        },
        purchaseOrder: {
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(fakeTx);
    });

    // Post-transaction lookup
    findFirstMock
      .mockResolvedValueOnce(ORDERED_PO)  // initial guard lookup
      .mockResolvedValueOnce(updatedPO);  // final return

    const res = await POST(
      makeRequest({ items: [{ itemId: 'item_1', quantityToReceive: 5 }] }),
      params(),
    );
    expect(transactionMock).toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalReceived).toBe(5);
    expect(body.summary.inventoryUpdated).toBe(true);
  });

  it('sets costBasis on repricing rule when it is null', async () => {
    const updatedPO = { ...ORDERED_PO, status: 'PARTIALLY_RECEIVED' };
    const repricingUpdateMock = vi.fn().mockResolvedValue({});

    transactionMock.mockImplementation(async (fn: (tx: object) => Promise<unknown>) => {
      const fakeTx = {
        purchaseOrderItem: {
          update:   vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            { quantityOrdered: 10, quantityReceived: 5, status: 'PARTIALLY_RECEIVED' },
          ]),
        },
        inventoryItem: {
          findUnique: vi.fn().mockResolvedValue(null),
          create:     vi.fn().mockResolvedValue({}),
          update:     vi.fn().mockResolvedValue({}),
        },
        repricingRule: {
          // Rule exists with costBasis: null → should be set to item.unitCost (15)
          findFirst: vi.fn().mockResolvedValue({ id: 'rule_1', costBasis: null }),
          update:    repricingUpdateMock,
        },
        purchaseOrder: {
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(fakeTx);
    });

    findFirstMock
      .mockResolvedValueOnce(ORDERED_PO)
      .mockResolvedValueOnce(updatedPO);

    const res = await POST(
      makeRequest({ items: [{ itemId: 'item_1', quantityToReceive: 5 }] }),
      params(),
    );
    expect(res.status).toBe(200);
    expect(repricingUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { costBasis: 15 } }),
    );
    const body = await res.json();
    expect(body.summary.costBasisSet).toBe(true);
  });

  it('returns 400 when quantityToReceive is zero (must be a positive integer)', async () => {
    const res = await POST(
      makeRequest({ items: [{ itemId: 'item_1', quantityToReceive: 0 }] }),
      params(),
    );
    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('returns 422 when receiving more than remaining after a partial receive', async () => {
    // Item already has 5 received; remaining is 5; requesting 6
    const partialPO = {
      ...ORDERED_PO,
      status: 'PARTIALLY_RECEIVED',
      items: [{
        ...ORDERED_PO.items[0],
        quantityReceived: 5,
        status: 'PARTIALLY_RECEIVED',
      }],
    };
    findFirstMock.mockResolvedValueOnce(partialPO);
    const res = await POST(
      makeRequest({ items: [{ itemId: 'item_1', quantityToReceive: 6 }] }),
      params(),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.details[0].error).toContain('Cannot receive');
  });

  it('second receive completes remaining quantity and returns 200', async () => {
    const partialPO = {
      ...ORDERED_PO,
      status: 'PARTIALLY_RECEIVED',
      items: [{
        ...ORDERED_PO.items[0],
        quantityReceived: 5,
        status: 'PARTIALLY_RECEIVED',
      }],
    };
    const updatedPO = { ...partialPO, status: 'RECEIVED' };

    transactionMock.mockImplementation(async (fn: (tx: object) => Promise<unknown>) => {
      const fakeTx = {
        purchaseOrderItem: {
          update:   vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            { quantityOrdered: 10, quantityReceived: 10, status: 'RECEIVED' },
          ]),
        },
        inventoryItem: {
          findUnique: vi.fn().mockResolvedValue(null),
          create:     vi.fn().mockResolvedValue({}),
          update:     vi.fn().mockResolvedValue({}),
        },
        repricingRule: {
          findFirst: vi.fn().mockResolvedValue(null),
          update:    vi.fn().mockResolvedValue({}),
        },
        purchaseOrder: {
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(fakeTx);
    });

    findFirstMock
      .mockResolvedValueOnce(partialPO)
      .mockResolvedValueOnce(updatedPO);

    const res = await POST(
      makeRequest({ items: [{ itemId: 'item_1', quantityToReceive: 5 }] }),
      params(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalReceived).toBe(5);
  });

  it('does not overwrite existing InventoryItem.unitCost on receive (non-overwrite rule)', async () => {
    const updatedPO = { ...ORDERED_PO, status: 'PARTIALLY_RECEIVED' };
    const inventoryUpdateMock = vi.fn().mockResolvedValue({});

    transactionMock.mockImplementation(async (fn: (tx: object) => Promise<unknown>) => {
      const fakeTx = {
        purchaseOrderItem: {
          update:   vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            { quantityOrdered: 10, quantityReceived: 5, status: 'PARTIALLY_RECEIVED' },
          ]),
        },
        inventoryItem: {
          // Existing item with unitCost already set — must NOT be overwritten
          findUnique: vi.fn().mockResolvedValue({ unitCost: 20.00, purchasedAt: new Date('2024-01-01'), sku: 'SKU-A' }),
          create:     vi.fn().mockResolvedValue({}),
          update:     inventoryUpdateMock,
        },
        repricingRule: {
          findFirst: vi.fn().mockResolvedValue(null),
          update:    vi.fn().mockResolvedValue({}),
        },
        purchaseOrder: {
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(fakeTx);
    });

    findFirstMock
      .mockResolvedValueOnce(ORDERED_PO)
      .mockResolvedValueOnce(updatedPO);

    const res = await POST(
      makeRequest({ items: [{ itemId: 'item_1', quantityToReceive: 5 }] }),
      params(),
    );
    expect(res.status).toBe(200);

    // inventoryItem.update was called (quantity incremented) but unitCost must not be in the data
    expect(inventoryUpdateMock).toHaveBeenCalled();
    const updateCallData = inventoryUpdateMock.mock.calls[0][0].data;
    expect(updateCallData.unitCost).toBeUndefined();
  });

  it('preserves existing costBasis on repricing rule when non-null', async () => {
    const updatedPO = { ...ORDERED_PO, status: 'PARTIALLY_RECEIVED' };
    const repricingUpdateMock = vi.fn().mockResolvedValue({});

    transactionMock.mockImplementation(async (fn: (tx: object) => Promise<unknown>) => {
      const fakeTx = {
        purchaseOrderItem: {
          update:   vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            { quantityOrdered: 10, quantityReceived: 5, status: 'PARTIALLY_RECEIVED' },
          ]),
        },
        inventoryItem: {
          findUnique: vi.fn().mockResolvedValue(null),
          create:     vi.fn().mockResolvedValue({}),
          update:     vi.fn().mockResolvedValue({}),
        },
        repricingRule: {
          // Rule exists with existing costBasis → must NOT be overwritten
          findFirst: vi.fn().mockResolvedValue({ id: 'rule_1', costBasis: 12.00 }),
          update:    repricingUpdateMock,
        },
        purchaseOrder: {
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(fakeTx);
    });

    findFirstMock
      .mockResolvedValueOnce(ORDERED_PO)
      .mockResolvedValueOnce(updatedPO);

    const res = await POST(
      makeRequest({ items: [{ itemId: 'item_1', quantityToReceive: 5 }] }),
      params(),
    );
    expect(res.status).toBe(200);
    expect(repricingUpdateMock).not.toHaveBeenCalled(); // must not overwrite
    const body = await res.json();
    expect(body.summary.costBasisSet).toBe(false);
  });
});
