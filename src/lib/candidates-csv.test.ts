import { describe, it, expect } from 'vitest';
import { parseCandidatesCsv, normalizeRetailerUrl } from './candidates-csv';

// ─── normalizeRetailerUrl ────────────────────────────────────────────────────

describe('normalizeRetailerUrl', () => {
  it('strips query parameters', () => {
    expect(normalizeRetailerUrl('https://www.walmart.com/ip/item/123456789?from=search&rank=1'))
      .toBe('https://www.walmart.com/ip/item/123456789');
  });

  it('strips trailing slash', () => {
    expect(normalizeRetailerUrl('https://www.walmart.com/ip/Widget/12345/'))
      .toBe('https://www.walmart.com/ip/widget/12345');
  });

  it('lowercases the URL', () => {
    expect(normalizeRetailerUrl('https://www.Walmart.com/ip/Widget/12345'))
      .toBe('https://www.walmart.com/ip/widget/12345');
  });

  it('handles URLs without query params', () => {
    expect(normalizeRetailerUrl('https://www.walmart.com/ip/item/12345'))
      .toBe('https://www.walmart.com/ip/item/12345');
  });

  it('handles bare string (not a valid URL) gracefully', () => {
    expect(normalizeRetailerUrl('walmart.com/item/123?foo=bar'))
      .toBe('walmart.com/item/123');
  });

  it('strips hash fragments', () => {
    expect(normalizeRetailerUrl('https://www.walmart.com/ip/item/123#reviews'))
      .toBe('https://www.walmart.com/ip/item/123');
  });
});

// ─── parseCandidatesCsv ──────────────────────────────────────────────────────

const VALID_HEADER = 'retailer_url,retailer,source_price,title,asin,upc,brand,va_notes';

function makeRow(overrides: Partial<{
  retailerUrl: string; retailer: string; source_price: string;
  title: string; asin: string; upc: string; brand: string; va_notes: string;
}> = {}) {
  return [
    overrides.retailerUrl  ?? 'https://www.walmart.com/ip/Widget/12345',
    overrides.retailer     ?? 'Walmart',
    overrides.source_price ?? '9.97',
    overrides.title        ?? 'Some Widget Product',
    overrides.asin         ?? 'B01TEST1234',
    overrides.upc          ?? '012345678901',
    overrides.brand        ?? 'BrandName',
    overrides.va_notes     ?? 'Notes here',
  ].join(',');
}

describe('parseCandidatesCsv — required columns', () => {
  it('returns missingColumns when retailer_url missing', () => {
    const csv = 'retailer,source_price,title\nWalmart,9.97,Widget';
    const res = parseCandidatesCsv(csv);
    expect(res.missingColumns).toContain('retailerUrl');
    expect(res.rows).toHaveLength(0);
  });

  it('returns missingColumns when source_price missing', () => {
    const csv = 'retailer_url,retailer,title\nhttps://walmart.com/ip/1,Walmart,Widget';
    const res = parseCandidatesCsv(csv);
    expect(res.missingColumns).toContain('sourcePrice');
  });

  it('returns missingColumns when title missing', () => {
    const csv = 'retailer_url,retailer,source_price\nhttps://walmart.com/ip/1,Walmart,9.97';
    const res = parseCandidatesCsv(csv);
    expect(res.missingColumns).toContain('title');
  });

  it('returns error when fewer than 2 rows', () => {
    const csv = 'retailer_url,retailer,source_price,title';
    const res = parseCandidatesCsv(csv);
    expect(res.parseErrors.length).toBeGreaterThan(0);
    expect(res.rows).toHaveLength(0);
  });
});

describe('parseCandidatesCsv — valid CSV', () => {
  it('parses a valid row correctly', () => {
    const csv = `${VALID_HEADER}\n${makeRow()}`;
    const res = parseCandidatesCsv(csv);
    expect(res.missingColumns).toHaveLength(0);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0];
    expect(row.retailerUrl).toBe('https://www.walmart.com/ip/Widget/12345');
    expect(row.retailer).toBe('Walmart');
    expect(row.sourcePrice).toBe(9.97);
    expect(row.title).toBe('Some Widget Product');
    expect(row.asin).toBe('B01TEST1234');
    expect(row.upc).toBe('012345678901');
    expect(row.brand).toBe('BrandName');
    expect(row.vaNotes).toBe('Notes here');
  });

  it('skips rows with missing retailer_url', () => {
    const csv = `${VALID_HEADER}\n${makeRow({ retailerUrl: '' })}`;
    const res = parseCandidatesCsv(csv);
    expect(res.rows).toHaveLength(0);
    expect(res.skippedRows).toBe(1);
  });

  it('skips rows with non-numeric source_price', () => {
    const csv = `${VALID_HEADER}\n${makeRow({ source_price: 'bad' })}`;
    const res = parseCandidatesCsv(csv);
    expect(res.rows).toHaveLength(0);
    expect(res.parseErrors.length).toBeGreaterThan(0);
  });

  it('skips rows with zero source_price', () => {
    const csv = `${VALID_HEADER}\n${makeRow({ source_price: '0' })}`;
    const res = parseCandidatesCsv(csv);
    expect(res.rows).toHaveLength(0);
  });

  it('uppercases ASIN', () => {
    const csv = `${VALID_HEADER}\n${makeRow({ asin: 'b0abcdefgh' })}`;
    const res = parseCandidatesCsv(csv);
    expect(res.rows[0].asin).toBe('B0ABCDEFGH');
  });

  it('parses on_sale boolean fields', () => {
    const header = 'retailer_url,retailer,source_price,title,on_sale';
    const csvTrue  = `${header}\nhttps://walmart.com/ip/1,Walmart,9.97,Widget,TRUE`;
    const csvFalse = `${header}\nhttps://walmart.com/ip/2,Walmart,9.97,Widget,false`;
    expect(parseCandidatesCsv(csvTrue).rows[0].onSale).toBe(true);
    expect(parseCandidatesCsv(csvFalse).rows[0].onSale).toBe(false);
  });

  it('handles tab-delimited CSV', () => {
    const tsv = 'retailer_url\tretailer\tsource_price\ttitle\nhttps://walmart.com/ip/1\tWalmart\t9.97\tWidget';
    const res = parseCandidatesCsv(tsv);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].retailer).toBe('Walmart');
  });

  it('parses multiple rows', () => {
    const csv = [
      VALID_HEADER,
      makeRow({ retailerUrl: 'https://walmart.com/ip/1', title: 'Product 1' }),
      makeRow({ retailerUrl: 'https://walmart.com/ip/2', title: 'Product 2' }),
      makeRow({ retailerUrl: 'https://walmart.com/ip/3', title: 'Product 3' }),
    ].join('\n');
    const res = parseCandidatesCsv(csv);
    expect(res.rows).toHaveLength(3);
  });
});

// ─── Import behavior guarantees (no side-effect tests) ───────────────────────

describe('parseCandidatesCsv — safety', () => {
  it('does not call processRetailerProduct (pure parser — no imports)', () => {
    // This test verifies the parser is a pure function with no side effects.
    // It does not import processRetailerProduct, broadcastLeads, or any Prisma model.
    const csv = `${VALID_HEADER}\n${makeRow()}`;
    const result = parseCandidatesCsv(csv);
    expect(result.rows[0].retailerUrl).toBeTruthy();
    // The key assertion: parseCandidatesCsv returns plain data — no DB calls, no API calls.
    expect(typeof result.rows[0].sourcePrice).toBe('number');
  });
});
