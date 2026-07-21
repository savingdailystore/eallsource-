import { describe, it, expect, vi, beforeEach } from 'vitest';

const scanJobUpdate          = vi.fn();
const getRetailer            = vi.fn();
const processRetailerProduct = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: { scanJob: { update: (...args: unknown[]) => scanJobUpdate(...args) } },
}));
vi.mock('@/retailers', () => ({ getRetailer: (...args: unknown[]) => getRetailer(...args) }));
vi.mock('@/services/pipeline', () => ({
  processRetailerProduct: (...args: unknown[]) => processRetailerProduct(...args),
}));

import { runScanJob } from './run-scan';
import type { ScanRunResult } from './run-scan';

// ── Shared helpers ────────────────────────────────────────────────────────────

function fakeProduct(overrides: Partial<{ title: string; upc: string; url: string }> = {}) {
  return {
    title:    overrides.title ?? 'Test Product',
    brand:    'TestBrand',
    upc:      overrides.upc,
    price:    20,
    inStock:  true,
    url:      overrides.url ?? 'https://walmart.com/p/test',
    retailer: 'Walmart',
  };
}

/** Make a mock retailer plugin that returns the given products. */
function mockPlugin(products: object[]) {
  return { search: vi.fn().mockResolvedValue(products) };
}

