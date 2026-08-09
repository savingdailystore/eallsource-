import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock       = vi.fn();
const auditLogCreate = vi.fn();

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { auditLog: { create: (...args: unknown[]) => auditLogCreate(...args) } },
}));

process.env.LWA_CLIENT_ID = 'test-client-id';

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

  it('OAuth URL does not include version=beta', async () => {
    authMock.mockResolvedValue(session('OWNER'));
    const res = await GET(makeReq());
    const loc = res.headers.get('location') ?? '';
    expect(loc).not.toContain('version=beta');
    expect(loc).not.toContain('version');
  });

  it('OAuth URL includes application_id and state params', async () => {
    authMock.mockResolvedValue(session('OWNER'));
    const res = await GET(makeReq());
    const loc = new URL(res.headers.get('location') ?? 'http://x');
    expect(loc.searchParams.get('application_id')).toBe('test-client-id');
    expect(loc.searchParams.get('state')).toBeTruthy();
  });

  it('ADMIN: audit log is written for OAuth start', async () => {
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
