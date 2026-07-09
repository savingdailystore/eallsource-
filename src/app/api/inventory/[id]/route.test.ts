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

const EXISTING_ITEM    = { id: 'item_1', orgId: 'org_1', asin: 'B000000001', unitCost: null };
const ITEM_WITH_COST   = { ...EXISTING_ITEM, unitCost: 14.99 };

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

  // unitCost confirmation guard tests
  it('allows setting unitCost when existing is null (no confirmation required)', async () => {
    // EXISTING_ITEM has unitCost: null → first-time set → allowed
    update.mockResolvedValue({ ...EXISTING_ITEM, unitCost: 9.99 });
    const res = await PATCH(makeRequest({ unitCost: 9.99 }), params());
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
  });

  it('returns 409 when changing existing unitCost without confirmOverwrite', async () => {
    findFirst.mockResolvedValue(ITEM_WITH_COST);
    const res = await PATCH(makeRequest({ unitCost: 19.99 }), params());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(true);
    expect(body.currentUnitCost).toBe(14.99);
    expect(body.requestedUnitCost).toBe(19.99);
    expect(update).not.toHaveBeenCalled();
  });

  it('allows changing existing unitCost when confirmOverwrite is true', async () => {
    findFirst.mockResolvedValue(ITEM_WITH_COST);
    update.mockResolvedValue({ ...ITEM_WITH_COST, unitCost: 19.99 });
    const res = await PATCH(makeRequest({ unitCost: 19.99, confirmOverwrite: true }), params());
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
    // confirmOverwrite must not be sent to Prisma
    const callData = update.mock.calls[0][0].data;
    expect(callData.confirmOverwrite).toBeUndefined();
  });

  it('returns 409 when clearing existing unitCost to null without confirmOverwrite', async () => {
    findFirst.mockResolvedValue(ITEM_WITH_COST);
    const res = await PATCH(makeRequest({ unitCost: null }), params());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(true);
    expect(body.currentUnitCost).toBe(14.99);
    expect(body.requestedUnitCost).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('allows clearing existing unitCost to null with confirmOverwrite: true', async () => {
    findFirst.mockResolvedValue(ITEM_WITH_COST);
    update.mockResolvedValue({ ...ITEM_WITH_COST, unitCost: null });
    const res = await PATCH(makeRequest({ unitCost: null, confirmOverwrite: true }), params());
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
  });

  it('allows sending same unitCost value without confirmOverwrite (no-op)', async () => {
    findFirst.mockResolvedValue(ITEM_WITH_COST);
    update.mockResolvedValue(ITEM_WITH_COST);
    const res = await PATCH(makeRequest({ unitCost: 14.99 }), params());
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
  });

  it('409 response includes warning message text', async () => {
    findFirst.mockResolvedValue(ITEM_WITH_COST);
    const res = await PATCH(makeRequest({ unitCost: 0.01 }), params());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/historical/i);
    expect(body.requiresConfirmation).toBe(true);
  });
});
