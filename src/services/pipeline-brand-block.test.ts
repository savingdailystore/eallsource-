// Tests for brand_blocked pipeline gate
//
// Cases:
//   1. Returns brand_blocked when brand is actively blocked
//   2. Allows an unblocked brand through the brand gate
//
// NOTE: The full pipeline is integration-tested elsewhere. These tests focus
// specifically on the brand-block lookup, using shallow mocks for all the
// expensive network calls (Keepa, SP-API, etc.).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Prisma mock ──────────────────────────────────────────────────────────────

const productFindFirst    = vi.fn();
const productUpsert       = vi.fn();
const leadFindFirst       = vi.fn();
const leadCreate          = vi.fn();
const leadUpdate          = vi.fn();
const brandBlockFindFirst = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product:    {
      findFirst: (...a: unknown[]) => productFindFirst(...a),
      upsert:    (...a: unknown[]) => productUpsert(...a),
    },
    lead:       {
      findFirst: (...a: unknown[]) => leadFindFirst(...a),
      create:    (...a: unknown[]) => leadCreate(...a),
      update:    (...a: unknown[]) => leadUpdate(...a),
    },
    brandBlock: { findFirst: (...a: unknown[]) => brandBlockFindFirst(...a) },
  },
}));

// ── External service mocks (keep pipeline moving until brand gate) ───────────

vi.mock('@/lib/keepa', () => ({
  getKeepaData: vi.fn().mockResolvedValue({
    title: 'Astercook 8 Pan', brand: 'Astercook', category: 'Kitchen',
    buyBoxPrice: 29.99, lowestNewPrice: 28.00, fbaSellers: 3, totalSellers: 5,
    amazonIsSeller: false, priceStability: 'STABLE', priceTrend: 'FLAT',
    bsr: 5000, monthlySales: 200,
  }),
}));

vi.mock('@/lib/amazon', () => ({
  getProductData:           vi.fn().mockResolvedValue(null),
  searchCatalogByUpc:       vi.fn().mockResolvedValue(null),
  searchCatalogByEan:       vi.fn().mockResolvedValue(null),
  searchCatalogByKeywords:  vi.fn().mockResolvedValue(null),
  getFeeEstimate:           vi.fn().mockResolvedValue(null),
}));

vi.mock('@/engines/profitability', () => ({
  calculateProfitability: vi.fn().mockReturnValue({
    qualifies: true, profit: 5, roi: 40, margin: 0.2, amazonFees: 8,
    finalCost: 15, totalLandedCost: 15, referralFee: 4, fbaFee: 4,
    storageFee: 0, prepFee: 0, taxAmount: 0,
  }),
}));

vi.mock('@/engines/gating', () => ({
  assessGating: vi.fn().mockReturnValue({ risk: 'LOW', isPrivateLabel: false, hasHazmat: false, isGenericBrand: false }),
}));

vi.mock('@/engines/demand', () => ({
  assessDemand:   vi.fn().mockReturnValue({ level: 'HIGH', velocityTooLow: false, expectedUnitsPerSeller: 10, monthlySales: 200 }),
  bsrToPercentile: vi.fn().mockReturnValue(5),
}));

vi.mock('@/engines/validation', () => ({
  validateProduct: vi.fn().mockReturnValue({ passed: true, reasons: [], identityScore: 100, urlScore: 100, priceScore: 100, inventoryScore: 100 }),
}));

vi.mock('@/engines/scoring', () => ({
  calculateScore: vi.fn().mockReturnValue(85),
}));

import { processRetailerProduct } from './pipeline';

const PRODUCT = {
  title:    'Astercook 8 Inch Pan',
  url:      'https://walmart.com/ip/1234',
  price:    15.00,
  retailer: 'Walmart',
  inStock:  true,
  brand:    'Astercook',
};

beforeEach(() => {
  vi.clearAllMocks();
  // No ASIN-level IP complaint by default (productFindFirst is also used for lead.findFirst)
  productFindFirst.mockResolvedValue(null);
  // No brand block by default
  brandBlockFindFirst.mockResolvedValue(null);
  // Downstream product/lead persistence (needed when brand gate passes)
  productUpsert.mockResolvedValue({ id: 'prod-1', asin: 'B0GCCDXV8X' });
  leadFindFirst.mockResolvedValue(null);
  leadCreate.mockResolvedValue({ id: 'lead-1', score: 85 });
  leadUpdate.mockResolvedValue({ id: 'lead-1', score: 85 });
});

describe('pipeline brand_blocked gate', () => {
  it('returns brand_blocked when brand is actively blocked', async () => {
    brandBlockFindFirst.mockResolvedValue({ id: 'bb1' });

    const result = await processRetailerProduct(PRODUCT, 'org1', { knownAsin: 'B0GCCDXV8X' });

    expect(result.outcome).toBe('brand_blocked');
    expect(brandBlockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { normalizedBrand: 'astercook', isActive: true },
      }),
    );
  });

  it('does not block when brand is not in the blocklist', async () => {
    brandBlockFindFirst.mockResolvedValue(null);

    const result = await processRetailerProduct(PRODUCT, 'org1', { knownAsin: 'B0GCCDXV8X' });

    // Should proceed past the brand gate (may be lead_created or another gate)
    expect(result.outcome).not.toBe('brand_blocked');
  });
});