/** Make processRetailerProduct call onDiagnostic and return a given outcome. */
function mockPipelineOutcome(
  outcome: object,
  diag?: { matchMethod?: string; matchConfidence?: number; asin?: string },
) {
  return vi.fn().mockImplementation(async (_product: unknown, _orgId: unknown, opts: any) => {
    if (diag) {
      opts?.onDiagnostic?.({
        sourceTitle:     'Test Product',
        outcome:         (outcome as any).outcome,
        asin:            diag.asin ?? 'B001TEST001',
        matchMethod:     diag.matchMethod,
        matchConfidence: diag.matchConfidence,
      });
    }
    return outcome;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
describe('runScanJob — matchMethodBreakdown', () => {
  beforeEach(() => {
    scanJobUpdate.mockReset().mockResolvedValue({});
    getRetailer.mockReset();
    processRetailerProduct.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('increments upc when matchMethod is UPC', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct({ upc: '012345678901' })]));
    processRetailerProduct.mockImplementation(mockPipelineOutcome(
      { outcome: 'lead_created', leadId: 'l1', score: 80 },
      { matchMethod: 'UPC', matchConfidence: 99, asin: 'B001TEST' },
    ));

    const result: ScanRunResult = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.matchMethodBreakdown.upc).toBe(1);
    expect(result.matchMethodBreakdown.ean).toBe(0);
    expect(result.matchMethodBreakdown.title).toBe(0);
  });

  it('increments ean when matchMethod is EAN', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockImplementation(mockPipelineOutcome(
      { outcome: 'no_match' },
      { matchMethod: 'EAN', matchConfidence: 99, asin: 'B001TEST' },
    ));

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.matchMethodBreakdown.ean).toBe(1);
  });

  it('increments brandModel when matchMethod is BRAND_MODEL', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockImplementation(mockPipelineOutcome(
      { outcome: 'not_profitable', roi: 5, profit: 0.5 },
      { matchMethod: 'BRAND_MODEL', matchConfidence: 85, asin: 'B001TEST' },
    ));

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.matchMethodBreakdown.brandModel).toBe(1);
  });

  it('increments title when matchMethod is TITLE_SIMILARITY', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockImplementation(mockPipelineOutcome(
      { outcome: 'lead_created', leadId: 'l1', score: 70 },
      { matchMethod: 'TITLE_SIMILARITY', matchConfidence: 65, asin: 'B001TEST' },
    ));

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.matchMethodBreakdown.title).toBe(1);
    expect(result.matchMethodBreakdown.upc).toBe(0);
  });

  it('increments unknown for unrecognised or absent matchMethod', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockImplementation(mockPipelineOutcome(
      { outcome: 'lead_created', leadId: 'l1', score: 80 },
      { matchMethod: 'MANUAL', matchConfidence: 100, asin: 'B001TEST' },
    ));

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.matchMethodBreakdown.unknown).toBe(1);
  });

  it('does not count no_match products (no asin in diagnostic) in any bucket', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    // no_match: diagnostic fires but has no asin
    processRetailerProduct.mockImplementation(async (_p: unknown, _o: unknown, opts: any) => {
      opts?.onDiagnostic?.({ sourceTitle: 'Test Product', outcome: 'no_match' });
      return { outcome: 'no_match' };
    });

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    const total = Object.values(result.matchMethodBreakdown).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it('accumulates correctly across multiple products with mixed methods', async () => {
    const products = [fakeProduct({ upc: '111' }), fakeProduct(), fakeProduct()];
    getRetailer.mockReturnValue(mockPlugin(products));

    let call = 0;
    processRetailerProduct.mockImplementation(async (_p: unknown, _o: unknown, opts: any) => {
      call++;
      if (call === 1) {
        opts?.onDiagnostic?.({ sourceTitle: 'P1', outcome: 'lead', asin: 'B001', matchMethod: 'UPC', matchConfidence: 99 });
        return { outcome: 'lead_created', leadId: 'l1', score: 80 };
      }
      if (call === 2) {
        opts?.onDiagnostic?.({ sourceTitle: 'P2', outcome: 'not_profitable', asin: 'B002', matchMethod: 'TITLE_SIMILARITY', matchConfidence: 62 });
        return { outcome: 'not_profitable', roi: 3, profit: 0.3 };
      }
      // call === 3: no match
      opts?.onDiagnostic?.({ sourceTitle: 'P3', outcome: 'no_match' });
      return { outcome: 'no_match' };
    });

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.matchMethodBreakdown.upc).toBe(1);
    expect(result.matchMethodBreakdown.title).toBe(1);
    const total = Object.values(result.matchMethodBreakdown).reduce((a, b) => a + b, 0);
    expect(total).toBe(2); // only the 2 that had an asin
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('runScanJob — avgMatchConfidence', () => {
  beforeEach(() => {
    scanJobUpdate.mockReset().mockResolvedValue({});
    getRetailer.mockReset();
    processRetailerProduct.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('computes the rounded average of matched-product confidences', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct(), fakeProduct()]));
    let call = 0;
    processRetailerProduct.mockImplementation(async (_p: unknown, _o: unknown, opts: any) => {
      call++;
      opts?.onDiagnostic?.({
        sourceTitle: 'P', outcome: 'lead', asin: 'B00' + call,
        matchMethod: 'UPC', matchConfidence: call === 1 ? 99 : 71,
      });
      return { outcome: 'lead_created', leadId: `l${call}`, score: 80 };
    });

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    // (99 + 71) / 2 = 85
    expect(result.avgMatchConfidence).toBe(85);
  });

  it('returns 0 when no products matched (divide-by-zero guard)', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct(), fakeProduct()]));
    processRetailerProduct.mockImplementation(async (_p: unknown, _o: unknown, opts: any) => {
      opts?.onDiagnostic?.({ sourceTitle: 'P', outcome: 'no_match' }); // no asin
      return { outcome: 'no_match' };
    });

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.avgMatchConfidence).toBe(0);
  });

  it('returns 0 on an empty product list', async () => {
    getRetailer.mockReturnValue(mockPlugin([]));

    const result = await runScanJob({ retailer: 'Target', query: 'q', orgId: 'org' });

    expect(result.avgMatchConfidence).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('runScanJob — low/high confidence buckets', () => {
  beforeEach(() => {
    scanJobUpdate.mockReset().mockResolvedValue({});
    getRetailer.mockReset();
    processRetailerProduct.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('counts confidence < 70 as lowConfidenceMatches', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockImplementation(mockPipelineOutcome(
      { outcome: 'lead_created', leadId: 'l1', score: 60 },
      { matchMethod: 'TITLE_SIMILARITY', matchConfidence: 62, asin: 'B001' },
    ));

    const result = await runScanJob({ retailer: 'Target', query: 'q', orgId: 'org' });

    expect(result.lowConfidenceMatches).toBe(1);
    expect(result.highConfidenceMatches).toBe(0);
  });

  it('counts confidence >= 90 as highConfidenceMatches', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockImplementation(mockPipelineOutcome(
      { outcome: 'lead_created', leadId: 'l1', score: 85 },
      { matchMethod: 'UPC', matchConfidence: 99, asin: 'B001' },
    ));

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.highConfidenceMatches).toBe(1);
    expect(result.lowConfidenceMatches).toBe(0);
  });

  it('confidence exactly 70 is not low (boundary)', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockImplementation(mockPipelineOutcome(
      { outcome: 'lead_created', leadId: 'l1', score: 70 },
      { matchMethod: 'TITLE_SIMILARITY', matchConfidence: 70, asin: 'B001' },
    ));

    const result = await runScanJob({ retailer: 'Target', query: 'q', orgId: 'org' });

    expect(result.lowConfidenceMatches).toBe(0);
  });

  it('confidence exactly 90 is high (boundary)', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockImplementation(mockPipelineOutcome(
      { outcome: 'lead_created', leadId: 'l1', score: 90 },
      { matchMethod: 'UPC', matchConfidence: 90, asin: 'B001' },
    ));

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.highConfidenceMatches).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('runScanJob — riskGateBreakdown', () => {
  beforeEach(() => {
    scanJobUpdate.mockReset().mockResolvedValue({});
    getRetailer.mockReset();
    processRetailerProduct.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const gateCase = (outcome: string, key: string) =>
    it(`increments riskGateBreakdown.${key} for outcome "${outcome}"`, async () => {
      getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
      processRetailerProduct.mockResolvedValue({ outcome });

      const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

      expect((result.riskGateBreakdown as any)[key]).toBe(1);
      expect(result.skipped).toBe(1);
    });

  gateCase('brand_blocked',        'brandBlocked');
  gateCase('ip_complaint_history', 'ipComplaintHistory');
  gateCase('private_label',        'privateLabel');
  gateCase('hazmat',               'hazmat');
  gateCase('generic_brand',        'genericBrand');
  gateCase('amazon_sells_it',      'amazonSellsIt');
  gateCase('price_unstable',       'priceUnstable');

  it('increments riskGateBreakdown.validationFailed AND top-level validationFailed', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockResolvedValue({ outcome: 'validation_failed', reasons: ['identity too low'] });

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.validationFailed).toBe(1);
    expect(result.riskGateBreakdown.validationFailed).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('increments riskGateBreakdown.gating for unrecognised outcomes', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockResolvedValue({ outcome: 'future_unknown_gate' });

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.riskGateBreakdown.gating).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('does not mutate riskGateBreakdown for lead_created', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockResolvedValue({ outcome: 'lead_created', leadId: 'l1', score: 80 });

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    const gateTotal = Object.values(result.riskGateBreakdown).reduce((a, b) => a + b, 0);
    expect(gateTotal).toBe(0);
    expect(result.created).toBe(1);
  });

  it('all risk gate counts start at zero for an empty scan', async () => {
    getRetailer.mockReturnValue(mockPlugin([]));

    const result = await runScanJob({ retailer: 'Target', query: 'q', orgId: 'org' });

    expect(Object.values(result.riskGateBreakdown).every((v) => v === 0)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('runScanJob — scraperMetrics', () => {
  beforeEach(() => {
    scanJobUpdate.mockReset().mockResolvedValue({});
    getRetailer.mockReset();
    processRetailerProduct.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reports productsFound correctly', async () => {
    const products = [fakeProduct(), fakeProduct()];
    getRetailer.mockReturnValue(mockPlugin(products));
    processRetailerProduct.mockResolvedValue({ outcome: 'no_match' });

    const result = await runScanJob({ retailer: 'Walmart', query: 'coffee maker', orgId: 'org' });

    expect(result.scraperMetrics.productsFound).toBe(2);
    expect(result.scraperMetrics.retailer).toBe('Walmart');
    expect(result.scraperMetrics.query).toBe('coffee maker');
  });

  it('splits productsWithUpc and productsWithoutUpc correctly', async () => {
    const products = [
      fakeProduct({ upc: '012345678901' }),
      fakeProduct({ upc: '987654321098' }),
      fakeProduct(), // no upc
    ];
    getRetailer.mockReturnValue(mockPlugin(products));
    processRetailerProduct.mockResolvedValue({ outcome: 'no_match' });

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.scraperMetrics.productsWithUpc).toBe(2);
    expect(result.scraperMetrics.productsWithoutUpc).toBe(1);
  });

  it('sets hitProductCap true when product count equals cap (18)', async () => {
    const products = Array.from({ length: 18 }, (_, i) => fakeProduct({ url: `https://x.com/${i}` }));
    getRetailer.mockReturnValue(mockPlugin(products));
    processRetailerProduct.mockResolvedValue({ outcome: 'no_match' });

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.scraperMetrics.hitProductCap).toBe(true);
  });

  it('sets hitProductCap false when fewer than 18 products returned', async () => {
    const products = Array.from({ length: 5 }, (_, i) => fakeProduct({ url: `https://x.com/${i}` }));
    getRetailer.mockReturnValue(mockPlugin(products));
    processRetailerProduct.mockResolvedValue({ outcome: 'no_match' });

    const result = await runScanJob({ retailer: 'Target', query: 'q', orgId: 'org' });

    expect(result.scraperMetrics.hitProductCap).toBe(false);
  });

  it('reports zero products correctly when scraper returns nothing', async () => {
    getRetailer.mockReturnValue(mockPlugin([]));

    const result = await runScanJob({ retailer: 'Target', query: 'q', orgId: 'org' });

    expect(result.scraperMetrics.productsFound).toBe(0);
    expect(result.scraperMetrics.productsWithUpc).toBe(0);
    expect(result.scraperMetrics.productsWithoutUpc).toBe(0);
    expect(result.scraperMetrics.hitProductCap).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('runScanJob — timingMetrics', () => {
  beforeEach(() => {
    scanJobUpdate.mockReset().mockResolvedValue({});
    getRetailer.mockReset();
    processRetailerProduct.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('timingMetrics fields are non-negative numbers', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockResolvedValue({ outcome: 'no_match' });

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.timingMetrics.totalRuntimeMs).toBeGreaterThanOrEqual(0);
    expect(result.timingMetrics.scraperRuntimeMs).toBeGreaterThanOrEqual(0);
    expect(result.timingMetrics.pipelineRuntimeMs).toBeGreaterThanOrEqual(0);
  });

  it('totalRuntimeMs >= scraperRuntimeMs + pipelineRuntimeMs', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockResolvedValue({ outcome: 'no_match' });

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.timingMetrics.totalRuntimeMs)
      .toBeGreaterThanOrEqual(result.timingMetrics.scraperRuntimeMs + result.timingMetrics.pipelineRuntimeMs - 5); // 5ms tolerance
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('runScanJob — hazmat gate fires when title contains hazmat keyword', () => {
  beforeEach(() => {
    scanJobUpdate.mockReset().mockResolvedValue({});
    getRetailer.mockReset();
    processRetailerProduct.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('hazmat outcome increments riskGateBreakdown.hazmat', async () => {
    getRetailer.mockReturnValue(mockPlugin([
      { ...fakeProduct({ title: 'Lithium Ion Portable Charger' }), upc: undefined },
    ]));
    processRetailerProduct.mockResolvedValue({ outcome: 'hazmat' });

    const result = await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org' });

    expect(result.riskGateBreakdown.hazmat).toBe(1);
    expect(result.skipped).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('runScanJob — result stored in ScanJob.result', () => {
  beforeEach(() => {
    scanJobUpdate.mockReset().mockResolvedValue({});
    getRetailer.mockReset();
    processRetailerProduct.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('new metric fields are present in the DONE update payload', async () => {
    getRetailer.mockReturnValue(mockPlugin([fakeProduct()]));
    processRetailerProduct.mockImplementation(mockPipelineOutcome(
      { outcome: 'lead_created', leadId: 'l1', score: 80 },
      { matchMethod: 'UPC', matchConfidence: 99, asin: 'B001' },
    ));

    await runScanJob({ retailer: 'Walmart', query: 'q', orgId: 'org', scanJobId: 'job_1' });

    const doneCall = scanJobUpdate.mock.calls.find(([a]) => a.data.status === 'DONE');
    expect(doneCall).toBeTruthy();
    const stored = doneCall![0].data.result;

    expect(stored).toHaveProperty('matchMethodBreakdown');
    expect(stored).toHaveProperty('riskGateBreakdown');
    expect(stored).toHaveProperty('scraperMetrics');
    expect(stored).toHaveProperty('timingMetrics');
    expect(stored).toHaveProperty('avgMatchConfidence');
  });
});
