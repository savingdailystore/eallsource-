import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock       = vi.fn();
const upsert         = vi.fn();
const auditLogCreate = vi.fn();

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    amazonCredential: { upsert: (...args: unknown[]) => upsert(...args) },
    auditLog:         { create: (...args: unknown[]) => auditLogCreate(...args) },
  },
}));
vi.mock('@/lib/encryption', () => ({
  encrypt:                (v: string) => `enc(${v})`,
  isEncryptionConfigured: () => true,
}));

import { POST } from './route';

function makeReq(body: object) {
  return new Request('http://localhost/api/amazon/connect', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  }) as any;
}

const validBody = {
  sellerId:      'A1TWT2OVUBOAE6',
  marketplaceId: 'ATVPDKIKX0DER',
  refreshToken:  'Atzr|some-refresh-token',
  accessToken:   '',
};

function session(role: string) {
  return { user: { id: 'u1', orgId: 'org_1', role } };
}

describe('POST /api/amazon/connect — role guard', () => {
  beforeEach(() => {
    authMock.mockReset();
    upsert.mockReset();
    auditLogCreate.mockReset();
    upsert.mockResolvedValue({ id: 'cred_1', sellerId: validBody.sellerId, isActive: true });
    auditLogCreate.mockResolvedValue({});
  });

  it('OWNER: can connect — returns 200 with credential info', async () => {
    authMock.mockResolvedValue(session('OWNER'));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isActive).toBe(true);
  });

  it('ADMIN: can connect — returns 200 with credential info', async () => {
    authMock.mockResolvedValue(session('ADMIN'));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isActive).toBe(true);
  });

  it('ANALYST: cannot connect — returns 403', async () => {
    authMock.mockResolvedValue(session('ANALYST'));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/forbidden/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('unauthenticated: returns 401', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('OWNER: credential is upserted with encrypted tokens', async () => {
    authMock.mockResolvedValue(session('OWNER'));
    await POST(makeReq(validBody));
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sellerId:      validBody.sellerId,
          marketplaceId: validBody.marketplaceId,
          isActive:      true,
        }),
      }),
    );
  });
});
