import { describe, it, expect, vi, beforeEach } from 'vitest';

const scanJobUpdate         = vi.fn();
const getRetailer           = vi.fn();
const processRetailerProduct = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: { scanJob: { update: (...args: unknown[]) => scanJobUpdate(...args) } },
}));
vi.mock('@/retailers', () => ({ getRetailer: (...args: unknown[]) => getRetailer(...args) }));
vi.mock('@/services/pipeline', () => ({
  processRetailerProduct: (...args: unknown[]) => processRetailerProduct(...args),
}));

import { runScanJob } from './run-scan';

describe('runScanJob — ScanJob.error sanitization (NF-1)', () => {
  beforeEach(() => {
    scanJobUpdate.mockReset();
    getRetailer.mockReset();
    processRetailerProduct.mockReset();
    scanJobUpdate.mockResolvedValue({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('stores a fixed, safe message for an unknown retailer — never the raw template string', async () => {
    getRetailer.mockReturnValue(undefined);

    await expect(
      runScanJob({ retailer: 'NotARealRetailer', query: 'q', orgId: 'org_1', scanJobId: 'job_1' }),
    ).rejects.toThrow();

    const failedCall = scanJobUpdate.mock.calls.find(([arg]) => arg.data.status === 'FAILED');
    expect(failedCall).toBeTruthy();
    const storedError = failedCall![0].data.error;

    expect(storedError).toBe('Unknown retailer. Check your saved search configuration.');
    expect(storedError).not.toContain('NotARealRetailer');
    expect(console.error).toHaveBeenCalled();
  });

  it('stores a fixed, safe message for a general scan failure — never String(err)', async () => {
    getRetailer.mockReturnValue({ search: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:5432 — internal db detail')) });

    await expect(
      runScanJob({ retailer: 'Target', query: 'q', orgId: 'org_1', scanJobId: 'job_2' }),
    ).rejects.toThrow();

    const failedCall = scanJobUpdate.mock.calls.find(([arg]) => arg.data.status === 'FAILED');
    expect(failedCall).toBeTruthy();
    const storedError = failedCall![0].data.error;

    expect(storedError).toBe('Scan failed. Our team has been notified — try again later.');
    expect(storedError).not.toContain('10.0.0.5');
    expect(storedError).not.toContain('ECONNREFUSED');
    expect(console.error).toHaveBeenCalled();
  });

  it('still records a real outcome and never touches ScanJob.error on success', async () => {
    getRetailer.mockReturnValue({ search: vi.fn().mockResolvedValue([]) });

    const result = await runScanJob({ retailer: 'Target', query: 'q', orgId: 'org_1', scanJobId: 'job_3' });

    expect(result.found).toBe(0);
    const doneCall = scanJobUpdate.mock.calls.find(([arg]) => arg.data.status === 'DONE');
    expect(doneCall).toBeTruthy();
    expect(doneCall![0].data.error).toBeUndefined();
  });
});
