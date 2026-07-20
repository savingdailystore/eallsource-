// Tests for GET + POST /api/admin/brand-blocks
//
// Cases:
//   1.  GET unauthenticated → 401
//   2.  GET non-admin → 403
//   3.  GET admin → 200 with blocks list
//   4.  POST unauthenticated → 401
//   5.  POST non-admin → 403
//   6.  POST missing brand → 400
//   7.  POST creates block, normalizes brand, rejects active leads, writes AuditLog
//   8.  POST duplicate active brand → 409
//   9.  POST reactivates cleared brand block

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/admin', () => ({ isPlatformAdmin: vi.fn() }));

const brandBlockFindMany  = vi.fn();
const brandBlockFindUnique = vi.fn();
const brandBlockCreate    = vi.fn();
const brandBlockUpdate    = vi.fn();
const productUpdateMany   = vi.fn();
const leadUpdateMany      = vi.fn();
const auditLogCreate      = vi.fn();
const txFn                = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    brandBlock: {
      findMany:   (...a: unknown[]) => brandBlockFindMany(...a),
      findUnique: (...a: unknown[]) => brandBlockFindUnique(...a),
      create:     (...a: unknown[]) => brandBlockCreate(...a),
      update:     (...a: unknown[]) => brandBlockUpdate(...a),
    },
    $transaction: (...a: unknown[]) => txFn(...a),
  },
}));

import { auth } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/admin';

const mockAuth            = auth as ReturnType<typeof vi.fn>;
const mockIsPlatformAdmin = isPlatformAdmin as ReturnType<typeof vi.fn>;

function setupTx() {
  txFn.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      brandBlock: { create: brandBlockCreate, update: brandBlockUpdate },
      product:    { updateMany: productUpdateMany },
      lead:       { updateMany: leadUpdateMany },
      auditLog:   { create: auditLogCreate },
    };
    return cb(tx);
  });
}

function adminSession(role = 'OWNER') {
  return { user: { id: 'u1', orgId: 'org1', email: 'owner@org.com', role } };
}

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/admin/brand-blocks', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsPlatformAdmin.mockReturnValue(false);
  brandBlockFindMany.mockResolvedValue([]);
  brandBlockFindUnique.mockResolvedValue(null);
  brandBlockCreate.mockResolvedValue({ id: 'bb1', brand: 'Astercook', normalizedBrand: 'astercook', isActive: true });
  brandBlockUpdate.mockResolvedValue({ id: 'bb1', isActive: false });
  productUpdateMany.mockResolvedValue({ count: 3 });
  leadUpdateMany.mockResolvedValue({ count: 5 });
  auditLogCreate.mockResolvedValue({});
  setupTx();
});

describe('GET /api/admin/brand-blocks', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not OWNER or platform admin', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'ANALYST', email: 'a@org.com' } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 200 with blocks list for OWNER', async () => {
    mockAuth.mockResolvedValue(adminSession());
    brandBlockFindMany.mockResolvedValue([{ id: 'bb1', brand: 'Astercook', isActive: true }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.blocks).toHaveLength(1);
  });

  it('returns 200 with blocks list for platform admin', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'ADMIN', email: 'savingdailystore@gmail.com' } });
    mockIsPlatformAdmin.mockReturnValue(true);
    brandBlockFindMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/brand-blocks', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq({ brand: 'Astercook' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not OWNER or platform admin', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'ANALYST', email: 'a@org.com' } });
    const res = await POST(makeReq({ brand: 'Astercook' }));
    expect(res.status).toBe(403);
    expect(txFn).not.toHaveBeenCalled();
  });

  it('returns 400 when brand is missing', async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await POST(makeReq({ reason: 'missing brand field' }));
    expect(res.status).toBe(400);
    expect(txFn).not.toHaveBeenCalled();
  });

  it('returns 400 when brand is whitespace-only', async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await POST(makeReq({ brand: '   ' }));
    expect(res.status).toBe(400);
    expect(txFn).not.toHaveBeenCalled();
  });

  it('creates brand block, normalizes brand, rejects active leads, writes AuditLog', async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await POST(makeReq({ brand: '  Astercook  ', reason: 'Private label' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.leadsRejected).toBe(5);

    // Transaction was called
    expect(txFn).toHaveBeenCalledTimes(1);

    // BrandBlock created with normalized brand
    expect(brandBlockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brand:           'Astercook',
          normalizedBrand: 'astercook',
          isActive:        true,
        }),
      }),
    );

    // Active leads rejected — filter uses case-insensitive brand match
    expect(leadUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status:  { notIn: ['REJECTED', 'EXPIRED'] },
          product: { brand: { equals: 'astercook', mode: 'insensitive' } },
        }),
        data: { status: 'REJECTED' },
      }),
    );

    // AuditLog written
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action:   'BRAND_BLOCK_CREATED',
          resource: 'BrandBlock',
          metadata: expect.objectContaining({
            brand:           'Astercook',
            normalizedBrand: 'astercook',
            leadsRejected:   5,
          }),
        }),
      }),
    );
  });

  it('returns 409 when brand is already actively blocked', async () => {
    mockAuth.mockResolvedValue(adminSession());
    brandBlockFindUnique.mockResolvedValue({ id: 'bb1', isActive: true, normalizedBrand: 'astercook' });
    const res = await POST(makeReq({ brand: 'Astercook' }));
    expect(res.status).toBe(409);
    expect(txFn).not.toHaveBeenCalled();
  });

  it('reactivates a previously cleared block rather than creating a duplicate', async () => {
    mockAuth.mockResolvedValue(adminSession());
    // Existing block is inactive (cleared)
    brandBlockFindUnique.mockResolvedValue({ id: 'bb-old', isActive: false, normalizedBrand: 'astercook' });

    const res = await POST(makeReq({ brand: 'Astercook' }));
    expect(res.status).toBe(200);

    // Should UPDATE the existing block, not create a new one
    expect(brandBlockUpdate).toHaveBeenCalled();
    expect(brandBlockCreate).not.toHaveBeenCalled();

    // AuditLog metadata marks it as reactivated
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ reactivated: true }),
        }),
      }),
    );
  });
});
