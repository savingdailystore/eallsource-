/**
 * Phase 20.2M-1D-6B/6C — Lead Fee Refresh Endpoint Tests
 *
 * Tests POST /api/leads/[id]/refresh-fees.
 * All external I/O (auth, prisma, SP-API, rate-limit) is mocked with
 * explicit factory functions to avoid loading real next-auth/prisma modules.
 * calculateProfitability is NOT mocked — it is a pure function with no I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mock factories ───────────────────────────────────────────────────────────

const mockAuth              = vi.fn();
const mockOrgFindUnique     = vi.fn();
const mockLeadFindFirst     = vi.fn();
const mockProductUpdateMany = vi.fn();
const mockGetFeeEstimate    = vi.fn();
const mockIsRateLimited     = vi.fn();
const mockRecordAttempt     = vi.fn();

vi.mock('@/lib/auth',        () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));
vi.mock('@/lib/prisma',      () => ({
  prisma: {
    organization: { findUnique: (...a: unknown[]) => mockOrgFindUnique(...a) },
    lead:         { findFirst:  (...a: unknown[]) => mockLeadFindFirst(...a)  },
    product:      { updateMany: (...a: unknown[]) => mockProductUpdateMany(...a) },
  },
}));
vi.mock('@/lib/amazon',      () => ({ getFeeEstimate: (...a: unknown[]) => mockGetFeeEstimate(...a) }));
vi.mock('@/lib/rate-limit',  () => ({
  isRateLimited: (...a: unknown[]) => mockIsRateLimited(...a),
  recordAttempt: (...a: unknown[]) => mockRecordAttempt(...a),
}));
vi.mock('@/lib/lead-access', () => ({ leadAccessWhere: () => ({}) }));

import { POST } from './route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OWNER_SESSION = {
  user: { id: 'user-1', orgId: 'org-1', role: 'OWNER', plan: 'PRO', email: 'owner@example.com' },
};

// Base product includes all fields now selected by the route (Phase 6C expansion).
// sourcePrice present → triggers full recalculation path by default.
const PRODUCT = {
  id:             'product-1',
  orgId:          'org-1',
  asin:           'B001234567',
  lowestFbaPrice: 29.99,
  buyBoxPrice:    31.00,
  sourcePrice:    25.00,
  sourceTaxRate:  null,      // → defaults to 0.0875 in engine
  storageFee:     0.50,
  prepFee:        1.50,
  category:       'Electronics',
};

const FRESH_FEES = { referralFee: 3.00, fbaFee: 4.50 };

// Pre-computed from calculateProfitability with PRODUCT + FRESH_FEES:
//   referralFee  = 3.00  (SP-API rate)
//   fbaFee       = 4.50  (SP-API)
//   storageFee   = 0.50  (stored)
//   prepFee      = 1.50  (stored)
//   taxAmount    = 25.00 * 0.0875 = 2.1875
//   amazonFees   = 3.00 + 4.50 + 0.50 = 8.00
//   fees (total) = 8.00 + 1.50 + 2.1875 = 11.6875
//   finalCost    = 25.00 (no discounts)
//   totalLandedCost = 25.00
//   profit       = 29.99 - 11.6875 - 25.00 = -6.6975
const EXPECTED_AMAZON_FEES      = 3.00 + 4.50 + 0.50;           // 8.00
const EXPECTED_TAX_AMOUNT       = 25.00 * 0.0875;               // 2.1875
const EXPECTED_FEES_COL         = EXPECTED_AMAZON_FEES + 1.50 + EXPECTED_TAX_AMOUNT;
const EXPECTED_TOTAL_LANDED     = 25.00;
const EXPECTED_FINAL_COST       = 25.00;
const EXPECTED_PROFIT           = 29.99 - EXPECTED_FEES_COL - EXPECTED_TOTAL_LANDED;
const EXPECTED_ROI              = (EXPECTED_PROFIT / EXPECTED_TOTAL_LANDED) * 100;
const EXPECTED_MARGIN           = (EXPECTED_PROFIT / 29.99) * 100;

function makeReq(body?: object): NextRequest {
  return new NextRequest('http://localhost/api/leads/lead-1/refresh-fees', {
    method:  'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body:    body ? JSON.stringify(body) : undefined,
  });
}

const makeCtx = (id = 'lead-1') => ({ params: Promise.resolve({ id }) });

// ─── Default happy-path setup ─────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(OWNER_SESSION);
  mockOrgFindUnique.mockResolvedValue({ isBroadcastSource: false });
  mockLeadFindFirst.mockResolvedValue({ product: PRODUCT });
  mockIsRateLimited.mockResolvedValue({ limited: false, retryAfterSeconds: 0 });
  mockRecordAttempt.mockResolvedValue(1);
  mockGetFeeEstimate.mockResolvedValue(FRESH_FEES);
  mockProductUpdateMany.mockResolvedValue({ count: 1 });
});

// ─── 1. Auth guards ──────────────────────────────────────────────────────────

describe('auth guards', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns 403 when role is ADMIN (not OWNER)', async () => {
    mockAuth.mockResolvedValue({ user: { ...OWNER_SESSION.user, role: 'ADMIN' } });
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(403);
    expect(mockProductUpdateMany).not.toHaveBeenCalled();
  });

  it('returns 403 when role is ANALYST', async () => {
    mockAuth.mockResolvedValue({ user: { ...OWNER_SESSION.user, role: 'ANALYST' } });
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(403);
  });
});

// ─── 2. Lead lookup ──────────────────────────────────────────────────────────

describe('lead lookup', () => {
  it('returns 404 when lead not found for org', async () => {
    mockLeadFindFirst.mockResolvedValue(null);
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    expect(mockProductUpdateMany).not.toHaveBeenCalled();
  });

  it('returns 404 when lead has no product', async () => {
    mockLeadFindFirst.mockResolvedValue({ product: null });
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    expect(mockProductUpdateMany).not.toHaveBeenCalled();
  });

  it('returns 403 when product.orgId does not match session orgId', async () => {
    mockLeadFindFirst.mockResolvedValue({
      product: { ...PRODUCT, orgId: 'other-org' },
    });
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(403);
    expect(mockProductUpdateMany).not.toHaveBeenCalled();
  });
});

// ─── 3. Rate limiting ────────────────────────────────────────────────────────

describe('rate limiting', () => {
  it('returns 429 when rate limited', async () => {
    mockIsRateLimited.mockResolvedValue({ limited: true, retryAfterSeconds: 300 });
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('RATE_LIMITED');
    expect(mockGetFeeEstimate).not.toHaveBeenCalled();
    expect(mockProductUpdateMany).not.toHaveBeenCalled();
  });

  it('records attempt before SP-API call, including when SP-API returns null', async () => {
    mockGetFeeEstimate.mockResolvedValue(null);
    await POST(makeReq(), makeCtx());
    expect(mockRecordAttempt).toHaveBeenCalledWith('fee-refresh:org-1', 3600);
    expect(mockRecordAttempt).toHaveBeenCalledBefore(mockGetFeeEstimate as any);
  });

  it('records attempt even when getFeeEstimate throws', async () => {
    mockGetFeeEstimate.mockRejectedValue(new Error('network error'));
    await POST(makeReq(), makeCtx());
    expect(mockRecordAttempt).toHaveBeenCalledWith('fee-refresh:org-1', 3600);
  });
});

// ─── 4. Resell price resolution ──────────────────────────────────────────────

describe('resell price resolution', () => {
  it('returns 422 when both lowestFbaPrice and buyBoxPrice are null', async () => {
    mockLeadFindFirst.mockResolvedValue({
      product: { ...PRODUCT, lowestFbaPrice: null, buyBoxPrice: null },
    });
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('NO_RESELL_PRICE');
    expect(mockGetFeeEstimate).not.toHaveBeenCalled();
  });

  it('returns 422 when resell price is zero', async () => {
    mockLeadFindFirst.mockResolvedValue({
      product: { ...PRODUCT, lowestFbaPrice: 0, buyBoxPrice: 0 },
    });
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(422);
  });

  it('prefers lowestFbaPrice over buyBoxPrice when both are present', async () => {
    await POST(makeReq(), makeCtx());
    expect(mockGetFeeEstimate).toHaveBeenCalledWith('org-1', 'B001234567', 29.99);
  });

  it('falls back to buyBoxPrice when lowestFbaPrice is null', async () => {
    mockLeadFindFirst.mockResolvedValue({
      product: { ...PRODUCT, lowestFbaPrice: null, buyBoxPrice: 31.00 },
    });
    await POST(makeReq(), makeCtx());
    expect(mockGetFeeEstimate).toHaveBeenCalledWith('org-1', 'B001234567', 31.00);
  });

  it('does not accept or use a price from the request body', async () => {
    await POST(makeReq({ price: 999.99 }), makeCtx());
    expect(mockGetFeeEstimate).toHaveBeenCalledWith('org-1', 'B001234567', 29.99);
    expect(mockGetFeeEstimate).not.toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 999.99
    );
  });
});

// ─── 5. SP-API call and unavailable behavior ─────────────────────────────────

describe('SP-API behavior', () => {
  it('calls getFeeEstimate with correct orgId, asin, and derived resellPrice', async () => {
    await POST(makeReq(), makeCtx());
    expect(mockGetFeeEstimate).toHaveBeenCalledWith('org-1', 'B001234567', 29.99);
    expect(mockGetFeeEstimate).toHaveBeenCalledTimes(1);
  });

  it('returns SP_API_UNAVAILABLE and does not write when getFeeEstimate returns null', async () => {
    mockGetFeeEstimate.mockResolvedValue(null);
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, status: 'SP_API_UNAVAILABLE' });
    expect(mockProductUpdateMany).not.toHaveBeenCalled();
  });

  it('returns SP_API_UNAVAILABLE and does not write when getFeeEstimate throws', async () => {
    mockGetFeeEstimate.mockRejectedValue(new Error('SP-API 500'));
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, status: 'SP_API_UNAVAILABLE' });
    expect(mockProductUpdateMany).not.toHaveBeenCalled();
  });
});

// ─── 6. Full success (Phase 6C — recalculation) ──────────────────────────────

describe('full success behavior (sourcePrice present)', () => {
  it('returns REFRESHED with profitUpdated: true', async () => {
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, status: 'REFRESHED', profitUpdated: true });
  });

  it('writes fee metadata with org-scoped where clause', async () => {
    await POST(makeReq(), makeCtx());
    const call = mockProductUpdateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(call.where).toMatchObject({ id: 'product-1', orgId: 'org-1' });
    expect(call.data.referralFee).toBe(3.00);
    expect(call.data.fbaFee).toBe(4.50);
    expect(call.data.feeEstimateSource).toBe('SP_API');
    expect(call.data.feeEstimatePrice).toBe(29.99);
    expect(call.data.feeEstimateConfirmed).toBe(true);
    expect(call.data.feeEstimatedAt).toBeInstanceOf(Date);
  });

  it('computes amazonFees = referralFee + fbaFee + storageFee (includes storageFee)', async () => {
    await POST(makeReq(), makeCtx());
    const data = mockProductUpdateMany.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.amazonFees).toBeCloseTo(EXPECTED_AMAZON_FEES, 6); // 8.00
  });

  it('computes fees column = amazonFees + prepFee + taxAmount', async () => {
    await POST(makeReq(), makeCtx());
    const data = mockProductUpdateMany.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.fees).toBeCloseTo(EXPECTED_FEES_COL, 6);
  });

  it('writes recalculated profit, roi, margin as numbers', async () => {
    await POST(makeReq(), makeCtx());
    const data = mockProductUpdateMany.mock.calls[0][0].data as Record<string, unknown>;
    expect(typeof data.profit).toBe('number');
    expect(typeof data.roi).toBe('number');
    expect(typeof data.margin).toBe('number');
    expect(data.profit).toBeCloseTo(EXPECTED_PROFIT, 6);
    expect(data.roi).toBeCloseTo(EXPECTED_ROI, 4);
    expect(data.margin).toBeCloseTo(EXPECTED_MARGIN, 4);
  });

  it('writes finalCost and totalLandedCost from the engine', async () => {
    await POST(makeReq(), makeCtx());
    const data = mockProductUpdateMany.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.finalCost).toBeCloseTo(EXPECTED_FINAL_COST, 6);
    expect(data.totalLandedCost).toBeCloseTo(EXPECTED_TOTAL_LANDED, 6);
    expect(data.taxAmount).toBeCloseTo(EXPECTED_TAX_AMOUNT, 6);
  });

  it('uses stored storageFee from product (not a hardcoded default) in amazonFees', async () => {
    // storageFee=1.00 → amazonFees should be 3.00 + 4.50 + 1.00 = 8.50
    mockLeadFindFirst.mockResolvedValue({
      product: { ...PRODUCT, storageFee: 1.00 },
    });
    await POST(makeReq(), makeCtx());
    const data = mockProductUpdateMany.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.amazonFees).toBeCloseTo(3.00 + 4.50 + 1.00, 6);
  });

  it('defaults storageFee to 0.50 and prepFee to 1.50 when stored values are null', async () => {
    mockLeadFindFirst.mockResolvedValue({
      product: { ...PRODUCT, storageFee: null, prepFee: null },
    });
    await POST(makeReq(), makeCtx());
    const data = mockProductUpdateMany.mock.calls[0][0].data as Record<string, unknown>;
    // amazonFees = 3.00 + 4.50 + 0.50 = 8.00
    expect(data.amazonFees).toBeCloseTo(8.00, 6);
  });

  it('uses sourceTaxRate from product when present', async () => {
    // taxRate 0.10 → taxAmount = 25.00 * 0.10 = 2.50
    mockLeadFindFirst.mockResolvedValue({
      product: { ...PRODUCT, sourceTaxRate: '0.1000' },
    });
    await POST(makeReq(), makeCtx());
    const data = mockProductUpdateMany.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.taxAmount).toBeCloseTo(25.00 * 0.10, 6);
  });

  it('does not return fee or profitability amounts in the response body', async () => {
    const res = await POST(makeReq(), makeCtx());
    const body = await res.json();
    for (const field of ['referralFee', 'fbaFee', 'amazonFees', 'profit', 'roi', 'margin', 'storageFee']) {
      expect(body, `response must not include ${field}`).not.toHaveProperty(field);
    }
  });

  it('does not update forbidden fields', async () => {
    await POST(makeReq(), makeCtx());
    const data = mockProductUpdateMany.mock.calls[0][0].data as Record<string, unknown>;
    for (const forbidden of [
      'storageFee', 'prepFee',
      'sourcePrice', 'sourceTaxRate',
      'buyBoxPrice', 'lowestFbaPrice',
      'priceCheckedAt', 'freshnessStatus',
      'estimatedResellPrice',
    ]) {
      expect(data, `data.${forbidden} must not be set`).not.toHaveProperty(forbidden);
    }
  });

  it('does not call lead.update — Lead is read-only throughout', async () => {
    await POST(makeReq(), makeCtx());
    expect(mockLeadFindFirst).toHaveBeenCalledTimes(1);
    expect(mockProductUpdateMany).toHaveBeenCalledTimes(1);
  });
});

// ─── 7. Fees-only fallback (sourcePrice null) ────────────────────────────────

describe('fees-only fallback (sourcePrice null)', () => {
  beforeEach(() => {
    mockLeadFindFirst.mockResolvedValue({
      product: { ...PRODUCT, sourcePrice: null },
    });
  });

  it('returns REFRESHED_FEES_ONLY with profitUpdated: false and warning', async () => {
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok:           true,
      status:       'REFRESHED_FEES_ONLY',
      profitUpdated: false,
      warning:      'MISSING_SOURCE_PRICE',
    });
  });

  it('writes only the 6 fee metadata fields — no profit/roi/margin/amazonFees', async () => {
    await POST(makeReq(), makeCtx());
    expect(mockProductUpdateMany).toHaveBeenCalledTimes(1);
    const data = mockProductUpdateMany.mock.calls[0][0].data as Record<string, unknown>;
    // Fee metadata fields present
    expect(data.referralFee).toBe(3.00);
    expect(data.fbaFee).toBe(4.50);
    expect(data.feeEstimateSource).toBe('SP_API');
    expect(data.feeEstimatePrice).toBe(29.99);
    expect(data.feeEstimateConfirmed).toBe(true);
    expect(data.feeEstimatedAt).toBeInstanceOf(Date);
    // Recalculation fields absent
    for (const absent of ['profit', 'roi', 'margin', 'amazonFees', 'fees', 'finalCost', 'totalLandedCost', 'taxAmount']) {
      expect(data, `data.${absent} must not be set`).not.toHaveProperty(absent);
    }
  });
});
