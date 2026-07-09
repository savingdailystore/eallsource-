import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

const authMock           = vi.fn();
const findManyMock       = vi.fn();
const updateManyMock     = vi.fn();
const histUpdateMock     = vi.fn();
const ruleUpdateMock     = vi.fn();
const transactionMock    = vi.fn();
const pushListingMock    = vi.fn();

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    repricingHistory: {
      findMany:   (...a: unknown[]) => findManyMock(...a),
      updateMany: (...a: unknown[]) => updateManyMock(...a),
      update:     (...a: unknown[]) => histUpdateMock(...a),
    },
    repricingRule: {
      update: (...a: unknown[]) => ruleUpdateMock(...a),
    },
    $transaction: (ops: unknown) => transactionMock(ops),
  },
}));
vi.mock('@/lib/amazon-listings', () => ({ pushListingPrice: (...a: unknown[]) => pushListingMock(...a) }));

// NOTE: @/engines/repricingReadiness is NOT mocked — estimateFloorBreakdown
// runs as a real pure function to exercise the actual floor re-check logic.

import { POST } from './route';

// ── Session fixtures ───────────────────────────────────────────────────────────

const OWNER_SESSION   = { user: { orgId: 'org_1', id: 'user_1', role: 'OWNER',  plan: 'PRO'     } };
const VIEWER_SESSION  = { user: { orgId: 'org_1', id: 'user_1', role: 'VIEWER', plan: 'PRO'     } };
const STARTER_SESSION = { user: { orgId: 'org_1', id: 'user_1', role: 'OWNER',  plan: 'STARTER' } };

// ── Proposal builder ──────────────────────────────────────────────────────────

function makeProposal(overrides: Partial<{
  id:               string;
  recommendedPrice: number;
  direction:        string;
  riskScore:        number;
  sku:              string | null;
  previousPrice:    number;
  ruleId:           string;
  rule:             Record<string, unknown>;
}> = {}) {
  return {
    id:               'hist_1',
    recommendedPrice: 24.99,
    direction:        'DOWN',
    riskScore:        40,
    sku:              'MY-SKU-01',
    previousPrice:    27.99,
    ruleId:           'rule_1',
    rule: {
      id:            'rule_1',
      asin:          'B000000001',
      orgId:         'org_1',
      costBasis:     null,
      minRoi:        30,
      minProfit:     5,
      floorPrice:    null,
      lastPushedAt:  null,
      lastPushedPrice: null,
    },
    ...overrides,
  };
}

