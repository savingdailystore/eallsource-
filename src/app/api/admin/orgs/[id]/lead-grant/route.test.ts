import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock                  = vi.fn();
const orgFindUnique             = vi.fn();
const leadFindFirst             = vi.fn();
const entitlementFindUnique     = vi.fn();
const entitlementCreate         = vi.fn();
const auditLogCreate            = vi.fn();
const copyLeadToOrgMock         = vi.fn();
const getCurrentDeliveryWeekStartMock = vi.fn();

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/admin',  () => ({ isPlatformAdmin: (email: string | null | undefined) => email === 'savingdailystore@gmail.com' }));
vi.mock('@/services/broadcast',   () => ({ copyLeadToOrg: (...args: unknown[]) => copyLeadToOrgMock(...args) }));
vi.mock('@/lib/lead-delivery',    () => ({ getCurrentDeliveryWeekStart: () => getCurrentDeliveryWeekStartMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization:     { findUnique: (...args: unknown[]) => orgFindUnique(...args) },
    lead:             { findFirst:  (...args: unknown[]) => leadFindFirst(...args) },
    leadEntitlement:  {
      findUnique: (...args: unknown[]) => entitlementFindUnique(...args),
      create:     (...args: unknown[]) => entitlementCreate(...args),
    },
    auditLog:         { create: (...args: unknown[]) => auditLogCreate(...args) },
  },
}));

import { POST } from './route';

const ADMIN_SESSION = { user: { email: 'savingdailystore@gmail.com', id: 'admin_1' } };
const SOURCE_LEAD   = { id: 'lead_src_1', leadTier: 'BASIC', status: 'NEW', orgId: 'src_org_1', score: 90, product: { id: 'prod_src_1', asin: 'B000000001' } };

function makePost(body: unknown, orgId = 'cust_org_1') {
  return new Request(`http://localhost/api/admin/orgs/${orgId}/lead-grant`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  }) as any;
}

