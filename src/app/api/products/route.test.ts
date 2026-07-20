// Tests for GET /api/products
//
// Cases:
//   1. Unauthenticated → 401
//   2. Default query excludes hasIpComplaintHistory=true products
//   3. Customer (non-OWNER, non-admin) cannot use showBlocked — filter still applied
//   4. OWNER with showBlocked=true omits the hasIpComplaintHistory filter
//   5. Platform admin with showBlocked=true omits the hasIpComplaintHistory filter
//   6. Non-privileged showBlocked=true is silently ignored (same as default)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/admin', () => ({ isPlatformAdmin: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  getCached: vi.fn((_key: string, fn: () => unknown) => fn()),
}));

const productFindMany = vi.fn();
const productCount    = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findMany: (...a: unknown[]) => productFindMany(...a),
      count:    (...a: unknown[]) => productCount(...a),
    },
  },
}));

import { auth } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/admin';

const mockAuth            = auth as ReturnType<typeof vi.fn>;
const mockIsPlatformAdmin = isPlatformAdmin as ReturnType<typeof vi.fn>;

function makeReq(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/products');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  productFindMany.mockResolvedValue([]);
  productCount.mockResolvedValue(0);
  mockIsPlatformAdmin.mockReturnValue(false);
});

describe('GET /api/products', () => {
  // ── 1. Unauthenticated ────────────────────────────────────────────────────

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  // ── 2. Default excludes IP-flagged products ───────────────────────────────

  it('excludes hasIpComplaintHistory=true products by default', async () => {
    mockAuth.mockResolvedValue({ user: { orgId: 'org1', role: 'ADMIN', email: 'user@org.com' } });

    await GET(makeReq());

    expect(productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ hasIpComplaintHistory: false }),
      }),
    );
  });

  // ── 3. Customer cannot use showBlocked ───────────────────────────────────

  it('ignores showBlocked=true for a non-OWNER non-admin user', async () => {
    mockAuth.mockResolvedValue({ user: { orgId: 'org1', role: 'ADMIN', email: 'user@org.com' } });
    mockIsPlatformAdmin.mockReturnValue(false);

    await GET(makeReq({ showBlocked: 'true' }));

    expect(productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ hasIpComplaintHistory: false }),
      }),
    );
  });

  // ── 4. OWNER with showBlocked=true omits filter ───────────────────────────

  it('omits hasIpComplaintHistory filter when OWNER requests showBlocked=true', async () => {
    mockAuth.mockResolvedValue({ user: { orgId: 'org1', role: 'OWNER', email: 'owner@org.com' } });
    mockIsPlatformAdmin.mockReturnValue(false);

    await GET(makeReq({ showBlocked: 'true' }));

    const callArg = productFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArg.where).not.toHaveProperty('hasIpComplaintHistory');
  });

  // ── 5. Platform admin with showBlocked=true omits filter ─────────────────

  it('omits hasIpComplaintHistory filter when platform admin requests showBlocked=true', async () => {
    mockAuth.mockResolvedValue({ user: { orgId: 'org1', role: 'ADMIN', email: 'savingdailystore@gmail.com' } });
    mockIsPlatformAdmin.mockReturnValue(true);

    await GET(makeReq({ showBlocked: 'true' }));

    const callArg = productFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArg.where).not.toHaveProperty('hasIpComplaintHistory');
  });

  // ── 6. Non-privileged showBlocked silently ignored ────────────────────────

  it('still excludes blocked products when ANALYST passes showBlocked=true', async () => {
    mockAuth.mockResolvedValue({ user: { orgId: 'org1', role: 'ANALYST', email: 'analyst@org.com' } });
    mockIsPlatformAdmin.mockReturnValue(false);

    await GET(makeReq({ showBlocked: 'true' }));

    expect(productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ hasIpComplaintHistory: false }),
      }),
    );
  });

  // ── 7. Returns success shape ──────────────────────────────────────────────

  it('returns 200 with success:true and data array', async () => {
    mockAuth.mockResolvedValue({ user: { orgId: 'org1', role: 'ADMIN', email: 'user@org.com' } });
    productFindMany.mockResolvedValue([{ id: 'p1' }]);
    productCount.mockResolvedValue(1);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});
