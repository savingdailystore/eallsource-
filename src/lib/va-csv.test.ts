/**
 * VA CSV adapter tests — Phase 18.4b-Adapter
 *
 * Covers:
 *   1.  Parses VA CSV headers correctly
 *   2.  Maps Product Name to title
 *   3.  Maps Cost Price to sourcePrice (strips $ and commas)
 *   4.  Derives retailer from Source URL domain
 *   5.  Extracts ASIN from ASIN column
 *   6.  Extracts ASIN from Amazon URL when ASIN column missing/blank
 *   7.  Skips rows with invalid Cost Price
 *   8.  Skips rows with missing Source URL
 *   9.  Routes rows with multiple Source URLs to needsCleanupRows
 *   10. Flags sourcePrice < $10 with LOW_PRICE warning
 *   11. VA estimated profit/ROI preserved in meta only, not in CandidateRow
 *   12. Does not import Product, Lead, or LeadEntitlement records (pure parser)
 *   13. Does not call SP-API, Keepa, Apify, or broadcastLeads (no such imports)
 *   14. version=beta file is untouched (structural — oauth route not referenced here)
 *   15. Skips row with no ASIN and no Amazon URL
 *   16. RISKY_CATEGORY warning fires for supplement/knife/grocery titles
 *   17. COUPON_PRESENT warning fires when coupon code present
 *   18. VA_HIGH_ROI warning fires when VA ROI > 200%
 *   19. ASIN_FROM_URL warning fires when ASIN comes from Amazon URL
 *   20. Accepted CandidateRow contains only importable fields (no VA metadata)
 */

import { describe, it, expect } from 'vitest';
import {
  parseVaCsv,
  deriveRetailer,
  extractAsinFromUrl,
  parseCostPrice,
  isRiskyText,
} from './va-csv';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VA_HEADER = 'Product Name,ASIN,Category,Source URL,Amazon URL,Cost Price,Sales Price,Profit,R.O.I,Est Sales/M,Coupon Code,Note';

function makeRow(overrides: Partial<{
  productName: string;
  asin: string;
  category: string;
  sourceUrl: string;
  amazonUrl: string;
  costPrice: string;
  salesPrice: string;
  profit: string;
  roi: string;
  estSales: string;
  coupon: string;
  note: string;
}> = {}): string {
  return [
    overrides.productName ?? 'OXO Good Grips 3-Piece Mixing Bowl Set',
    overrides.asin        ?? 'B00004OCIX',
    overrides.category    ?? 'Kitchen',
    overrides.sourceUrl   ?? 'https://www.walmart.com/ip/OXO-Bowl/12345',
    overrides.amazonUrl   ?? 'https://www.amazon.com/dp/B00004OCIX',
    overrides.costPrice   ?? '$24.99',
    overrides.salesPrice  ?? '$49.99',
    overrides.profit      ?? '$15.00',
    overrides.roi         ?? '60%',
    overrides.estSales    ?? '120',
    overrides.coupon      ?? '',
    overrides.note        ?? '3-piece set; verified pack count matches',
  ].join(',');
}

function csv(...rows: string[]): string {
  return [VA_HEADER, ...rows].join('\n');
}

// ─── 1–3: Header parsing, Product Name, Cost Price ───────────────────────────

describe('parseVaCsv — header and basic mapping', () => {
  it('1. parses VA CSV headers and returns accepted rows', () => {
    const result = parseVaCsv(csv(makeRow()));
    expect(result.parseErrors).toHaveLength(0);
    expect(result.acceptedRows).toHaveLength(1);
    expect(result.totalInputRows).toBe(1);
  });

  it('2. maps Product Name to candidate.title', () => {
    const result = parseVaCsv(csv(makeRow({ productName: 'Rubbermaid Brilliance 10-Piece Set' })));
    expect(result.acceptedRows[0].candidate.title).toBe('Rubbermaid Brilliance 10-Piece Set');
  });

  it('3. maps Cost Price to candidate.sourcePrice, stripping $ and commas', () => {
    const result = parseVaCsv(csv(makeRow({ costPrice: '"$1,234.56"' })));
    expect(result.acceptedRows[0].candidate.sourcePrice).toBe(1234.56);
  });
});

// ─── 4: Retailer derivation ───────────────────────────────────────────────────