describe('POST /api/admin/orgs/[id]/lead-grant', () => {
  beforeEach(() => {
    authMock.mockReset();
    orgFindUnique.mockReset();
    leadFindFirst.mockReset();
    entitlementFindUnique.mockReset();
    entitlementCreate.mockReset();
    auditLogCreate.mockReset();
    copyLeadToOrgMock.mockReset();
    getCurrentDeliveryWeekStartMock.mockReset();

    // Happy-path defaults
    authMock.mockResolvedValue(ADMIN_SESSION);
    orgFindUnique.mockResolvedValue({ id: 'cust_org_1', isBroadcastSource: false });
    leadFindFirst.mockResolvedValue(SOURCE_LEAD);
    copyLeadToOrgMock.mockResolvedValue('lead_copied_1');
    entitlementFindUnique.mockResolvedValue(null);
    entitlementCreate.mockResolvedValue({ id: 'ent_1' });
    auditLogCreate.mockResolvedValue({});
    getCurrentDeliveryWeekStartMock.mockReturnValue(new Date('2026-07-20T13:00:00.000Z'));
  });

  // ── Auth ──────────────────────────────────────────────────────────────
  it('rejects unauthenticated requests', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makePost({ sourceLeadId: 'lead_src_1' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    expect(res.status).toBe(403);
    expect(copyLeadToOrgMock).not.toHaveBeenCalled();
  });

  it('rejects non-admin sessions', async () => {
    authMock.mockResolvedValue({ user: { email: 'attacker@example.com', id: 'u_bad' } });
    const res = await POST(makePost({ sourceLeadId: 'lead_src_1' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    expect(res.status).toBe(403);
    expect(copyLeadToOrgMock).not.toHaveBeenCalled();
  });

  // ── Validation ────────────────────────────────────────────────────────
  it('returns 400 for missing sourceLeadId', async () => {
    const res = await POST(makePost({}), { params: Promise.resolve({ id: 'cust_org_1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty sourceLeadId string', async () => {
    const res = await POST(makePost({ sourceLeadId: '' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    expect(res.status).toBe(400);
  });

  // ── Target org guards ─────────────────────────────────────────────────
  it('returns 404 when target org does not exist', async () => {
    orgFindUnique.mockResolvedValue(null);
    const res = await POST(makePost({ sourceLeadId: 'lead_src_1' }), { params: Promise.resolve({ id: 'nonexistent' }) });
    expect(res.status).toBe(404);
    expect(copyLeadToOrgMock).not.toHaveBeenCalled();
  });

  it('returns 400 when target org is the broadcast source org', async () => {
    orgFindUnique.mockResolvedValue({ id: 'src_org_1', isBroadcastSource: true });
    const res = await POST(makePost({ sourceLeadId: 'lead_src_1' }), { params: Promise.resolve({ id: 'src_org_1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/source org/i);
    expect(copyLeadToOrgMock).not.toHaveBeenCalled();
  });

  // ── Source lead guards ────────────────────────────────────────────────
  it('returns 404 when source lead is not found or not in source pool', async () => {
    leadFindFirst.mockResolvedValue(null);
    const res = await POST(makePost({ sourceLeadId: 'bogus_id' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    expect(res.status).toBe(404);
    expect(copyLeadToOrgMock).not.toHaveBeenCalled();
  });

  // ── Happy path ────────────────────────────────────────────────────────
  it('grants lead successfully and returns copiedLeadId', async () => {
    const res  = await POST(makePost({ sourceLeadId: 'lead_src_1' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyGranted).toBe(false);
    expect(body.copiedLeadId).toBe('lead_copied_1');
    expect(body.entitlementId).toBe('ent_1');
  });

  it('calls copyLeadToOrg with correct target org and source lead', async () => {
    await POST(makePost({ sourceLeadId: 'lead_src_1' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    expect(copyLeadToOrgMock).toHaveBeenCalledWith('cust_org_1', SOURCE_LEAD);
  });

  it('creates entitlement with deliverySource OWNER_GRANT', async () => {
    await POST(makePost({ sourceLeadId: 'lead_src_1' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    const [{ data }] = entitlementCreate.mock.calls[0];
    expect(data.deliverySource).toBe('OWNER_GRANT');
    expect(data.orgId).toBe('cust_org_1');
    expect(data.leadId).toBe('lead_copied_1');
    expect(data.leadTierAtDelivery).toBe('BASIC');
  });

  it('writes AuditLog with action OWNER_LEAD_GRANT', async () => {
    await POST(makePost({ sourceLeadId: 'lead_src_1' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const [{ data }] = auditLogCreate.mock.calls[0];
    expect(data.action).toBe('OWNER_LEAD_GRANT');
    expect(data.orgId).toBe('cust_org_1');
    expect(data.metadata.sourceLeadId).toBe('lead_src_1');
    expect(data.metadata.copiedLeadId).toBe('lead_copied_1');
    expect(data.metadata.adminEmail).toBe('savingdailystore@gmail.com');
  });

  // ── countsTowardWeeklyLimit ───────────────────────────────────────────
  it('sets deliveryWeekStart when countsTowardWeeklyLimit is true', async () => {
    const weekStart = new Date('2026-07-20T13:00:00.000Z');
    getCurrentDeliveryWeekStartMock.mockReturnValue(weekStart);
    await POST(makePost({ sourceLeadId: 'lead_src_1', countsTowardWeeklyLimit: true }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    const [{ data }] = entitlementCreate.mock.calls[0];
    expect(data.countsTowardWeeklyLimit).toBe(true);
    expect(data.deliveryWeekStart).toEqual(weekStart);
  });

  it('does not set deliveryWeekStart when countsTowardWeeklyLimit is false (default)', async () => {
    await POST(makePost({ sourceLeadId: 'lead_src_1' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    const [{ data }] = entitlementCreate.mock.calls[0];
    expect(data.countsTowardWeeklyLimit).toBe(false);
    expect(data.deliveryWeekStart).toBeNull();
    expect(getCurrentDeliveryWeekStartMock).not.toHaveBeenCalled();
  });

  // ── Idempotency ───────────────────────────────────────────────────────
  it('returns alreadyGranted:true without creating a new entitlement when one already exists', async () => {
    entitlementFindUnique.mockResolvedValue({ id: 'ent_existing' });
    const res  = await POST(makePost({ sourceLeadId: 'lead_src_1' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyGranted).toBe(true);
    expect(body.entitlementId).toBe('ent_existing');
    expect(entitlementCreate).not.toHaveBeenCalled();
  });

  // ── Active lead guard ─────────────────────────────────────────────────
  it('returns 400 when source lead is REJECTED', async () => {
    leadFindFirst.mockResolvedValue({ ...SOURCE_LEAD, status: 'REJECTED' });
    const res  = await POST(makePost({ sourceLeadId: 'lead_src_1' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/rejected or expired/i);
    expect(copyLeadToOrgMock).not.toHaveBeenCalled();
  });

  it('returns 400 when source lead is EXPIRED', async () => {
    leadFindFirst.mockResolvedValue({ ...SOURCE_LEAD, status: 'EXPIRED' });
    const res  = await POST(makePost({ sourceLeadId: 'lead_src_1' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/rejected or expired/i);
    expect(copyLeadToOrgMock).not.toHaveBeenCalled();
  });

  it('allows grant when source lead is active (status NEW)', async () => {
    leadFindFirst.mockResolvedValue({ ...SOURCE_LEAD, status: 'NEW' });
    const res = await POST(makePost({ sourceLeadId: 'lead_src_1' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyGranted).toBe(false);
    expect(copyLeadToOrgMock).toHaveBeenCalledTimes(1);
  });

  // ── Note ──────────────────────────────────────────────────────────────
  it('stores optional note on the entitlement', async () => {
    await POST(makePost({ sourceLeadId: 'lead_src_1', note: 'Manual bonus for VIP' }), { params: Promise.resolve({ id: 'cust_org_1' }) });
    const [{ data }] = entitlementCreate.mock.calls[0];
    expect(data.note).toBe('Manual bonus for VIP');
  });
});
