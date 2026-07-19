import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock       = vi.fn();
const orgFindFirst   = vi.fn();
const leadFindMany   = vi.fn();
const leadCount      = vi.fn();

vi.mock('@/lib/auth',  () => ({ auth: () => authMock() }));
vi.mock('@/lib/admin', () => ({ isPlatformAdmin: (email: string | null | undefined) => email === 'savingdailystore@gmail.com' }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findFirst: (...args: unknown[]) => orgFindFirst(...args) },
    lead:         { findMany:  (...args: unknown[]) => leadFindMany(...args), count: (...args: unknown[]) => leadCount(...args) },
  },
}));

import { GET } from './route';

const ADMIN_SESSION = { user: { email: 'savingdailystore@gmail.com', id: 'admin_1' } };
const SOURCE_ORG    = { id: 'src_org_1' };
const SAMPLE_LEADS  = [
  { id: 'lead_1', status: 'NEW', leadTier: 'BASIC', score: 80, createdAt: new Date(), product: { asin: 'B000001', title: 'Test Product', sourceRetailer: 'Walmart', sourcePrice: 10, buyBoxPrice: 20, roi: 50 } },
  { id: 'lead_2', status: 'REJECTED', leadTier: 'PRO', score: 72, createdAt: new Date(), product: { asin: 'B000002', title: 'Test Product 2', sourceRetailer: 'Target', sourcePrice: 15, buyBoxPrice: 30, roi: 60 } },
];

function makeGet(qs = '') {
  return new Request(`http://localhost/api/admin/source-leads${qs}`) as any;
}

describe('GET /api/admin/source-leads', () => {
  beforeEach(() => {
    authMock.mockReset();
    orgFindFirst.mockReset();
    leadFindMany.mockReset();
    leadCount.mockReset();

    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindFirst.mockResolvedValue(SOURCE_ORG);
    leadFindMany.mockResolvedValue(SAMPLE_LEADS);
    leadCount.mockResolvedValue(2);
  });

  it('rejects unauthenticated requests with 403', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it('rejects non-admin sessions with 403', async () => {
    authMock.mockResolvedValue({ user: { email: 'other@example.com', id: 'u_1' } });
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it('returns empty list when no source org exists', async () => {
    orgFindFirst.mockResolvedValue(null);
    const res  = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leads).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns leads from source org only', async () => {
    const res  = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leads).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(leadFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { orgId: 'src_org_1' },
    }));
  });

  it('returns page and limit in response', async () => {
    const res  = await GET(makeGet('?page=2&limit=10'));
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.limit).toBe(10);
  });

  it('applies skip/take correctly for pagination', async () => {
    await GET(makeGet('?page=3&limit=10'));
    expect(leadFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
  });

  it('includes product fields in response', async () => {
    const res  = await GET(makeGet());
    const body = await res.json();
    expect(body.leads[0].product.asin).toBe('B000001');
    expect(body.leads[0].product.roi).toBe(50);
  });
});
