import { describe, it, expect } from 'vitest';
import {
  parseReimbursementReport,
  analyseReimbursement,
  resolveUnitCost,
  buildRecoverySummary,
  type ParsedReimbursementRow,
  type CostLookup,
} from './reimbursementRecovery';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTsv(rows: Record<string, string>[]): string {
  const headers = [
    'reimbursement-id', 'approval-date', 'case-id', 'amazon-order-id', 'reason',
    'sku', 'fnsku', 'asin', 'product-name', 'condition', 'currency-unit',
    'amount-per-unit', 'amount-total', 'quantity-reimbursed-cash',
    'quantity-reimbursed-inventory', 'quantity-reimbursed-total',
    'original-reimbursement-id', 'original-reimbursement-type',
  ];
  const dataRows = rows.map((r) => headers.map((h) => r[h] ?? '').join('\t'));
  return [headers.join('\t'), ...dataRows].join('\n');
}

function baseRow(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    'reimbursement-id':              'REIMB-001',
    'approval-date':                 'Jan 15, 2024',
    'case-id':                       'CASE-123',
    'amazon-order-id':               '',
    'reason':                        'LOST_INBOUND_SHIPMENT',
    'sku':                           'MY-SKU-001',
    'fnsku':                         'X0012345',
    'asin':                          'B0CGR29R63',
    'product-name':                  'Test Product',
    'condition':                     'NewItem',
    'currency-unit':                 'USD',
    'amount-per-unit':               '12.50',
    'amount-total':                  '25.00',
    'quantity-reimbursed-cash':      '2',
    'quantity-reimbursed-inventory': '0',
    'quantity-reimbursed-total':     '2',
    'original-reimbursement-id':     '',
    'original-reimbursement-type':   '',
    ...overrides,
  };
}

function noCost(): CostLookup {
  return {
    inventoryUnitCost:      null,
    repricingCostBasis:     null,
    productSourcePrice:     null,
    productTotalLandedCost: null,
  };
}

function withInventoryCost(cost: number): CostLookup {
  return { ...noCost(), inventoryUnitCost: cost };
}

function withRepricingCost(cost: number): CostLookup {
  return { ...noCost(), repricingCostBasis: cost };
}

function withProductCost(source: number, landed: number | null = null): CostLookup {
  return { ...noCost(), productSourcePrice: source, productTotalLandedCost: landed };
}

function parsedRow(overrides: Partial<Record<string, string>> = {}): ParsedReimbursementRow {
  const result = parseReimbursementReport(makeTsv([baseRow(overrides)]));
  expect(result.errors).toHaveLength(0);
  return result.rows[0];
}

// ─── 1. TSV Parser ───────────────────────────────────────────────────────────

