/**
 * Phase 20.2M-1D-6B — Lead Fee Refresh Endpoint Tests
 *
 * Tests POST /api/leads/[id]/refresh-fees.
 * All external I/O (auth, prisma, SP-API, rate-limit) is mocked with
 * explicit factory functions to avoid loading real next-auth/prisma modules.
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

const PRODUCT = {
  id:             'product-1',
  orgId:          'org-1',
  asin:           'B001234567',
  lowestFbaPrice: 29.99,
  buyBoxPrice:    31.00,
};

const FRESH_FEES = { referralFee: 3.00, fbaFee: 4.50 };

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
    // Must use stored lowestFbaPrice, not the client-supplied value
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

// ─── 6. Success behavior ─────────────────────────────────────────────────────

describe('success behavior', () => {
  it('returns REFRESHED on success', async () => {
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, status: 'REFRESHED' });
  });

  it('updates only the allowed fee metadata fields on Product with org-scoped where clause', async () => {
    await POST(makeReq(), makeCtx());
    expect(mockProductUpdateMany).toHaveBeenCalledTimes(1);
    const call = mockProductUpdateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data:  Record<string, unknown>;
    };

    // Where clause must be double-keyed
    expect(call.where).toMatchObject({ id: 'product-1', orgId: 'org-1' });

    // Exactly these 6 fields — no more
    expect(call.data.referralFee).toBe(3.00);
    expect(call.data.fbaFee).toBe(4.50);
    expect(call.data.feeEstimateSource).toBe('SP_API');
    expect(call.data.feeEstimatePrice).toBe(29.99);
    expect(call.data.feeEstimateConfirmed).toBe(true);
    expect(call.data.feeEstimatedAt).toBeInstanceOf(Date);
  });

  it('does not update profit, roi, margin, amazonFees, buyBoxPrice, lowestFbaPrice, priceCheckedAt, storageFee, prepFee, or taxAmount', async () => {
    await POST(makeReq(), makeCtx());
    const data = mockProductUpdateMany.mock.calls[0][0].data as Record<string, unknown>;
    for (const forbidden of [
      'profit', 'roi', 'margin', 'amazonFees',
      'buyBoxPrice', 'lowestFbaPrice', 'priceCheckedAt',
      'storageFee', 'prepFee', 'taxAmount',
    ]) {
      expect(data, `data.${forbidden} must not be set`).not.toHaveProperty(forbidden);
    }
  });

  it('does not return fee amounts in the response body', async () => {
    const res = await POST(makeReq(), makeCtx());
    const body = await res.json();
    for (const field of ['referralFee', 'fbaFee', 'amazonFees', 'feeEstimatePrice', 'storageFee']) {
      expect(body, `response must not include ${field}`).not.toHaveProperty(field);
    }
  });

  it('does not call lead.update, and only calls lead.findFirst once (read-only on Lead)', async () => {
    await POST(makeReq(), makeCtx());
    // lead.findFirst was called once (read), never updated
    expect(mockLeadFindFirst).toHaveBeenCalledTimes(1);
    // No lead or entitlement write mock was registered — confirms no such call
    expect(mockProductUpdateMany).toHaveBeenCalledTimes(1); // only product write
  });
});
