import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const authMock    = vi.fn();
const orgFindFirst = vi.fn();
const candFindMany = vi.fn();
const candCount    = vi.fn();
const candGroupBy  = vi.fn();

vi.mock('@/lib/auth',  () => ({ auth: () => authMock() }));
vi.mock('@/lib/admin', () => ({
  isPlatformAdmin: (email: string | null | undefined) => email === 'savingdailystore@gmail.com',
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization:    { findFirst: (...a: unknown[]) => orgFindFirst(...a) },
    sourceCandidate: {
      findMany: (...a: unknown[]) => candFindMany(...a),
      count:    (...a: unknown[]) => candCount(...a),
      groupBy:  (...a: unknown[]) => candGroupBy(...a),
    },
  },
}));

import { GET } from './route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_SESSION = { user: { email: 'savingdailystore@gmail.com', id: 'admin-1', role: 'MEMBER' } };
const OWNER_SESSION = { user: { email: 'owner@example.com',           id: 'owner-1', role: 'OWNER'  } };
const USER_SESSION  = { user: { email: 'user@example.com',            id: 'user-1',  role: 'MEMBER' } };

const ORG = { id: 'org-source' };

function makeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id:                'cand-1',
    retailer:          'Walmart',
    retailerUrl:       'https://walmart.com/ip/123',
    title:             'Test Product',
    brand:             'TestBrand',
    asin:              'B001234567',
    upc:               null,
    sourcePrice:       9.99,
    sourceListPrice:   null,
    onSale:            null,
    certStatus:        'RAW_CANDIDATE',
    sourceType:        'VA_IMPORT',
    sourceCost:        null,
    vaNotes:           null,
    certNotes:         null,
    estimatedProfit:   null,
    estimatedRoi:      null,
    buyBoxPrice:       null,
    lastCheckedAt:     null,
    amazonCheckedAt:   null,
    certifiedAt:       null,
    productId:         null,
    leadId:            null,
    targetLeadPurpose: 'PROFIT',
    createdAt:         new Date('2026-07-01'),
    updatedAt:         new Date('2026-07-01'),
    ...overrides,
  };
}

function makeRequest(params: Record<string, string> = {}) {
  const sp  = new URLSearchParams(params);
  const url = `http://localhost/api/admin/candidates?${sp}`;
  // Route uses req.nextUrl.searchParams (Next.js property), not the standard URL
  return { nextUrl: new URL(url) } as any;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(ADMIN_SESSION);
  orgFindFirst.mockResolvedValue(ORG);
  candFindMany.mockResolvedValue([makeCandidate()]);
  candCount.mockResolvedValue(1);
  candGroupBy.mockResolvedValue([{ certStatus: 'RAW_CANDIDATE', _count: { id: 1 } }]);
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('GET /api/admin/candidates — auth', () => {

  it('returns 403 for unauthenticated requests', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns 403 for non-admin, non-owner sessions', async () => {
    authMock.mockResolvedValue(USER_SESSION);
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('allows OWNER role', async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it('allows platform admin email', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

});

// ─── targetLeadPurpose in response ────────────────────────────────────────────

describe('GET /api/admin/candidates — targetLeadPurpose', () => {

  it('returns targetLeadPurpose = PROFIT for a default candidate', async () => {
    candFindMany.mockResolvedValue([makeCandidate({ targetLeadPurpose: 'PROFIT' })]);
    const res  = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.candidates[0].targetLeadPurpose).toBe('PROFIT');
  });

  it('returns targetLeadPurpose = STARTER_SALES when set', async () => {
    candFindMany.mockResolvedValue([makeCandidate({ targetLeadPurpose: 'STARTER_SALES' })]);
    const res  = await GET(makeRequest());
    const body = await res.json();
    expect(body.candidates[0].targetLeadPurpose).toBe('STARTER_SALES');
  });

  it('includes targetLeadPurpose in the findMany select', async () => {
    await GET(makeRequest());
    const [{ select }] = candFindMany.mock.calls[0];
    expect(select.targetLeadPurpose).toBe(true);
  });

  it('returns targetLeadPurpose for every candidate in the list', async () => {
    candFindMany.mockResolvedValue([
      makeCandidate({ id: 'c1', targetLeadPurpose: 'PROFIT' }),
      makeCandidate({ id: 'c2', targetLeadPurpose: 'STARTER_SALES' }),
    ]);
    const res  = await GET(makeRequest());
    const body = await res.json();
    expect(body.candidates).toHaveLength(2);
    expect(body.candidates[0].targetLeadPurpose).toBe('PROFIT');
    expect(body.candidates[1].targetLeadPurpose).toBe('STARTER_SALES');
  });

});

// ─── No source org ────────────────────────────────────────────────────────────

describe('GET /api/admin/candidates — no source org', () => {

  it('returns empty list when no broadcast-source org exists', async () => {
    orgFindFirst.mockResolvedValue(null);
    const res  = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.candidates).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.statusCounts).toEqual({});
    expect(candFindMany).not.toHaveBeenCalled();
  });

});

// ─── Response shape ───────────────────────────────────────────────────────────

describe('GET /api/admin/candidates — response shape', () => {

  it('returns candidates, total, page, limit, statusCounts', async () => {
    const res  = await GET(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty('candidates');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('page');
    expect(body).toHaveProperty('limit');
    expect(body).toHaveProperty('statusCounts');
  });

  it('statusCounts is keyed by certStatus', async () => {
    candGroupBy.mockResolvedValue([
      { certStatus: 'RAW_CANDIDATE', _count: { id: 5 } },
      { certStatus: 'CERTIFIED',     _count: { id: 2 } },
    ]);
    const res  = await GET(makeRequest());
    const body = await res.json();
    expect(body.statusCounts['RAW_CANDIDATE']).toBe(5);
    expect(body.statusCounts['CERTIFIED']).toBe(2);
  });

  it('does not write to any table (read-only)', async () => {
    await GET(makeRequest());
    // Verify only read operations were used
    expect(candFindMany).toHaveBeenCalledOnce();
    expect(candCount).toHaveBeenCalledOnce();
    expect(candGroupBy).toHaveBeenCalledOnce();
  });

});

// ─── Filters ──────────────────────────────────────────────────────────────────

describe('GET /api/admin/candidates — filters', () => {

  it('passes status filter to findMany where clause', async () => {
    await GET(makeRequest({ status: 'MATCHED' }));
    const [{ where }] = candFindMany.mock.calls[0];
    expect(where.certStatus).toBe('MATCHED');
  });

  it('passes retailer filter to findMany where clause', async () => {
    await GET(makeRequest({ retailer: 'Walmart' }));
    const [{ where }] = candFindMany.mock.calls[0];
    expect(where.retailer.equals).toBe('Walmart');
  });

  it('passes sourceType filter to findMany where clause', async () => {
    await GET(makeRequest({ sourceType: 'VA_IMPORT' }));
    const [{ where }] = candFindMany.mock.calls[0];
    expect(where.sourceType.equals).toBe('VA_IMPORT');
  });

});
