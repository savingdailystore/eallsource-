import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock              = vi.fn();
const organizationUpdate    = vi.fn();
const subscriptionUpdateMany = vi.fn();
const auditLogCreate        = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { update: (...args: unknown[]) => organizationUpdate(...args) },
    subscription: { updateMany: (...args: unknown[]) => subscriptionUpdateMany(...args) },
    auditLog:     { create: (...args: unknown[]) => auditLogCreate(...args) },
  },
}));

import { PATCH } from './route';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/admin/orgs/org_1', {
    method:  'PATCH',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  }) as any;
}

describe('PATCH /api/admin/orgs/[id]', () => {
  beforeEach(() => {
    authMock.mockReset();
    organizationUpdate.mockReset();
    subscriptionUpdateMany.mockReset();
    auditLogCreate.mockReset();
    organizationUpdate.mockResolvedValue({ id: 'org_1', name: 'Acme', scanEnabled: true, receiveBroadcast: false, plan: 'PRO' });
    subscriptionUpdateMany.mockResolvedValue({ count: 1 });
    auditLogCreate.mockResolvedValue({});
  });

  it('rejects a non-admin session', async () => {
    authMock.mockResolvedValue({ user: { email: 'not-an-admin@example.com' } });
    const res = await PATCH(makeRequest({ plan: 'PRO' }), { params: Promise.resolve({ id: 'org_1' }) });
    expect(res.status).toBe(403);
    expect(organizationUpdate).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    authMock.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ plan: 'PRO' }), { params: Promise.resolve({ id: 'org_1' }) });
    expect(res.status).toBe(403);
  });

  it('allows the platform admin and writes an audit log entry recording who changed what', async () => {
    authMock.mockResolvedValue({ user: { email: 'savingdailystore@gmail.com' } });
    const res = await PATCH(makeRequest({ plan: 'PRO' }), { params: Promise.resolve({ id: 'org_1' }) });

    expect(res.status).toBe(200);
    expect(organizationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org_1' }, data: { plan: 'PRO' } }),
    );
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const [{ data }] = auditLogCreate.mock.calls[0];
    expect(data.orgId).toBe('org_1');
    expect(data.action).toBe('ADMIN_ORG_UPDATE');
    expect(data.metadata.adminEmail).toBe('savingdailystore@gmail.com');
    expect(data.metadata.changes).toEqual({ plan: 'PRO' });
  });
});
