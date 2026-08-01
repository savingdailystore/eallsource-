import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const authMock       = vi.fn();
const candFindUnique = vi.fn();
const candUpdate     = vi.fn();
const auditCreate    = vi.fn();

vi.mock('@/lib/auth',  () => ({ auth: () => authMock() }));
vi.mock('@/lib/admin', () => ({
  isPlatformAdmin: (email: string | null | undefined) => email === 'savingdailystore@gmail.com',
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sourceCandidate: {
      findUnique: (...args: unknown[]) => candFindUnique(...args),
      update:     (...args: unknown[]) => candUpdate(...args),
    },
    // These must NEVER be called by this route
    lead:            { create: vi.fn(), update: vi.fn() },
    product:         { upsert: vi.fn() },
    leadEntitlement: { create: vi.fn(), upsert: vi.fn() },
    auditLog:        { create: (...args: unknown[]) => auditCreate(...args) },
  },
}));

import { PATCH } from './route';
import { prisma } from '@/lib/prisma';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_SESSION = { user: { email: 'savingdailystore@gmail.com', id: 'admin-1', role: 'MEMBER' } };
const OWNER_SESSION = { user: { email: 'owner@example.com',           id: 'owner-1', role: 'OWNER'  } };
const USER_SESSION  = { user: { email: 'user@example.com',            id: 'user-1',  role: 'MEMBER' } };

const CAND_ID = 'cand-abc';

function makeCandidate(certStatus: string) {
  return { id: CAND_ID, certStatus, orgId: 'org-1' };
}

function makePatch(body: unknown, id = CAND_ID) {
  return new Request(`http://localhost/api/admin/candidates/${id}/target-lead-purpose`, {
    method:  'PATCH',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  }) as any;
}

function makePatchRaw(raw: string, id = CAND_ID) {
  return new Request(`http://localhost/api/admin/candidates/${id}/target-lead-purpose`, {
    method:  'PATCH',
    headers: { 'content-type': 'application/json' },
    body:    raw,
  }) as any;
}

