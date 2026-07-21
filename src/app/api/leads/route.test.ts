import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const authMock       = vi.fn();
const orgFindUnique  = vi.fn();
const leadFindMany   = vi.fn();
const leadCount      = vi.fn();
const leadFindFirst  = vi.fn();
const leadUpdate     = vi.fn();
const auditLogCreate = vi.fn().mockResolvedValue({});

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findUnique: (...a: unknown[]) => orgFindUnique(...a) },
    lead: {
      findMany:  (...a: unknown[]) => leadFindMany(...a),
      count:     (...a: unknown[]) => leadCount(...a),
      findFirst: (...a: unknown[]) => leadFindFirst(...a),
      update:    (...a: unknown[]) => leadUpdate(...a),
    },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
  },
}));
// getCached calls through to the callback — no Redis in tests
vi.mock('@/lib/redis', () => ({
  getCached: (_key: string, fn: () => unknown) => fn(),
}));

import { GET, PATCH } from './route';

// Source/operator org — isBroadcastSource = true
const SOURCE_SESSION = { user: { id: 'u1', role: 'OWNER', orgId: 'source-org', plan: 'ENTERPRISE', email: 'owner@test.com' } };
// Customer org — isBroadcastSource = false (role ADMIN)
const ADMIN_SESSION  = { user: { id: 'u2', role: 'ADMIN', orgId: 'cust-org-1', plan: 'PRO',        email: 'customer@test.com' } };
// Customer org — isBroadcastSource = false but role is OWNER (tests that role alone does not bypass)
const CUST_OWNER_SESSION = { user: { id: 'u3', role: 'OWNER', orgId: 'cust-org-2', plan: 'PRO', email: 'custowner@test.com' } };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/leads');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

function makePatch(body: object) {
  return new NextRequest('http://localhost/api/leads', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

describe('GET /api/leads — entitlement enforcement', () => {
  beforeEach(() => {
    authMock.mockReset();
    orgFindUnique.mockReset();
    leadFindMany.mockReset();
    leadCount.mockReset();
    leadFindMany.mockResolvedValue([]);
    leadCount.mockResolvedValue(0);
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('customer (ADMIN, isBroadcastSource=false): where includes entitlements.some', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    await GET(makeGet());
    const [call] = leadFindMany.mock.calls;
    expect(call[0].where).toMatchObject({
      orgId:        'cust-org-1',
      entitlements: { some: { orgId: 'cust-org-1' } },
    });
  });

  it('source org (isBroadcastSource=true): where does NOT include entitlements', async () => {
    authMock.mockResolvedValue(SOURCE_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: true });
    await GET(makeGet());
    const [call] = leadFindMany.mock.calls;
    expect(call[0].where.orgId).toBe('source-org');
    expect(call[0].where).not.toHaveProperty('entitlements');
  });

  it('customer OWNER (isBroadcastSource=false): role alone does not bypass — still requires entitlement', async () => {
    authMock.mockResolvedValue(CUST_OWNER_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    await GET(makeGet());
    const [call] = leadFindMany.mock.calls;
    expect(call[0].where).toMatchObject({
      orgId:        'cust-org-2',
      entitlements: { some: { orgId: 'cust-org-2' } },
    });
  });

  it('customer: count query uses same entitlement-aware where', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    await GET(makeGet());
    const [countCall] = leadCount.mock.calls;
    expect(countCall[0].where).toMatchObject({
      orgId:        'cust-org-1',
      entitlements: { some: { orgId: 'cust-org-1' } },
    });
  });

  it('customer: no leadTier filter applied (no retroactive plan-tier gating)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    await GET(makeGet());
    const [call] = leadFindMany.mock.calls;
    expect(JSON.stringify(call[0].where)).not.toContain('leadTier');
    expect(JSON.stringify(call[0].where)).not.toContain('allowedLeadTiers');
  });

  it('BACKFILL entitlements visible: entitlements.some checks only orgId, not deliverySource', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    await GET(makeGet());
    const [call] = leadFindMany.mock.calls;
    expect(call[0].where.entitlements.some).toEqual({ orgId: 'cust-org-1' });
    expect(JSON.stringify(call[0].where)).not.toContain('deliverySource');
  });

  it('returns 200 with lead data', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    leadFindMany.mockResolvedValue([{ id: 'lead-1', score: 80, status: 'NEW', product: { asin: 'B001' } }]);
    leadCount.mockResolvedValue(1);
    const res  = await GET(makeGet());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });
});

