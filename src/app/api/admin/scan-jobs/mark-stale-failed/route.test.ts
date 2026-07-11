import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock         = vi.fn();
const scanJobUpdate    = vi.fn();
const auditLogCreate   = vi.fn();

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    scanJob:  { updateMany: (...args: unknown[]) => scanJobUpdate(...args) },
    auditLog: { create:     (...args: unknown[]) => auditLogCreate(...args) },
  },
}));

import { POST } from './route';

const ADMIN_SESSION  = { user: { email: 'savingdailystore@gmail.com', orgId: 'org_admin' } };
const OTHER_SESSION  = { user: { email: 'other@example.com', orgId: 'org_other' } };

describe('POST /api/admin/scan-jobs/mark-stale-failed', () => {
  beforeEach(() => {
    authMock.mockReset();
    scanJobUpdate.mockReset();
    auditLogCreate.mockReset();
    auditLogCreate.mockResolvedValue({});
  });

  it('returns 403 for unauthenticated requests', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(403);
    expect(scanJobUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 for non-platform-admin users', async () => {
    authMock.mockResolvedValue(OTHER_SESSION);
    const res = await POST();
    expect(res.status).toBe(403);
    expect(scanJobUpdate).not.toHaveBeenCalled();
  });

  it('returns 200 with affected: 0 when no stale jobs exist', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    scanJobUpdate.mockResolvedValue({ count: 0 });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ affected: 0 });
  });

  it('marks stale jobs failed and returns the count', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    scanJobUpdate.mockResolvedValue({ count: 3 });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ affected: 3 });
  });

  it('only targets PENDING and RUNNING jobs older than 10 minutes', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    scanJobUpdate.mockResolvedValue({ count: 1 });

    const before = Date.now();
    await POST();
    const after = Date.now();

    const [{ where, data }] = scanJobUpdate.mock.calls[0];

    expect(where.status).toEqual({ in: ['PENDING', 'RUNNING'] });

    // cutoff must be between 10m01s ago and 9m59s ago
    const cutoffMs = where.createdAt.lt.getTime();
    expect(cutoffMs).toBeLessThanOrEqual(before - 10 * 60 * 1000);
    expect(cutoffMs).toBeGreaterThanOrEqual(after - 10 * 60 * 1000 - 2000);

    expect(data.status).toBe('FAILED');
    expect(data.error).toMatch(/stale/i);
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it('does not affect DONE or already-FAILED jobs', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    scanJobUpdate.mockResolvedValue({ count: 0 });

    await POST();

    const [{ where }] = scanJobUpdate.mock.calls[0];
    expect(where.status.in).not.toContain('DONE');
    expect(where.status.in).not.toContain('FAILED');
  });

  it('writes an audit log entry with admin email and affected count', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    scanJobUpdate.mockResolvedValue({ count: 2 });

    await POST();

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const [{ data }] = auditLogCreate.mock.calls[0];
    expect(data.action).toBe('ADMIN_MARK_STALE_SCANS_FAILED');
    expect(data.resource).toBe('ScanJob');
    expect(data.metadata.adminEmail).toBe('savingdailystore@gmail.com');
    expect(data.metadata.affected).toBe(2);
    expect(data.metadata.cutoffMinutes).toBe(10);
    expect(data.orgId).toBe('org_admin');
  });
});
