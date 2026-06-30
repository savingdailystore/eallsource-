import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock  = vi.fn();
const findFirst = vi.fn();
const update    = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    inventoryItem: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      update:    (...args: unknown[]) => update(...args),
    },
  },
}));

import { PATCH } from './route';

const EXISTING_ITEM = { id: 'item_1', orgId: 'org_1', asin: 'B000000001' };

function makeRequest(body: unknown, id = 'item_1') {
  return {
    json: async () => body,
    url:  `http://localhost/api/inventory/${id}`,
  } as unknown as import('next/server').NextRequest;
}

function params(id = 'item_1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/inventory/[id]', () => {
  beforeEach(() => {
    authMock.mockReset();
    findFirst.mockReset();
    update.mockReset();
    authMock.mockResolvedValue({ user: { orgId: 'org_1', role: 'OWNER' } });
    findFirst.mockResolvedValue(EXISTING_ITEM);
    update.mockResolvedValue({ ...EXISTING_ITEM });
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await PATCH(makeRequest({}), params());
    expect(res.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is VIEWER', async () => {
    authMock.mockResolvedValue({ user: { orgId: 'org_1', role: 'VIEWER' } });
    const res = await PATCH(makeRequest({ productName: 'Test' }), params());
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('returns 404 when item belongs to a different org', async () => {
    findFirst.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ productName: 'Test' }), params());
    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('returns 400 when unitCost is negative', async () => {
    const res = await PATCH(makeRequest({ unitCost: -1 }), params());
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('returns 400 when purchasedAt is an invalid date string', async () => {
    const res = await PATCH(makeRequest({ purchasedAt: 'not-a-date' }), params());
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('accepts a valid ISO purchasedAt and passes a Date to the DB', async () => {
    update.mockResolvedValue({ ...EXISTING_ITEM, purchasedAt: new Date('2024-06-01') });
    const res = await PATCH(
      makeRequest({ purchasedAt: '2024-06-01T00:00:00.000Z' }),
      params(),
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ purchasedAt: expect.any(Date) }),
      }),
    );
  });

  it('accepts null purchasedAt to clear the date', async () => {
    update.mockResolvedValue({ ...EXISTING_ITEM, purchasedAt: null });
    const res = await PATCH(makeRequest({ purchasedAt: null }), params());
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ purchasedAt: null }),
      }),
    );
  });

  it('accepts a valid unitCost and passes it to the DB', async () => {
    update.mockResolvedValue({ ...EXISTING_ITEM, unitCost: 14.99 });
    const res = await PATCH(makeRequest({ unitCost: 14.99 }), params());
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unitCost: 14.99 }),
      }),
    );
  });

  it('accepts null unitCost to clear the value', async () => {
    update.mockResolvedValue({ ...EXISTING_ITEM, unitCost: null });
    const res = await PATCH(makeRequest({ unitCost: null }), params());
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unitCost: null }),
      }),
    );
  });

  it('ADMIN role is allowed to edit', async () => {
    authMock.mockResolvedValue({ user: { orgId: 'org_1', role: 'ADMIN' } });
    const res = await PATCH(makeRequest({ productName: 'Test' }), params());
    expect(res.status).toBe(200);
  });

  it('ANALYST role is allowed to edit', async () => {
    authMock.mockResolvedValue({ user: { orgId: 'org_1', role: 'ANALYST' } });
    const res = await PATCH(makeRequest({ productName: 'Test' }), params());
    expect(res.status).toBe(200);
  });
});
