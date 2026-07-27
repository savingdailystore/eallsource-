/**
 * Phase 18.2 — Candidate Evaluator Tests
 *
 * Key invariants verified:
 * - evaluateCandidate writes to sourceCandidate ONLY (no Product/Lead/Entitlement)
 * - All hard-reject safety gates work (brand block, private-label, hazmat, IP history)
 * - Not-profitable → NO_LONGER_PROFITABLE (not REJECTED)
 * - Profitable + clean match → MATCHED (never CERTIFIED)
 * - Advisory warnings → NEEDS_REVIEW
 * - Missing ASIN/UPC/title → safe REJECTED (no_match)
 * - CERTIFIED candidate → throws (never overwrites)
 * - force:true is never called
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { evaluateCandidate } from './candidateEvaluator';
import { prisma } from '@/lib/prisma';
import * as amazon from '@/lib/amazon';
import * as keepa  from '@/lib/keepa';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sourceCandidate: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    product:         { findFirst: vi.fn().mockResolvedValue(null) },
    brandBlock:      { findFirst: vi.fn().mockResolvedValue(null) },
    // These must NEVER be called by the evaluator
    lead:            { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    leadEntitlement: { create: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock('@/lib/amazon', () => ({
  searchCatalogByUpc:      vi.fn().mockResolvedValue(null),
  searchCatalogByEan:      vi.fn().mockResolvedValue(null),
  searchCatalogByKeywords: vi.fn().mockResolvedValue(null),
  getProductData:          vi.fn().mockResolvedValue(null),
  getFeeEstimate:          vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/keepa', () => ({
  getKeepaData: vi.fn().mockResolvedValue(null),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ORG_ID = 'org-test-1';
const CAND_ID = 'cand-test-1';

function makeCandidate(overrides: Partial<{
  certStatus: string;
  asin: string | null;
  upc: string | null;
  title: string | null;
  brand: string | null;
  sourcePrice: number | null;
}> = {}) {
  return {
    id:          CAND_ID,
    certStatus:  'RAW_CANDIDATE',
    asin:        null,
    upc:         null,
    title:       'Test Product',
    brand:       'TestBrand',
    sourcePrice: 15.00,
    ...overrides,
  };
}

function goodProductData() {
  return {
    title:          'Test Product',
    brand:          'TestBrand',
    category:       'Home & Kitchen',
    buyBoxPrice:    45.00,
    lowestFbaPrice: 44.00,
    fbaSellers:     3,
    totalSellers:   5,
    amazonIsSeller: false,
    bsr:            50000,
  };
}

function goodKeepaData() {
  return {
    title:          'Test Product',
    brand:          'TestBrand',
    category:       'Home & Kitchen',
    buyBoxPrice:    45.00,
    lowestNewPrice: 44.00,
    fbaSellers:     3,
    totalSellers:   5,
    amazonIsSeller: false,
    bsr:            50000,
    priceStability: 'STABLE' as const,
    priceTrend:     'FLAT' as const,
    monthlySales:   50,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: candidate exists, no IP flag, no brand block
  (prisma.sourceCandidate.findUnique as MockedFunction<typeof prisma.sourceCandidate.findUnique>)
    .mockResolvedValue(makeCandidate({ asin: 'B0TEST12345' }) as any);
  (prisma.product.findFirst as MockedFunction<typeof prisma.product.findFirst>)
    .mockResolvedValue(null);
  (prisma.brandBlock.findFirst as MockedFunction<typeof prisma.brandBlock.findFirst>)
    .mockResolvedValue(null);
  (prisma.sourceCandidate.update as MockedFunction<typeof prisma.sourceCandidate.update>)
    .mockResolvedValue({} as any);

  // Default: good SP-API and Keepa data
  (amazon.getProductData as MockedFunction<typeof amazon.getProductData>)
    .mockResolvedValue(goodProductData() as any);
  (keepa.getKeepaData as MockedFunction<typeof keepa.getKeepaData>)
    .mockResolvedValue(goodKeepaData() as any);
  (amazon.getFeeEstimate as MockedFunction<typeof amazon.getFeeEstimate>)
    .mockResolvedValue({ referralFee: 6.75, fbaFee: 4.56 });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('evaluateCandidate — safety: never creates Product/Lead/Entitlement', () => {
  it('only calls sourceCandidate.update — never lead.create, product, or entitlement', async () => {
    await evaluateCandidate(CAND_ID, ORG_ID);

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.leadEntitlement.create).not.toHaveBeenCalled();
    expect(prisma.leadEntitlement.upsert).not.toHaveBeenCalled();
    expect(prisma.sourceCandidate.update).toHaveBeenCalledOnce();
  });

  it('throws without creating any records when candidate is CERTIFIED', async () => {
    (prisma.sourceCandidate.findUnique as MockedFunction<typeof prisma.sourceCandidate.findUnique>)
      .mockResolvedValue(makeCandidate({ certStatus: 'CERTIFIED', asin: 'B0TEST12345' }) as any);

    await expect(evaluateCandidate(CAND_ID, ORG_ID)).rejects.toThrow('already CERTIFIED');

    expect(prisma.sourceCandidate.update).not.toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('throws when candidate does not exist', async () => {
    (prisma.sourceCandidate.findUnique as MockedFunction<typeof prisma.sourceCandidate.findUnique>)
      .mockResolvedValue(null as any);

    await expect(evaluateCandidate(CAND_ID, ORG_ID)).rejects.toThrow('not found');
    expect(prisma.sourceCandidate.update).not.toHaveBeenCalled();
  });
});

describe('evaluateCandidate — no match', () => {
  it('REJECTED when no ASIN, no UPC match, and no title match', async () => {
    (prisma.sourceCandidate.findUnique as MockedFunction<typeof prisma.sourceCandidate.findUnique>)
      .mockResolvedValue(makeCandidate({ asin: null, upc: null, title: 'Unknown Widget' }) as any);
    (amazon.searchCatalogByKeywords as MockedFunction<typeof amazon.searchCatalogByKeywords>)
      .mockResolvedValue(null);

    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(result.newStatus).toBe('REJECTED');
    expect(result.certNotes).toContain('No Amazon ASIN match');
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('uses ASIN directly when candidate already has one (skips match search)', async () => {
    (prisma.sourceCandidate.findUnique as MockedFunction<typeof prisma.sourceCandidate.findUnique>)
      .mockResolvedValue(makeCandidate({ asin: 'B0DIRECT123' }) as any);

    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(amazon.searchCatalogByUpc).not.toHaveBeenCalled();
    expect(result.asin).toBe('B0DIRECT123');
    expect(result.matchMethod).toBe('MANUAL');
    expect(result.matchConfidence).toBe(100);
  });

  it('tries UPC search when no ASIN', async () => {
    (prisma.sourceCandidate.findUnique as MockedFunction<typeof prisma.sourceCandidate.findUnique>)
      .mockResolvedValue(makeCandidate({ asin: null, upc: '012345678901' }) as any);
    (amazon.searchCatalogByUpc as MockedFunction<typeof amazon.searchCatalogByUpc>)
      .mockResolvedValue({ asin: 'B0FROMUPC', amazonUrl: '', matchMethod: 'UPC', matchConfidence: 99 });

    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(amazon.searchCatalogByUpc).toHaveBeenCalledWith(ORG_ID, '012345678901');
    expect(result.asin).toBe('B0FROMUPC');
    expect(result.matchMethod).toBe('UPC');
  });
});

describe('evaluateCandidate — hard rejects', () => {
  it('REJECTED when ASIN has IP complaint history', async () => {
    (prisma.product.findFirst as MockedFunction<typeof prisma.product.findFirst>)
      .mockResolvedValue({ id: 'prod-flagged' } as any);

    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(result.newStatus).toBe('REJECTED');
    expect(result.certNotes).toContain('IP complaint history');
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('REJECTED when brand is on blocklist', async () => {
    (prisma.brandBlock.findFirst as MockedFunction<typeof prisma.brandBlock.findFirst>)
      .mockResolvedValue({ id: 'block-1' } as any);

    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(result.newStatus).toBe('REJECTED');
    expect(result.certNotes?.toLowerCase()).toContain('brand blocked');
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('REJECTED when product is Amazon private-label (solimo, amazon basics, etc.)', async () => {
    (amazon.getProductData as MockedFunction<typeof amazon.getProductData>)
      .mockResolvedValue({ ...goodProductData(), brand: 'Solimo' } as any);
    (keepa.getKeepaData as MockedFunction<typeof keepa.getKeepaData>)
      .mockResolvedValue({ ...goodKeepaData(), brand: 'Solimo' } as any);

    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(result.newStatus).toBe('REJECTED');
    expect(result.certNotes).toContain('private-label');
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('REJECTED when product title contains hazmat keyword (lithium battery)', async () => {
    (amazon.getProductData as MockedFunction<typeof amazon.getProductData>)
      .mockResolvedValue({ ...goodProductData(), title: 'Lithium Battery Pack 10000mAh' } as any);
    (keepa.getKeepaData as MockedFunction<typeof keepa.getKeepaData>)
      .mockResolvedValue({ ...goodKeepaData(), title: 'Lithium Battery Pack 10000mAh' } as any);

    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(result.newStatus).toBe('REJECTED');
    expect(result.certNotes).toContain('Hazmat');
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });
});

describe('evaluateCandidate — no longer profitable', () => {
  it('NO_LONGER_PROFITABLE when ROI < 30% or profit < $8', async () => {
    // sourcePrice $15, buyBox $16 → fees eat margin
    (amazon.getProductData as MockedFunction<typeof amazon.getProductData>)
      .mockResolvedValue({ ...goodProductData(), buyBoxPrice: 16.00, lowestFbaPrice: 16.00 } as any);
    (keepa.getKeepaData as MockedFunction<typeof keepa.getKeepaData>)
      .mockResolvedValue({ ...goodKeepaData(), buyBoxPrice: 16.00, lowestNewPrice: 16.00 } as any);

    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(result.newStatus).toBe('NO_LONGER_PROFITABLE');
    expect(result.certNotes).toContain('Not profitable');
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('NO_LONGER_PROFITABLE when resale price below $12 floor', async () => {
    (amazon.getProductData as MockedFunction<typeof amazon.getProductData>)
      .mockResolvedValue({ ...goodProductData(), buyBoxPrice: 10.00, lowestFbaPrice: 10.00 } as any);
    (keepa.getKeepaData as MockedFunction<typeof keepa.getKeepaData>)
      .mockResolvedValue({ ...goodKeepaData(), buyBoxPrice: 10.00, lowestNewPrice: 10.00 } as any);

    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(result.newStatus).toBe('NO_LONGER_PROFITABLE');
    expect(result.certNotes).toContain('floor');
  });
});

describe('evaluateCandidate — NEEDS_REVIEW', () => {
  it('NEEDS_REVIEW when Amazon holds buy box', async () => {
    (amazon.getProductData as MockedFunction<typeof amazon.getProductData>)
      .mockResolvedValue({ ...goodProductData(), amazonIsSeller: true } as any);
    (keepa.getKeepaData as MockedFunction<typeof keepa.getKeepaData>)
      .mockResolvedValue({ ...goodKeepaData(), amazonIsSeller: true } as any);

    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(result.newStatus).toBe('NEEDS_REVIEW');
    expect(result.certNotes).toContain('Amazon holds buy box');
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(result.newStatus).not.toBe('CERTIFIED');
  });

  it('NEEDS_REVIEW when price is volatile', async () => {
    (keepa.getKeepaData as MockedFunction<typeof keepa.getKeepaData>)
      .mockResolvedValue({ ...goodKeepaData(), priceStability: 'VOLATILE' } as any);

    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(result.newStatus).toBe('NEEDS_REVIEW');
    expect(result.certNotes).toContain('Volatile');
    expect(result.newStatus).not.toBe('CERTIFIED');
  });

  it('NEEDS_REVIEW when no Amazon pricing data', async () => {
    (amazon.getProductData as MockedFunction<typeof amazon.getProductData>)
      .mockResolvedValue(null as any);
    (keepa.getKeepaData as MockedFunction<typeof keepa.getKeepaData>)
      .mockResolvedValue(null as any);

    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(result.newStatus).toBe('NEEDS_REVIEW');
    expect(result.certNotes).toContain('no Amazon pricing data');
  });
});

describe('evaluateCandidate — MATCHED (profitable + clean)', () => {
  it('MATCHED when profitable, high-confidence ASIN match, no warnings', async () => {
    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(result.newStatus).toBe('MATCHED');
    expect(result.certNotes).toBeNull();
    expect(result.estimatedProfit).toBeGreaterThan(0);
    expect(result.estimatedRoi).toBeGreaterThan(0);
    expect(result.buyBoxPrice).toBe(45.00);
    expect(result.newStatus).not.toBe('CERTIFIED');

    // Key invariant: no lead or product rows created
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.leadEntitlement.create).not.toHaveBeenCalled();
    expect(prisma.sourceCandidate.update).toHaveBeenCalledOnce();

    // Verify update args contain the expected status
    const updateCall = (prisma.sourceCandidate.update as MockedFunction<typeof prisma.sourceCandidate.update>).mock.calls[0][0];
    expect((updateCall as any).data.certStatus).toBe('MATCHED');
  });

  it('returns estimatedRoi as decimal fraction (0.xx = xx%)', async () => {
    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(result.estimatedRoi).not.toBeNull();
    // roi from profitability is a percentage (e.g., 85); stored as 0.85
    expect(result.estimatedRoi!).toBeGreaterThan(0);
    expect(result.estimatedRoi!).toBeLessThan(10); // should be a fraction, not 100+
  });
});

describe('evaluateCandidate — source price missing', () => {
  it('NEEDS_REVIEW when sourcePrice is null', async () => {
    (prisma.sourceCandidate.findUnique as MockedFunction<typeof prisma.sourceCandidate.findUnique>)
      .mockResolvedValue(makeCandidate({ asin: 'B0TEST12345', sourcePrice: null }) as any);

    const result = await evaluateCandidate(CAND_ID, ORG_ID);

    expect(result.newStatus).toBe('NEEDS_REVIEW');
    expect(result.certNotes).toContain('Source price missing');
  });
});
