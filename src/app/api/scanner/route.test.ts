import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock      = vi.fn();
const orgFindUnique  = vi.fn();
const scanJobCreate  = vi.fn();
const auditLogCreate = vi.fn();
const runScanJob      = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findUnique: (...args: unknown[]) => orgFindUnique(...args) },
    scanJob:      { create: (...args: unknown[]) => scanJobCreate(...args), update: vi.fn() },
    auditLog:     { create: (...args: unknown[]) => auditLogCreate(...args) },
  },
}));
vi.mock('@/services/run-scan', () => ({ runScanJob: (...args: unknown[]) => runScanJob(...args) }));
vi.mock('@/retailers', () => ({ getRetailerNames: () => ['Target', 'Walmart'] }));
vi.mock('@/lib/demo-scan', () => ({ runDemoScan: vi.fn() }));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/scanner', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  }) as any;
}

describe('POST /api/scanner', () => {
  beforeEach(() => {
    authMock.mockReset();
    orgFindUnique.mockReset();
    scanJobCreate.mockReset();
    auditLogCreate.mockReset();
    runScanJob.mockReset();
    authMock.mockResolvedValue({ user: { id: 'u1', orgId: 'org_1', role: 'OWNER' } });
    orgFindUnique.mockResolvedValue({ scanEnabled: true });
    scanJobCreate.mockResolvedValue({ id: 'job_1' });
    auditLogCreate.mockResolvedValue({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not leak the raw scan error to the client', async () => {
    runScanJob.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:5432 — internal db detail'));
    const res  = await POST(makeRequest({ retailer: 'Target', query: 'toys' }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe('Scan failed');
    expect(body.message).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
    expect(console.error).toHaveBeenCalled();
  });

  it('succeeds and returns the result for a healthy scan', async () => {
    runScanJob.mockResolvedValue({ leadsCreated: 3 });
    const res  = await POST(makeRequest({ retailer: 'Target', query: 'toys' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.result).toEqual({ leadsCreated: 3 });
  });
});