function makeRequest(body: object) {
  return new Request('http://localhost/api/repricing/push', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

// Helper for push requests that include confirmed: true
function makePushRequest(historyIds: string[]) {
  return makeRequest({ historyIds, action: 'push', confirmed: true });
}

// ── Auth & access control ─────────────────────────────────────────────────────

describe('POST /api/repricing/push — access control', () => {
  beforeEach(() => {
    authMock.mockReset();
    findManyMock.mockReset();
  });

  it('returns 401 when not authenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ historyIds: ['h1'], action: 'push' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for STARTER plan', async () => {
    authMock.mockResolvedValue(STARTER_SESSION);
    const res = await POST(makeRequest({ historyIds: ['h1'], action: 'push' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for VIEWER role', async () => {
    authMock.mockResolvedValue(VIEWER_SESSION);
    const res = await POST(makeRequest({ historyIds: ['h1'], action: 'push' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid body', async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    const res = await POST(makeRequest({ historyIds: [], action: 'push' })); // empty array fails min(1)
    expect(res.status).toBe(400);
  });
});

// ── confirmed: true guard ─────────────────────────────────────────────────────

describe('POST /api/repricing/push — confirmed guard', () => {
  beforeEach(() => {
    authMock.mockReset();
    findManyMock.mockReset();
    pushListingMock.mockReset();
    transactionMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
  });

  it('returns 400 when action=push and confirmed is missing', async () => {
    const res = await POST(makeRequest({ historyIds: ['hist_1'], action: 'push' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/confirmed/i);
    expect(pushListingMock).not.toHaveBeenCalled();
  });

  it('returns 400 when action=push and confirmed is false', async () => {
    const res = await POST(makeRequest({ historyIds: ['hist_1'], action: 'push', confirmed: false }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/confirmed/i);
    expect(pushListingMock).not.toHaveBeenCalled();
  });

  it('does not update history when confirmed is missing', async () => {
    const res = await POST(makeRequest({ historyIds: ['hist_1'], action: 'push' }));
    expect(res.status).toBe(400);
    expect(histUpdateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('allows action=push when confirmed is true', async () => {
    pushListingMock.mockResolvedValue({ ok: true });
    transactionMock.mockResolvedValue([{}, {}]);
    findManyMock.mockResolvedValue([makeProposal()]);

    const res  = await POST(makeRequest({ historyIds: ['hist_1'], action: 'push', confirmed: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pushed).toBe(1);
  });

  it('reject action does not require confirmed', async () => {
    findManyMock.mockResolvedValue([makeProposal()]);
    updateManyMock.mockResolvedValue({ count: 1 });

    const res  = await POST(makeRequest({ historyIds: ['hist_1'], action: 'reject' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.rejected).toBe(1);
    expect(pushListingMock).not.toHaveBeenCalled();
  });

  it('reject action works even when confirmed is explicitly false', async () => {
    findManyMock.mockResolvedValue([makeProposal()]);
    updateManyMock.mockResolvedValue({ count: 1 });

    const res  = await POST(makeRequest({ historyIds: ['hist_1'], action: 'reject', confirmed: false }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.rejected).toBe(1);
  });
});

// ── Reject action ─────────────────────────────────────────────────────────────

describe('POST /api/repricing/push — reject action', () => {
  beforeEach(() => {
    authMock.mockReset();
    findManyMock.mockReset();
    updateManyMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
  });

  it('marks proposals REJECTED without calling Amazon', async () => {
    findManyMock.mockResolvedValue([makeProposal()]);
    updateManyMock.mockResolvedValue({ count: 1 });

    const res  = await POST(makeRequest({ historyIds: ['hist_1'], action: 'reject' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.rejected).toBe(1);
    expect(pushListingMock).not.toHaveBeenCalled();
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REJECTED' } }),
    );
  });
});

// ── SKU required ──────────────────────────────────────────────────────────────

describe('POST /api/repricing/push — SKU guard', () => {
  beforeEach(() => {
    authMock.mockReset();
    findManyMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
  });

  it('skips push and reports error when SKU is null', async () => {
    findManyMock.mockResolvedValue([makeProposal({ sku: null })]);

    const res  = await POST(makePushRequest(['hist_1']));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pushed).toBe(0);
    expect(body.failed).toBe(1);
    expect(body.results[0].error).toMatch(/SKU/);
    expect(pushListingMock).not.toHaveBeenCalled();
  });
});

// ── Cooldown guardrail ────────────────────────────────────────────────────────

describe('POST /api/repricing/push — cooldown', () => {
  beforeEach(() => {
    authMock.mockReset();
    findManyMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
  });

  it('blocks push when rule was pushed within 15 minutes', async () => {
    const recentPush = new Date(Date.now() - 5 * 60_000); // 5 min ago
    findManyMock.mockResolvedValue([
      makeProposal({ rule: { ...makeProposal().rule, lastPushedAt: recentPush } }),
    ]);

    const res  = await POST(makePushRequest(['hist_1']));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pushed).toBe(0);
    expect(body.results[0].error).toMatch(/Cooldown/i);
    expect(pushListingMock).not.toHaveBeenCalled();
  });

  it('allows push when lastPushedAt is more than 15 minutes ago', async () => {
    const oldPush = new Date(Date.now() - 20 * 60_000); // 20 min ago
    pushListingMock.mockResolvedValue({ ok: true });
    transactionMock.mockResolvedValue([{}, {}]);
    findManyMock.mockResolvedValue([
      makeProposal({ rule: { ...makeProposal().rule, lastPushedAt: oldPush } }),
    ]);

    const res  = await POST(makePushRequest(['hist_1']));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pushed).toBe(1);
  });

  it('allows push when lastPushedAt is null (never pushed before)', async () => {
    pushListingMock.mockResolvedValue({ ok: true });
    transactionMock.mockResolvedValue([{}, {}]);
    findManyMock.mockResolvedValue([makeProposal()]);

    const res  = await POST(makePushRequest(['hist_1']));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pushed).toBe(1);
  });

  it('cooldown blocks one proposal but allows other valid proposals to continue', async () => {
    const recentPush = new Date(Date.now() - 5 * 60_000);
    pushListingMock.mockResolvedValue({ ok: true });
    transactionMock.mockResolvedValue([{}, {}]);

    findManyMock.mockResolvedValue([
      // First proposal: on cooldown
      makeProposal({ id: 'hist_1', rule: { ...makeProposal().rule, id: 'rule_1', asin: 'B001', lastPushedAt: recentPush } }),
      // Second proposal: no cooldown
      makeProposal({ id: 'hist_2', rule: { ...makeProposal().rule, id: 'rule_2', asin: 'B002', lastPushedAt: null } }),
    ]);

    const res  = await POST(makePushRequest(['hist_1', 'hist_2']));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pushed).toBe(1);
    expect(body.failed).toBe(1);
    const blockedResult = body.results.find((r: { historyId: string }) => r.historyId === 'hist_1');
    expect(blockedResult.error).toMatch(/Cooldown/i);
  });
});

// ── Effective safe floor re-check ─────────────────────────────────────────────

describe('POST /api/repricing/push — floor re-check', () => {
  beforeEach(() => {
    authMock.mockReset();
    findManyMock.mockReset();
    histUpdateMock.mockReset();
    ruleUpdateMock.mockReset();
    transactionMock.mockReset();
    pushListingMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
  });

  it('blocks a tampered proposal price that is far below the effective floor', async () => {
    // costBasis=10, minRoi=30, minProfit=5 → algebraic floor ≈ $24.63
    // A tampered recommendedPrice of $15 is well below floor - tolerance
    findManyMock.mockResolvedValue([
      makeProposal({
        recommendedPrice: 15.00, // far below floor
        rule: {
          ...makeProposal().rule,
          costBasis:  10,
          minRoi:     30,
          minProfit:  5,
          floorPrice: null,
        },
      }),
    ]);

    const res  = await POST(makePushRequest(['hist_1']));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pushed).toBe(0);
    expect(body.results[0].error).toMatch(/floor/i);
    expect(pushListingMock).not.toHaveBeenCalled();
  });

  it('allows a proposal price that is above the effective floor', async () => {
    pushListingMock.mockResolvedValue({ ok: true });
    transactionMock.mockResolvedValue([{}, {}]);

    // costBasis=10, minRoi=30, minProfit=5 → floor ≈ $24.63
    // Price of $25 should pass
    findManyMock.mockResolvedValue([
      makeProposal({
        recommendedPrice: 25.00,
        rule: {
          ...makeProposal().rule,
          costBasis:  10,
          minRoi:     30,
          minProfit:  5,
          floorPrice: null,
        },
      }),
    ]);

    const res  = await POST(makePushRequest(['hist_1']));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pushed).toBe(1);
  });

  it('uses manual floorPrice as part of effective floor when costBasis is null', async () => {
    // No costBasis, but manual floorPrice = $25. Price of $10 should be blocked.
    findManyMock.mockResolvedValue([
      makeProposal({
        recommendedPrice: 10.00,
        rule: {
          ...makeProposal().rule,
          costBasis:  null,
          minRoi:     30,
          minProfit:  5,
          floorPrice: 25.00,
        },
      }),
    ]);

    const res  = await POST(makePushRequest(['hist_1']));
    const body = await res.json();

    expect(body.pushed).toBe(0);
    expect(body.results[0].error).toMatch(/floor/i);
    expect(pushListingMock).not.toHaveBeenCalled();
  });

  it('allows any positive price when costBasis is null and no floorPrice (floor = 0)', async () => {
    pushListingMock.mockResolvedValue({ ok: true });
    transactionMock.mockResolvedValue([{}, {}]);

    findManyMock.mockResolvedValue([
      makeProposal({
        recommendedPrice: 5.00,
        rule: {
          ...makeProposal().rule,
          costBasis:  null,
          minRoi:     30,
          minProfit:  5,
          floorPrice: null,
        },
      }),
    ]);

    const res  = await POST(makePushRequest(['hist_1']));
    const body = await res.json();

    // floor = 0, so only the price > 0 check blocks — $5 passes
    expect(body.pushed).toBe(1);
  });

  // ── Exact boundary tests for tightened $0.03 tolerance ────────────────────

  it('allows price exactly at the effective floor (zero gap — boundary)', async () => {
    pushListingMock.mockResolvedValue({ ok: true });
    transactionMock.mockResolvedValue([{}, {}]);

    // Manual floor $25, no costBasis — effectiveFloor = $25
    // Price = $25.00 = floor exactly → allowed
    findManyMock.mockResolvedValue([
      makeProposal({
        recommendedPrice: 25.00,
        rule: {
          ...makeProposal().rule,
          costBasis:  null,
          minRoi:     30,
          minProfit:  5,
          floorPrice: 25.00,
        },
      }),
    ]);

    const res  = await POST(makePushRequest(['hist_1']));
    const body = await res.json();

    expect(body.pushed).toBe(1);
    expect(pushListingMock).toHaveBeenCalled();
  });

  it('allows price $0.03 below floor (within tolerance)', async () => {
    pushListingMock.mockResolvedValue({ ok: true });
    transactionMock.mockResolvedValue([{}, {}]);

    // Manual floor $25, price = $24.97 (floor - 0.03 = exactly at tolerance boundary → allowed)
    findManyMock.mockResolvedValue([
      makeProposal({
        recommendedPrice: 24.97,
        rule: {
          ...makeProposal().rule,
          costBasis:  null,
          minRoi:     30,
          minProfit:  5,
          floorPrice: 25.00,
        },
      }),
    ]);

    const res  = await POST(makePushRequest(['hist_1']));
    const body = await res.json();

    expect(body.pushed).toBe(1);
    expect(pushListingMock).toHaveBeenCalled();
  });

  it('blocks price $0.04 below floor (exceeds $0.03 tolerance)', async () => {
    // Manual floor $25, price = $24.96 (floor - 0.04 > tolerance) → blocked
    findManyMock.mockResolvedValue([
      makeProposal({
        recommendedPrice: 24.96,
        rule: {
          ...makeProposal().rule,
          costBasis:  null,
          minRoi:     30,
          minProfit:  5,
          floorPrice: 25.00,
        },
      }),
    ]);

    const res  = await POST(makePushRequest(['hist_1']));
    const body = await res.json();

    expect(body.pushed).toBe(0);
    expect(body.results[0].error).toMatch(/floor/i);
    expect(pushListingMock).not.toHaveBeenCalled();
  });

  it('blocked floor push does not update history or rule', async () => {
    findManyMock.mockResolvedValue([
      makeProposal({
        recommendedPrice: 10.00,
        rule: {
          ...makeProposal().rule,
          costBasis:  null,
          floorPrice: 25.00,
        },
      }),
    ]);

    await POST(makePushRequest(['hist_1']));

    expect(histUpdateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(ruleUpdateMock).not.toHaveBeenCalled();
  });
});

// ── Successful push ───────────────────────────────────────────────────────────

describe('POST /api/repricing/push — successful push', () => {
  beforeEach(() => {
    authMock.mockReset();
    findManyMock.mockReset();
    histUpdateMock.mockReset();
    ruleUpdateMock.mockReset();
    transactionMock.mockReset();
    pushListingMock.mockReset();
    authMock.mockResolvedValue(OWNER_SESSION);
    pushListingMock.mockResolvedValue({ ok: true });
    transactionMock.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
    histUpdateMock.mockResolvedValue({});
    ruleUpdateMock.mockResolvedValue({});
  });

  it('pushes successfully and returns pushed: 1', async () => {
    findManyMock.mockResolvedValue([makeProposal()]);

    const res  = await POST(makePushRequest(['hist_1']));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.pushed).toBe(1);
    expect(body.failed).toBe(0);
    expect(pushListingMock).toHaveBeenCalledWith('org_1', 'MY-SKU-01', 24.99);
  });

  it('marks history PUSHED and updates rule lastPushedPrice via $transaction', async () => {
    findManyMock.mockResolvedValue([makeProposal()]);

    await POST(makePushRequest(['hist_1']));

    expect(transactionMock).toHaveBeenCalled();
    expect(histUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PUSHED' }) }),
    );
    expect(ruleUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastPushedPrice: 24.99 }) }),
    );
  });

  it('marks history FAILED when Amazon rejects the push', async () => {
    pushListingMock.mockResolvedValue({ ok: false, error: 'Amazon error 403' });
    histUpdateMock.mockResolvedValue({});
    findManyMock.mockResolvedValue([makeProposal()]);

    const res  = await POST(makePushRequest(['hist_1']));
    const body = await res.json();

    expect(body.pushed).toBe(0);
    expect(body.failed).toBe(1);
    expect(histUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
});