describe('parseReimbursementReport — TSV parsing', () => {
  it('parses a valid TSV row', () => {
    const result = parseReimbursementReport(makeTsv([baseRow()]));
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);

    const row = result.rows[0];
    expect(row.reimbursementId).toBe('REIMB-001');
    expect(row.approvalDate).toBeInstanceOf(Date);
    expect(row.reason).toBe('LOST_INBOUND_SHIPMENT');
    expect(row.asin).toBe('B0CGR29R63');
    expect(row.amountPerUnit).toBe(12.5);
    expect(row.amountTotal).toBe(25.0);
    expect(row.quantityReimbursedCash).toBe(2);
    expect(row.quantityReimbursedTotal).toBe(2);
    expect(row.currencyUnit).toBe('USD');
  });

  it('preserves rawPayload with all original columns', () => {
    const result = parseReimbursementReport(makeTsv([baseRow()]));
    const row    = result.rows[0];
    expect(row.rawPayload['reimbursement-id']).toBe('REIMB-001');
    expect(row.rawPayload['amount-per-unit']).toBe('12.50');
  });

  it('parses CSV (comma-delimited) when no tabs present', () => {
    const csv = [
      'reimbursement-id,approval-date,reason,currency-unit,amount-per-unit,amount-total,quantity-reimbursed-total',
      'REIMB-CSV,Jan 15 2024,LOST_INBOUND_SHIPMENT,USD,10.00,20.00,2',
    ].join('\n');
    const result = parseReimbursementReport(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].reimbursementId).toBe('REIMB-CSV');
  });

  it('parses multiple rows', () => {
    const result = parseReimbursementReport(
      makeTsv([
        baseRow({ 'reimbursement-id': 'R1' }),
        baseRow({ 'reimbursement-id': 'R2' }),
        baseRow({ 'reimbursement-id': 'R3' }),
      ])
    );
    expect(result.rows).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it('handles empty report gracefully', () => {
    expect(parseReimbursementReport('')).toEqual({ rows: [], errors: [], total: 0 });
    expect(parseReimbursementReport('   \n  ')).toEqual({ rows: [], errors: [], total: 0 });
  });

  it('returns a header-only report as 0 rows', () => {
    const headerOnly = makeTsv([]).split('\n')[0]; // just the header line
    const result = parseReimbursementReport(headerOnly);
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('records an error for a row missing reimbursement-id', () => {
    const result = parseReimbursementReport(
      makeTsv([baseRow({ 'reimbursement-id': '' })])
    );
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('reimbursement-id');
  });

  it('records an error for an invalid date, continues parsing next rows', () => {
    const result = parseReimbursementReport(
      makeTsv([
        baseRow({ 'reimbursement-id': 'BAD', 'approval-date': 'not-a-date' }),
        baseRow({ 'reimbursement-id': 'GOOD' }),
      ])
    );
    expect(result.errors).toHaveLength(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].reimbursementId).toBe('GOOD');
  });

  it('treats empty optional fields as null', () => {
    const row = parsedRow({ 'case-id': '', 'asin': '', 'fnsku': '' });
    expect(row.caseId).toBeNull();
    expect(row.asin).toBeNull();
    expect(row.fnsku).toBeNull();
  });

  it('defaults currency-unit to USD when missing', () => {
    const row = parsedRow({ 'currency-unit': '' });
    expect(row.currencyUnit).toBe('USD');
  });

  it('handles zero amounts safely', () => {
    const row = parsedRow({ 'amount-per-unit': '0', 'amount-total': '0', 'quantity-reimbursed-total': '0' });
    expect(row.amountPerUnit).toBe(0);
    expect(row.amountTotal).toBe(0);
    expect(row.quantityReimbursedTotal).toBe(0);
  });
});

// ─── 2. Cost resolution ──────────────────────────────────────────────────────

describe('resolveUnitCost', () => {
  it('prefers inventoryUnitCost above all others', () => {
    const result = resolveUnitCost({
      inventoryUnitCost:      20,
      repricingCostBasis:     15,
      productSourcePrice:     10,
      productTotalLandedCost: 12,
    });
    expect(result.cost).toBe(20);
    expect(result.source).toBe('inventory');
  });

  it('falls back to repricingCostBasis when inventoryUnitCost is null', () => {
    const result = resolveUnitCost({
      inventoryUnitCost:      null,
      repricingCostBasis:     15,
      productSourcePrice:     10,
      productTotalLandedCost: null,
    });
    expect(result.cost).toBe(15);
    expect(result.source).toBe('repricing');
  });

  it('falls back to productTotalLandedCost before sourcePrice', () => {
    const result = resolveUnitCost({
      inventoryUnitCost:      null,
      repricingCostBasis:     null,
      productSourcePrice:     8,
      productTotalLandedCost: 11,
    });
    expect(result.cost).toBe(11);
    expect(result.source).toBe('product');
  });

  it('falls back to productSourcePrice as last resort', () => {
    const result = resolveUnitCost({
      inventoryUnitCost:      null,
      repricingCostBasis:     null,
      productSourcePrice:     8,
      productTotalLandedCost: null,
    });
    expect(result.cost).toBe(8);
    expect(result.source).toBe('product');
  });

  it('returns null when all cost sources are null', () => {
    const result = resolveUnitCost(noCost());
    expect(result.cost).toBeNull();
    expect(result.source).toBeNull();
  });
});

// ─── 3. Underpayment detection ───────────────────────────────────────────────

describe('analyseReimbursement — underpayment detection', () => {
  it('detects POSSIBLE underpayment when cost exceeds reimbursement per unit', () => {
    const row      = parsedRow({ 'amount-per-unit': '12.00', 'quantity-reimbursed-total': '2' });
    const analysis = analyseReimbursement(row, withInventoryCost(18.50));
    expect(analysis.underpaymentStatus).toBe('POSSIBLE');
    expect(analysis.possibleUnderpayment).toBeCloseTo(6.50);
    expect(analysis.totalPossibleShortfall).toBeCloseTo(13.00);
    expect(analysis.recommendation).toBe('POSSIBLE_UNDERPAYMENT');
    expect(analysis.recommendationLabel).toContain('Possible underpayment');
  });

  it('marks OK when reimbursement meets or exceeds cost', () => {
    const row      = parsedRow({ 'amount-per-unit': '20.00' });
    const analysis = analyseReimbursement(row, withInventoryCost(18.00));
    expect(analysis.underpaymentStatus).toBe('OK');
    expect(analysis.possibleUnderpayment).toBeNull();
    expect(analysis.totalPossibleShortfall).toBeNull();
    expect(analysis.recommendation).toBe('LOOKS_REASONABLE');
  });

  it('marks OK when reimbursement exactly equals cost', () => {
    const row      = parsedRow({ 'amount-per-unit': '18.50' });
    const analysis = analyseReimbursement(row, withInventoryCost(18.50));
    expect(analysis.underpaymentStatus).toBe('OK');
  });

  it('returns UNKNOWN underpayment when no cost data available', () => {
    const row      = parsedRow();
    const analysis = analyseReimbursement(row, noCost());
    expect(analysis.underpaymentStatus).toBe('UNKNOWN');
    expect(analysis.possibleUnderpayment).toBeNull();
    expect(analysis.totalPossibleShortfall).toBeNull();
    expect(analysis.recommendation).toBe('MISSING_COST_DATA');
    expect(analysis.recommendationLabel).toContain('add cost to evaluate');
  });

  it('uses repricing cost when inventory cost is absent', () => {
    const row      = parsedRow({ 'amount-per-unit': '10.00' });
    const analysis = analyseReimbursement(row, withRepricingCost(15.00));
    expect(analysis.underpaymentStatus).toBe('POSSIBLE');
    expect(analysis.unitCostSource).toBe('repricing');
    expect(analysis.possibleUnderpayment).toBeCloseTo(5.00);
  });

  it('does not fabricate underpayment from product cost alone — marks as product source', () => {
    const row      = parsedRow({ 'amount-per-unit': '8.00' });
    const analysis = analyseReimbursement(row, withProductCost(10.00));
    // Product cost is used but flagged as 'product' source — still POSSIBLE
    expect(analysis.unitCostSource).toBe('product');
    expect(analysis.underpaymentStatus).toBe('POSSIBLE');
  });
});

// ─── 4. Specific recommendation rules ───────────────────────────────────────

describe('analyseReimbursement — recommendation rules', () => {
  it('recommends MISSING_ASIN_SKU when both are absent', () => {
    const row      = parsedRow({ 'asin': '', 'sku': '' });
    const analysis = analyseReimbursement(row, noCost());
    expect(analysis.recommendation).toBe('MISSING_ASIN_SKU');
    expect(analysis.recommendationLabel).toContain('manually');
  });

  it('recommends LARGE_REIMBURSEMENT for amounts over $500 with no cost data', () => {
    const row      = parsedRow({ 'amount-total': '600.00', 'amount-per-unit': '600.00' });
    const analysis = analyseReimbursement(row, noCost());
    expect(analysis.recommendation).toBe('LARGE_REIMBURSEMENT');
    expect(analysis.recommendationLabel).toContain('verify');
  });

  it('recommends POSSIBLE_UNDERPAYMENT (not just LARGE) when cost known and large amount', () => {
    const row      = parsedRow({ 'amount-total': '600.00', 'amount-per-unit': '600.00', 'quantity-reimbursed-total': '1' });
    const analysis = analyseReimbursement(row, withInventoryCost(700));
    expect(analysis.recommendation).toBe('POSSIBLE_UNDERPAYMENT');
  });

  it('recommends ZERO_AMOUNT for $0 reimbursements', () => {
    const row      = parsedRow({ 'amount-total': '0', 'amount-per-unit': '0', 'quantity-reimbursed-total': '0' });
    const analysis = analyseReimbursement(row, noCost());
    expect(analysis.recommendation).toBe('ZERO_AMOUNT');
  });

  it('recommendationNote is always a non-empty string', () => {
    const row      = parsedRow();
    const analysis = analyseReimbursement(row, noCost());
    expect(typeof analysis.recommendationNote).toBe('string');
    expect(analysis.recommendationNote.length).toBeGreaterThan(0);
  });
});

// ─── 5. Summary aggregation ──────────────────────────────────────────────────

describe('buildRecoverySummary', () => {
  it('aggregates totals correctly', () => {
    const rows = [
      parsedRow({ 'reimbursement-id': 'R1', 'amount-total': '25.00', 'amount-per-unit': '12.50', 'quantity-reimbursed-total': '2' }),
      parsedRow({ 'reimbursement-id': 'R2', 'amount-total': '30.00', 'amount-per-unit': '30.00', 'quantity-reimbursed-total': '1' }),
    ];
    const analyses = rows.map((r) => analyseReimbursement(r, withInventoryCost(20)));
    const summary  = buildRecoverySummary(analyses);

    expect(summary.totalRecords).toBe(2);
    expect(summary.totalReimbursed).toBeCloseTo(55.00);
    // R1: cost 20, amount 12.50 → POSSIBLE; R2: cost 20, amount 30 → OK
    expect(summary.possibleUnderpaymentCount).toBe(1);
    expect(summary.totalPossibleShortfall).toBeCloseTo(15.00); // 7.50 diff × 2 qty
    expect(summary.missingCostCount).toBe(0);
  });

  it('counts missing cost rows separately', () => {
    const row1     = parsedRow({ 'reimbursement-id': 'R1' });
    const row2     = parsedRow({ 'reimbursement-id': 'R2' });
    const analyses = [
      analyseReimbursement(row1, noCost()),
      analyseReimbursement(row2, withInventoryCost(10)),
    ];
    const summary = buildRecoverySummary(analyses);
    expect(summary.missingCostCount).toBe(1);
    expect(summary.reviewCount).toBe(0); // MISSING_COST_DATA is a data quality signal, not a dispute action
  });

  it('returns zero summary for empty input', () => {
    const summary = buildRecoverySummary([]);
    expect(summary.totalRecords).toBe(0);
    expect(summary.totalReimbursed).toBe(0);
    expect(summary.possibleUnderpaymentCount).toBe(0);
    expect(summary.totalPossibleShortfall).toBe(0);
  });
});

// ─── 6. Duplicate handling (parser level) ───────────────────────────────────

describe('parseReimbursementReport — duplicate rows', () => {
  it('parses duplicate reimbursement-id rows without error (upsert handled by DB layer)', () => {
    const result = parseReimbursementReport(
      makeTsv([
        baseRow({ 'reimbursement-id': 'DUP-001' }),
        baseRow({ 'reimbursement-id': 'DUP-001' }),
      ])
    );
    // Parser itself does not deduplicate — DB upsert handles it
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });
});
