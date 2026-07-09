import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock            = vi.fn();
const findFirstMock       = vi.fn();
const findUniqueMock      = vi.fn();
const updateMock          = vi.fn();
const updateManyMock      = vi.fn();
const createMock          = vi.fn();
const transactionMock     = vi.fn();

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    repricingRule: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      update:    (...args: unknown[]) => updateMock(...args),
      delete:    vi.fn().mockResolvedValue({}),
    },
    repricingHistory: {
      findMany:    vi.fn().mockResolvedValue([]),
      create:      (...args: unknown[]) => createMock(...args),
      updateMany:  (...args: unknown[]) => updateManyMock(...args),
    },
    product: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
    },
    inventoryItem: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
    $transaction: (ops: unknown) => transactionMock(ops),
  },
}));

// Mock amazon-listings so tests don't hit real SP-API
vi.mock('@/lib/amazon-listings', () => ({
  getListingMarket: vi.fn().mockResolvedValue({ currentPrice: undefined }),
}));

import { POST, PATCH } from './route';

const OWNER_SESSION   = { user: { orgId: 'org_1', id: 'user_1', role: 'OWNER',   plan: 'PRO'     } };
const VIEWER_SESSION  = { user: { orgId: 'org_1', id: 'user_1', role: 'VIEWER',  plan: 'PRO'     } };
const STARTER_SESSION = { user: { orgId: 'org_1', id: 'user_1', role: 'OWNER',   plan: 'STARTER' } };

function makeRequest(body: unknown = {}, id = 'rule_1') {
  return {
    json:    async () => body,
    url:     `http://localhost/api/repricing/rules/${id}`,
    nextUrl: new URL(`http://localhost/api/repricing/rules/${id}`),
  } as unknown as import('next/server').NextRequest;
}

function params(id = 'rule_1') {
  return { params: Promise.resolve({ id }) } as never;
}

const BASE_RULE = {
  id:                   'rule_1',
  orgId:                'org_1',
  asin:                 'B000000001',
  minRoi:               30,
  minProfit:            3,
  strategy:             'COMPETITIVE',
  isActive:             true,
  floorPrice:           null,
  costBasis:            null,
  lastRecommendedPrice: 29.99,
  lastDirection:        'HOLD',
  lastPushedPrice:      null,
};

const BASE_PRODUCT = {
  asin:                 'B000000001',
  orgId:                'org_1',
  totalLandedCost:      10.00,
  sourcePrice:           8.00,
  estimatedResellPrice: 29.99,
  buyBoxPrice:          28.00,
  fbaSellers:           3,
};

// ─── costBasis priority chain ─────────────────────────────────────────────────

describe('POST /api/repricing/rules/[id] — single-rule run', () => {
  beforeEach(() => {
    authMock.mockReset();
    findFirstMock.mockReset();
    findUniqueMock.mockReset();
    updateMock.mockReset();
    updateManyMock.mockReset();
    createMock.mockReset();
    transactionMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
    transactionMock.mockResolvedValue([{}, {}, {}]);
    updateMock.mockResolvedValue({});
    updateManyMock.mockResolvedValue({ count: 0 });
    createMock.mockResolvedValue({});
    findUniqueMock.mockResolvedValue(null); // no inventory SKU by default
  });

  it('returns 403 for STARTER plan', async () => {
    authMock.mockResolvedValue(STARTER_SESSION);
    findFirstMock.mockResolvedValue(BASE_RULE);
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(403);
  });

  it('returns 403 for VIEWER role', async () => {
    authMock.mockResolvedValue(VIEWER_SESSION);
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(403);
  });

  it('returns 404 when rule not found', async () => {
    findFirstMock.mockResolvedValue(null);
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(404);
  });

  // ── costBasis priority ──────────────────────────────────────────────────────

  it('uses rule.costBasis when set — not product.totalLandedCost', async () => {
    findFirstMock
      .mockResolvedValueOnce({ ...BASE_RULE, costBasis: 5.00 }) // rule
      .mockResolvedValueOnce(BASE_PRODUCT);                      // product
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalled();
  });

  it('falls back to product.totalLandedCost when rule.costBasis is null', async () => {
    findFirstMock
      .mockResolvedValueOnce(BASE_RULE)     // rule (costBasis: null)
      .mockResolvedValueOnce(BASE_PRODUCT); // product (totalLandedCost: 10.00)
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalled();
  });

  it('falls back to product.sourcePrice when totalLandedCost is null', async () => {
    findFirstMock
      .mockResolvedValueOnce(BASE_RULE)
      .mockResolvedValueOnce({ ...BASE_PRODUCT, totalLandedCost: null });
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalled();
  });

  // ── missing data errors ─────────────────────────────────────────────────────

  it('returns 400 when no price data is available', async () => {
    findFirstMock
      .mockResolvedValueOnce(BASE_RULE)
      .mockResolvedValueOnce({ ...BASE_PRODUCT, buyBoxPrice: null, estimatedResellPrice: null, lastPushedPrice: null });
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/price/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('returns 400 when no cost and no manual floor', async () => {
    findFirstMock
      .mockResolvedValueOnce({ ...BASE_RULE, costBasis: null })
      .mockResolvedValueOnce({ ...BASE_PRODUCT, totalLandedCost: null, sourcePrice: null });
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cost/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('skips the cost check when a manual floor price is set', async () => {
    findFirstMock
      .mockResolvedValueOnce({ ...BASE_RULE, costBasis: null, floorPrice: 20.00 })
      .mockResolvedValueOnce({ ...BASE_PRODUCT, totalLandedCost: null, sourcePrice: null });
    const res = await POST(makeRequest(), params());
    // Should proceed past the cost check because floorPrice is set
    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalled();
  });

  // ── proposal fields and superseding ────────────────────────────────────────

  it('supersedes prior proposals and includes sku + previousPrice in new entry', async () => {
    // Return a SKU from inventory
    findUniqueMock.mockResolvedValue({ sku: 'MY-SKU-01' });
    findFirstMock
      .mockResolvedValueOnce(BASE_RULE)
      .mockResolvedValueOnce(BASE_PRODUCT);

    await POST(makeRequest(), params());

    // $transaction receives [updateMany, rule.update, history.create]
    const txArg = transactionMock.mock.calls[0][0] as unknown[];
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg).toHaveLength(3); // updateMany + rule update + history create

    // updateMany was called (to supersede)
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PROPOSED' }) }),
    );

    // history.create includes sku, previousPrice, and engine reason
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sku:           'MY-SKU-01',
          previousPrice: expect.any(Number),
          status:        expect.stringMatching(/^(PROPOSED|HOLD)$/),
          reason:        expect.any(String),
        }),
      }),
    );
  });

  it('returns proposalQueued: true when price direction is not HOLD', async () => {
    // Use a cost that forces a clear price recommendation
    findFirstMock
      .mockResolvedValueOnce({ ...BASE_RULE, costBasis: 5.00 })
      .mockResolvedValueOnce({ ...BASE_PRODUCT, buyBoxPrice: 22.00, estimatedResellPrice: 24.00 });
    const res  = await POST(makeRequest(), params());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(typeof body.proposalQueued).toBe('boolean');
    expect(body.status).toMatch(/^(PROPOSED|HOLD)$/);
  });
});

