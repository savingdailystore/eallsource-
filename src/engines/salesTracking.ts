// Sales Tracking Engine — pure functions, no DB, no framework imports.
//
// DATA HONESTY RULES (enforced here):
//  - Never fabricate fees. If the import report has no fee columns, fees stay null.
//  - Never show "realized profit" when totalFees is null — use "gross profit before fees" instead.
//  - Never fabricate unit cost. If no cost data found, cogs/profit/roi all stay null.
//  - grossProfitBeforeFees is NOT the same as realizedProfit — label them distinctly.
//  - rawPayload is preserved verbatim — never modified.
//  - Parser uses header-based column mapping — no positional assumptions.

// ─── Types ──────────────────────────────────────────────────────────────────

export type CostSource = 'PO_ITEM' | 'INVENTORY' | 'REPRICING' | 'PRODUCT';

export interface ParsedSaleRow {
  // Dedup
  dedupKey:      string;    // computed; always set
  orderItemId:   string | null;
  amazonOrderId: string | null;

  // Identity
  asin:        string | null;
  sku:         string | null;
  productName: string | null;

  // Sale
  saleDate:         Date;
  quantitySold:     number;
  grossRevenue:     number;   // item-price total (all units combined)
  itemTax:          number | null;
  promotionDiscount: number | null;
  netRevenue:       number;   // grossRevenue − (promotionDiscount ?? 0)

  // Metadata
  fulfillmentChannel: string | null;
  orderStatus:        string | null;

  rawPayload: Record<string, string>;
}

export interface SalesParseResult {
  rows:            ParsedSaleRow[];
  errors:          SalesParseError[];
  total:           number;   // rows attempted (including errors)
  skipped:         number;   // rows skipped due to non-Shipped / cancelled status
  currencySkipped: number;   // rows skipped due to unsupported (non-USD) currency
}

export interface SalesParseError {
  rowIndex: number;
  raw:      Record<string, string>;
  message:  string;
}

export interface SaleCostLookup {
  // Ordered by priority (highest first)
  poItemUnitCost:          number | null;
  inventoryUnitCost:       number | null;
  repricingCostBasis:      number | null;
  productTotalLandedCost:  number | null;
  productSourcePrice:      number | null;
}

export interface ComputedSaleProfit {
  unitCostUsed:         number | null;
  costSource:           CostSource | null;
  cogs:                 number | null;
  grossProfitBeforeFees: number | null;
  grossRoiBeforeFees:   number | null;
  realizedProfit:       number | null;  // only set when totalFees is known
  roi:                  number | null;  // based on realizedProfit only
}

export interface SaleRecordForBI {
  saleDate:              Date;
  quantitySold:          number;
  grossRevenue:          number;
  netRevenue:            number;
  totalFees:             number | null;
  cogs:                  number | null;
  grossProfitBeforeFees: number | null;
  realizedProfit:        number | null;
  roi:                   number | null;
  asin:                  string | null;
  sku:                   string | null;
  unitCostUsed:          number | null;
  costSource:            string | null;
}

