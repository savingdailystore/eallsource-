import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const search   = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/retailers', () => ({
  getRetailerNames: () => ['Target'],
  getRetailer: () => ({ search: (...args: unknown[]) => search(...args) }),
}));
vi.mock('@/services/pipeline', () => ({ inspectRetailerProduct: vi.fn() }));

import { GET } from './route';

function makeRequest(qs = 'retailer=Target&kw=test') {
  return new Request(`http://localhost/api/amazon/dry-run?${qs}`) as any;
}

describe('GET /api/amazon/dry-run', () => {
  beforeEach(() => {
    authMock.mockReset();
    search.mockReset();
    authMock.mockResolvedValue({ user: { id: 'u1', orgId: 'org_1', role: 'OWNER' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not leak the raw scrape error message to the client', async () => {
    search.mockRejectedValue(new Error('connection refused to 192.168.1.50:9999 — internal detail'));
    const res  = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).not.toContain('192.168.1.50');
    expect(body.error).not.toContain('connection refused');
    expect(console.error).toHaveBeenCalled();
  });

  it('rejects non-owners', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', orgId: 'org_1', role: 'MEMBER' } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });
});
