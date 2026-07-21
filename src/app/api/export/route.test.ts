import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const authMock       = vi.fn();
const orgFindUnique  = vi.fn();
const leadFindMany   = vi.fn();
const prodFindMany   = vi.fn();
const auditLogCreate = vi.fn().mockResolvedValue({});

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findUnique: (...a: unknown[]) => orgFindUnique(...a) },
    lead:         { findMany:   (...a: unknown[]) => leadFindMany(...a)  },
    product:      { findMany:   (...a: unknown[]) => prodFindMany(...a)  },
    auditLog:     { create:     (...a: unknown[]) => auditLogCreate(...a) },
  },
}));

import { GET } from './route';

const SOURCE_SESSION     = { user: { id: 'u1', role: 'OWNER', orgId: 'source-org', plan: 'ENTERPRISE' } };
const ADMIN_SESSION      = { user: { id: 'u2', role: 'ADMIN', orgId: 'cust-org-1', plan: 'PRO' } };
const CUST_OWNER_SESSION = { user: { id: 'u3', role: 'OWNER', orgId: 'cust-org-2', plan: 'PRO' } };

const FAKE_LEAD = {
  id: 'lead-1', score: 80, status: 'NEW', createdAt: new Date(),
  product: {
    asin: 'B001', title: 'Test', category: 'Electronics', sourceRetailer: 'Walmart',
    sourcePrice: 10, finalCost: 10, lowestFbaPrice: 20, price: 20,
    amazonFees: 3, profit: 7, roi: 70, bsr: 1000, ipRiskScore: 'LOW', demandLevel: 'HIGH',
  },
};

function makeGet(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/export');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

describe('GET /api/export — entitlement enforcement', () => {
  beforeEach(() => {
    authMock.mockReset();
    orgFindUnique.mockReset();
    leadFindMany.mockReset();
    prodFindMany.mockReset();
    leadFindMany.mockResolvedValue([FAKE_LEAD]);
    prodFindMany.mockResolvedValue([]);
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeGet({ type: 'leads' }));
    expect(res.status).toBe(401);
  });

  it('customer (ADMIN, isBroadcastSource=false): leads export where includes entitlements.some', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    await GET(makeGet({ type: 'leads', format: 'json' }));
    const [call] = leadFindMany.mock.calls;
    expect(call[0].where).toMatchObject({
      orgId:        'cust-org-1',
      entitlements: { some: { orgId: 'cust-org-1' } },
    });
  });

  it('source org (isBroadcastSource=true): export where does NOT include entitlements', async () => {
    authMock.mockResolvedValue(SOURCE_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: true });
    await GET(makeGet({ type: 'leads', format: 'json' }));
    const [call] = leadFindMany.mock.calls;
    expect(call[0].where.orgId).toBe('source-org');
    expect(call[0].where).not.toHaveProperty('entitlements');
  });

  it('customer OWNER (isBroadcastSource=false): role alone does not bypass entitlement', async () => {
    authMock.mockResolvedValue(CUST_OWNER_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    await GET(makeGet({ type: 'leads', format: 'json' }));
    const [call] = leadFindMany.mock.calls;
    expect(call[0].where).toMatchObject({
      orgId:        'cust-org-2',
      entitlements: { some: { orgId: 'cust-org-2' } },
    });
  });

  it('customer: export returns only entitled leads', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    const res  = await GET(makeGet({ type: 'leads', format: 'json' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].asin).toBe('B001');
  });

  it('customer: no leadTier filter in export (no retroactive plan-tier gating)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    await GET(makeGet({ type: 'leads', format: 'json' }));
    const [call] = leadFindMany.mock.calls;
    expect(JSON.stringify(call[0].where)).not.toContain('leadTier');
  });

  it('BACKFILL entitlements visible: entitlements.some checks only orgId, not deliverySource', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    await GET(makeGet({ type: 'leads', format: 'json' }));
    const [call] = leadFindMany.mock.calls;
    expect(call[0].where.entitlements.some).toEqual({ orgId: 'cust-org-1' });
    expect(JSON.stringify(call[0].where)).not.toContain('deliverySource');
  });
});

describe('GET /api/export — CUSTOMER_EXPORT_USED audit', () => {
  beforeEach(() => {
    authMock.mockReset();
    orgFindUnique.mockReset();
    leadFindMany.mockReset();
    prodFindMany.mockReset();
    auditLogCreate.mockReset();
    auditLogCreate.mockResolvedValue({});
    leadFindMany.mockResolvedValue([FAKE_LEAD]);
    prodFindMany.mockResolvedValue([]);
  });

  it('writes CUSTOMER_EXPORT_USED with correct type/format/rowCount', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });

    await GET(makeGet({ type: 'leads', format: 'json' }));

    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action:   'CUSTOMER_EXPORT_USED',
          resource: 'Export',
          orgId:    'cust-org-1',
          userId:   'u2',
          metadata: expect.objectContaining({ type: 'leads', format: 'json', rowCount: 1 }),
        }),
      }),
    );
  });

  it('writes audit log even when rowCount is 0', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    leadFindMany.mockResolvedValue([]);

    await GET(makeGet({ type: 'leads', format: 'csv' }));

    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action:   'CUSTOMER_EXPORT_USED',
          metadata: expect.objectContaining({ rowCount: 0 }),
        }),
      }),
    );
  });
});