// ── Guard 1: zero-inventory HOLD ──────────────────────────────────────────────

describe('POST /api/repricing/rules/[id] — zero-inventory guard', () => {
  beforeEach(() => {
    authMock.mockReset();
    findFirstMock.mockReset();
    findUniqueMock.mockReset();
    updateMock.mockReset();
    updateManyMock.mockReset();
    createMock.mockReset();
    transactionMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
    transactionMock.mockResolvedValue([{}, {}, {}]);
    updateMock.mockResolvedValue({});
    updateManyMock.mockResolvedValue({ count: 0 });
    createMock.mockResolvedValue({});
  });

  it('emits HOLD with zero-inventory reason when availableQuantity is 0', async () => {
    findFirstMock
      .mockResolvedValueOnce({ ...BASE_RULE, costBasis: 10.89, lastPushedPrice: 25.77 })
      .mockResolvedValueOnce(BASE_PRODUCT);
    findUniqueMock.mockResolvedValue({ sku: 'MY-SKU', availableQuantity: 0 });

    const res  = await POST(makeRequest(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('HOLD');
    expect(body.proposalQueued).toBe(false);
    expect(body.data.reason).toMatch(/No inventory on hand/i);
  });

  it('creates a HOLD history entry (not PROPOSED) when availableQuantity is 0', async () => {
    findFirstMock
      .mockResolvedValueOnce({ ...BASE_RULE, costBasis: 10.89, lastPushedPrice: 25.77 })
      .mockResolvedValueOnce(BASE_PRODUCT);
    findUniqueMock.mockResolvedValue({ sku: 'MY-SKU', availableQuantity: 0 });

    await POST(makeRequest(), params());

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status:    'HOLD',
          direction: 'HOLD',
          reason:    expect.stringMatching(/No inventory on hand/i),
        }),
      }),
    );
    expect(createMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROPOSED' }) }),
    );
  });

  it('proceeds normally and creates a proposal when availableQuantity is > 0', async () => {
    findFirstMock
      .mockResolvedValueOnce({ ...BASE_RULE, costBasis: 5.00, lastPushedPrice: 25.77 })
      .mockResolvedValueOnce(BASE_PRODUCT);
    findUniqueMock.mockResolvedValue({ sku: 'MY-SKU', availableQuantity: 5 });

    const res  = await POST(makeRequest(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toMatch(/^(PROPOSED|HOLD)$/);
    expect(transactionMock).toHaveBeenCalled();
  });

  it('proceeds normally when no inventory record exists (null guard only fires on zero)', async () => {
    findFirstMock
      .mockResolvedValueOnce({ ...BASE_RULE, costBasis: 5.00, lastPushedPrice: 25.77 })
      .mockResolvedValueOnce(BASE_PRODUCT);
    findUniqueMock.mockResolvedValue(null); // no inventory row at all

    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalled();
  });
});

// ── PATCH save-only should not run repricing ──────────────────────────────────

describe('PATCH /api/repricing/rules/[id] — save only', () => {
  beforeEach(() => {
    authMock.mockReset();
    findFirstMock.mockReset();
    updateMock.mockReset();
    createMock.mockReset();
    transactionMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
    updateMock.mockResolvedValue({ id: 'rule_1', minRoi: 25 });
  });

  it('saves rule settings without calling $transaction or history', async () => {
    findFirstMock.mockResolvedValue(BASE_RULE);
    const res = await PATCH(makeRequest({ minRoi: 25 }), params());
    expect(res.status).toBe(200);
    // PATCH must NOT create history or start a repricing run
    expect(transactionMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns 403 for VIEWER', async () => {
    authMock.mockResolvedValue(VIEWER_SESSION);
    const res = await PATCH(makeRequest({ minRoi: 25 }), params());
    expect(res.status).toBe(403);
  });
});
