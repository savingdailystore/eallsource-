/**
 * VA CSV adapter — Phase 18.4b-Adapter
 *
 * Parses the VA's own sheet format and maps it to CandidateRow-compatible
 * data for SourceCandidate import. VA-estimated profit/ROI/sales are
 * treated as review-only metadata — EALLsource recalculates all economics.
 *
 * VA CSV columns:
 *   Product Name, ASIN, Category, Source URL, Amazon URL,
 *   Cost Price, Sales Price, Profit, R.O.I, Est Sales/M,
 *   Coupon Code, Note
 *
 * Safety invariants (enforced by structure — never imported):
 *   prisma / any Prisma model → not imported
 *   processRetailerProduct    → not imported
 *   broadcastLeads            → not imported
 *   SP-API / Keepa / Apify    → not imported
 *   No DB writes, no API calls — pure parser only.
 */

import type { CandidateRow } from './candidates-csv';

// ─── Public types ─────────────────────────────────────────────────────────────

export type VaWarningCode =
  | 'LOW_PRICE'       // sourcePrice < $10
  | 'RISKY_CATEGORY'  // supplements/medical/knives/grocery/hazmat/oversized
  | 'ASIN_FROM_URL'   // ASIN extracted from Amazon URL (not ASIN column)
  | 'VA_HIGH_ROI'     // VA estimated ROI > 200%
  | 'COUPON_PRESENT'; // coupon code present — true cost may differ

export interface VaWarning {
  code:    VaWarningCode;
  message: string;
}

/** VA-specific metadata — for pre-import review only; not stored in SourceCandidate. */
export interface VaReviewMeta {
  vaCategory?:               string;
  vaEstimatedBuyBox?:        number; // VA "Sales Price" column
  vaEstimatedProfit?:        number; // VA "Profit" column
  vaEstimatedRoi?:           string; // VA "R.O.I" column — kept as string
  vaEstimatedSalesPerMonth?: number; // VA "Est Sales/M" column
  couponCode?:               string;
  amazonUrl?:                string;
  asinSource?:               'COLUMN' | 'AMAZON_URL';
}

export interface VaReviewRow {
  rowNumber: number;
  candidate: CandidateRow;  // importable fields only
  meta:      VaReviewMeta;  // review-only, not persisted
  warnings:  VaWarning[];
}

export interface VaSkippedRow {
  rowNumber: number;
  rawTitle:  string;
  reason:    string;
}

export interface VaCleanupRow {
  rowNumber: number;
  rawTitle:  string;
  issue:     string;
  rawValue:  string;
}

export interface ParseVaCsvResult {
  acceptedRows:     VaReviewRow[];
  skippedRows:      VaSkippedRow[];
  needsCleanupRows: VaCleanupRow[];
  totalInputRows:   number;
  parseErrors:      string[];
}

// ─── Risky category detection ─────────────────────────────────────────────────

const RISKY_PATTERNS: RegExp[] = [
  /supplement/i, /vitamin/i, /probiotic/i, /protein.?powder/i, /collagen/i,
  /medical/i, /otc\b/i, /first.?aid/i, /pain.?relief/i, /antibiotic/i,
  /\bknife\b|knives|cutlery|\bblade\b|\bsteak knife/i,
  /hazmat|flammable|aerosol|\blithium.?batter/i,
  /\bgrocery\b|coffee\b|energy.?bar|protein.?bar|candy|snack|beverage|soda\b/i,
  /pet.?treat|dog.?treat|cat.?treat|rawhide/i,
  /oversized|freight|pallet|heavy.?duty.*(150|200)\s*lb/i,
];

export function isRiskyText(category: string, title: string): boolean {
  const text = `${category} ${title}`;
  return RISKY_PATTERNS.some(p => p.test(text));
}

// ─── Retailer derivation ──────────────────────────────────────────────────────

const DOMAIN_RETAILER: [RegExp, string][] = [
  [/walmart\.com/i,    'Walmart'],
  [/target\.com/i,     'Target'],
  [/iherb\.com/i,      'iHerb'],
  [/kroger\.com/i,     'Kroger'],
  [/costco\.com/i,     'Costco'],
  [/samsclub\.com/i,   "Sam's Club"],
  [/bjs\.com/i,        'BJs'],
  [/biglots\.com/i,    'Big Lots'],
  [/staples\.com/i,    'Staples'],
  [/homedepot\.com/i,  'Home Depot'],
  [/lowes\.com/i,      "Lowe's"],
  [/cvs\.com/i,        'CVS'],
  [/walgreens\.com/i,  'Walgreens'],
  [/bestbuy\.com/i,    'Best Buy'],
  [/chewy\.com/i,      'Chewy'],
  [/petsmart\.com/i,   'PetSmart'],
];

export function deriveRetailer(url: string): string {
  for (const [pattern, name] of DOMAIN_RETAILER) {
    if (pattern.test(url)) return name;
  }
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const base = host.split('.')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return 'Unknown';
  }
}

