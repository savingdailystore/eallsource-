// Reimbursement Recovery Engine — pure functions, no DB, no framework imports.
//
// DATA HONESTY RULES (enforced here):
//  - Never claim Amazon owes money with certainty.
//  - Underpayment is flagged only when cost data is known and exceeds reimbursement.
//  - When cost is unknown, recommendation is "Add unit cost to evaluate".
//  - rawPayload is preserved from the original report row — never modified.
//  - Parser uses header-based column mapping — no positional assumptions.

// ─── Types ──────────────────────────────────────────────────────────────────

export type RecoveryRecommendation =
  | 'LOOKS_REASONABLE'
  | 'POSSIBLE_UNDERPAYMENT'
  | 'MISSING_COST_DATA'
  | 'MISSING_ASIN_SKU'
  | 'LARGE_REIMBURSEMENT'
  | 'ZERO_AMOUNT';

export type UnderpaymentStatus =
  | 'POSSIBLE'    // cost known and exceeds reimbursement per unit
  | 'OK'          // cost known, reimbursement >= cost
  | 'UNKNOWN';    // cost not available — cannot evaluate

export interface ParsedReimbursementRow {
  reimbursementId:             string;
  approvalDate:                Date;
  caseId:                      string | null;
  amazonOrderId:               string | null;
  reason:                      string;
  sku:                         string | null;
  fnsku:                       string | null;
  asin:                        string | null;
  productName:                 string | null;
  condition:                   string | null;
  currencyUnit:                string;
  amountPerUnit:               number;
  amountTotal:                 number;
  quantityReimbursedCash:      number;
  quantityReimbursedInventory: number;
  quantityReimbursedTotal:     number;
  originalReimbursementId:     string | null;
  originalReimbursementType:   string | null;
  rawPayload:                  Record<string, string>; // full original TSV row
}

export interface ParseResult {
  rows:   ParsedReimbursementRow[];
  errors: ParseRowError[];
  total:  number; // rows attempted (including errors)
}

export interface ParseRowError {
  rowIndex: number;
  raw:      Record<string, string>;
  message:  string;
}

export interface ReimbursementRecoveryAnalysis {
  reimbursementId: string;
  asin:            string | null;
  sku:             string | null;
  productName:     string | null;
  reason:          string;
  amountPerUnit:   number;
  amountTotal:     number;
  currencyUnit:    string;
  quantityTotal:   number;

  // Cost resolution
  unitCost:       number | null;
  unitCostSource: 'inventory' | 'repricing' | 'product' | null;

  // Underpayment
  underpaymentStatus:    UnderpaymentStatus;
  possibleUnderpayment:  number | null; // per-unit difference; null when status is UNKNOWN
  totalPossibleShortfall: number | null; // possibleUnderpayment × quantityTotal; null when UNKNOWN

  // Deterministic recommendation
  recommendation:      RecoveryRecommendation;
  recommendationLabel: string; // human-readable label
  recommendationNote:  string; // supporting detail
}

// Cost lookup input — caller supplies resolved values from DB
export interface CostLookup {
  inventoryUnitCost: number | null; // InventoryItem.unitCost
  repricingCostBasis: number | null; // RepricingRule.costBasis
  productSourcePrice: number | null; // Product.sourcePrice (least reliable — last resort)
  productTotalLandedCost: number | null; // Product.totalLandedCost
}

// ─── TSV/CSV Parser ─────────────────────────────────────────────────────────

// Amazon FBA Reimbursements report column header → internal field mapping.
// Keys are lower-cased, trimmed Amazon column headers.
const COLUMN_MAP: Record<string, keyof ParsedReimbursementRow | '_skip'> = {
  'approval-date':                  'approvalDate',
  'reimbursement-id':               'reimbursementId',
  'case-id':                        'caseId',
  'amazon-order-id':                'amazonOrderId',
  'reason':                         'reason',
  'sku':                            'sku',
  'fnsku':                          'fnsku',
  'asin':                           'asin',
  'product-name':                   'productName',
  'condition':                      'condition',
  'currency-unit':                  'currencyUnit',
  'amount-per-unit':                'amountPerUnit',
  'amount-total':                   'amountTotal',
  'quantity-reimbursed-cash':       'quantityReimbursedCash',
  'quantity-reimbursed-inventory':  'quantityReimbursedInventory',
  'quantity-reimbursed-total':      'quantityReimbursedTotal',
  'original-reimbursement-id':      'originalReimbursementId',
  'original-reimbursement-type':    'originalReimbursementType',
};

function detectDelimiter(firstLine: string): '\t' | ',' {
  const tabs   = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs >= commas ? '\t' : ',';
}

