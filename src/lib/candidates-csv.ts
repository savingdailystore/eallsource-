/**
 * CSV parser + column mapper for the VA candidate import sheet.
 * Reuses the same delimiter-detection and RFC-4180 parser from inventory/import.
 */

export interface CandidateRow {
  retailerUrl:    string;
  retailer:       string;
  sourcePrice:    number;
  title:          string;
  asin?:          string;
  upc?:           string;
  retailerItemId?: string;
  brand?:         string;
  sourceListPrice?: number;
  onSale?:        boolean;
  vaNotes?:       string;
}

// Normalize a header label to lowercase alphanumeric for alias matching.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const COLUMN_ALIASES: Record<keyof CandidateRow, string[]> = {
  retailerUrl:    ['retailerurl', 'retailer_url', 'sourceurl', 'producturl', 'url'],
  retailer:       ['retailer', 'store', 'source'],
  sourcePrice:    ['sourceprice', 'source_price', 'price', 'cost'],
  title:          ['title', 'productname', 'name', 'itemname', 'description'],
  asin:           ['asin', 'amazonasin'],
  upc:            ['upc', 'barcode', 'gtin'],
  retailerItemId: ['retaileritemid', 'retailer_item_id', 'itemid', 'walmart_item_id', 'dpci', 'tcin', 'target_item_id'],
  brand:          ['brand', 'manufacturer'],
  sourceListPrice:['sourcelistprice', 'source_list_price', 'listprice', 'wasprice', 'originalprice'],
  onSale:         ['onsale', 'on_sale', 'sale', 'clearance', 'rollback'],
  vaNotes:        ['vanotes', 'va_notes', 'notes', 'comments', 'comment'],
};

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

function mapHeaders(headers: string[]): Partial<Record<keyof CandidateRow, number>> {
  const normalized = headers.map(norm);
  const map: Partial<Record<keyof CandidateRow, number>> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof CandidateRow, string[]][]) {
    const idx = normalized.findIndex(h => aliases.includes(h));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

export interface ParseCandidatesCsvResult {
  rows:           CandidateRow[];
  skippedRows:    number;
  parseErrors:    string[];
  missingColumns: string[];
}

export function parseCandidatesCsv(csv: string): ParseCandidatesCsvResult {
  const raw = parseDelimited(csv, detectDelimiter(csv));
  if (raw.length < 2) {
    return { rows: [], skippedRows: 0, parseErrors: ['File needs a header row and at least one data row.'], missingColumns: [] };
  }

  const headerMap = mapHeaders(raw[0]);

  // Check required columns
  const required: (keyof CandidateRow)[] = ['retailerUrl', 'retailer', 'sourcePrice', 'title'];
  const missingColumns = required.filter(f => headerMap[f] === undefined);

  // Also accept: if none of (asin, upc) is present, that is allowed — they are optional.
  // But retailer_url is always required.
  if (missingColumns.length > 0) {
    return { rows: [], skippedRows: 0, parseErrors: [], missingColumns };
  }

  const cell = (row: string[], field: keyof CandidateRow): string | undefined => {
    const idx = headerMap[field];
    return idx === undefined ? undefined : row[idx]?.trim() || undefined;
  };

  const rows: CandidateRow[] = [];
  const parseErrors: string[] = [];
  let skippedRows = 0;

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    const retailerUrl = cell(row, 'retailerUrl');
    const retailer    = cell(row, 'retailer');
    const priceStr    = cell(row, 'sourcePrice');
    const title       = cell(row, 'title');

    if (!retailerUrl || !retailer || !title) { skippedRows++; continue; }

    const sourcePrice = parseFloat(priceStr ?? '');
    if (isNaN(sourcePrice) || sourcePrice <= 0) {
      parseErrors.push(`Row ${i + 1}: invalid source_price "${priceStr ?? ''}"`);
      skippedRows++;
      continue;
    }

    const onSaleRaw = cell(row, 'onSale');
    const onSale    = onSaleRaw !== undefined
      ? ['true', '1', 'yes', 'y'].includes(onSaleRaw.toLowerCase())
      : undefined;

    const slpRaw       = cell(row, 'sourceListPrice');
    const sourceListPrice = slpRaw ? parseFloat(slpRaw) : undefined;

    rows.push({
      retailerUrl,
      retailer,
      sourcePrice,
      title,
      asin:           cell(row, 'asin')?.toUpperCase() || undefined,
      upc:            cell(row, 'upc') || undefined,
      retailerItemId: cell(row, 'retailerItemId') || undefined,
      brand:          cell(row, 'brand') || undefined,
      sourceListPrice: (sourceListPrice !== undefined && !isNaN(sourceListPrice)) ? sourceListPrice : undefined,
      onSale,
      vaNotes:        cell(row, 'vaNotes') || undefined,
    });
  }

  return { rows, skippedRows, parseErrors, missingColumns: [] };
}

/** Strip query params, trailing slash, lowercase. */
export function normalizeRetailerUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.search = '';
    u.hash   = '';
    return u.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return raw.split('?')[0].replace(/\/$/, '').toLowerCase();
  }
}
