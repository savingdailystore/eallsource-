import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const upsert    = vi.fn();
const auditLogCreate = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    amazonCredential: { upsert: (...args: unknown[]) => upsert(...args) },
    auditLog:         { create: (...args: unknown[]) => auditLogCreate(...args) },
  },
}));
vi.mock('@/lib/encryption', () => ({ encrypt: (v: string) => `enc(${v})` }));

process.env.LWA_CLIENT_ID     = 'test-client-id';
process.env.LWA_CLIENT_SECRET = 'test-client-secret';
process.env.NEXTAUTH_URL      = 'https://eallsource.com';

import { GET } from './route';

function makeRequest(query: string, cookieState = 'good-state') {
  const req = new Request(`http://localhost/api/amazon/callback?${query}`) as any;
  req.cookies = { get: (name: string) => (name === 'amazon_oauth_state' ? { value: cookieState } : undefined) };
  return req;
}

describe('GET /api/amazon/callback', () => {
  beforeEach(() => {
    authMock.mockReset();
    upsert.mockReset();
    auditLogCreate.mockReset();
    authMock.mockResolvedValue({ user: { id: 'u1', orgId: 'org_1' } });
  });

  it('rejects a malformed selling_partner_id without exchanging the code', async () => {
    const req = makeRequest('spapi_oauth_code=abc&state=good-state&selling_partner_id=not-valid!!');
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('error=invalid_seller_id');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects on CSRF state mismatch', async () => {
    const req = makeRequest('spapi_oauth_code=abc&state=wrong-state&selling_partner_id=A1B2C3D4E5F6G', 'good-state');
    const res = await GET(req);

    expect(res.headers.get('location')).toContain('error=invalid_state');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('accepts a well-formed selling_partner_id and proceeds to token exchange', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
    }) as any;
    upsert.mockResolvedValue({});
    auditLogCreate.mockResolvedValue({});

    const req = makeRequest('spapi_oauth_code=abc&state=good-state&selling_partner_id=A1B2C3D4E5F6G');
    const res = await GET(req);

    expect(upsert).toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('connected=true');
  });
});