function routeParams(id = CAND_ID) {
  return { params: Promise.resolve({ id }) };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(ADMIN_SESSION);
  candFindUnique.mockResolvedValue(makeCandidate('RAW_CANDIDATE'));
  candUpdate.mockResolvedValue({});
  auditCreate.mockResolvedValue({});
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/admin/candidates/[id]/target-lead-purpose — auth', () => {

  it('returns 403 for unauthenticated requests', async () => {
    authMock.mockResolvedValue(null);
    const res = await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(res.status).toBe(403);
    expect(candUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 for non-admin, non-owner sessions', async () => {
    authMock.mockResolvedValue(USER_SESSION);
    const res = await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(res.status).toBe(403);
    expect(candUpdate).not.toHaveBeenCalled();
  });

  it('allows OWNER role regardless of email', async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    const res = await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(res.status).toBe(200);
    expect(candUpdate).toHaveBeenCalledOnce();
  });

  it('allows platform admin email regardless of role', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION); // MEMBER role but admin email
    const res = await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(res.status).toBe(200);
    expect(candUpdate).toHaveBeenCalledOnce();
  });

});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('PATCH /api/admin/candidates/[id]/target-lead-purpose — validation', () => {

  it('returns 400 for invalid JSON body', async () => {
    const res = await PATCH(makePatchRaw('not-json'), routeParams());
    expect(res.status).toBe(400);
    expect(candUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when targetLeadPurpose is missing', async () => {
    const res = await PATCH(makePatch({}), routeParams());
    expect(res.status).toBe(400);
    expect(candUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid value PREMIUM', async () => {
    const res = await PATCH(makePatch({ targetLeadPurpose: 'PREMIUM' }), routeParams());
    expect(res.status).toBe(400);
    expect(candUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid value WATCHLIST', async () => {
    const res = await PATCH(makePatch({ targetLeadPurpose: 'WATCHLIST' }), routeParams());
    expect(res.status).toBe(400);
    expect(candUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 for null targetLeadPurpose', async () => {
    const res = await PATCH(makePatch({ targetLeadPurpose: null }), routeParams());
    expect(res.status).toBe(400);
    expect(candUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 for empty string targetLeadPurpose', async () => {
    const res = await PATCH(makePatch({ targetLeadPurpose: '' }), routeParams());
    expect(res.status).toBe(400);
    expect(candUpdate).not.toHaveBeenCalled();
  });

  it('accepts PROFIT as valid', async () => {
    const res = await PATCH(makePatch({ targetLeadPurpose: 'PROFIT' }), routeParams());
    expect(res.status).toBe(200);
  });

  it('accepts STARTER_SALES as valid', async () => {
    const res = await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(res.status).toBe(200);
  });

});

// ─── Not found ────────────────────────────────────────────────────────────────

describe('PATCH /api/admin/candidates/[id]/target-lead-purpose — not found', () => {

  it('returns 404 when candidate does not exist', async () => {
    candFindUnique.mockResolvedValue(null);
    const res = await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams('no-such-id'));
    expect(res.status).toBe(404);
    expect(candUpdate).not.toHaveBeenCalled();
  });

});

// ─── Status safety ────────────────────────────────────────────────────────────

describe('PATCH /api/admin/candidates/[id]/target-lead-purpose — status safety', () => {

  it('allows update when certStatus is RAW_CANDIDATE', async () => {
    candFindUnique.mockResolvedValue(makeCandidate('RAW_CANDIDATE'));
    const res = await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(res.status).toBe(200);
    expect(candUpdate).toHaveBeenCalledOnce();
  });

  it('allows update when certStatus is NEEDS_REVIEW', async () => {
    candFindUnique.mockResolvedValue(makeCandidate('NEEDS_REVIEW'));
    const res = await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(res.status).toBe(200);
    expect(candUpdate).toHaveBeenCalledOnce();
  });

  it('allows update when certStatus is NO_LONGER_PROFITABLE', async () => {
    candFindUnique.mockResolvedValue(makeCandidate('NO_LONGER_PROFITABLE'));
    const res = await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(res.status).toBe(200);
    expect(candUpdate).toHaveBeenCalledOnce();
  });

  it('allows update when certStatus is REJECTED', async () => {
    candFindUnique.mockResolvedValue(makeCandidate('REJECTED'));
    const res = await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(res.status).toBe(200);
    expect(candUpdate).toHaveBeenCalledOnce();
  });

  it('blocks update when certStatus is MATCHED (409)', async () => {
    candFindUnique.mockResolvedValue(makeCandidate('MATCHED'));
    const res = await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(res.status).toBe(409);
    expect(candUpdate).not.toHaveBeenCalled();
  });

  it('blocks update when certStatus is CERTIFIED (409)', async () => {
    candFindUnique.mockResolvedValue(makeCandidate('CERTIFIED'));
    const res = await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(res.status).toBe(409);
    expect(candUpdate).not.toHaveBeenCalled();
  });

});

// ─── Update behavior ──────────────────────────────────────────────────────────

describe('PATCH /api/admin/candidates/[id]/target-lead-purpose — update behavior', () => {

  it('updates only targetLeadPurpose on SourceCandidate', async () => {
    await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(candUpdate).toHaveBeenCalledWith({
      where: { id: CAND_ID },
      data:  { targetLeadPurpose: 'STARTER_SALES' },
    });
    // No extra fields written
    const [{ data }] = candUpdate.mock.calls[0];
    expect(Object.keys(data)).toEqual(['targetLeadPurpose']);
  });

  it('returns ok:true with candidateId, targetLeadPurpose, and certStatus', async () => {
    candFindUnique.mockResolvedValue(makeCandidate('NO_LONGER_PROFITABLE'));
    const res  = await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.candidateId).toBe(CAND_ID);
    expect(body.targetLeadPurpose).toBe('STARTER_SALES');
    expect(body.certStatus).toBe('NO_LONGER_PROFITABLE');
  });

  it('does not write to Lead, Product, or LeadEntitlement', async () => {
    await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.product.upsert).not.toHaveBeenCalled();
    expect(prisma.leadEntitlement.create).not.toHaveBeenCalled();
    expect(prisma.leadEntitlement.upsert).not.toHaveBeenCalled();
  });

  it('writes AuditLog with ADMIN_CANDIDATE_PURPOSE_SET action', async () => {
    await PATCH(makePatch({ targetLeadPurpose: 'STARTER_SALES' }), routeParams());
    expect(auditCreate).toHaveBeenCalledOnce();
    const [{ data }] = auditCreate.mock.calls[0];
    expect(data.action).toBe('ADMIN_CANDIDATE_PURPOSE_SET');
    expect(data.metadata.candidateId).toBe(CAND_ID);
    expect(data.metadata.targetLeadPurpose).toBe('STARTER_SALES');
    expect(data.metadata.adminEmail).toBe('savingdailystore@gmail.com');
  });

  it('audit log failure does not break the response (catch swallowed)', async () => {
    auditCreate.mockRejectedValue(new Error('DB down'));
    const res = await PATCH(makePatch({ targetLeadPurpose: 'PROFIT' }), routeParams());
    // Route catches audit failure — still returns 200
    expect(res.status).toBe(200);
    expect(candUpdate).toHaveBeenCalledOnce();
  });

});