// ─── ASIN extraction ──────────────────────────────────────────────────────────

export function extractAsinFromUrl(amazonUrl: string): string | null {
  const m =
    amazonUrl.match(/\/dp\/([A-Z0-9]{10})/i) ??
    amazonUrl.match(/\/product\/([A-Z0-9]{10})/i) ??
    amazonUrl.match(/[?&]asin=([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

// ─── Cost price parsing ───────────────────────────────────────────────────────

export function parseCostPrice(raw: string): number | null {
  const n = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(n) || n <= 0 ? null : n;
}

// ─── Multiple-URL detection ───────────────────────────────────────────────────

function hasMultipleUrls(cell: string): boolean {
  return (cell.match(/https?:\/\//g) ?? []).length > 1;
}

// ─── CSV parsing (self-contained, not imported from candidates-csv) ───────────

function detectDelimiter(text: string): ',' | '\t' {
  const first = text.split('\n').find(l => l.trim() !== '') ?? '';
  return (first.match(/\t/g) ?? []).length > (first.match(/,/g) ?? []).length ? '\t' : ',';
}

function parseDelimited(text: string, delimiter: ',' | '\t'): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delimiter) { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

// ─── Column mapping ───────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

type VaCol =
  | 'productname' | 'asin' | 'category' | 'sourceurl' | 'amazonurl'
  | 'costprice' | 'salesprice' | 'profit' | 'roi' | 'estsalesm'
  | 'couponcode' | 'note';

const VA_ALIASES: Record<VaCol, string[]> = {
  productname: ['productname', 'product_name', 'name', 'title'],
  asin:        ['asin', 'amazonasin', 'asin#'],
  category:    ['category', 'cat'],
  sourceurl:   ['sourceurl', 'source_url', 'sourcelink', 'source_link', 'storeurl', 'store_url', 'retailerurl', 'retailer_url'],
  amazonurl:   ['amazonurl', 'amazon_url', 'amazonlink', 'amazon_link', 'amazonproducturl'],
  costprice:   ['costprice', 'cost_price', 'cost', 'sourceprice', 'source_price', 'buyprice', 'buycost'],
  salesprice:  ['salesprice', 'sales_price', 'sellprice', 'sell_price', 'amazonprice', 'amazon_price', 'price'],
  profit:      ['profit', 'estprofit', 'est_profit', 'estimatedprofit'],
  roi:         ['roi', 'roi%', 'roi_percent', 'return'],
  estsalesm:   ['estsalesm', 'estsales', 'est_sales', 'estsalesmonth', 'monthlysales', 'salesmonth'],
  couponcode:  ['couponcode', 'coupon_code', 'coupon', 'promocode'],
  note:        ['note', 'notes', 'vanotes', 'va_notes', 'comments'],
};

function mapVaHeaders(headers: string[]): Partial<Record<VaCol, number>> {
  const normalized = headers.map(norm);
  const map: Partial<Record<VaCol, number>> = {};
  for (const [col, aliases] of Object.entries(VA_ALIASES) as [VaCol, string[]][]) {
    const idx = normalized.findIndex(h => aliases.includes(h));
    if (idx !== -1) map[col] = idx;
  }
  return map;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseVaCsv(csv: string): ParseVaCsvResult {
  const raw = parseDelimited(csv, detectDelimiter(csv));

  if (raw.length < 2) {
    return {
      acceptedRows: [], skippedRows: [], needsCleanupRows: [],
      totalInputRows: 0,
      parseErrors: ['File needs a header row and at least one data row.'],
    };
  }

  const colMap   = mapVaHeaders(raw[0]);
  const dataRows = raw.slice(1);

  const cell = (row: string[], col: VaCol): string =>
    colMap[col] !== undefined ? (row[colMap[col]!]?.trim() ?? '') : '';

  const accepted:  VaReviewRow[]   = [];
  const skipped:   VaSkippedRow[]  = [];
  const cleanup:   VaCleanupRow[]  = [];
  const parseErrors: string[]      = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row      = dataRows[i];
    const rowNum   = i + 2;
    const rawTitle = cell(row, 'productname') || `Row ${rowNum}`;
    const rawSrc   = cell(row, 'sourceurl');
    const rawCost  = cell(row, 'costprice');

    // ── Hard skips ────────────────────────────────────────────────────────────

    if (!rawTitle || rawTitle === `Row ${rowNum}`) {
      skipped.push({ rowNumber: rowNum, rawTitle, reason: 'Missing product name' });
      continue;
    }
    if (!rawSrc) {
      skipped.push({ rowNumber: rowNum, rawTitle, reason: 'Missing Source URL' });
      continue;
    }

    // Multiple URLs in source cell → needs cleanup
    if (hasMultipleUrls(rawSrc)) {
      cleanup.push({
        rowNumber: rowNum, rawTitle,
        issue:    'Source URL cell contains multiple URLs — cannot determine single retailer listing',
        rawValue: rawSrc.slice(0, 200),
      });
      continue;
    }

    // Invalid cost price
    const sourcePrice = parseCostPrice(rawCost);
    if (sourcePrice === null) {
      skipped.push({
        rowNumber: rowNum, rawTitle,
        reason: `Invalid Cost Price "${rawCost}" — must be a positive number`,
      });
      continue;
    }

    // ── ASIN resolution ───────────────────────────────────────────────────────

    const rawAsinCell = cell(row, 'asin').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const rawAmazonUrl = cell(row, 'amazonurl');
    let asin: string | undefined;
    let asinSource: VaReviewMeta['asinSource'];

    if (rawAsinCell.length === 10) {
      asin = rawAsinCell;
      asinSource = 'COLUMN';
    } else if (rawAmazonUrl) {
      const extracted = extractAsinFromUrl(rawAmazonUrl);
      if (extracted) { asin = extracted; asinSource = 'AMAZON_URL'; }
    }

    if (!asin) {
      skipped.push({
        rowNumber: rowNum, rawTitle,
        reason: 'No ASIN in ASIN column and no valid ASIN extractable from Amazon URL — row requires one of: ASIN, Amazon URL with ASIN',
      });
      continue;
    }

    // ── Derived fields ────────────────────────────────────────────────────────

    // Take only the first URL if cell accidentally has newline-separated extras
    const retailerUrl = rawSrc.split('\n')[0].trim();
    const retailer    = deriveRetailer(retailerUrl);
    const category    = cell(row, 'category');
    const rawNote     = cell(row, 'note');
    const couponCode  = cell(row, 'couponcode') || undefined;

    const noteParts: string[] = [];
    if (rawNote)    noteParts.push(rawNote);
    if (couponCode) noteParts.push(`Coupon: ${couponCode}`);
    const vaNotes = noteParts.length > 0 ? noteParts.join('; ') : undefined;

    // ── VA review metadata (not imported) ────────────────────────────────────

    const vaEstimatedBuyBox        = parseCostPrice(cell(row, 'salesprice')) ?? undefined;
    const vaEstimatedProfit        = parseCostPrice(cell(row, 'profit')) ?? undefined;
    const rawRoi                   = cell(row, 'roi');
    const rawEstSales              = cell(row, 'estsalesm');
    const vaEstimatedSalesPerMonth = parseInt(rawEstSales, 10) || undefined;

    const meta: VaReviewMeta = {
      vaCategory:               category || undefined,
      vaEstimatedBuyBox,
      vaEstimatedProfit,
      vaEstimatedRoi:           rawRoi  || undefined,
      vaEstimatedSalesPerMonth,
      couponCode,
      amazonUrl:                rawAmazonUrl || undefined,
      asinSource,
    };

    // ── CandidateRow (importable fields only) ─────────────────────────────────

    const candidate: CandidateRow = {
      retailerUrl,
      retailer,
      sourcePrice,
      title: rawTitle,
      asin,
      vaNotes,
    };

    // ── Warnings ──────────────────────────────────────────────────────────────

    const warnings: VaWarning[] = [];

    if (sourcePrice < 10) {
      warnings.push({
        code: 'LOW_PRICE',
        message: `Source price $${sourcePrice.toFixed(2)} is below $10 — unlikely to clear the $12 Amazon resale floor after fees`,
      });
    }

    if (isRiskyText(category, rawTitle)) {
      warnings.push({
        code: 'RISKY_CATEGORY',
        message: `Product title or category "${category || '(none)'}" may indicate a restricted/risky category (supplements, medical, knives, grocery, hazmat, oversized)`,
      });
    }

    if (asinSource === 'AMAZON_URL') {
      warnings.push({
        code: 'ASIN_FROM_URL',
        message: `ASIN "${asin}" extracted from Amazon URL — verify it matches the exact product listing before certifying`,
      });
    }

    if (couponCode) {
      warnings.push({
        code: 'COUPON_PRESENT',
        message: `Coupon code "${couponCode}" present — source price may not reflect true landed cost; coupon is not factored into EALLsource economics`,
      });
    }

    if (rawRoi) {
      const roiNum = parseFloat(rawRoi.replace(/[%,\s]/g, ''));
      if (!isNaN(roiNum) && roiNum > 200) {
        warnings.push({
          code: 'VA_HIGH_ROI',
          message: `VA estimated ROI ${rawRoi} exceeds 200% — verify independently; SP-API/Keepa will recalculate`,
        });
      }
    }

    accepted.push({ rowNumber: rowNum, candidate, meta, warnings });
  }

  return {
    acceptedRows:     accepted,
    skippedRows:      skipped,
    needsCleanupRows: cleanup,
    totalInputRows:   dataRows.length,
    parseErrors,
  };
}
