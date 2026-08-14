/**
 * Unit tests for POST /api/admin/tools/fee-preview
 *
 * Covers:
 * - Auth guard (unauthenticated, non-admin, OWNER, platformAdmin)
 * - Input validation (missing/invalid fields)
 * - SP-API null  → SP_API_FEE_UNAVAILABLE, no fee amounts, no pass/fail
 * - SP-API throw → SP_API_FEE_UNAVAILABLE, no internal error leaked
 * - SP-API success → referralFee, fbaFee, totalAmazonFees, profit computed
 * - No static/rate-table fallback fees ever returned
 * - Read-only contract — no DB writes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockAuth    = vi.fn();
const mockGetFees = vi.fn();

vi.mock('@/lib/auth',   () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));
vi.mock('@/lib/amazon', () => ({ getFeeEstimate: (...a: unknown[]) => mockGetFees(...a) }));
vi.mock('@/lib/admin',  () => ({
  isPlatformAdmin: (email: string | null | undefined) => email === 'admin@example.com',
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/tools/fee-preview', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

const VALID_BODY = {
  asin:          'B000000001',
  resellPrice:   14.99,
  sourceCost:    6.99,
  sourceTaxRate: 0.086,
  category:      'Beauty',
};

function ownerSession(orgId = 'org-1') {
  return { user: { role: 'OWNER', email: 'owner@example.com', orgId } };
}
function adminSession(orgId = 'org-1') {
  return { user: { role: 'ADMIN', email: 'admin@example.com', orgId } };
}
function nonAdminSession() {
  return { user: { role: 'ANALYST', email: 'user@example.com', orgId: 'org-2' } };
}

// ── Auth guard ────────────────────────────────────────────────────────────────

describe('auth guard', () => {
  beforeEach(() => mockGetFees.mockResolvedValue(null));

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin authenticated user', async () => {
    mockAuth.mockResolvedValue(nonAdminSession());
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('allows OWNER role', async () => {
    mockAuth.mockResolvedValue(ownerSession());
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
  });

  it('allows platform admin email regardless of role', async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
  });
});

// ── Input validation ──────────────────────────────────────────────────────────

describe('input validation', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(ownerSession());
    mockGetFees.mockResolvedValue(null);
  });

  it('rejects invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/admin/tools/fee-preview', {
      method:  'POST',
      body:    'not json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid json/i);
  });

  it.each([
    ['missing asin',          { ...VALID_BODY, asin: undefined }],
    ['bad asin (short)',      { ...VALID_BODY, asin: 'B123' }],
    ['bad asin (non-alpha)',  { ...VALID_BODY, asin: 'B000-00001' }],
    ['missing resellPrice',   { ...VALID_BODY, resellPrice: undefined }],
    ['zero resellPrice',      { ...VALID_BODY, resellPrice: 0 }],
    ['negative resellPrice',  { ...VALID_BODY, resellPrice: -1 }],
    ['missing sourceCost',    { ...VALID_BODY, sourceCost: undefined }],
    ['zero sourceCost',       { ...VALID_BODY, sourceCost: 0 }],
    ['missing sourceTaxRate', { ...VALID_BODY, sourceTaxRate: undefined }],
    ['taxRate > 1',           { ...VALID_BODY, sourceTaxRate: 1.5 }],
    ['taxRate < 0',           { ...VALID_BODY, sourceTaxRate: -0.01 }],
    ['missing category',      { ...VALID_BODY, category: undefined }],
    ['empty category',        { ...VALID_BODY, category: '' }],
  ])('rejects %s', async (_label, body) => {
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
  });

  it('normalises asin to uppercase', async () => {
    mockGetFees.mockResolvedValue({ referralFee: 1.20, fbaFee: 3.22 });
    const res  = await POST(makeReq({ ...VALID_BODY, asin: 'b000000001' }));
    const data = await res.json();
    expect(data.asin).toBe('B000000001');
  });
});

// ── SP-API null → SP_API_FEE_UNAVAILABLE ─────────────────────────────────────

describe('SP-API null returns SP_API_FEE_UNAVAILABLE', () => {
  beforeEach(() => mockAuth.mockResolvedValue(ownerSession()));

  it('returns ok:false with SP_API_FEE_UNAVAILABLE when getFeeEstimate returns null', async () => {
    mockGetFees.mockResolvedValue(null);

    const res  = await POST(makeReq(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.feeStatus).toBe('SP_API_FEE_UNAVAILABLE');
    expect(data.message).toMatch(/SP-API fee estimate unavailable/i);
  });

  it('does not return referralFee when SP-API is unavailable', async () => {
    mockGetFees.mockResolvedValue(null);
    const data = await (await POST(makeReq(VALID_BODY))).json();
    expect(data.referralFee).toBeUndefined();
  });

  it('does not return fbaFee when SP-API is unavailable', async () => {
    mockGetFees.mockResolvedValue(null);
    const data = await (await POST(makeReq(VALID_BODY))).json();
    expect(data.fbaFee).toBeUndefined();
  });

  it('does not return totalAmazonFees when SP-API is unavailable', async () => {
    mockGetFees.mockResolvedValue(null);
    const data = await (await POST(makeReq(VALID_BODY))).json();
    expect(data.totalAmazonFees).toBeUndefined();
  });

  it('does not return estimatedProfit (no STARTER_SALES pass/fail) when SP-API unavailable', async () => {
    mockGetFees.mockResolvedValue(null);
    const data = await (await POST(makeReq(VALID_BODY))).json();
    expect(data.estimatedProfit).toBeUndefined();
    expect(data.estimatedRoi).toBeUndefined();
  });

  it('does not return any rate-table-based fee as referralFeeSource', async () => {
    mockGetFees.mockResolvedValue(null);
    const data = await (await POST(makeReq(VALID_BODY))).json();
    expect(data.referralFeeSource).toBeUndefined();
  });
});

// ── SP-API throw → SP_API_FEE_UNAVAILABLE (no error leak) ────────────────────

describe('SP-API throw returns SP_API_FEE_UNAVAILABLE without leaking error details', () => {
  beforeEach(() => mockAuth.mockResolvedValue(ownerSession()));

  it('catches thrown errors and returns SP_API_FEE_UNAVAILABLE', async () => {
    mockGetFees.mockRejectedValue(new Error('Amazon account not connected — secret credential id xyz'));

    const res  = await POST(makeReq(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.feeStatus).toBe('SP_API_FEE_UNAVAILABLE');
  });

  it('does not leak the raw error message when SP-API throws', async () => {
    const secretMsg = 'AccessToken=abc123secret, OrgId=org-owner';
    mockGetFees.mockRejectedValue(new Error(secretMsg));

    const data = await (await POST(makeReq(VALID_BODY))).json();

    const body = JSON.stringify(data);
    expect(body).not.toContain('abc123secret');
    expect(body).not.toContain(secretMsg);
  });

  it('does not return referralFee on SP-API throw', async () => {
    mockGetFees.mockRejectedValue(new Error('network error'));
    const data = await (await POST(makeReq(VALID_BODY))).json();
    expect(data.referralFee).toBeUndefined();
  });

  it('does not return fbaFee on SP-API throw', async () => {
    mockGetFees.mockRejectedValue(new Error('network error'));
    const data = await (await POST(makeReq(VALID_BODY))).json();
    expect(data.fbaFee).toBeUndefined();
  });
});

// ── SP-API success path ───────────────────────────────────────────────────────

describe('SP-API success path', () => {
  beforeEach(() => mockAuth.mockResolvedValue(ownerSession('org-owner')));

  it('returns SP_API_SUCCESS with confirmed fees and computed profit', async () => {
    mockGetFees.mockResolvedValue({ referralFee: 1.20, fbaFee: 3.22 });

    const res  = await POST(makeReq(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.feeStatus).toBe('SP_API_SUCCESS');
    expect(data.referralFee).toBe(1.20);
    expect(data.fbaFee).toBe(3.22);
    expect(data.totalAmazonFees).toBeCloseTo(1.20 + 3.22, 2);

    // taxedSourceCost = 6.99 × 1.086 ≈ 7.59
    expect(data.taxedSourceCost).toBeCloseTo(7.59, 1);

    // profit = 14.99 - 7.59 - (1.20 + 3.22) = 2.98
    expect(data.estimatedProfit).toBeCloseTo(2.98, 1);
    expect(data.estimatedRoi).toBeGreaterThan(0);
  });

  it('profit message confirms preview-only / no candidate created', async () => {
    mockGetFees.mockResolvedValue({ referralFee: 1.20, fbaFee: 3.22 });
    const data = await (await POST(makeReq(VALID_BODY))).json();
    expect(data.message).toMatch(/preview only/i);
    expect(data.message).toMatch(/no candidate/i);
  });

  it('passes the correct orgId to getFeeEstimate', async () => {
    mockGetFees.mockResolvedValue({ referralFee: 1.20, fbaFee: 3.22 });
    await POST(makeReq(VALID_BODY));
    expect(mockGetFees).toHaveBeenCalledWith('org-owner', 'B000000001', 14.99);
  });

  it('computes negative profit correctly when fees exceed spread', async () => {
    mockGetFees.mockResolvedValue({ referralFee: 2.00, fbaFee: 7.00 });
    // sourceCost=6.99 taxed=7.59; amazon=14.99; totalFees=9.00; profit = -1.60
    const data = await (await POST(makeReq(VALID_BODY))).json();
    expect(data.estimatedProfit).toBeCloseTo(-1.60, 1);
    expect(data.feeStatus).toBe('SP_API_SUCCESS');
  });
});

// ── Category field is informational only ──────────────────────────────────────

describe('category field is informational only', () => {
  beforeEach(() => mockAuth.mockResolvedValue(ownerSession()));

  it('echoes back the category without using it to compute fees', async () => {
    mockGetFees.mockResolvedValue({ referralFee: 1.20, fbaFee: 3.22 });
    const res  = await POST(makeReq({ ...VALID_BODY, category: 'Toys' }));
    const data = await res.json();

    // Referral fee comes ONLY from SP-API, not from "Toys → 15%" rate table
    expect(data.referralFee).toBe(1.20);       // unchanged regardless of category
    expect(data.category).toBe('Toys');         // echoed back for display
    expect(data.referralRate).toBeUndefined();  // no rate-table field present
  });

  it.each(['Beauty', 'Toys', 'Grocery', 'Office', 'Unknown'])(
    'category %s never produces a rate-table referralFee when SP-API unavailable',
    async (category) => {
      mockGetFees.mockResolvedValue(null);
      const data = await (await POST(makeReq({ ...VALID_BODY, category }))).json();
      expect(data.referralFee).toBeUndefined();
      expect(data.feeStatus).toBe('SP_API_FEE_UNAVAILABLE');
    },
  );
});

// ── Read-only contract ────────────────────────────────────────────────────────

describe('read-only contract', () => {
  it('never calls any prisma write method', async () => {
    // prisma is mocked as {} — any write attempt throws "prisma.X is not a function"
    mockAuth.mockResolvedValue(ownerSession());
    mockGetFees.mockResolvedValue({ referralFee: 1.20, fbaFee: 3.22 });

    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
  });
});
