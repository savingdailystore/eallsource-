import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock        = vi.fn();
const findManyMock    = vi.fn();
const countMock       = vi.fn();
const transactionMock = vi.fn();

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    purchaseOrder: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      count:    (...args: unknown[]) => countMock(...args),
    },
    $transaction: (fn: unknown) => transactionMock(fn),
  },
}));

import { GET, POST } from './route';

function makeRequest(body?: unknown, url = 'http://localhost/api/purchase-orders') {
  return {
    json:        async () => body,
    url,
    nextUrl:     new URL(url),
  } as unknown as import('next/server').NextRequest;
}

const OWNER_SESSION  = { user: { orgId: 'org_1', id: 'user_1', role: 'OWNER'  } };
const VIEWER_SESSION = { user: { orgId: 'org_1', id: 'user_1', role: 'VIEWER' } };

describe('GET /api/purchase-orders', () => {
  beforeEach(() => {
    authMock.mockReset();
    findManyMock.mockReset();
    countMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns paginated orders for authenticated user', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('total', 0);
  });

  it('VIEWER role can list orders', async () => {
    authMock.mockResolvedValue(VIEWER_SESSION);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });
});

describe('POST /api/purchase-orders', () => {
  const validBody = {
    supplierName: 'Acme Supply',
    orderDate:    '2024-06-01T00:00:00.000Z',
    shippingCost: 5,
    tax:          2,
    items: [
      {
        productName:     'Test Widget',
        asin:            'B000000001',
        quantityOrdered: 3,
        unitCost:        10,
      },
    ],
  };

  beforeEach(() => {
    authMock.mockReset();
    transactionMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
    transactionMock.mockImplementation(async (fn: (tx: object) => Promise<unknown>) => {
      const fakeTx = {
        purchaseOrder: {
          create: vi.fn().mockResolvedValue({ id: 'po_1', items: [], totalCost: 37 }),
        },
        lead: { updateMany: vi.fn() },
      };
      return fn(fakeTx);
    });
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER', async () => {
    authMock.mockResolvedValue(VIEWER_SESSION);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
  });

  it('returns 400 when items array is empty', async () => {
    const res = await POST(makeRequest({ ...validBody, items: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when quantityOrdered is zero', async () => {
    const res = await POST(makeRequest({
      ...validBody,
      items: [{ productName: 'X', asin: 'B000000001', quantityOrdered: 0, unitCost: 5 }],
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when unitCost is negative', async () => {
    const res = await POST(makeRequest({
      ...validBody,
      items: [{ productName: 'X', asin: 'B000000001', quantityOrdered: 1, unitCost: -1 }],
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when unitCost is zero', async () => {
    const res = await POST(makeRequest({
      ...validBody,
      items: [{ productName: 'X', asin: 'B000000001', quantityOrdered: 1, unitCost: 0 }],
    }));
    expect(res.status).toBe(400);
  });

  it('creates PO and returns 201 for OWNER', async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
  });

  it('creates PO and returns 201 for ANALYST', async () => {
    authMock.mockResolvedValue({ user: { orgId: 'org_1', id: 'user_1', role: 'ANALYST' } });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
  });
});