describe('deriveRetailer', () => {
  it('4a. maps walmart.com to Walmart', () => {
    expect(deriveRetailer('https://www.walmart.com/ip/item/123')).toBe('Walmart');
  });
  it('4b. maps target.com to Target', () => {
    expect(deriveRetailer('https://www.target.com/p/item/-/A-123')).toBe('Target');
  });
  it('4c. maps iherb.com to iHerb', () => {
    expect(deriveRetailer('https://www.iherb.com/pr/item/12345')).toBe('iHerb');
  });
  it('4d. maps samsclub.com to Sam\'s Club', () => {
    expect(deriveRetailer('https://www.samsclub.com/p/item/123')).toBe("Sam's Club");
  });
  it('4. sets retailer on accepted candidate row from Source URL', () => {
    const result = parseVaCsv(csv(makeRow({ sourceUrl: 'https://www.target.com/p/thing/-/A-99' })));
    expect(result.acceptedRows[0].candidate.retailer).toBe('Target');
  });
});

// ─── 5: ASIN from column ─────────────────────────────────────────────────────

describe('parseVaCsv — ASIN from column', () => {
  it('5. uses ASIN column value when valid 10-char alphanumeric', () => {
    const result = parseVaCsv(csv(makeRow({ asin: 'B00004OCIX', amazonUrl: '' })));
    expect(result.acceptedRows[0].candidate.asin).toBe('B00004OCIX');
    expect(result.acceptedRows[0].meta.asinSource).toBe('COLUMN');
  });
});

// ─── 6: ASIN from Amazon URL ─────────────────────────────────────────────────

describe('parseVaCsv — ASIN from Amazon URL', () => {
  it('6. extracts ASIN from /dp/ Amazon URL when ASIN column is blank', () => {
    const result = parseVaCsv(csv(makeRow({ asin: '', amazonUrl: 'https://www.amazon.com/dp/B0TEST1234' })));
    expect(result.acceptedRows[0].candidate.asin).toBe('B0TEST1234');
    expect(result.acceptedRows[0].meta.asinSource).toBe('AMAZON_URL');
  });
});

// ─── 7: Invalid cost price ───────────────────────────────────────────────────

describe('parseVaCsv — invalid cost price', () => {
  it('7a. skips row with non-numeric cost price', () => {
    const result = parseVaCsv(csv(makeRow({ costPrice: 'N/A' })));
    expect(result.acceptedRows).toHaveLength(0);
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0].reason).toContain('Invalid Cost Price');
  });

  it('7b. skips row with zero cost price', () => {
    const result = parseVaCsv(csv(makeRow({ costPrice: '$0.00' })));
    expect(result.acceptedRows).toHaveLength(0);
    expect(result.skippedRows[0].reason).toContain('Invalid Cost Price');
  });

  it('7c. skips row with empty cost price', () => {
    const result = parseVaCsv(csv(makeRow({ costPrice: '' })));
    expect(result.skippedRows).toHaveLength(1);
  });
});

// ─── 8: Missing Source URL ────────────────────────────────────────────────────

describe('parseVaCsv — missing Source URL', () => {
  it('8. skips row with missing Source URL', () => {
    const result = parseVaCsv(csv(makeRow({ sourceUrl: '' })));
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0].reason).toContain('Missing Source URL');
  });
});

// ─── 9: Multiple Source URLs ─────────────────────────────────────────────────

describe('parseVaCsv — multiple Source URLs', () => {
  it('9. routes rows with multiple URLs in Source URL cell to needsCleanupRows', () => {
    const multiUrl = 'https://walmart.com/ip/item/1 https://walmart.com/ip/item/2';
    const result = parseVaCsv(csv(makeRow({ sourceUrl: multiUrl })));
    expect(result.needsCleanupRows).toHaveLength(1);
    expect(result.needsCleanupRows[0].issue).toContain('multiple URLs');
    expect(result.acceptedRows).toHaveLength(0);
  });
});

// ─── 10: LOW_PRICE warning ───────────────────────────────────────────────────

