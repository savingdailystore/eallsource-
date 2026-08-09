import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMock       = vi.fn();
const auditLogCreate = vi.fn();

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { auditLog: { create: (...args: unknown[]) => auditLogCreate(...args) } },
}));

// Both env vars must be present — set before module import so they are available on load.
process.env.AMAZON_SP_APP_ID = 'test-sp-app-id';
process.env.LWA_CLIENT_ID    = 'test-lwa-client-id';

import { GET } from './route';

function makeReq() {
  return new Request('http://localhost/api/amazon/oauth/start') as any;
}

function session(role: string, plan = 'PRO') {
  return { user: { id: 'u1', orgId: 'org_1', role, plan } };
}

describe('GET /api/amazon/oauth/start — role guard', () => {
  beforeEach(() => {
    authMock.mockReset();
    auditLogCreate.mockReset();
    auditLogCreate.mockResolvedValue({});
    // Restore both env vars before each test in case a prior test deleted one.
    process.env.AMAZON_SP_APP_ID = 'test-sp-app-id';
    process.env.LWA_CLIENT_ID    = 'test-lwa-client-id';
  });

  it('OWNER: redirects to Seller Central', async () => {
    authMock.mockResolvedValue(session('OWNER'));
    const res = await GET(makeReq());
    expect(res.status).toBe(307);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('sellercentral.amazon.com');
    expect(loc).not.toContain('error=');
  });

  it('ADMIN: redirects to Seller Central', async () => {
    authMock.mockResolvedValue(session('ADMIN'));
    const res = await GET(makeReq());
    expect(res.status).toBe(307);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('sellercentral.amazon.com');
    expect(loc).not.toContain('error=');
  });

  it('ANALYST: redirects with insufficient_role error', async () => {
    authMock.mockResolvedValue(session('ANALYST'));
    const res = await GET(makeReq());
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('error=insufficient_role');
  });

  it('unauthenticated: redirects to login', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/auth/login');
  });

  it('STARTER plan: redirects to billing regardless of role', async () => {
    authMock.mockResolvedValue(session('OWNER', 'STARTER'));
    const res = await GET(makeReq());
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/dashboard/billing');
  });

  it('AMAZON_SP_APP_ID missing: redirects with missing_credentials', async () => {
    delete process.env.AMAZON_SP_APP_ID;
    authMock.mockResolvedValue(session('OWNER'));
    const res = await GET(makeReq());
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('error=missing_credentials');
  });

  it('LWA_CLIENT_ID missing: redirects with missing_credentials', async () => {
    delete process.env.LWA_CLIENT_ID;
    authMock.mockResolvedValue(session('OWNER'));
    const res = await GET(makeReq());
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('error=missing_credentials');
  });

  it('application_id equals AMAZON_SP_APP_ID — not LWA_CLIENT_ID', async () => {
    authMock.mockResolvedValue(session('OWNER'));
    const res = await GET(makeReq());
    const loc = new URL(res.headers.get('location') ?? 'http://x');
    expect(loc.searchParams.get('application_id')).toBe('test-sp-app-id');
    expect(loc.searchParams.get('application_id')).not.toBe('test-lwa-client-id');
  });

  it('state parameter is present and non-empty', async () => {
    authMock.mockResolvedValue(session('OWNER'));
    const res = await GET(makeReq());
    const loc = new URL(res.headers.get('location') ?? 'http://x');
    expect(loc.searchParams.get('state')).toBeTruthy();
  });

  it('OAuth URL does not include version=beta', async () => {
    authMock.mockResolvedValue(session('OWNER'));
    const res = await GET(makeReq());
    const loc = res.headers.get('location') ?? '';
    expect(loc).not.toContain('version=beta');
    expect(loc).not.toContain('version');
  });

  it('OWNER: audit log AMAZON_OAUTH_START_ATTEMPTED is written', async () => {
    authMock.mockResolvedValue(session('OWNER'));
    await GET(makeReq());
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'AMAZON_OAUTH_START_ATTEMPTED' }),
      }),
    );
  });

  it('ADMIN: audit log AMAZON_OAUTH_START_ATTEMPTED is written', async () => {
    authMock.mockResolvedValue(session('ADMIN'));
    await GET(makeReq());
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'AMAZON_OAUTH_START_ATTEMPTED' }),
      }),
    );
  });

  it('ANALYST: no audit log written (rejected before audit)', async () => {
    authMock.mockResolvedValue(session('ANALYST'));
    await GET(makeReq());
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});