describe('GET /api/leads — dateFilter param', () => {
  beforeEach(() => {
    authMock.mockReset();
    orgFindUnique.mockReset();
    leadFindMany.mockReset();
    leadCount.mockReset();
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    leadFindMany.mockResolvedValue([{ id: 'l1', score: 80, status: 'NEW', createdAt: new Date().toISOString(), product: { asin: 'B001' } }]);
    leadCount.mockResolvedValue(1);
  });

  it('dateFilter=today applies createdAt gte boundary (approx 24h)', async () => {
    const before = new Date(Date.now() - 24 * 60 * 60 * 1000 - 5000);
    await GET(makeGet({ dateFilter: 'today' }));
    const [call] = leadFindMany.mock.calls;
    const boundary: Date = call[0].where.createdAt?.gte;
    expect(boundary).toBeInstanceOf(Date);
    expect(boundary.getTime()).toBeGreaterThan(before.getTime());
  });

  it('dateFilter=week applies createdAt gte boundary (approx 7 days)', async () => {
    const before = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 5000);
    await GET(makeGet({ dateFilter: 'week' }));
    const [call] = leadFindMany.mock.calls;
    const boundary: Date = call[0].where.createdAt?.gte;
    expect(boundary).toBeInstanceOf(Date);
    expect(boundary.getTime()).toBeGreaterThan(before.getTime());
    // week boundary is more than 24h ago
    expect(boundary.getTime()).toBeLessThan(Date.now() - 24 * 60 * 60 * 1000);
  });

  it('no dateFilter means no createdAt filter applied', async () => {
    await GET(makeGet());
    const [call] = leadFindMany.mock.calls;
    expect(call[0].where).not.toHaveProperty('createdAt');
  });

  it('invalid dateFilter is ignored', async () => {
    await GET(makeGet({ dateFilter: 'yesterday' }));
    const [call] = leadFindMany.mock.calls;
    expect(call[0].where).not.toHaveProperty('createdAt');
  });

  it('dateFilter=today uses createdAt desc sort (newest first)', async () => {
    await GET(makeGet({ dateFilter: 'today' }));
    const [call] = leadFindMany.mock.calls;
    expect(call[0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('dateFilter=today with sortBy=roi uses roi sort (explicit sort wins)', async () => {
    await GET(makeGet({ dateFilter: 'today', sortBy: 'roi' }));
    const [call] = leadFindMany.mock.calls;
    expect(call[0].orderBy).toEqual({ product: { roi: 'desc' } });
  });

  it('response includes createdAt on lead records', async () => {
    const res  = await GET(makeGet({ dateFilter: 'today' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0]).toHaveProperty('createdAt');
  });

  it('REJECTED leads remain excluded when dateFilter=today', async () => {
    await GET(makeGet({ dateFilter: 'today' }));
    const [call] = leadFindMany.mock.calls;
    expect(call[0].where.status).toMatchObject({ notIn: ['REJECTED', 'EXPIRED'] });
  });

  it('dateFilter and sellable filter compose (both in where)', async () => {
    await GET(makeGet({ dateFilter: 'today', minRoi: '30' }));
    const [call] = leadFindMany.mock.calls;
    expect(call[0].where).toHaveProperty('createdAt');
    expect(call[0].where.product).toMatchObject({ roi: { gte: 30 } });
  });
});

describe('PATCH /api/leads — entitlement enforcement', () => {
  beforeEach(() => {
    authMock.mockReset();
    orgFindUnique.mockReset();
    leadFindFirst.mockReset();
    leadUpdate.mockReset();
  });

  it('customer: findFirst where includes entitlements.some', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    leadFindFirst.mockResolvedValue(null);
    const res = await PATCH(makePatch({ id: 'claaaaaaaaaaaaaaaaaaaaaa', status: 'SAVED' }));
    expect(res.status).toBe(404);
    const [call] = leadFindFirst.mock.calls;
    expect(call[0].where).toMatchObject({
      orgId:        'cust-org-1',
      entitlements: { some: { orgId: 'cust-org-1' } },
    });
  });

  it('customer OWNER: role alone does not bypass — findFirst still requires entitlement', async () => {
    authMock.mockResolvedValue(CUST_OWNER_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    leadFindFirst.mockResolvedValue(null);
    await PATCH(makePatch({ id: 'claaaaaaaaaaaaaaaaaaaaaa', status: 'SAVED' }));
    const [call] = leadFindFirst.mock.calls;
    expect(call[0].where).toMatchObject({ entitlements: { some: { orgId: 'cust-org-2' } } });
  });

  it('customer: PATCH proceeds when entitlement exists', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    const fakeLead = { id: 'claaaaaaaaaaaaaaaaaaaaaa', orgId: 'cust-org-1', status: 'NEW' };
    leadFindFirst.mockResolvedValue(fakeLead);
    leadUpdate.mockResolvedValue({ ...fakeLead, status: 'SAVED' });
    const res = await PATCH(makePatch({ id: 'claaaaaaaaaaaaaaaaaaaaaa', status: 'SAVED' }));
    expect(res.status).toBe(200);
  });

  it('source org: findFirst where does NOT include entitlements', async () => {
    authMock.mockResolvedValue(SOURCE_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: true });
    leadFindFirst.mockResolvedValue(null);
    await PATCH(makePatch({ id: 'claaaaaaaaaaaaaaaaaaaaaa', status: 'SAVED' }));
    const [call] = leadFindFirst.mock.calls;
    expect(call[0].where.orgId).toBe('source-org');
    expect(call[0].where).not.toHaveProperty('entitlements');
  });
});

describe('PATCH /api/leads — CUSTOMER_LEAD_STATUS_UPDATE audit', () => {
  beforeEach(() => {
    authMock.mockReset();
    orgFindUnique.mockReset();
    leadFindFirst.mockReset();
    leadUpdate.mockReset();
    auditLogCreate.mockReset();
    auditLogCreate.mockResolvedValue({});
  });

  it('writes CUSTOMER_LEAD_STATUS_UPDATE on successful status change', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    const fakeLead = { id: 'claaaaaaaaaaaaaaaaaaaaaa', orgId: 'cust-org-1', status: 'NEW' };
    leadFindFirst.mockResolvedValue(fakeLead);
    leadUpdate.mockResolvedValue({ ...fakeLead, status: 'SAVED' });

    await PATCH(makePatch({ id: 'claaaaaaaaaaaaaaaaaaaaaa', status: 'SAVED' }));

    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action:   'CUSTOMER_LEAD_STATUS_UPDATE',
          resource: 'Lead',
          orgId:    'cust-org-1',
          userId:   'u2',
          metadata: expect.objectContaining({ before: 'NEW', after: 'SAVED' }),
        }),
      }),
    );
  });

  it('does NOT write audit log when lead is not found (404)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
    leadFindFirst.mockResolvedValue(null);

    const res = await PATCH(makePatch({ id: 'claaaaaaaaaaaaaaaaaaaaaa', status: 'SAVED' }));

    expect(res.status).toBe(404);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});