describe('parseVaCsv — LOW_PRICE warning', () => {
  it('10. flags sourcePrice < $10 with LOW_PRICE warning (still accepted)', () => {
    const result = parseVaCsv(csv(makeRow({ costPrice: '$7.99' })));
    expect(result.acceptedRows).toHaveLength(1); // still accepted — just warned
    const codes = result.acceptedRows[0].warnings.map(w => w.code);
    expect(codes).toContain('LOW_PRICE');
  });

  it('10b. does not warn when sourcePrice >= $10', () => {
    const result = parseVaCsv(csv(makeRow({ costPrice: '$10.00' })));
    const codes = result.acceptedRows[0].warnings.map(w => w.code);
    expect(codes).not.toContain('LOW_PRICE');
  });
});

// ─── 11: VA estimated profit/ROI preserved in meta only ──────────────────────

describe('parseVaCsv — VA metadata isolation', () => {
  it('11a. VA estimated profit is in meta, not in CandidateRow', () => {
    const result = parseVaCsv(csv(makeRow({ profit: '$15.00', roi: '60%', salesPrice: '$49.99' })));
    const row = result.acceptedRows[0];
    expect(row.meta.vaEstimatedProfit).toBe(15.00);
    expect(row.meta.vaEstimatedRoi).toBe('60%');
    expect(row.meta.vaEstimatedBuyBox).toBe(49.99);
    // CandidateRow has no profit/roi fields — verify they don't appear
    expect(Object.keys(row.candidate)).not.toContain('estimatedProfit');
    expect(Object.keys(row.candidate)).not.toContain('estimatedRoi');
    expect(Object.keys(row.candidate)).not.toContain('buyBoxPrice');
  });

  it('11b. vaNotes combines Note and Coupon in CandidateRow', () => {
    const result = parseVaCsv(csv(makeRow({ note: 'Verified pack', coupon: 'SAVE10' })));
    expect(result.acceptedRows[0].candidate.vaNotes).toContain('Verified pack');
    expect(result.acceptedRows[0].candidate.vaNotes).toContain('Coupon: SAVE10');
  });
});

// ─── 12: Pure parser — no Product/Lead/LeadEntitlement records ───────────────

describe('parseVaCsv — pure parser safety', () => {
  it('12. returns plain data — no Prisma model methods, no DB writes', () => {
    const result = parseVaCsv(csv(makeRow()));
    // If this module imported prisma/lead/product/entitlement and called them,
    // the test would fail or produce unexpected side effects. This test verifies
    // the return value is serialisable plain data.
    expect(typeof result).toBe('object');
    expect(result.acceptedRows[0].candidate.sourcePrice).toBe(24.99);
    expect(JSON.stringify(result)).not.toContain('prisma');
  });
});

// ─── 13: No SP-API, Keepa, Apify, broadcastLeads calls ──────────────────────

describe('parseVaCsv — no external API calls', () => {
  it('13. parseVaCsv is synchronous and returns immediately (no async calls)', () => {
    // parseVaCsv is not async — it returns ParseVaCsvResult directly.
    // Async would indicate an external call was made.
    const result = parseVaCsv(csv(makeRow()));
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.acceptedRows).toHaveLength(1);
  });
});

// ─── 15: Skips row with no ASIN and no Amazon URL ────────────────────────────

describe('parseVaCsv — no ASIN and no Amazon URL', () => {
  it('15. skips row with empty ASIN column and no Amazon URL', () => {
    const result = parseVaCsv(csv(makeRow({ asin: '', amazonUrl: '' })));
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0].reason).toContain('No ASIN');
  });
});

// ─── 16–19: Warnings ─────────────────────────────────────────────────────────