export interface SalesSummary {
  totalRecords:          number;
  totalUnitsSold:        number;
  totalGrossRevenue:     number;
  totalNetRevenue:       number;
  // Profit aggregates — only populated when at least some records have the relevant data
  totalCogs:             number | null;  // null when zero records have cost data
  totalGrossProfitBeforeFees: number | null;
  totalRealizedProfit:   number | null;  // null when zero records have fee data
  avgRoi:                number | null;
  // Data quality counts
  recordsWithCost:       number;
  recordsMissingCost:    number;
  recordsWithFees:       number;
  recordsMissingFees:    number;
  // Top ASIN by units
  topAsin:               string | null;
  lastSaleDate:          Date | null;
  lastSyncAt:            Date | null;
  lastSyncStatus:        string | null;
  lastSyncSource:        string | null;
  hasData:               boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectDelimiter(line: string): '\t' | ',' {
  const tabs   = (line.match(/\t/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  return tabs >= commas ? '\t' : ',';
}

function parsePositiveFloat(val: string | undefined): number | null {
  if (val == null || val.trim() === '') return null;
  const n = parseFloat(val.replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
}

function parseNonNegativeFloat(val: string | undefined): number | null {
  const n = parsePositiveFloat(val);
  return n !== null && n >= 0 ? n : null;
}

function parseDate(val: string | undefined): Date | null {
  if (!val || val.trim() === '') return null;
  // Amazon uses ISO-8601 in orders reports: "2024-03-15T10:00:00+00:00"
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? null : d;
}

function nullIfEmpty(val: string | undefined): string | null {
  if (val == null || val.trim() === '') return null;
  return val.trim();
}

// ─── Parser ──────────────────────────────────────────────────────────────────

// Amazon flat-file orders report (GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_DATE)
// Maps lower-cased, trimmed column headers to internal fields.
// Both 'quantity' and 'quantity-purchased' appear in different report versions.
const ORDERS_QUANTITY_COLS = new Set(['quantity', 'quantity-purchased', 'quantity-shipped']);

// Statuses to skip — Cancelled orders generate no revenue
const SKIP_STATUSES = new Set(['Cancelled', 'Pending', 'PendingAvailability', 'Unshipped']);

// Only USD is supported — non-USD amounts must not be stored as if they were USD
const SUPPORTED_CURRENCIES = new Set(['USD']);

// Amazon Fulfilled Shipments report uses title-case space-separated headers.
// After lowercase + space→hyphen normalization these still differ from the flat-file
// field names the parser reads, so map them to canonical keys here.
const ORDERS_HEADER_ALIASES: Record<string, string> = {
  'amazon-order-item-id':   'order-item-id',          // Fulfilled Shipments → flat-file
  'merchant-sku':           'sku',
  'shipped-quantity':       'quantity-shipped',
  'item-promo-discount':    'item-promotion-discount',
  'shipment-promo-discount':'ship-promotion-discount',
};

/**
 * Parse a raw TSV or CSV string from the Amazon flat-file orders report.
 * Supports both lower-case/hyphenated flat-file headers and the title-case
 * space-separated Amazon Fulfilled Shipments report format.
 * Cancelled/Pending orders are skipped (counted in `skipped`).
 * Safe to call with empty or whitespace-only input.
 */
export function parseSalesReport(raw: string): SalesParseResult {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');

  if (lines.length === 0) {
    return { rows: [], errors: [], total: 0, skipped: 0, currencySkipped: 0 };
  }

  const delimiter = detectDelimiter(lines[0]);
  // Normalize: lowercase, spaces→hyphens, then resolve aliases to canonical names
  const headers = lines[0]
    .split(delimiter)
    .map((h) => {
      const normalized = h.trim().toLowerCase().replace(/\s+/g, '-');
      return ORDERS_HEADER_ALIASES[normalized] ?? normalized;
    });

  // Detect which quantity column is present
  const qtyCol = headers.find((h) => ORDERS_QUANTITY_COLS.has(h)) ?? null;

  const rows:    ParsedSaleRow[]   = [];
  const errors:  SalesParseError[] = [];
  let   skipped         = 0;
  let   currencySkipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delimiter);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = (cells[idx] ?? '').trim(); });

    try {
      // Skip non-revenue orders
      const status = nullIfEmpty(raw['order-status']);
      if (status && SKIP_STATUSES.has(status)) {
        skipped++;
        continue;
      }

      // Skip non-USD rows — storing MXN/CAD/etc amounts as if USD would corrupt revenue figures
      const currency = nullIfEmpty(raw['currency']) ?? nullIfEmpty(raw['item-price-currency']);
      if (currency && !SUPPORTED_CURRENCIES.has(currency)) {
        currencySkipped++;
        continue;
      }

      const amazonOrderId = nullIfEmpty(raw['amazon-order-id']);
      if (!amazonOrderId) throw new Error('Missing amazon-order-id');

      const saleDate = parseDate(raw['purchase-date'] ?? raw['last-updated-date']);
      if (!saleDate) throw new Error(`Invalid purchase-date: "${raw['purchase-date']}"`);

      // Quantity
      const qtyVal = qtyCol ? raw[qtyCol] : undefined;
      const qtyRaw = parseNonNegativeFloat(qtyVal);
      if (qtyRaw === null || qtyRaw === 0) throw new Error(`Invalid quantity: "${qtyVal}"`);
      const quantitySold = Math.round(qtyRaw);

      // Revenue
      const grossRevenue = parseNonNegativeFloat(raw['item-price']);
      if (grossRevenue === null) throw new Error(`Invalid item-price: "${raw['item-price']}"`);

      const itemTax            = parseNonNegativeFloat(raw['item-tax']);
      const itemPromoDis       = parseNonNegativeFloat(raw['item-promotion-discount']);
      const shipPromoDis       = parseNonNegativeFloat(raw['ship-promotion-discount']);

      // Sum promotions only when at least one is present
      let promotionDiscount: number | null = null;
      if (itemPromoDis !== null || shipPromoDis !== null) {
        promotionDiscount = (itemPromoDis ?? 0) + (shipPromoDis ?? 0);
      }

      const netRevenue = grossRevenue - (promotionDiscount ?? 0);

      // Identity
      const asin        = nullIfEmpty(raw['asin']);
      const sku         = nullIfEmpty(raw['sku']);
      const productName = nullIfEmpty(raw['product-name']);
      const orderItemId = nullIfEmpty(raw['order-item-id']);

      // Dedup key: prefer order-item-id; fall back to stable composite
      const dedupKey = orderItemId
        ?? `${amazonOrderId}#${asin ?? ''}#${sku ?? ''}#${i}`;

      rows.push({
        dedupKey,
        orderItemId,
        amazonOrderId,
        asin,
        sku,
        productName,
        saleDate,
        quantitySold,
        grossRevenue,
        itemTax,
        promotionDiscount,
        netRevenue,
        fulfillmentChannel: nullIfEmpty(raw['fulfillment-channel']),
        orderStatus:        status,
        rawPayload:         raw,
      });

    } catch (err) {
      errors.push({
        rowIndex: i,
        raw,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { rows, errors, total: lines.length - 1, skipped, currencySkipped };
}

// ─── Cost resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the best available unit cost using the established priority chain:
 *   PurchaseOrderItem.unitCost → InventoryItem.unitCost →
 *   RepricingRule.costBasis → Product.totalLandedCost → Product.sourcePrice
 */
export function resolveSaleCost(lookup: SaleCostLookup): {
  cost:   number | null;
  source: CostSource | null;
} {
  if (lookup.poItemUnitCost != null)         return { cost: lookup.poItemUnitCost,         source: 'PO_ITEM'   };
  if (lookup.inventoryUnitCost != null)      return { cost: lookup.inventoryUnitCost,       source: 'INVENTORY' };
  if (lookup.repricingCostBasis != null)     return { cost: lookup.repricingCostBasis,      source: 'REPRICING' };
  if (lookup.productTotalLandedCost != null) return { cost: lookup.productTotalLandedCost,  source: 'PRODUCT'   };
  if (lookup.productSourcePrice != null)     return { cost: lookup.productSourcePrice,       source: 'PRODUCT'   };
  return { cost: null, source: null };
}

// ─── Profit computation ──────────────────────────────────────────────────────

/**
 * Compute all profit metrics for a single sale row.
 *
 * Rules:
 * - cogs requires unitCost
 * - grossProfitBeforeFees requires netRevenue + cogs
 * - realizedProfit requires netRevenue + totalFees (not null) + cogs
 * - roi is based on realizedProfit / cogs (never on grossProfit)
 * - grossRoiBeforeFees is separate — based on grossProfitBeforeFees / cogs
 * - Never substitute 0 for a null fee
 */
export function computeSaleProfit(
  netRevenue:   number,
  quantitySold: number,
  totalFees:    number | null,
  costResolved: { cost: number | null; source: CostSource | null },
): ComputedSaleProfit {
  const { cost: unitCostUsed, source: costSource } = costResolved;

  const cogs = unitCostUsed !== null ? round2(unitCostUsed * quantitySold) : null;

  const grossProfitBeforeFees =
    cogs !== null ? round2(netRevenue - cogs) : null;

  const grossRoiBeforeFees =
    grossProfitBeforeFees !== null && cogs !== null && cogs > 0
      ? round2((grossProfitBeforeFees / cogs) * 100)
      : null;

  // Realized profit requires fees — never use 0 as a substitute for null fees
  const realizedProfit =
    cogs !== null && totalFees !== null
      ? round2(netRevenue - totalFees - cogs)
      : null;

  const roi =
    realizedProfit !== null && cogs !== null && cogs > 0
      ? round2((realizedProfit / cogs) * 100)
      : null;

  return {
    unitCostUsed,
    costSource,
    cogs,
    grossProfitBeforeFees,
    grossRoiBeforeFees,
    realizedProfit,
    roi,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Profit status ───────────────────────────────────────────────────────────

export type ProfitStatus = 'COMPLETE' | 'GROSS_ONLY' | 'MISSING_COST' | 'NO_PROFIT_DATA' | 'INCOMPLETE';

/**
 * Derive a single profit-completeness status from the key financial fields on a
 * sale record.  Uses only fields that are already stored — no re-computation.
 *
 * COMPLETE       — cost + fees + realizedProfit all present → true realized profit available
 * GROSS_ONLY     — cost present, fees null, grossProfitBeforeFees present → show gross estimate only
 * MISSING_COST   — fees present, cost null → profit uncomputable despite having fees
 * NO_PROFIT_DATA — neither cost nor fees present
 * INCOMPLETE     — cost + fees present but realizedProfit null → edge case, cannot show any profit
 */
export function getSaleProfitStatus(row: {
  unitCostUsed:   number | null;
  totalFees:      number | null;
  realizedProfit: number | null;
}): ProfitStatus {
  const hasCost   = row.unitCostUsed   !== null;
  const hasFees   = row.totalFees      !== null;
  const hasProfit = row.realizedProfit !== null;

  if (hasCost && hasFees && hasProfit)  return 'COMPLETE';
  if (hasCost && hasFees && !hasProfit) return 'INCOMPLETE';  // fees present but realized profit missing
  if (hasCost && !hasFees)              return 'GROSS_ONLY';
  if (!hasCost && hasFees)              return 'MISSING_COST';
  return 'NO_PROFIT_DATA';
}

// ─── Sales filter ─────────────────────────────────────────────────────────────

export type SalesFilter =
  | 'all'
  | 'complete'
  | 'gross-only'
  | 'missing-fees'
  | 'missing-cost'
  | 'no-profit-data'
  | 'incomplete';

const VALID_SALES_FILTERS: readonly string[] = [
  'all', 'complete', 'gross-only', 'missing-fees',
  'missing-cost', 'no-profit-data', 'incomplete',
];

export function parseSalesFilter(raw: string | null | undefined): SalesFilter {
  return VALID_SALES_FILTERS.includes(raw as string) ? (raw as SalesFilter) : 'all';
}

export function applySalesFilter<T extends {
  unitCostUsed:   number | null;
  totalFees:      number | null;
  realizedProfit: number | null;
}>(rows: T[], filter: SalesFilter): T[] {
  if (filter === 'all') return rows;
  return rows.filter((r) => {
    switch (filter) {
      case 'complete':       return getSaleProfitStatus(r) === 'COMPLETE';
      case 'gross-only':     return getSaleProfitStatus(r) === 'GROSS_ONLY';
      case 'missing-fees':   return r.totalFees === null;
      case 'missing-cost':   return r.unitCostUsed === null;
      case 'no-profit-data': return getSaleProfitStatus(r) === 'NO_PROFIT_DATA';
      case 'incomplete':     return getSaleProfitStatus(r) === 'INCOMPLETE';
    }
  });
}

// ─── Settlement report parsing ────────────────────────────────────────────────

// Amazon GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE
// One row per transaction event. Must be grouped by order-item-code to aggregate fees.

const REFERRAL_FEE_TYPES = new Set(['Commission']);
const FBA_FEE_TYPES      = new Set(['FBAPerUnitFulfillmentFee', 'FBAPerOrderFulfillmentFee']);
// All other item-related-fee-type / ItemFees amount-description values → otherFees

const ORDER_TRANSACTION_TYPES   = new Set(['Order']);
const REFUND_TRANSACTION_TYPES  = new Set(['Refund']);
// Everything else: Adjustment, Transfer, ServiceFee, Debt, other-transaction → unsupported in MVP

// V2 flat-file amount-type values
const AMOUNT_TYPE_FEES  = 'ItemFees';
const AMOUNT_TYPE_PRICE = 'ItemPrice';

// Known header aliases — supports both V1 (item-related-fee-*) and V2 (amount-*) column layouts.
// V2 uses: amount-type, amount-description, amount (unified column triple for price and fee rows).
// V1 uses: price-type, price-amount, item-related-fee-type, item-related-fee-amount.
const SETTLEMENT_HEADER_ALIASES: Record<string, string> = {
  'order id':                     'order-id',
  'order item id':                'order-item-code',
  'order item code':              'order-item-code',
  'transaction type':             'transaction-type',
  'settlement id':                'settlement-id',
  'posted date':                  'posted-date',
  // V1 columns
  'price type':                   'price-type',
  'price amount':                 'price-amount',
  'item related fee type':        'item-related-fee-type',
  'item related fee amount':      'item-related-fee-amount',
  'other fee reason description': 'other-fee-reason-description',
  // V2 columns (no normalization needed — already hyphenated in the file)
  // 'amount-type', 'amount-description', 'amount' are passed through as-is
};

export interface ParsedSettlementRow {
  dedupKey:       string;
  settlementId:   string | null;
  transactionType: string | null;
  postedDate:     Date | null;
  orderId:        string | null;
  orderItemCode:  string | null;   // order-item-code → matches SaleRecord.orderItemId
  sku:            string | null;
  priceType:      string | null;
  priceAmount:    number | null;   // signed as received
  itemFeeType:    string | null;
  itemFeeAmount:  number | null;   // signed as received (negative = fee)
  otherFeeReason: string | null;
  rawPayload:     Record<string, string>;
}

export interface SettlementParseError {
  rowIndex: number;
  raw:      Record<string, string>;
  message:  string;
}

export interface SettlementFeeGroup {
  orderItemCode: string;
  orderId:       string | null;
  sku:           string | null;
  referralFee:   number;   // abs; Commission rows summed
  fbaFee:        number;   // abs; FBA fee rows summed
  otherFees:     number;   // abs; all other item fee rows summed
  totalFees:     number;   // referralFee + fbaFee + otherFees
  rowCount:      number;
}

export interface SettlementParseResult {
  allRows:         ParsedSettlementRow[];  // every row — all stored as SettlementRecord
  orderRows:       ParsedSettlementRow[];  // Order transaction-type only → processed for fees
  refundRows:      ParsedSettlementRow[];  // Refund transaction-type → stored, not applied
  unsupportedRows: ParsedSettlementRow[];  // everything else
  errors:          SettlementParseError[];
  feeGroups:       Map<string, SettlementFeeGroup>; // orderItemCode → aggregated fees
  rowsParsed:      number;
  parseErrors:     number;
  refundCount:     number;
  unsupportedCount: number;
}

/**
 * Build a stable dedupKey for a settlement row.
 * Combines the most identifying fields. rowIndex is included as tiebreaker
 * so two identical-content rows at different positions are treated as separate
 * (Amazon can emit duplicates that we want to deduplicate on re-import, but
 * two intentionally different rows at different positions remain distinct).
 */
export function buildSettlementDedupKey(
  settlementId:  string | null,
  transactionType: string | null,
  orderId:       string | null,
  orderItemCode: string | null,
  itemFeeType:   string | null,
  priceType:     string | null,
  priceAmount:   number | null,
  itemFeeAmount: number | null,
  rowIndex:      number,
): string {
  return [
    settlementId   ?? '',
    transactionType ?? '',
    orderId        ?? '',
    orderItemCode  ?? '',
    itemFeeType    ?? '',
    priceType      ?? '',
    priceAmount    != null ? priceAmount.toFixed(2)    : '',
    itemFeeAmount  != null ? itemFeeAmount.toFixed(2)  : '',
    String(rowIndex),
  ].join('|');
}

function parseSignedFloat(val: string | undefined): number | null {
  if (val == null || val.trim() === '') return null;
  const n = parseFloat(val.replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
}

// Headers that are present in Orders reports but never in settlement reports.
// Presence of any of these in the first line is a strong signal of wrong file type.
const ORDERS_REPORT_HEADERS = new Set([
  'amazon-order-item-id',
  'order-item-id',
  'item-price',
  'item-price-currency',
  'ship-service-level',
  'recipient-name',
  'ship-city',
]);

// Minimum headers required to be considered a settlement file.
const SETTLEMENT_REQUIRED_HEADERS = new Set([
  'settlement-id',
  'transaction-type',
]);

export interface SettlementFileTypeError {
  isOrdersReport: boolean;
  missingRequired: string[];
  message: string;
}

/**
 * Sniff the first line of a raw file and return an error descriptor if it is
 * clearly not a settlement report (e.g. an orders flat-file was uploaded instead).
 * Returns null when the file looks like a valid settlement report.
 * Must be called before any DB writes.
 */
export function detectSettlementFileTypeError(raw: string): SettlementFileTypeError | null {
  const firstLine = raw.split(/\r?\n/).find((l) => l.trim() !== '');
  if (!firstLine) return null;

  const delimiter   = detectDelimiter(firstLine);
  const headerSet   = new Set(
    firstLine.split(delimiter).map((h) => h.trim().toLowerCase().replace(/\s+/g, '-')),
  );

  // Check for orders-report telltale headers
  const ordersMatches = [...ORDERS_REPORT_HEADERS].filter((h) => headerSet.has(h));
  if (ordersMatches.length > 0) {
    return {
      isOrdersReport: true,
      missingRequired: [],
      message:
        'This looks like an Orders report, not a Settlement report. ' +
        'Please upload it using "Import Orders Report" instead.',
    };
  }

  // Check that minimum settlement headers are present
  const missing = [...SETTLEMENT_REQUIRED_HEADERS].filter((h) => !headerSet.has(h));
  if (missing.length > 0) {
    return {
      isOrdersReport: false,
      missingRequired: missing,
      message:
        `This file is missing required settlement columns: ${missing.join(', ')}. ` +
        'Please upload a settlement flat file downloaded from Reports → Payments → All Statements.',
    };
  }

  return null;
}

/**
 * Parse an Amazon settlement flat-file report (GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE).
 * Header-based; detects TSV or CSV; tolerates missing optional columns.
 * Rows are separated by transaction-type into orderRows / refundRows / unsupportedRows.
 * Fee aggregation is performed only on Order-type rows.
 */
export function parseSettlementReport(raw: string): SettlementParseResult {
  const empty: SettlementParseResult = {
    allRows: [], orderRows: [], refundRows: [], unsupportedRows: [],
    errors: [], feeGroups: new Map(),
    rowsParsed: 0, parseErrors: 0, refundCount: 0, unsupportedCount: 0,
  };

  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return empty;

  const delimiter  = detectDelimiter(lines[0]);
  const rawHeaders = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());
  const headers    = rawHeaders.map((h) => SETTLEMENT_HEADER_ALIASES[h] ?? h);

  const allRows:         ParsedSettlementRow[] = [];
  const orderRows:       ParsedSettlementRow[] = [];
  const refundRows:      ParsedSettlementRow[] = [];
  const unsupportedRows: ParsedSettlementRow[] = [];
  const errors:          SettlementParseError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delimiter);
    const rawRow: Record<string, string> = {};
    headers.forEach((h, idx) => { rawRow[h] = (cells[idx] ?? '').trim(); });

    try {
      const settlementId    = nullIfEmpty(rawRow['settlement-id']);
      const transactionType = nullIfEmpty(rawRow['transaction-type']);
      const orderId         = nullIfEmpty(rawRow['order-id']);
      const orderItemCode   = nullIfEmpty(rawRow['order-item-code']);
      const sku             = nullIfEmpty(rawRow['sku']);
      const otherFeeReason  = nullIfEmpty(rawRow['other-fee-reason-description']);
      const postedDate      = parseDate(rawRow['posted-date'] ?? rawRow['posted date']);

      // Resolve price/fee fields — supports both V1 and V2 column layouts:
      //
      // V1: price-type / price-amount  +  item-related-fee-type / item-related-fee-amount
      // V2: amount-type / amount-description / amount
      //     → amount-type = "ItemFees"  → fee row  (amount-description = fee name)
      //     → amount-type = "ItemPrice" → price row (amount-description = price name)
      //
      // Both formats are normalized into the same priceType/priceAmount/itemFeeType/itemFeeAmount
      // fields so groupSettlementFees works identically for both.

      const v2AmountType        = nullIfEmpty(rawRow['amount-type']);
      const v2AmountDescription = nullIfEmpty(rawRow['amount-description']);
      const v2Amount            = parseSignedFloat(rawRow['amount']);

      let priceType:    string | null;
      let priceAmount:  number | null;
      let itemFeeType:  string | null;
      let itemFeeAmount: number | null;

      if (v2AmountType === AMOUNT_TYPE_FEES) {
        // V2 fee row — amount-description is the fee name (Commission, FBAPerUnitFulfillmentFee, etc.)
        priceType    = null;
        priceAmount  = null;
        itemFeeType  = v2AmountDescription;
        itemFeeAmount = v2Amount;
      } else if (v2AmountType === AMOUNT_TYPE_PRICE) {
        // V2 price row — amount-description is the price component (Principal, Tax, etc.)
        priceType    = v2AmountDescription;
        priceAmount  = v2Amount;
        itemFeeType  = null;
        itemFeeAmount = null;
      } else if (v2AmountType != null) {
        // V2 row with an unrecognised amount-type — preserve raw amount, no fee mapping
        priceType    = v2AmountType;
        priceAmount  = v2Amount;
        itemFeeType  = null;
        itemFeeAmount = null;
      } else {
        // V1 columns (no amount-type present)
        priceType    = nullIfEmpty(rawRow['price-type']);
        priceAmount  = parseSignedFloat(rawRow['price-amount']);
        itemFeeType  = nullIfEmpty(rawRow['item-related-fee-type']);
        itemFeeAmount = parseSignedFloat(rawRow['item-related-fee-amount']);
      }

      const dedupKey = buildSettlementDedupKey(
        settlementId, transactionType, orderId, orderItemCode,
        itemFeeType, priceType, priceAmount, itemFeeAmount, i,
      );

      const row: ParsedSettlementRow = {
        dedupKey, settlementId, transactionType, postedDate,
        orderId, orderItemCode, sku, priceType, priceAmount,
        itemFeeType, itemFeeAmount, otherFeeReason,
        rawPayload: rawRow,
      };

      allRows.push(row);

      if (transactionType && REFUND_TRANSACTION_TYPES.has(transactionType)) {
        refundRows.push(row);
      } else if (transactionType && ORDER_TRANSACTION_TYPES.has(transactionType)) {
        orderRows.push(row);
      } else {
        unsupportedRows.push(row);
      }
    } catch (err) {
      errors.push({
        rowIndex: i,
        raw:      rawRow,
        message:  err instanceof Error ? err.message : String(err),
      });
    }
  }

  const feeGroups = groupSettlementFees(orderRows);

  return {
    allRows, orderRows, refundRows, unsupportedRows, errors, feeGroups,
    rowsParsed:       lines.length - 1,
    parseErrors:      errors.length,
    refundCount:      refundRows.length,
    unsupportedCount: unsupportedRows.length,
  };
}

/**
 * Aggregate fee rows by orderItemCode. Only processes Order-type rows.
 * Fee amounts in settlement reports are negative; stored as positive (abs) in the group.
 * Rows without orderItemCode are skipped (can't match to a SaleRecord without it).
 */
export function groupSettlementFees(
  orderRows: ParsedSettlementRow[],
): Map<string, SettlementFeeGroup> {
  const groups = new Map<string, SettlementFeeGroup>();

  for (const row of orderRows) {
    if (!row.orderItemCode) continue;

    if (!groups.has(row.orderItemCode)) {
      groups.set(row.orderItemCode, {
        orderItemCode: row.orderItemCode,
        orderId:       row.orderId,
        sku:           row.sku,
        referralFee:   0,
        fbaFee:        0,
        otherFees:     0,
        totalFees:     0,
        rowCount:      0,
      });
    }

    const group = groups.get(row.orderItemCode)!;
    group.rowCount++;

    if (row.itemFeeType && row.itemFeeAmount != null) {
      const absAmt = Math.abs(row.itemFeeAmount);
      if (REFERRAL_FEE_TYPES.has(row.itemFeeType)) {
        group.referralFee = round2(group.referralFee + absAmt);
      } else if (FBA_FEE_TYPES.has(row.itemFeeType)) {
        group.fbaFee = round2(group.fbaFee + absAmt);
      } else {
        group.otherFees = round2(group.otherFees + absAmt);
      }
      group.totalFees = round2(group.referralFee + group.fbaFee + group.otherFees);
    }
  }

  return groups;
}

// ─── BI summary ───────────────────────────────────────────────────────────────

export interface SyncForSales {
  status:      string;
  startedAt:   Date;
  completedAt?: Date | null;
  source:      string;
}

export function summarizeSales(
  records:  SaleRecordForBI[],
  lastSync?: SyncForSales | null,
): SalesSummary {
  const empty: SalesSummary = {
    totalRecords: 0, totalUnitsSold: 0, totalGrossRevenue: 0, totalNetRevenue: 0,
    totalCogs: null, totalGrossProfitBeforeFees: null, totalRealizedProfit: null, avgRoi: null,
    recordsWithCost: 0, recordsMissingCost: 0, recordsWithFees: 0, recordsMissingFees: 0,
    topAsin: null, lastSaleDate: null,
    lastSyncAt:     lastSync?.startedAt ?? null,
    lastSyncStatus: lastSync?.status    ?? null,
    lastSyncSource: lastSync?.source    ?? null,
    hasData: false,
  };

  if (records.length === 0) return empty;

  let totalUnitsSold     = 0;
  let totalGrossRevenue  = 0;
  let totalNetRevenue    = 0;
  let sumCogs            = 0;
  let sumGrossProfit     = 0;
  let sumRealizedProfit  = 0;
  let hasCogs            = false;
  let hasGrossProfit     = false;
  let hasRealizedProfit  = false;
  let recordsWithCost    = 0;
  let recordsMissingCost = 0;
  let recordsWithFees    = 0;
  let recordsMissingFees = 0;
  let roiSum             = 0;
  let roiCount           = 0;
  let lastSaleDate: Date | null = null;

  const asinUnits = new Map<string, number>();

  for (const r of records) {
    totalUnitsSold    += r.quantitySold;
    totalGrossRevenue += r.grossRevenue;
    totalNetRevenue   += r.netRevenue;

    if (r.asin) {
      asinUnits.set(r.asin, (asinUnits.get(r.asin) ?? 0) + r.quantitySold);
    }

    if (r.unitCostUsed !== null) recordsWithCost++;
    else                         recordsMissingCost++;

    if (r.totalFees !== null) recordsWithFees++;
    else                      recordsMissingFees++;

    if (r.cogs !== null) {
      sumCogs += r.cogs;
      hasCogs  = true;
    }
    if (r.grossProfitBeforeFees !== null) {
      sumGrossProfit += r.grossProfitBeforeFees;
      hasGrossProfit  = true;
    }
    if (r.realizedProfit !== null) {
      sumRealizedProfit += r.realizedProfit;
      hasRealizedProfit  = true;
    }
    if (r.roi !== null) {
      roiSum += r.roi;
      roiCount++;
    }

    if (!lastSaleDate || r.saleDate > lastSaleDate) lastSaleDate = r.saleDate;
  }

  // Top ASIN by units sold
  let topAsin: string | null = null;
  let topUnits = 0;
  for (const [asin, units] of asinUnits) {
    if (units > topUnits) { topUnits = units; topAsin = asin; }
  }

  return {
    totalRecords:          records.length,
    totalUnitsSold,
    totalGrossRevenue:     round2(totalGrossRevenue),
    totalNetRevenue:       round2(totalNetRevenue),
    totalCogs:             hasCogs          ? round2(sumCogs)           : null,
    totalGrossProfitBeforeFees: hasGrossProfit ? round2(sumGrossProfit) : null,
    totalRealizedProfit:   hasRealizedProfit ? round2(sumRealizedProfit) : null,
    avgRoi:                roiCount > 0     ? round2(roiSum / roiCount)  : null,
    recordsWithCost,
    recordsMissingCost,
    recordsWithFees,
    recordsMissingFees,
    topAsin,
    lastSaleDate,
    lastSyncAt:     lastSync?.startedAt ?? null,
    lastSyncStatus: lastSync?.status    ?? null,
    lastSyncSource: lastSync?.source    ?? null,
    hasData:        true,
  };
}

// ─── Cost recalculation helpers ───────────────────────────────────────────────

// Statuses that indicate no revenue was generated — mirror the import skip set.
const RECALC_SKIP_STATUSES = new Set([
  'Cancelled', 'Pending', 'PendingAvailability', 'Unshipped',
]);

export interface EligibilityResult {
  eligible: boolean;
  reason?:  string;
}

export interface RecalcSaleRecord {
  id:           string;
  sku:          string | null;
  asin:         string | null;
  quantitySold: number;
  netRevenue:   number;
  totalFees:    number | null;
  unitCostUsed: number | null;
  orderStatus:  string | null;
}

export interface RecalcInventoryItem {
  sku:      string | null;
  unitCost: number | null;
}

export interface RecalcProjection {
  id:                    string;
  unitCostUsed:          number;
  costSource:            CostSource;
  cogs:                  number | null;
  grossProfitBeforeFees: number | null;
  grossRoiBeforeFees:    number | null;
  realizedProfit:        number | null;
  roi:                   number | null;
}

export interface RecalcPreviewResult {
  eligible:    RecalcSaleRecord[];
  skipped:     Array<RecalcSaleRecord & { skipReason: string }>;
  projections: Map<string, RecalcProjection>;
  warnings:    string[];
}

/**
 * Determine whether a single sale record is eligible for inventory cost recalculation.
 * Returns eligible=false with a reason string for any disqualifying condition.
 */
export function isEligibleForCostRecalculation(record: RecalcSaleRecord): EligibilityResult {
  if (record.unitCostUsed !== null) {
    return { eligible: false, reason: 'already has unit cost' };
  }
  if (!record.sku) {
    return { eligible: false, reason: 'no SKU on record' };
  }
  if (record.quantitySold <= 0) {
    return { eligible: false, reason: 'quantity sold is zero or negative' };
  }
  if (record.orderStatus && RECALC_SKIP_STATUSES.has(record.orderStatus)) {
    return { eligible: false, reason: `order status is ${record.orderStatus}` };
  }
  return { eligible: true };
}

/**
 * Compute the derived profit fields that should be written when applying inventory cost
 * to a single sale record. Delegates entirely to the existing computeSaleProfit formula —
 * no new calculations introduced here.
 */
export function applyInventoryCostToSaleRecord(
  record:            { netRevenue: number; quantitySold: number; totalFees: number | null },
  inventoryUnitCost: number,
): ComputedSaleProfit {
  const costResolved = resolveSaleCost({
    poItemUnitCost:         null,
    inventoryUnitCost,
    repricingCostBasis:     null,
    productTotalLandedCost: null,
    productSourcePrice:     null,
  });
  return computeSaleProfit(record.netRevenue, record.quantitySold, record.totalFees, costResolved);
}

/**
 * Preview what applying inventoryItem.unitCost to the given sale records would do.
 * No DB writes — pure computation only.
 * Returns eligible rows, skipped rows with reasons, projected write values, and warnings.
 */
export function previewInventoryCostRecalculation(
  records:       RecalcSaleRecord[],
  inventoryItem: RecalcInventoryItem,
): RecalcPreviewResult {
  const eligible:    RecalcSaleRecord[]                           = [];
  const skipped:     Array<RecalcSaleRecord & { skipReason: string }> = [];
  const projections: Map<string, RecalcProjection>               = new Map();
  const warnings:    string[]                                     = [];

  const unitCost = inventoryItem.unitCost;

  // Reject invalid unit cost — do not fabricate 0 as a substitute for missing/invalid cost.
  if (unitCost == null || !Number.isFinite(unitCost) || unitCost <= 0) {
    return {
      eligible:    [],
      skipped:     records.map((r) => ({ ...r, skipReason: 'inventory item has no valid unit cost' })),
      projections: new Map(),
      warnings:    ['Cannot preview: inventory item has no valid positive unit cost. Set a unit cost before recalculating.'],
    };
  }

  warnings.push(
    'This applies the current inventory unit cost to historical sales. ' +
    'If your purchase price was different at the time of sale, update the inventory cost before applying.',
  );

  let feeGapCount = 0;

  for (const record of records) {
    const { eligible: ok, reason } = isEligibleForCostRecalculation(record);
    if (!ok) {
      skipped.push({ ...record, skipReason: reason! });
      continue;
    }

    eligible.push(record);

    const computed = applyInventoryCostToSaleRecord(record, unitCost);
    projections.set(record.id, {
      id:                    record.id,
      unitCostUsed:          computed.unitCostUsed!,
      costSource:            computed.costSource!,
      cogs:                  computed.cogs,
      grossProfitBeforeFees: computed.grossProfitBeforeFees,
      grossRoiBeforeFees:    computed.grossRoiBeforeFees,
      realizedProfit:        computed.realizedProfit,
      roi:                   computed.roi,
    });

    if (record.totalFees === null) feeGapCount++;
  }

  if (feeGapCount > 0) {
    warnings.push(
      `${feeGapCount} of the eligible record${feeGapCount !== 1 ? 's' : ''} ` +
      `${feeGapCount !== 1 ? 'are' : 'is'} missing settlement fees. ` +
      'Applying cost will produce Gross only rows — not Complete realized profit. ' +
      'Import a settlement report to calculate realized profit.',
    );
  }

  return { eligible, skipped, projections, warnings };
}

// ─── Refund Classification (Phase 6.14) ──────────────────────────────────────

export type RefundAdjustmentType =
  | 'PRINCIPAL_REFUND'
  | 'TAX_REFUND'
  | 'FEE_CREDIT'
  | 'RETURN_FEE'
  | 'UNSUPPORTED';

export interface RefundClassification {
  adjustmentType: RefundAdjustmentType;
  amountCategory: string;      // raw priceType or itemFeeType label from the file
  amount: number | null;       // signed as received from Amazon
  profitImpact: number | null; // sign-adjusted impact: negative = loss, positive = gain
  eligibleForItemLevelPreview: boolean; // false when orderItemCode is null
  reason?: string;             // explains UNSUPPORTED or ineligibility
}

export interface RefundRowInput {
  transactionType: string | null;
  orderItemCode:   string | null;
  priceType:       string | null;
  priceAmount:     number | null;
  itemFeeType:     string | null;
  itemFeeAmount:   number | null;
  otherFeeReason:  string | null;
}

// Fee types on Refund rows that represent a new charge (not a credit back)
const RETURN_FEE_TYPES = new Set([
  'ReturnShipping',
  'ReturnProcessingFee',
]);

/**
 * Classify a single settlement row as a refund adjustment type.
 * Only rows where transactionType === 'Refund' are classified; all others are UNSUPPORTED.
 * Does not throw — unknown row types return UNSUPPORTED with a reason.
 * Does not infer by SKU or orderId — only priceType and itemFeeType drive classification.
 *
 * Sign convention (matches Amazon settlement file):
 *   PRINCIPAL_REFUND / TAX_REFUND: priceAmount is negative (money leaving seller to buyer)
 *   FEE_CREDIT: itemFeeAmount is positive on refund rows (credit back to seller)
 *   RETURN_FEE:  itemFeeAmount is negative (new charge to seller)
 */
export function classifyRefundSettlementRow(row: RefundRowInput): RefundClassification {
  const eligible = row.orderItemCode !== null;

  if (row.transactionType !== 'Refund') {
    return {
      adjustmentType: 'UNSUPPORTED',
      amountCategory: row.transactionType ?? 'unknown',
      amount:         null,
      profitImpact:   null,
      eligibleForItemLevelPreview: false,
      reason: `transactionType is "${row.transactionType ?? 'null'}", not "Refund"`,
    };
  }

  // Price-type rows (priceAmount column)
  if (row.priceType) {
    if (row.priceType === 'Principal') {
      return {
        adjustmentType: 'PRINCIPAL_REFUND',
        amountCategory: 'Principal',
        amount:         row.priceAmount,
        profitImpact:   row.priceAmount,   // negative: money leaving seller
        eligibleForItemLevelPreview: eligible,
      };
    }
    if (row.priceType === 'Tax') {
      return {
        adjustmentType: 'TAX_REFUND',
        amountCategory: 'Tax',
        amount:         row.priceAmount,
        profitImpact:   row.priceAmount,   // negative: tax refunded to buyer
        eligibleForItemLevelPreview: eligible,
      };
    }
    if (row.priceType === 'ShippingCharge') {
      return {
        adjustmentType: 'RETURN_FEE',
        amountCategory: 'ShippingCharge',
        amount:         row.priceAmount,
        profitImpact:   row.priceAmount,   // negative: new shipping charge to seller
        eligibleForItemLevelPreview: eligible,
      };
    }
  }

  // Fee-type rows (itemFeeAmount column)
  if (row.itemFeeType) {
    if (row.itemFeeType === 'Commission') {
      return {
        adjustmentType: 'FEE_CREDIT',
        amountCategory: 'Commission',
        amount:         row.itemFeeAmount,
        profitImpact:   row.itemFeeAmount,  // positive: referral fee credited back
        eligibleForItemLevelPreview: eligible,
      };
    }
    if (FBA_FEE_TYPES.has(row.itemFeeType)) {
      return {
        adjustmentType: 'FEE_CREDIT',
        amountCategory: row.itemFeeType,
        amount:         row.itemFeeAmount,
        profitImpact:   row.itemFeeAmount,  // positive: FBA fee credited back
        eligibleForItemLevelPreview: eligible,
      };
    }
    if (RETURN_FEE_TYPES.has(row.itemFeeType)) {
      return {
        adjustmentType: 'RETURN_FEE',
        amountCategory: row.itemFeeType,
        amount:         row.itemFeeAmount,
        profitImpact:   row.itemFeeAmount,  // negative: return processing charge
        eligibleForItemLevelPreview: eligible,
      };
    }
  }

  // otherFeeReason may hint at return-related charges
  if (row.otherFeeReason && /return/i.test(row.otherFeeReason)) {
    return {
      adjustmentType: 'RETURN_FEE',
      amountCategory: row.otherFeeReason,
      amount:         row.itemFeeAmount,
      profitImpact:   row.itemFeeAmount,
      eligibleForItemLevelPreview: eligible,
    };
  }

  return {
    adjustmentType: 'UNSUPPORTED',
    amountCategory: row.priceType ?? row.itemFeeType ?? row.otherFeeReason ?? 'unknown',
    amount:         row.priceAmount ?? row.itemFeeAmount,
    profitImpact:   null,
    eligibleForItemLevelPreview: false,
    reason:
      'Could not classify this refund row. ' +
      `priceType="${row.priceType ?? ''}" itemFeeType="${row.itemFeeType ?? ''}"`,
  };
}

export interface RefundGroupingResult {
  byOrderItemCode:      Map<string, ParsedSettlementRow[]>;
  withoutOrderItemCode: ParsedSettlementRow[];
}

/**
 * Group refund settlement rows by orderItemCode.
 * Rows without an orderItemCode are placed in withoutOrderItemCode (order-level; cannot
 * be safely linked to a single SaleRecord).
 * Does not group by SKU or orderId — only orderItemCode is used.
 */
export function groupRefundRowsByOrderItemCode(rows: ParsedSettlementRow[]): RefundGroupingResult {
  const byOrderItemCode      = new Map<string, ParsedSettlementRow[]>();
  const withoutOrderItemCode: ParsedSettlementRow[] = [];

  for (const row of rows) {
    if (!row.orderItemCode) {
      withoutOrderItemCode.push(row);
      continue;
    }
    const existing = byOrderItemCode.get(row.orderItemCode);
    if (existing) {
      existing.push(row);
    } else {
      byOrderItemCode.set(row.orderItemCode, [row]);
    }
  }

  return { byOrderItemCode, withoutOrderItemCode };
}

export interface RefundPreviewSaleRecord {
  id:            string;
  orderItemId:   string | null;
  sku:           string | null;
  realizedProfit: number | null;
}

export interface RefundMatchedGroup {
  orderItemCode:  string;
  saleRecordId:   string;
  classifications: RefundClassification[];
}

export interface RefundUnmatchedGroup {
  orderItemCode:  string;
  classifications: RefundClassification[];
}

export interface RefundPreviewResult {
  totalRefundRows:  number;
  itemLevelRows:    number;
  orderLevelRows:   number;
  matchedGroups:    RefundMatchedGroup[];
  unmatchedGroups:  RefundUnmatchedGroup[];
  skippedRows:      Array<{ row: ParsedSettlementRow; reason: string }>;
  warnings:         string[];
}

/**
 * Preview how stored refund rows would be classified and linked to SaleRecords.
 * Pure function — no DB writes, no mutations of input arrays.
 * Matches only by orderItemCode === SaleRecord.orderItemId; no SKU or orderId fallback.
 * Returns matched/unmatched groups, skipped rows, and human-readable warnings.
 */
export function previewRefundClassification(
  refundRows:  ParsedSettlementRow[],
  saleRecords: RefundPreviewSaleRecord[],
): RefundPreviewResult {
  const warnings: string[] = [
    'Refund rows are previewed only and are not applied to realized profit.',
    'Order-level refund rows are not applied because they cannot be safely assigned to one sale item.',
    'Unsupported refund row types are stored but not applied.',
  ];

  // Build a lookup of SaleRecord by orderItemId for O(1) matching
  const saleByOrderItemId = new Map<string, RefundPreviewSaleRecord>();
  for (const sr of saleRecords) {
    if (sr.orderItemId) saleByOrderItemId.set(sr.orderItemId, sr);
  }

  const { byOrderItemCode, withoutOrderItemCode } = groupRefundRowsByOrderItemCode(refundRows);

  const matchedGroups:   RefundMatchedGroup[]   = [];
  const unmatchedGroups: RefundUnmatchedGroup[] = [];
  const skippedRows:     Array<{ row: ParsedSettlementRow; reason: string }> = [];

  // Order-level rows → always skipped
  for (const row of withoutOrderItemCode) {
    skippedRows.push({ row, reason: 'no orderItemCode — cannot link to a single sale item' });
  }

  // Item-level groups
  for (const [orderItemCode, rows] of byOrderItemCode) {
    const classifications = rows.map((r) => classifyRefundSettlementRow(r));

    // UNSUPPORTED rows within an item-level group go to skippedRows
    for (let i = 0; i < rows.length; i++) {
      if (classifications[i].adjustmentType === 'UNSUPPORTED') {
        skippedRows.push({ row: rows[i], reason: classifications[i].reason ?? 'unsupported type' });
      }
    }

    const applyableClassifications = classifications.filter(
      (c) => c.adjustmentType !== 'UNSUPPORTED',
    );

    if (applyableClassifications.length === 0) continue;

    const saleRecord = saleByOrderItemId.get(orderItemCode);
    if (saleRecord) {
      matchedGroups.push({ orderItemCode, saleRecordId: saleRecord.id, classifications: applyableClassifications });
    } else {
      unmatchedGroups.push({ orderItemCode, classifications: applyableClassifications });
    }
  }

  return {
    totalRefundRows: refundRows.length,
    itemLevelRows:   [...byOrderItemCode.values()].reduce((n, rows) => n + rows.length, 0),
    orderLevelRows:  withoutOrderItemCode.length,
    matchedGroups,
    unmatchedGroups,
    skippedRows,
    warnings,
  };
}

// ─── Refund Apply Draft (Phase 6.16) ─────────────────────────────────────────

export interface DraftSettlementRecord {
  id:              string;   // becomes settlementRecordId on the draft
  settlementId:    string | null;
  transactionType: string | null;
  orderId:         string | null;
  orderItemCode:   string | null;
  sku:             string | null;
}

export interface DraftSaleRecord {
  id:    string;
  orgId: string;
}

export interface SaleAdjustmentRecordDraft {
  orgId:              string;
  saleRecordId:       string;
  settlementRecordId: string;
  settlementId:       string | null;
  transactionType:    string;
  adjustmentType:     string;
  orderId:            string | null;
  orderItemCode:      string | null;
  sku:                string | null;
  amountCategory:     string | null;
  amount:             number;
  profitImpact:       number;
  appliedToProfit:    false;
  // rawPayload is intentionally omitted — the source SettlementRecord.rawPayload
  // is accessible via the relation; duplicating it here adds no audit value.
}

/**
 * Build a write payload for a single SaleAdjustmentRecord from a classification result.
 * Returns null if:
 *   - adjustmentType is UNSUPPORTED
 *   - amount is null, NaN, or Infinity
 *   - profitImpact is null, NaN, or Infinity
 * No zero fallback — an invalid numeric value means the row is skipped, not stored as 0.
 * Never writes realizedProfit, adjustedProfit, refundImpact, or any SaleRecord profit field.
 */
export function buildSaleAdjustmentRecordDraft(
  classification:   RefundClassification,
  settlementRecord: DraftSettlementRecord,
  saleRecord:       DraftSaleRecord,
): SaleAdjustmentRecordDraft | null {
  if (classification.adjustmentType === 'UNSUPPORTED') return null;

  // Reject null, NaN, or non-finite amounts — no zero fallback
  if (
    classification.amount == null ||
    !Number.isFinite(classification.amount) ||
    classification.profitImpact == null ||
    !Number.isFinite(classification.profitImpact)
  ) {
    return null;
  }

  return {
    orgId:              saleRecord.orgId,
    saleRecordId:       saleRecord.id,
    settlementRecordId: settlementRecord.id,
    settlementId:       settlementRecord.settlementId,
    transactionType:    settlementRecord.transactionType ?? 'Refund',
    adjustmentType:     classification.adjustmentType,
    orderId:            settlementRecord.orderId,
    orderItemCode:      settlementRecord.orderItemCode,
    sku:                settlementRecord.sku,
    amountCategory:     classification.amountCategory,
    amount:             classification.amount,
    profitImpact:       classification.profitImpact,
    appliedToProfit:    false,
  };
}
