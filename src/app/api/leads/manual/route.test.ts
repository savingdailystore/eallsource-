import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const authMock            = vi.fn();
const userFindUnique      = vi.fn();
const processProductMock  = vi.fn();
const broadcastMock       = vi.fn();
const orgFindUnique       = vi.fn();

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user:         { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    organization: { findUnique: (...a: unknown[]) => orgFindUnique(...a)  },
  },
}));
vi.mock('@/services/pipeline', () => ({ processRetailerProduct: (...a: unknown[]) => processProductMock(...a) }));
vi.mock('@/services/broadcast', () => ({ broadcastLeads: (...a: unknown[]) => broadcastMock(...a) }));

import { POST } from './route';

const OWNER_SESSION = { user: { id: 'u1', role: 'OWNER',   orgId: 'org1', email: 'owner@test.com' } };
const USER_SESSION  = { user: { id: 'u2', role: 'ANALYST', orgId: 'org2', email: 'user@test.com'  } };

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/leads/manual', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

const VALID_BODY = {
  amazonUrl:   'https://www.amazon.com/dp/B0CGR29R63',
  retailerUrl: 'https://www.walmart.com/ip/123',
  retailer:    'Walmart',
  sourcePrice: 12.99,
};

describe('POST /api/leads/manual', () => {
  beforeEach(() => {
    authMock.mockReset();
    userFindUnique.mockReset();
    processProductMock.mockReset();
    broadcastMock.mockReset();
    orgFindUnique.mockReset();
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false });
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('allows OWNER without a DB lookup', async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    processProductMock.mockResolvedValue({ outcome: 'lead_created', leadId: 'l1', score: 80 });
    const res = await POST(makeReq(VALID_BODY));
    // No user.findUnique call for OWNER
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('returns 403 for non-OWNER user when DB canManualLead is false', async () => {
    authMock.mockResolvedValue(USER_SESSION);
    userFindUnique.mockResolvedValue({ canManualLead: false });
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(403);
    expect(processProductMock).not.toHaveBeenCalled();
  });

  it('returns 403 when DB user record not found', async () => {
    authMock.mockResolvedValue(USER_SESSION);
    userFindUnique.mockResolvedValue(null);
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('allows non-OWNER user when DB canManualLead is true', async () => {
    authMock.mockResolvedValue(USER_SESSION);
    userFindUnique.mockResolvedValue({ canManualLead: true });
    processProductMock.mockResolvedValue({ outcome: 'lead_created', leadId: 'l2', score: 75 });
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
  });

  it('reads canManualLead from DB for the requesting user id', async () => {
    authMock.mockResolvedValue(USER_SESSION);
    userFindUnique.mockResolvedValue({ canManualLead: true });
    processProductMock.mockResolvedValue({ outcome: 'lead_created', leadId: 'l3', score: 70 });
    await POST(makeReq(VALID_BODY));
    expect(userFindUnique).toHaveBeenCalledWith({
      where:  { id: USER_SESSION.user.id },
      select: { canManualLead: true },
    });
  });

  it('enforces revocation: DB false overrides any stale JWT value', async () => {
    // Simulates: admin just revoked canManualLead, user's JWT still says true
    const sessionWithStaleJwt = {
      user: { ...USER_SESSION.user, canManualLead: true },
    };
    authMock.mockResolvedValue(sessionWithStaleJwt);
    userFindUnique.mockResolvedValue({ canManualLead: false }); // DB is authoritative
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(403);
    expect(processProductMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid request body', async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    const res = await POST(makeReq({ amazonUrl: 'not-a-url' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when ASIN cannot be extracted from amazon URL', async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    const res = await POST(makeReq({ ...VALID_BODY, amazonUrl: 'https://www.amazon.com/no-asin-here' }));
    expect(res.status).toBe(400);
  });
});
