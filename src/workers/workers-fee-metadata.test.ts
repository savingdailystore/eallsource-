/**
 * Phase 20.2M-1D-2 — calculate_roi Worker Fee Metadata Tests
 *
 * Verifies that the calculate_roi worker:
 * - Attempts a SP-API fee refresh before computing profitability
 * - Writes fee metadata on SP-API success
 * - Does not erase existing confirmed SP_API metadata on refresh failure
 * - Falls back to STATIC labeling only when no prior confirmed data exists
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Worker } from 'bullmq';

// ── BullMQ mock — capture the handler passed to makeWorker ──────────────────

type JobHandler = (job: { data: unknown }) => Promise<unknown>;
const handlers: Record<string, JobHandler> = {};

vi.mock('bullmq', () => ({
  Worker: class {
    constructor(queueName: string, handler: JobHandler) {
      handlers[queueName] = handler;
    }
  },
}));

// ── Prisma mock ──────────────────────────────────────────────────────────────

const productFindUniqueOrThrow = vi.fn();
const productUpdate            = vi.fn();
const orgFindUnique            = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product:      { findUniqueOrThrow: (...a: unknown[]) => productFindUniqueOrThrow(...a), update: (...a: unknown[]) => productUpdate(...a) },
    organization: { findUnique: (...a: unknown[]) => orgFindUnique(...a) },
    scanJob:      { update: vi.fn() },
    repricingRule:    { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    repricingHistory: { create: vi.fn() },
    lead:         { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

// ── SP-API mock ──────────────────────────────────────────────────────────────

const getFeeEstimateMock = vi.fn();

vi.mock('@/lib/amazon', () => ({
  getFeeEstimate:          (...a: unknown[]) => getFeeEstimateMock(...a),
  getProductData:          vi.fn().mockResolvedValue(null),
  searchCatalogByUpc:      vi.fn().mockResolvedValue(null),
  searchCatalogByEan:      vi.fn().mockResolvedValue(null),
  searchCatalogByKeywords: vi.fn().mockResolvedValue(null),
}));

// ── Engine mocks ─────────────────────────────────────────────────────────────

vi.mock('@/engines/profitability', () => ({
  calculateProfitability: vi.fn().mockReturnValue({
    profit: 8, roi: 45, margin: 0.22, finalCost: 12, totalLandedCost: 12,
    referralFee: 4.50, fbaFee: 3.50, storageFee: 0, prepFee: 0, amazonFees: 8,
    taxAmount: 1.05, feeEstimateConfirmed: true,
  }),
}));

vi.mock('@/engines/gating', () => ({
  assessGating: vi.fn().mockReturnValue({ risk: 'LOW', autoUngated: false, hasHazmat: false, isBrandRestricted: false, isCategoryGated: false }),
}));

vi.mock('@/engines/demand', () => ({
  assessDemand: vi.fn().mockReturnValue({ level: 'HIGH', velocityTooLow: false, expectedUnitsPerSeller: 10, monthlySales: 100 }),
}));

vi.mock('@/engines/scoring', () => ({
  calculateScore: vi.fn().mockReturnValue(82),
}));

vi.mock('@/engines/validation', () => ({
  validateProduct: vi.fn().mockReturnValue({ passed: true, identityScore: 95, urlScore: 90, priceScore: 85, inventoryScore: 80 }),
}));

vi.mock('@/engines/repricing', () => ({
  calculateReprice: vi.fn().mockReturnValue({ recommendedPrice: 29.99, direction: 'UP', riskScore: 0.2 }),
}));

vi.mock('@/services/pipeline', () => ({
  processRetailerProduct: vi.fn().mockResolvedValue({ outcome: 'lead_created', leadId: 'l1', score: 80 }),
}));

// ── Load workers (registers handlers) ────────────────────────────────────────

import { startWorkers } from './index';
startWorkers('redis://localhost:6379');

// ── Base product fixture ──────────────────────────────────────────────────────

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    orgId: 'org-1',
    asin: 'B0TEST12345',
    title: 'Test Product',
    brand: 'TestBrand',
    category: 'Kitchen',
    sourcePrice: 12,
    sourceShipping: 0,
    estimatedResellPrice: 28,
    buyBoxPrice: 29,
    referralFee: 4.35,
    fbaFee: 3.50,
    storageFee: 0,
    prepFee: 0,
    sourceTaxRate: null,
    matchConfidence: 95,
    priceStability: 'STABLE',
    hasHazmat: false,
    bsr: 5000,
    fbaSellers: 3,
    totalSellers: 6,
    feeEstimateConfirmed: false,
    feeEstimateSource: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  orgFindUnique.mockResolvedValue(null);
  productUpdate.mockResolvedValue({});
  getFeeEstimateMock.mockResolvedValue({ referralFee: 4.80, fbaFee: 3.80 });
});

async function runCalcRoi(productOverrides: Record<string, unknown> = {}) {
  productFindUniqueOrThrow.mockResolvedValue(makeProduct(productOverrides));
  await handlers['calculate_roi']({ data: { productId: 'prod-1' } });
  return productUpdate.mock.calls[0][0];
}

describe('calculate_roi worker — SP-API fee refresh attempt', () => {
  it('calls getFeeEstimate with orgId, ASIN, and resell price', async () => {
    await runCalcRoi();

    expect(getFeeEstimateMock).toHaveBeenCalledWith('org-1', 'B0TEST12345', 28);
  });

  it('uses estimatedResellPrice as the fee estimate price argument', async () => {
    await runCalcRoi({ estimatedResellPrice: 31.99, buyBoxPrice: 33.00 });

    // estimatedResellPrice takes precedence over buyBoxPrice
    expect(getFeeEstimateMock).toHaveBeenCalledWith('org-1', 'B0TEST12345', 31.99);
  });

  it('falls back to buyBoxPrice when estimatedResellPrice is null', async () => {
    await runCalcRoi({ estimatedResellPrice: null, buyBoxPrice: 27.50 });

    expect(getFeeEstimateMock).toHaveBeenCalledWith('org-1', 'B0TEST12345', 27.50);
  });

  it('does not call getFeeEstimate when ASIN is missing', async () => {
    productFindUniqueOrThrow.mockResolvedValue(makeProduct({ asin: null }));
    await handlers['calculate_roi']({ data: { productId: 'prod-1' } });

    expect(getFeeEstimateMock).not.toHaveBeenCalled();
  });

  it('does not call getFeeEstimate when resell price is 0', async () => {
    await runCalcRoi({ estimatedResellPrice: 0, buyBoxPrice: 0 });

    expect(getFeeEstimateMock).not.toHaveBeenCalled();
  });
});

describe('calculate_roi worker — SP-API success updates fee metadata', () => {
  it('writes feeEstimateSource = "SP_API" on success', async () => {
    const updateArg = await runCalcRoi();
    expect(updateArg.data.feeEstimateSource).toBe('SP_API');
  });

  it('writes feeEstimateConfirmed = true on success', async () => {
    const updateArg = await runCalcRoi();
    expect(updateArg.data.feeEstimateConfirmed).toBe(true);
  });

  it('writes feeEstimatedAt as a Date on success', async () => {
    const before = new Date();
    const updateArg = await runCalcRoi();
    const after = new Date();

    const at = updateArg.data.feeEstimatedAt;
    expect(at).toBeInstanceOf(Date);
    expect(at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(at.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('writes feeEstimatePrice = resell price on success', async () => {
    const updateArg = await runCalcRoi();
    expect(updateArg.data.feeEstimatePrice).toBe(28);
  });

  it('writes priceCheckedAt on SP-API success', async () => {
    const updateArg = await runCalcRoi();
    expect(updateArg.data.priceCheckedAt).toBeInstanceOf(Date);
  });

  it('updates referralFee and fbaFee from fresh SP-API result', async () => {
    getFeeEstimateMock.mockResolvedValue({ referralFee: 4.80, fbaFee: 3.80 });
    const updateArg = await runCalcRoi();
    expect(updateArg.data.referralFee).toBe(4.80);
    expect(updateArg.data.fbaFee).toBe(3.80);
  });
});

describe('calculate_roi worker — SP-API failure preserves existing confirmed data', () => {
  it('does not downgrade feeEstimateSource from SP_API to STATIC when refresh fails', async () => {
    getFeeEstimateMock.mockResolvedValue(null);

    const updateArg = await runCalcRoi({
      feeEstimateConfirmed: true,
      feeEstimateSource: 'SP_API',
    });

    // Should preserve SP_API — not write STATIC over existing confirmed data
    expect(updateArg.data.feeEstimateSource).not.toBe('STATIC');
  });

  it('preserves feeEstimateConfirmed = true when refresh fails with existing SP_API data', async () => {
    getFeeEstimateMock.mockRejectedValue(new Error('SP-API timeout'));

    const updateArg = await runCalcRoi({
      feeEstimateConfirmed: true,
      feeEstimateSource: 'SP_API',
    });

    expect(updateArg.data.feeEstimateConfirmed).toBe(true);
  });

  it('writes feeEstimateSource = "STATIC" when no prior fee source exists and refresh fails', async () => {
    getFeeEstimateMock.mockResolvedValue(null);

    const updateArg = await runCalcRoi({
      feeEstimateConfirmed: false,
      feeEstimateSource: null,
    });

    expect(updateArg.data.feeEstimateSource).toBe('STATIC');
    expect(updateArg.data.feeEstimateConfirmed).toBe(false);
  });

  it('still writes profit/roi/score even when SP-API refresh fails', async () => {
    getFeeEstimateMock.mockResolvedValue(null);
    const updateArg = await runCalcRoi();

    expect(updateArg.data.profit).toBeDefined();
    expect(updateArg.data.roi).toBeDefined();
    expect(updateArg.data.score).toBeDefined();
  });
});