function parseNumber(val: string | undefined): number {
  if (val == null || val.trim() === '') return 0;
  const n = parseFloat(val.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseDate(val: string | undefined): Date | null {
  if (!val || val.trim() === '') return null;
  // Amazon uses "Mar 15, 2024" or "2024-03-15" — both parse fine with new Date()
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? null : d;
}

function nullIfEmpty(val: string | undefined): string | null {
  if (val == null || val.trim() === '') return null;
  return val.trim();
}

/**
 * Parse a raw TSV or CSV string from the Amazon FBA Reimbursements report.
 * The first non-blank line must be headers. All subsequent lines are data rows.
 * Safe to call with empty or whitespace-only input.
 */
export function parseReimbursementReport(raw: string): ParseResult {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');

  if (lines.length === 0) {
    return { rows: [], errors: [], total: 0 };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers   = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());

  const rows:   ParsedReimbursementRow[] = [];
  const errors: ParseRowError[]          = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delimiter);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = (cells[idx] ?? '').trim(); });

    try {
      const reimbursementId = raw['reimbursement-id']?.trim();
      if (!reimbursementId) throw new Error('Missing reimbursement-id');

      const approvalDate = parseDate(raw['approval-date']);
      if (!approvalDate) throw new Error(`Invalid approval-date: "${raw['approval-date']}"`);

      const reason = raw['reason']?.trim();
      if (!reason) throw new Error('Missing reason');

      rows.push({
        reimbursementId,
        approvalDate,
        caseId:                      nullIfEmpty(raw['case-id']),
        amazonOrderId:               nullIfEmpty(raw['amazon-order-id']),
        reason,
        sku:                         nullIfEmpty(raw['sku']),
        fnsku:                       nullIfEmpty(raw['fnsku']),
        asin:                        nullIfEmpty(raw['asin']),
        productName:                 nullIfEmpty(raw['product-name']),
        condition:                   nullIfEmpty(raw['condition']),
        currencyUnit:                raw['currency-unit']?.trim() || 'USD',
        amountPerUnit:               parseNumber(raw['amount-per-unit']),
        amountTotal:                 parseNumber(raw['amount-total']),
        quantityReimbursedCash:      Math.round(parseNumber(raw['quantity-reimbursed-cash'])),
        quantityReimbursedInventory: Math.round(parseNumber(raw['quantity-reimbursed-inventory'])),
        quantityReimbursedTotal:     Math.round(parseNumber(raw['quantity-reimbursed-total'])),
        originalReimbursementId:     nullIfEmpty(raw['original-reimbursement-id']),
        originalReimbursementType:   nullIfEmpty(raw['original-reimbursement-type']),
        rawPayload: raw,
      });
    } catch (err) {
      errors.push({
        rowIndex: i,
        raw,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { rows, errors, total: lines.length - 1 };
}

// ─── Cost resolution ─────────────────────────────────────────────────────────

// Priority: InventoryItem.unitCost > RepricingRule.costBasis >
//           Product.totalLandedCost > Product.sourcePrice
// Product cost fields are least reliable (may not reflect true landed cost).
export function resolveUnitCost(lookup: CostLookup): {
  cost: number | null;
  source: 'inventory' | 'repricing' | 'product' | null;
} {
  if (lookup.inventoryUnitCost != null)     return { cost: lookup.inventoryUnitCost,       source: 'inventory' };
  if (lookup.repricingCostBasis != null)    return { cost: lookup.repricingCostBasis,       source: 'repricing' };
  if (lookup.productTotalLandedCost != null) return { cost: lookup.productTotalLandedCost,  source: 'product'   };
  if (lookup.productSourcePrice != null)    return { cost: lookup.productSourcePrice,        source: 'product'   };
  return { cost: null, source: null };
}

// ─── Underpayment detection ──────────────────────────────────────────────────

const LARGE_REIMBURSEMENT_THRESHOLD = 500; // flag for manual review

function buildRecommendation(
  row:          ParsedReimbursementRow,
  unitCost:     number | null,
  underpayment: UnderpaymentStatus,
  perUnitDiff:  number | null,
): { recommendation: RecoveryRecommendation; label: string; note: string } {
  if (row.amountTotal === 0 && row.quantityReimbursedTotal === 0) {
    return {
      recommendation: 'ZERO_AMOUNT',
      label:          'Zero-amount entry',
      note:           'Reimbursement recorded with $0.00 — may be a reversal or adjustment.',
    };
  }

  if (!row.asin && !row.sku) {
    return {
      recommendation: 'MISSING_ASIN_SKU',
      label:          'Missing ASIN/SKU — review manually',
      note:           'Cannot match to inventory without ASIN or SKU.',
    };
  }

  if (row.amountTotal > LARGE_REIMBURSEMENT_THRESHOLD) {
    if (underpayment === 'POSSIBLE' && perUnitDiff != null) {
      return {
        recommendation: 'POSSIBLE_UNDERPAYMENT',
        label:          'Possible underpayment — large amount, worth reviewing',
        note:           `Estimated difference based on known unit cost: $${perUnitDiff.toFixed(2)}/unit.`,
      };
    }
    return {
      recommendation: 'LARGE_REIMBURSEMENT',
      label:          'Large reimbursement — verify against inventory records',
      note:           `Total $${row.amountTotal.toFixed(2)} exceeds $${LARGE_REIMBURSEMENT_THRESHOLD} — confirm accuracy.`,
    };
  }

  if (underpayment === 'UNKNOWN' || unitCost == null) {
    return {
      recommendation: 'MISSING_COST_DATA',
      label:          'Missing unit cost — add cost to evaluate',
      note:           'Add unit cost in the Inventory or Repricing module to enable underpayment analysis.',
    };
  }

  if (underpayment === 'POSSIBLE' && perUnitDiff != null) {
    return {
      recommendation: 'POSSIBLE_UNDERPAYMENT',
      label:          'Possible underpayment — worth reviewing',
      note:           `Estimated difference based on known unit cost: $${perUnitDiff.toFixed(2)}/unit. Cost exceeds reimbursement amount.`,
    };
  }

  return {
    recommendation: 'LOOKS_REASONABLE',
    label:          'Looks reasonable',
    note:           'Reimbursement amount is at or above known unit cost.',
  };
}

/**
 * Analyse a single parsed reimbursement row against known cost data.
 * Returns a deterministic, data-honest analysis. Never fabricates amounts.
 */
export function analyseReimbursement(
  row:    ParsedReimbursementRow,
  lookup: CostLookup,
): ReimbursementRecoveryAnalysis {
  const { cost: unitCost, source: unitCostSource } = resolveUnitCost(lookup);

  let underpaymentStatus: UnderpaymentStatus    = 'UNKNOWN';
  let possibleUnderpayment: number | null        = null;
  let totalPossibleShortfall: number | null      = null;

  if (unitCost != null) {
    const diff = unitCost - row.amountPerUnit;
    if (diff > 0) {
      underpaymentStatus    = 'POSSIBLE';
      possibleUnderpayment  = diff;
      totalPossibleShortfall = diff * row.quantityReimbursedTotal;
    } else {
      underpaymentStatus = 'OK';
    }
  }

  const { recommendation, label, note } = buildRecommendation(
    row, unitCost, underpaymentStatus, possibleUnderpayment,
  );

  return {
    reimbursementId: row.reimbursementId,
    asin:            row.asin,
    sku:             row.sku,
    productName:     row.productName,
    reason:          row.reason,
    amountPerUnit:   row.amountPerUnit,
    amountTotal:     row.amountTotal,
    currencyUnit:    row.currencyUnit,
    quantityTotal:   row.quantityReimbursedTotal,

    unitCost,
    unitCostSource,

    underpaymentStatus,
    possibleUnderpayment,
    totalPossibleShortfall,

    recommendation,
    recommendationLabel: label,
    recommendationNote:  note,
  };
}

// ─── Summary aggregation ─────────────────────────────────────────────────────

export interface RecoverySummary {
  totalRecords:           number;
  totalReimbursed:        number; // sum of amountTotal
  possibleUnderpaymentCount: number; // rows flagged as POSSIBLE
  totalPossibleShortfall: number; // sum of totalPossibleShortfall (when POSSIBLE)
  missingCostCount:       number; // rows where cost is unknown
  reviewCount:            number; // rows needing manual review (POSSIBLE + MISSING_ASIN + LARGE)
}

export function buildRecoverySummary(analyses: ReimbursementRecoveryAnalysis[]): RecoverySummary {
  let totalReimbursed          = 0;
  let possibleUnderpaymentCount = 0;
  let totalPossibleShortfall   = 0;
  let missingCostCount         = 0;
  let reviewCount              = 0;

  for (const a of analyses) {
    totalReimbursed += a.amountTotal;
    if (a.underpaymentStatus === 'POSSIBLE') {
      possibleUnderpaymentCount++;
      totalPossibleShortfall += a.totalPossibleShortfall ?? 0;
    }
    if (a.underpaymentStatus === 'UNKNOWN') missingCostCount++;
    if (
      a.recommendation === 'POSSIBLE_UNDERPAYMENT' ||
      a.recommendation === 'MISSING_ASIN_SKU'       ||
      a.recommendation === 'LARGE_REIMBURSEMENT'
    ) {
      reviewCount++;
    }
  }

  return {
    totalRecords: analyses.length,
    totalReimbursed,
    possibleUnderpaymentCount,
    totalPossibleShortfall,
    missingCostCount,
    reviewCount,
  };
}
