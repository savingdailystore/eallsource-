// Tests for PATCH /api/admin/brand-blocks/[id]
//
// Cases:
//   1. Unauthenticated → 401
//   2. Non-admin → 403
//   3. Block not found → 404
//   4. Block already inactive → 409
//   5. Clears the block: marks isActive=false, un-flags products, writes AuditLog
//   6. Response contains updated block with isActive=false

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/admin', () => ({ isPlatformAdmin: vi.fn() }));

const brandBlockFindUnique = vi.fn();
const brandBlockUpdate     = vi.fn();
const productUpdateMany    = vi.fn();
const auditLogCreate       = vi.fn();
const txFn                 = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    brandBlock: {
      findUnique: (...a: unknown[]) => brandBlockFindUnique(...a),
    },
    $transaction: (...a: unknown[]) => txFn(...a),
  },
}));

import { auth } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/admin';

const mockAuth            = auth as ReturnType<typeof vi.fn>;
const mockIsPlatformAdmin = isPlatformAdmin as ReturnType<typeof vi.fn>;

const params = Promise.resolve({ id: 'bb1' });

function makeReq() {
  return new NextRequest('http://localhost/api/admin/brand-blocks/bb1', { method: 'PATCH' });
}

function setupTx() {
  txFn.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      brandBlock: { update: brandBlockUpdate },
      product:    { updateMany: productUpdateMany },
      auditLog:   { create: auditLogCreate },
    };
    return cb(tx);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsPlatformAdmin.mockReturnValue(false);
  brandBlockFindUnique.mockResolvedValue({ id: 'bb1', brand: 'Astercook', normalizedBrand: 'astercook', isActive: true });
  brandBlockUpdate.mockResolvedValue({ id: 'bb1', isActive: false, clearedAt: new Date() });
  productUpdateMany.mockResolvedValue({ count: 3 });
  auditLogCreate.mockResolvedValue({});
  setupTx();
});

describe('PATCH /api/admin/brand-blocks/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(makeReq(), { params });
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not OWNER or platform admin', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'ANALYST', email: 'a@org.com' } });
    const res = await PATCH(makeReq(), { params });
    expect(res.status).toBe(403);
  });

  it('returns 404 when block does not exist', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'OWNER', orgId: 'org1', id: 'u1', email: 'owner@org.com' } });
    brandBlockFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeReq(), { params });
    expect(res.status).toBe(404);
    expect(txFn).not.toHaveBeenCalled();
  });

  it('returns 409 when block is already inactive', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'OWNER', orgId: 'org1', id: 'u1', email: 'owner@org.com' } });
    brandBlockFindUnique.mockResolvedValue({ id: 'bb1', brand: 'Astercook', normalizedBrand: 'astercook', isActive: false });
    const res = await PATCH(makeReq(), { params });
    expect(res.status).toBe(409);
    expect(txFn).not.toHaveBeenCalled();
  });

  it('clears block: isActive=false, un-flags products, writes AuditLog', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'OWNER', orgId: 'org1', id: 'u1', email: 'owner@org.com' } });

    const res = await PATCH(makeReq(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Block deactivated
    expect(brandBlockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bb1' },
        data:  expect.objectContaining({ isActive: false, clearedByEmail: 'owner@org.com' }),
      }),
    );

    // Products un-flagged
    expect(productUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { brand: { equals: 'astercook', mode: 'insensitive' } },
        data:  { isBrandBlocked: false },
      }),
    );

    // AuditLog written with CLEARED action
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action:   'BRAND_BLOCK_CLEARED',
          resource: 'BrandBlock',
          metadata: expect.objectContaining({
            brand:           'Astercook',
            normalizedBrand: 'astercook',
          }),
        }),
      }),
    );
  });
});