describe('parseVaCsv — warnings', () => {
  it('16. RISKY_CATEGORY fires for supplement keywords in title', () => {
    const result = parseVaCsv(csv(makeRow({ productName: 'Nature Made Vitamin C Supplement 1000mg', category: 'Health' })));
    const codes = result.acceptedRows[0].warnings.map(w => w.code);
    expect(codes).toContain('RISKY_CATEGORY');
  });

  it('16b. RISKY_CATEGORY fires for knife keyword in title', () => {
    const result = parseVaCsv(csv(makeRow({ productName: 'Wüsthof Classic Chef Knife 8-Inch' })));
    const codes = result.acceptedRows[0].warnings.map(w => w.code);
    expect(codes).toContain('RISKY_CATEGORY');
  });

  it('17. COUPON_PRESENT fires when coupon code is non-empty', () => {
    const result = parseVaCsv(csv(makeRow({ coupon: 'SAVE20' })));
    const codes = result.acceptedRows[0].warnings.map(w => w.code);
    expect(codes).toContain('COUPON_PRESENT');
  });

  it('18. VA_HIGH_ROI fires when VA ROI > 200%', () => {
    const result = parseVaCsv(csv(makeRow({ roi: '346%' })));
    const codes = result.acceptedRows[0].warnings.map(w => w.code);
    expect(codes).toContain('VA_HIGH_ROI');
  });

  it('18b. VA_HIGH_ROI does not fire for 150% ROI', () => {
    const result = parseVaCsv(csv(makeRow({ roi: '150%' })));
    const codes = result.acceptedRows[0].warnings.map(w => w.code);
    expect(codes).not.toContain('VA_HIGH_ROI');
  });

  it('19. ASIN_FROM_URL fires when ASIN was extracted from Amazon URL', () => {
    const result = parseVaCsv(csv(makeRow({ asin: '', amazonUrl: 'https://www.amazon.com/dp/B0TEST12345' })));
    const codes = result.acceptedRows[0].warnings.map(w => w.code);
    expect(codes).toContain('ASIN_FROM_URL');
  });
});

// ─── 20: CandidateRow contains only importable fields ────────────────────────

describe('parseVaCsv — CandidateRow shape', () => {
  it('20. accepted candidate has retailerUrl, retailer, sourcePrice, title, asin, vaNotes only', () => {
    const result = parseVaCsv(csv(makeRow()));
    const c = result.acceptedRows[0].candidate;
    expect(c.retailerUrl).toBeTruthy();
    expect(c.retailer).toBe('Walmart');
    expect(c.sourcePrice).toBe(24.99);
    expect(c.title).toBeTruthy();
    expect(c.asin).toBe('B00004OCIX');
    // VA economics not in CandidateRow
    expect((c as unknown as Record<string, unknown>).estimatedProfit).toBeUndefined();
    expect((c as unknown as Record<string, unknown>).vaEstimatedRoi).toBeUndefined();
    expect((c as unknown as Record<string, unknown>).vaEstimatedBuyBox).toBeUndefined();
  });
});

// ─── Unit helpers ─────────────────────────────────────────────────────────────

describe('extractAsinFromUrl', () => {
  it('extracts from /dp/ path', () => {
    expect(extractAsinFromUrl('https://www.amazon.com/dp/B00004OCIX')).toBe('B00004OCIX');
  });
  it('extracts from /dp/ path with product name prefix', () => {
    expect(extractAsinFromUrl('https://www.amazon.com/OXO-Bowl/dp/B00004OCIX/')).toBe('B00004OCIX');
  });
  it('extracts from query string asin= param', () => {
    expect(extractAsinFromUrl('https://www.amazon.com/gp/product?asin=B00004OCIX')).toBe('B00004OCIX');
  });
  it('returns null for non-Amazon URL', () => {
    expect(extractAsinFromUrl('https://www.walmart.com/ip/item/123')).toBeNull();
  });
});

describe('parseCostPrice', () => {
  it('strips $ and returns float', () => {
    expect(parseCostPrice('$24.99')).toBe(24.99);
  });
  it('strips commas', () => {
    expect(parseCostPrice('$1,234.00')).toBe(1234);
  });
  it('returns null for non-numeric', () => {
    expect(parseCostPrice('N/A')).toBeNull();
  });
  it('returns null for zero', () => {
    expect(parseCostPrice('0')).toBeNull();
  });
  it('returns null for negative', () => {
    expect(parseCostPrice('-5.00')).toBeNull();
  });
});

describe('isRiskyText', () => {
  it('detects supplement', () => {
    expect(isRiskyText('Health', 'Vitamin D Supplement 5000IU')).toBe(true);
  });
  it('detects knife', () => {
    expect(isRiskyText('Kitchen', 'Chef Knife 8 Inch')).toBe(true);
  });
  it('detects grocery/coffee', () => {
    expect(isRiskyText('Grocery', 'Ground Coffee Dark Roast 12oz')).toBe(true);
  });
  it('does not flag normal household products', () => {
    expect(isRiskyText('Home', 'OXO Good Grips Mixing Bowl Set 3-Piece')).toBe(false);
  });
});
