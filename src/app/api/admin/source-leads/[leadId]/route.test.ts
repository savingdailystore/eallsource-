import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock      = vi.fn();
const leadFindFirst = vi.fn();
const leadUpdate    = vi.fn();
const auditCreate   = vi.fn();

vi.mock('@/lib/auth',  () => ({ auth: () => authMock() }));
vi.mock('@/lib/admin', () => ({ isPlatformAdmin: (email: string | null | undefined) => email === 'savingdailystore@gmail.com' }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead:     { findFirst: (...args: unknown[]) => leadFindFirst(...args), update: (...args: unknown[]) => leadUpdate(...args) },
    auditLog: { create:    (...args: unknown[]) => auditCreate(...args) },
  },
}));

import { PATCH } from './route';

const ADMIN_SESSION = { user: { email: 'savingdailystore@gmail.com', id: 'admin_1' } };
const SOURCE_LEAD   = { id: 'lead_src_1', leadTier: 'BASIC', status: 'NEW', orgId: 'src_org_1' };

function makePatch(body: unknown, leadId = 'lead_src_1') {
  return new Request(`http://localhost/api/admin/source-leads/${leadId}`, {
    method:  'PATCH',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  }) as any;
}

describe('PATCH /api/admin/source-leads/[leadId]', () => {
  beforeEach(() => {
    authMock.mockReset();
    leadFindFirst.mockReset();
    leadUpdate.mockReset();
    auditCreate.mockReset();

    authMock.mockResolvedValue(ADMIN_SESSION);
    leadFindFirst.mockResolvedValue(SOURCE_LEAD);
    leadUpdate.mockResolvedValue({ id: 'lead_src_1', leadTier: 'BASIC', status: 'NEW' });
    auditCreate.mockResolvedValue({});
  });

  // ── Auth ──────────────────────────────────────────────────────────────
  it('rejects unauthenticated requests with 403', async () => {
    authMock.mockResolvedValue(null);
    const res = await PATCH(makePatch({ status: 'REJECTED' }), { params: Promise.resolve({ leadId: 'lead_src_1' }) });
    expect(res.status).toBe(403);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('rejects non-admin sessions with 403', async () => {
    authMock.mockResolvedValue({ user: { email: 'other@example.com', id: 'u_x' } });
    const res = await PATCH(makePatch({ status: 'REJECTED' }), { params: Promise.resolve({ leadId: 'lead_src_1' }) });
    expect(res.status).toBe(403);
  });

  // ── Validation ────────────────────────────────────────────────────────
  it('returns 400 when body has neither leadTier nor status', async () => {
    const res = await PATCH(makePatch({}), { params: Promise.resolve({ leadId: 'lead_src_1' }) });
    expect(res.status).toBe(400);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid leadTier value', async () => {
    const res = await PATCH(makePatch({ leadTier: 'GOLD' }), { params: Promise.resolve({ leadId: 'lead_src_1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status value (SAVED is not allowed)', async () => {
    const res = await PATCH(makePatch({ status: 'SAVED' }), { params: Promise.resolve({ leadId: 'lead_src_1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status value (PURCHASED is not allowed)', async () => {
    const res = await PATCH(makePatch({ status: 'PURCHASED' }), { params: Promise.resolve({ leadId: 'lead_src_1' }) });
    expect(res.status).toBe(400);
  });

  // ── Not found guard ───────────────────────────────────────────────────
  it('returns 404 when lead is not in source pool', async () => {
    leadFindFirst.mockResolvedValue(null);
    const res = await PATCH(makePatch({ status: 'REJECTED' }), { params: Promise.resolve({ leadId: 'unknown_lead' }) });
    expect(res.status).toBe(404);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  // ── Happy path ────────────────────────────────────────────────────────
  it('updates leadTier and returns updated lead', async () => {
    leadUpdate.mockResolvedValue({ id: 'lead_src_1', leadTier: 'PRO', status: 'NEW' });
    const res  = await PATCH(makePatch({ leadTier: 'PRO' }), { params: Promise.resolve({ leadId: 'lead_src_1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.lead.leadTier).toBe('PRO');
  });

  it('updates status to REJECTED', async () => {
    leadUpdate.mockResolvedValue({ id: 'lead_src_1', leadTier: 'BASIC', status: 'REJECTED' });
    const res  = await PATCH(makePatch({ status: 'REJECTED' }), { params: Promise.resolve({ leadId: 'lead_src_1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lead.status).toBe('REJECTED');
  });

  it('updates status to EXPIRED', async () => {
    leadUpdate.mockResolvedValue({ id: 'lead_src_1', leadTier: 'BASIC', status: 'EXPIRED' });
    const res  = await PATCH(makePatch({ status: 'EXPIRED' }), { params: Promise.resolve({ leadId: 'lead_src_1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lead.status).toBe('EXPIRED');
  });

  it('updates both leadTier and status together', async () => {
    leadUpdate.mockResolvedValue({ id: 'lead_src_1', leadTier: 'PRO', status: 'REJECTED' });
    const res = await PATCH(makePatch({ leadTier: 'PRO', status: 'REJECTED' }), { params: Promise.resolve({ leadId: 'lead_src_1' }) });
    expect(res.status).toBe(200);
    const [{ data }] = leadUpdate.mock.calls[0];
    expect(data.leadTier).toBe('PRO');
    expect(data.status).toBe('REJECTED');
  });

  it('queries only source-org leads (isBroadcastSource guard)', async () => {
    await PATCH(makePatch({ status: 'NEW' }), { params: Promise.resolve({ leadId: 'lead_src_1' }) });
    expect(leadFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ org: { isBroadcastSource: true } }),
    }));
  });

  // ── Audit log ─────────────────────────────────────────────────────────
  it('writes AuditLog with before/after and ADMIN_SOURCE_LEAD_UPDATE action', async () => {
    leadUpdate.mockResolvedValue({ id: 'lead_src_1', leadTier: 'PRO', status: 'NEW' });
    await PATCH(makePatch({ leadTier: 'PRO' }), { params: Promise.resolve({ leadId: 'lead_src_1' }) });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const [{ data }] = auditCreate.mock.calls[0];
    expect(data.action).toBe('ADMIN_SOURCE_LEAD_UPDATE');
    expect(data.metadata.before.leadTier).toBe('BASIC');
    expect(data.metadata.after.leadTier).toBe('PRO');
    expect(data.metadata.adminEmail).toBe('savingdailystore@gmail.com');
  });
});
