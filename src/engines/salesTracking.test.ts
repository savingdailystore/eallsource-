import { describe, it, expect } from 'vitest';
import {
  parseSalesReport,
  resolveSaleCost,
  computeSaleProfit,
  summarizeSales,
  parseSettlementReport,
  groupSettlementFees,
  buildSettlementDedupKey,
  detectSettlementFileTypeError,
  isEligibleForCostRecalculation,
  applyInventoryCostToSaleRecord,
  previewInventoryCostRecalculation,
  classifyRefundSettlementRow,
  groupRefundRowsByOrderItemCode,
  previewRefundClassification,
  buildSaleAdjustmentRecordDraft,
  type RecalcSaleRecord,
  type RefundRowInput,
  type ParsedSettlementRow,
  type RefundPreviewSaleRecord,
  type RefundClassification,
  type DraftSettlementRecord,
  type DraftSaleRecord,
  getSaleProfitStatus,
  parseSalesFilter,
  applySalesFilter,
  type SaleRecordForBI,
  type SyncForSales,
} from './salesTracking';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tsv(...rows: string[][]): string {
  return rows.map((r) => r.join('\t')).join('\n');
}

const HEADERS_TSV = [
  'amazon-order-id', 'purchase-date', 'order-status', 'fulfillment-channel',
  'asin', 'sku', 'product-name', 'quantity', 'item-price',
  'item-tax', 'item-promotion-discount', 'ship-promotion-discount',
  'order-item-id',
];

function makeRow(overrides: Record<string, string> = {}): string[] {
  const defaults: Record<string, string> = {
    'amazon-order-id':          '111-1111111-1111111',
    'purchase-date':            '2024-03-15T10:00:00+00:00',
    'order-status':             'Shipped',
    'fulfillment-channel':      'AFN',
    'asin':                     'B00TEST1234',
    'sku':                      'SKU-001',
    'product-name':             'Test Product',
    'quantity':                 '2',
    'item-price':               '39.98',
    'item-tax':                 '3.20',
    'item-promotion-discount':  '0.00',
    'ship-promotion-discount':  '0.00',
    'order-item-id':            'OI-001',
  };
  const merged = { ...defaults, ...overrides };
  return HEADERS_TSV.map((h) => merged[h] ?? '');
}

// ─── parseSalesReport ─────────────────────────────────────────────────────────

describe('parseSalesReport', () => {
  it('parses a valid TSV row', () => {
    const raw = tsv(HEADERS_TSV, makeRow());
    const { rows, errors, total, skipped } = parseSalesReport(raw);
    expect(errors).toHaveLength(0);
    expect(skipped).toBe(0);
    expect(total).toBe(1);
    expect(rows).toHaveLength(1);

    const r = rows[0];
    expect(r.amazonOrderId).toBe('111-1111111-1111111');
    expect(r.asin).toBe('B00TEST1234');
    expect(r.sku).toBe('SKU-001');
    expect(r.productName).toBe('Test Product');
    expect(r.quantitySold).toBe(2);
    expect(r.grossRevenue).toBe(39.98);
    expect(r.itemTax).toBe(3.20);
    expect(r.promotionDiscount).toBe(0);
    expect(r.netRevenue).toBe(39.98);
    expect(r.orderItemId).toBe('OI-001');
    expect(r.dedupKey).toBe('OI-001');
    expect(r.fulfillmentChannel).toBe('AFN');
    expect(r.orderStatus).toBe('Shipped');
    expect(r.saleDate).toBeInstanceOf(Date);
  });

  it('detects CSV delimiter', () => {
    const csv = HEADERS_TSV.join(',') + '\n' + makeRow().join(',');
    const { rows, errors } = parseSalesReport(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].asin).toBe('B00TEST1234');
  });

  it('handles TSV with tabs explicitly', () => {
    const raw = tsv(HEADERS_TSV, makeRow({ 'item-price': '19.99', 'quantity': '1' }));
    const { rows } = parseSalesReport(raw);
    expect(rows[0].grossRevenue).toBe(19.99);
    expect(rows[0].quantitySold).toBe(1);
  });

  it('skips Cancelled orders and counts them in skipped', () => {
    const raw = tsv(
      HEADERS_TSV,
      makeRow({ 'order-status': 'Cancelled' }),
      makeRow({ 'order-item-id': 'OI-002', 'order-status': 'Shipped' }),
    );
    const { rows, skipped, total } = parseSalesReport(raw);
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(1);
    expect(total).toBe(2);
  });

  it('skips Pending orders', () => {
    const raw = tsv(HEADERS_TSV, makeRow({ 'order-status': 'Pending' }));
    const { rows, skipped } = parseSalesReport(raw);
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('returns error for missing amazon-order-id', () => {
    const raw = tsv(HEADERS_TSV, makeRow({ 'amazon-order-id': '' }));
    const { rows, errors } = parseSalesReport(raw);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/amazon-order-id/i);
  });

  it('returns error for missing/invalid purchase-date', () => {
    const raw = tsv(HEADERS_TSV, makeRow({ 'purchase-date': 'not-a-date' }));
    const { rows, errors } = parseSalesReport(raw);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/purchase-date/i);
  });

  it('returns error for zero quantity', () => {
    const raw = tsv(HEADERS_TSV, makeRow({ 'quantity': '0' }));
    const { rows, errors } = parseSalesReport(raw);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/quantity/i);
  });

  it('returns error for missing item-price', () => {
    const raw = tsv(HEADERS_TSV, makeRow({ 'item-price': '' }));
    const { rows, errors } = parseSalesReport(raw);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/item-price/i);
  });

  it('computes dedupKey from order-item-id when present', () => {
    const raw = tsv(HEADERS_TSV, makeRow({ 'order-item-id': 'MYITEM-42' }));
    const { rows } = parseSalesReport(raw);
    expect(rows[0].dedupKey).toBe('MYITEM-42');
    expect(rows[0].orderItemId).toBe('MYITEM-42');
  });

  it('computes stable dedupKey from order+asin+sku when order-item-id missing', () => {
    // Report without order-item-id column
    const headersNoOI = HEADERS_TSV.filter((h) => h !== 'order-item-id');
    const rowNoOI = makeRow();
    const rowNoOIValues = headersNoOI.map((h) => {
      const idx = HEADERS_TSV.indexOf(h);
      return makeRow()[idx] ?? '';
    });
    const raw = headersNoOI.join('\t') + '\n' + rowNoOIValues.join('\t');
    const { rows } = parseSalesReport(raw);
    expect(rows[0].orderItemId).toBeNull();
    expect(rows[0].dedupKey).toContain('111-1111111-1111111');
    expect(rows[0].dedupKey).toContain('B00TEST1234');
  });

  it('handles promotion discount summing both fields', () => {
    const raw = tsv(HEADERS_TSV, makeRow({
      'item-price':                '39.98',
      'item-promotion-discount':   '2.00',
      'ship-promotion-discount':   '1.00',
    }));
    const { rows } = parseSalesReport(raw);
    expect(rows[0].promotionDiscount).toBe(3.00);
    expect(rows[0].netRevenue).toBe(36.98);
  });

  it('sets promotionDiscount null when both promo columns absent from report', () => {
    const headersNoPromo = HEADERS_TSV.filter(
      (h) => h !== 'item-promotion-discount' && h !== 'ship-promotion-discount',
    );
    const rowValues = headersNoPromo.map((h) => {
      const idx = HEADERS_TSV.indexOf(h);
      return makeRow()[idx] ?? '';
    });
    const raw = headersNoPromo.join('\t') + '\n' + rowValues.join('\t');
    const { rows } = parseSalesReport(raw);
    expect(rows[0].promotionDiscount).toBeNull();
    expect(rows[0].netRevenue).toBe(rows[0].grossRevenue);
  });

  it('sets itemTax null when column absent', () => {
    const headersNoTax = HEADERS_TSV.filter((h) => h !== 'item-tax');
    const rowValues = headersNoTax.map((h) => {
      const idx = HEADERS_TSV.indexOf(h);
      return makeRow()[idx] ?? '';
    });
    const raw = headersNoTax.join('\t') + '\n' + rowValues.join('\t');
    const { rows } = parseSalesReport(raw);
    expect(rows[0].itemTax).toBeNull();
  });

  it('handles quantity-purchased column alias', () => {
    const altHeaders = [...HEADERS_TSV];
    const qIdx = altHeaders.indexOf('quantity');
    altHeaders[qIdx] = 'quantity-purchased';
    const raw = altHeaders.join('\t') + '\n' + makeRow().join('\t');
    const { rows, errors } = parseSalesReport(raw);
    expect(errors).toHaveLength(0);
    expect(rows[0].quantitySold).toBe(2);
  });

  it('preserves rawPayload verbatim', () => {
    const raw = tsv(HEADERS_TSV, makeRow());
    const { rows } = parseSalesReport(raw);
    expect(rows[0].rawPayload['amazon-order-id']).toBe('111-1111111-1111111');
    expect(rows[0].rawPayload['item-price']).toBe('39.98');
  });

  it('returns empty result for empty input', () => {
    const result = parseSalesReport('');
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('handles multi-row input with one error row', () => {
    const raw = tsv(
      HEADERS_TSV,
      makeRow({ 'order-item-id': 'OI-GOOD', 'amazon-order-id': '111-GOOD-111' }),
      makeRow({ 'order-item-id': 'OI-BAD', 'item-price': '' }),
    );
    const { rows, errors, total } = parseSalesReport(raw);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(total).toBe(2);
  });

  it('deduplicates: two rows with same order-item-id both parse (dedup handled at DB layer)', () => {
    const raw = tsv(
      HEADERS_TSV,
      makeRow({ 'order-item-id': 'OI-DUP' }),
      makeRow({ 'order-item-id': 'OI-DUP' }),
    );
    const { rows } = parseSalesReport(raw);
    // Parser returns both; upsert in DB handles the actual dedup
    expect(rows).toHaveLength(2);
    expect(rows[0].dedupKey).toBe('OI-DUP');
  });
});

// ─── resolveSaleCost ──────────────────────────────────────────────────────────

describe('resolveSaleCost', () => {
  it('prefers PO_ITEM cost over all others', () => {
    const r = resolveSaleCost({
      poItemUnitCost: 10, inventoryUnitCost: 12, repricingCostBasis: 11,
      productTotalLandedCost: 9, productSourcePrice: 8,
    });
    expect(r.cost).toBe(10);
    expect(r.source).toBe('PO_ITEM');
  });

  it('falls back to INVENTORY when PO_ITEM is null', () => {
    const r = resolveSaleCost({
      poItemUnitCost: null, inventoryUnitCost: 12, repricingCostBasis: 11,
      productTotalLandedCost: 9, productSourcePrice: 8,
    });
    expect(r.cost).toBe(12);
    expect(r.source).toBe('INVENTORY');
  });

  it('falls back to REPRICING when PO and INVENTORY are null', () => {
    const r = resolveSaleCost({
      poItemUnitCost: null, inventoryUnitCost: null, repricingCostBasis: 11,
      productTotalLandedCost: 9, productSourcePrice: 8,
    });
    expect(r.cost).toBe(11);
    expect(r.source).toBe('REPRICING');
  });

  it('falls back to PRODUCT totalLandedCost before sourcePrice', () => {
    const r = resolveSaleCost({
      poItemUnitCost: null, inventoryUnitCost: null, repricingCostBasis: null,
      productTotalLandedCost: 9, productSourcePrice: 8,
    });
    expect(r.cost).toBe(9);
    expect(r.source).toBe('PRODUCT');
  });

  it('falls back to PRODUCT sourcePrice as last resort', () => {
    const r = resolveSaleCost({
      poItemUnitCost: null, inventoryUnitCost: null, repricingCostBasis: null,
      productTotalLandedCost: null, productSourcePrice: 8,
    });
    expect(r.cost).toBe(8);
    expect(r.source).toBe('PRODUCT');
  });

  it('returns null cost and null source when all are null', () => {
    const r = resolveSaleCost({
      poItemUnitCost: null, inventoryUnitCost: null, repricingCostBasis: null,
      productTotalLandedCost: null, productSourcePrice: null,
    });
    expect(r.cost).toBeNull();
    expect(r.source).toBeNull();
  });
});

// ─── computeSaleProfit ────────────────────────────────────────────────────────

describe('computeSaleProfit', () => {
  it('computes full profit when fees and cost are known', () => {
    // netRevenue=39.98, totalFees=5.50, unitCost=10, qty=2 → cogs=20, realized=14.48
    const r = computeSaleProfit(39.98, 2, 5.50, { cost: 10, source: 'PO_ITEM' });
    expect(r.unitCostUsed).toBe(10);
    expect(r.costSource).toBe('PO_ITEM');
    expect(r.cogs).toBe(20);
    expect(r.grossProfitBeforeFees).toBe(19.98);    // 39.98 - 20
    expect(r.grossRoiBeforeFees).toBe(99.9);         // 19.98/20 * 100
    expect(r.realizedProfit).toBe(14.48);            // 39.98 - 5.50 - 20
    expect(r.roi).toBe(72.4);                        // 14.48/20 * 100
  });

  it('sets grossProfitBeforeFees but NOT realizedProfit when fees are null', () => {
    const r = computeSaleProfit(39.98, 2, null, { cost: 10, source: 'INVENTORY' });
    expect(r.cogs).toBe(20);
    expect(r.grossProfitBeforeFees).toBe(19.98);
    // Realized profit must be null — fees are unknown
    expect(r.realizedProfit).toBeNull();
    expect(r.roi).toBeNull();
  });

  it('does NOT fabricate realized profit when fees are null — critical rule', () => {
    const r = computeSaleProfit(100, 1, null, { cost: 50, source: 'PO_ITEM' });
    expect(r.realizedProfit).toBeNull();
    expect(r.roi).toBeNull();
  });

  it('sets all profit fields null when cost is unknown', () => {
    const r = computeSaleProfit(39.98, 2, 5.50, { cost: null, source: null });
    expect(r.unitCostUsed).toBeNull();
    expect(r.costSource).toBeNull();
    expect(r.cogs).toBeNull();
    expect(r.grossProfitBeforeFees).toBeNull();
    expect(r.grossRoiBeforeFees).toBeNull();
    expect(r.realizedProfit).toBeNull();
    expect(r.roi).toBeNull();
  });

  it('sets all profit fields null when both fees and cost are null', () => {
    const r = computeSaleProfit(39.98, 2, null, { cost: null, source: null });
    expect(r.cogs).toBeNull();
    expect(r.realizedProfit).toBeNull();
    expect(r.roi).toBeNull();
  });

  it('roi is null when cogs is zero (avoids division by zero)', () => {
    const r = computeSaleProfit(10, 1, 2, { cost: 0, source: 'PO_ITEM' });
    expect(r.cogs).toBe(0);
    expect(r.roi).toBeNull();
    expect(r.grossRoiBeforeFees).toBeNull();
  });

  it('handles single unit correctly', () => {
    const r = computeSaleProfit(19.99, 1, 3.00, { cost: 8, source: 'INVENTORY' });
    expect(r.cogs).toBe(8);
    expect(r.grossProfitBeforeFees).toBe(11.99);
    expect(r.realizedProfit).toBe(8.99);
    expect(r.roi).toBe(112.38);
  });
});

// ─── summarizeSales ───────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<SaleRecordForBI> = {}): SaleRecordForBI {
  return {
    saleDate:              new Date('2024-03-15'),
    quantitySold:          2,
    grossRevenue:          39.98,
    netRevenue:            39.98,
    totalFees:             5.50,
    cogs:                  20,
    grossProfitBeforeFees: 19.98,
    realizedProfit:        14.48,
    roi:                   72.4,
    asin:                  'B00TEST1234',
    sku:                   'SKU-001',
    unitCostUsed:          10,
    costSource:            'PO_ITEM',
    ...overrides,
  };
}

describe('summarizeSales', () => {
  it('returns hasData=false for empty records', () => {
    const s = summarizeSales([]);
    expect(s.hasData).toBe(false);
    expect(s.totalRecords).toBe(0);
    expect(s.totalGrossRevenue).toBe(0);
  });

  it('returns correct totals for fully-populated records', () => {
    const s = summarizeSales([makeRecord(), makeRecord({ asin: 'B00OTHER', sku: 'SKU-002', realizedProfit: 10, roi: 50 })]);
    expect(s.hasData).toBe(true);
    expect(s.totalRecords).toBe(2);
    expect(s.totalUnitsSold).toBe(4);
    expect(s.totalGrossRevenue).toBe(79.96);
    expect(s.totalNetRevenue).toBe(79.96);
    expect(s.totalCogs).toBe(40);
    expect(s.totalGrossProfitBeforeFees).toBe(39.96);
    expect(s.totalRealizedProfit).toBe(24.48);
    expect(s.recordsWithCost).toBe(2);
    expect(s.recordsMissingCost).toBe(0);
    expect(s.recordsWithFees).toBe(2);
    expect(s.recordsMissingFees).toBe(0);
  });

  it('totalCogs is null when no records have cost data', () => {
    const r = makeRecord({ unitCostUsed: null, cogs: null, grossProfitBeforeFees: null, realizedProfit: null, roi: null });
    const s = summarizeSales([r]);
    expect(s.totalCogs).toBeNull();
    expect(s.totalGrossProfitBeforeFees).toBeNull();
    expect(s.totalRealizedProfit).toBeNull();
    expect(s.avgRoi).toBeNull();
    expect(s.recordsMissingCost).toBe(1);
    expect(s.recordsWithCost).toBe(0);
  });

  it('totalRealizedProfit is null when no records have fee data', () => {
    const r = makeRecord({ totalFees: null, realizedProfit: null, roi: null });
    const s = summarizeSales([r]);
    expect(s.totalRealizedProfit).toBeNull();
    expect(s.avgRoi).toBeNull();
    // But gross profit can still be shown
    expect(s.totalGrossProfitBeforeFees).toBe(19.98);
    expect(s.recordsMissingFees).toBe(1);
    expect(s.recordsWithFees).toBe(0);
  });

  it('shows gross profit but not realized profit in mixed scenario', () => {
    const withFees    = makeRecord();
    const withoutFees = makeRecord({ totalFees: null, realizedProfit: null, roi: null, sku: 'SKU-002' });
    const s = summarizeSales([withFees, withoutFees]);
    expect(s.recordsWithFees).toBe(1);
    expect(s.recordsMissingFees).toBe(1);
    // totalRealizedProfit only sums records where it's not null
    expect(s.totalRealizedProfit).toBe(14.48);
    expect(s.totalGrossProfitBeforeFees).toBe(39.96);
  });

  it('identifies top ASIN by units sold', () => {
    const r1 = makeRecord({ asin: 'B00SMALL', quantitySold: 1 });
    const r2 = makeRecord({ asin: 'B00BIG',   quantitySold: 10 });
    const r3 = makeRecord({ asin: 'B00BIG',   quantitySold: 5 });
    const s = summarizeSales([r1, r2, r3]);
    expect(s.topAsin).toBe('B00BIG');
  });

  it('tracks lastSaleDate as the most recent saleDate', () => {
    const r1 = makeRecord({ saleDate: new Date('2024-01-01') });
    const r2 = makeRecord({ saleDate: new Date('2024-06-15') });
    const s = summarizeSales([r1, r2]);
    expect(s.lastSaleDate?.toISOString().startsWith('2024-06-15')).toBe(true);
  });

  it('passes lastSync fields through', () => {
    const lastSync: SyncForSales = {
      status: 'DONE',
      startedAt: new Date('2024-06-01'),
      source: 'MANUAL_CSV',
    };
    const s = summarizeSales([], lastSync);
    expect(s.lastSyncAt).toEqual(new Date('2024-06-01'));
    expect(s.lastSyncStatus).toBe('DONE');
    expect(s.lastSyncSource).toBe('MANUAL_CSV');
    // hasData is false because no records, even if lastSync is present
    expect(s.hasData).toBe(false);
  });

  it('avgRoi is null when no records have roi data', () => {
    const r = makeRecord({ roi: null, realizedProfit: null, totalFees: null });
    const s = summarizeSales([r]);
    expect(s.avgRoi).toBeNull();
  });

  it('computes avgRoi when at least one record has roi', () => {
    const s = summarizeSales([
      makeRecord({ roi: 80 }),
      makeRecord({ roi: 40 }),
    ]);
    expect(s.avgRoi).toBe(60);
  });

  // No-fabrication: verify gross revenue always shows even when everything else is null
  it('always shows revenue even with zero cost/fee data', () => {
    const r = makeRecord({
      unitCostUsed: null, cogs: null, grossProfitBeforeFees: null,
      realizedProfit: null, roi: null, totalFees: null,
    });
    const s = summarizeSales([r]);
    expect(s.totalGrossRevenue).toBe(39.98);
    expect(s.totalNetRevenue).toBe(39.98);
    expect(s.totalCogs).toBeNull();
    expect(s.totalRealizedProfit).toBeNull();
  });
});

// ─── Amazon Fulfilled Shipments title-case header format (Phase 6.2.4) ───────

// Mirrors the real Amazon Fulfilled Shipments report headers exactly
const FULFILLED_SHIPMENTS_HEADERS = [
  'Amazon Order Id', 'Merchant Order Id', 'Shipment ID', 'Shipment Item Id',
  'Amazon Order Item Id', 'Merchant Order Item Id', 'Purchase Date', 'Payments Date',
  'Shipment Date', 'Reporting Date', 'Merchant SKU', 'Title',
  'Shipped Quantity', 'Currency', 'Item Price', 'Item Tax',
  'Shipping Price', 'Shipping Tax', 'Item Promo Discount',
  'Shipment Promo Discount', 'Fulfillment Channel', 'Sales Channel',
];

function makeShipmentRow(overrides: Record<string, string> = {}): string[] {
  const defaults: Record<string, string> = {
    'Amazon Order Id':         '114-1111111-1111111',
    'Merchant Order Id':       '',
    'Shipment ID':             'SHIP001',
    'Shipment Item Id':        '',
    'Amazon Order Item Id':    '158593198119961',
    'Merchant Order Item Id':  '',
    'Purchase Date':           '2024-04-25T10:00:00+00:00',
    'Payments Date':           '2024-04-26T10:00:00+00:00',
    'Shipment Date':           '2024-04-25T12:00:00+00:00',
    'Reporting Date':          '2024-04-25T12:00:00+00:00',
    'Merchant SKU':            'MY-SKU-001',
    'Title':                   'Test Product Title',
    'Shipped Quantity':        '1',
    'Currency':                'USD',
    'Item Price':              '19.99',
    'Item Tax':                '0.00',
    'Shipping Price':          '0.00',
    'Shipping Tax':            '0.00',
    'Item Promo Discount':     '0.00',
    'Shipment Promo Discount': '0.00',
    'Fulfillment Channel':     'Amazon',
    'Sales Channel':           'Amazon.com',
  };
  const merged = { ...defaults, ...overrides };
  return FULFILLED_SHIPMENTS_HEADERS.map((h) => merged[h] ?? '');
}

function shipmentTsv(...rows: string[][]): string {
  return [FULFILLED_SHIPMENTS_HEADERS, ...rows].map((r) => r.join('\t')).join('\n');
}

describe('parseSalesReport — Amazon Fulfilled Shipments format', () => {
  it('parses a title-case Fulfilled Shipments header row without errors', () => {
    const r = parseSalesReport(shipmentTsv(makeShipmentRow()));
    expect(r.errors).toHaveLength(0);
    expect(r.rows).toHaveLength(1);
  });

  it('maps Amazon Order Id correctly', () => {
    const r = parseSalesReport(shipmentTsv(makeShipmentRow()));
    expect(r.rows[0].amazonOrderId).toBe('114-1111111-1111111');
  });

  it('maps Amazon Order Item Id to orderItemId', () => {
    const r = parseSalesReport(shipmentTsv(makeShipmentRow()));
    expect(r.rows[0].orderItemId).toBe('158593198119961');
  });

  it('maps Merchant SKU to sku', () => {
    const r = parseSalesReport(shipmentTsv(makeShipmentRow()));
    expect(r.rows[0].sku).toBe('MY-SKU-001');
  });

  it('maps Shipped Quantity to quantitySold', () => {
    const r = parseSalesReport(shipmentTsv(makeShipmentRow({ 'Shipped Quantity': '3' })));
    expect(r.rows[0].quantitySold).toBe(3);
  });

  it('maps Item Price to grossRevenue', () => {
    const r = parseSalesReport(shipmentTsv(makeShipmentRow({ 'Item Price': '24.99' })));
    expect(r.rows[0].grossRevenue).toBe(24.99);
  });

  it('maps Item Tax to itemTax', () => {
    const r = parseSalesReport(shipmentTsv(makeShipmentRow({ 'Item Tax': '2.50' })));
    expect(r.rows[0].itemTax).toBe(2.50);
  });

  it('maps Purchase Date to saleDate', () => {
    const r = parseSalesReport(shipmentTsv(makeShipmentRow({ 'Purchase Date': '2024-04-25T10:00:00+00:00' })));
    expect(r.rows[0].saleDate.getFullYear()).toBe(2024);
    expect(r.rows[0].saleDate.getMonth()).toBe(3); // April = 3
    expect(r.rows[0].saleDate.getDate()).toBe(25);
  });

  it('Item Promo Discount reduces netRevenue', () => {
    const r = parseSalesReport(shipmentTsv(makeShipmentRow({ 'Item Price': '20.00', 'Item Promo Discount': '2.00' })));
    expect(r.rows[0].netRevenue).toBe(18.00);
  });

  it('Shipment Promo Discount reduces netRevenue', () => {
    const r = parseSalesReport(shipmentTsv(makeShipmentRow({ 'Item Price': '20.00', 'Shipment Promo Discount': '3.00' })));
    expect(r.rows[0].netRevenue).toBe(17.00);
  });

  it('maps Fulfillment Channel to fulfillmentChannel', () => {
    const r = parseSalesReport(shipmentTsv(makeShipmentRow({ 'Fulfillment Channel': 'Amazon' })));
    expect(r.rows[0].fulfillmentChannel).toBe('Amazon');
  });

  it('USD row imports normally', () => {
    const r = parseSalesReport(shipmentTsv(makeShipmentRow({ 'Currency': 'USD' })));
    expect(r.rows).toHaveLength(1);
    expect(r.currencySkipped).toBe(0);
  });

  it('MXN row is skipped and increments currencySkipped', () => {
    const r = parseSalesReport(shipmentTsv(makeShipmentRow({ 'Currency': 'MXN', 'Item Price': '555.14', 'Amazon Order Item Id': 'MX-001' })));
    expect(r.rows).toHaveLength(0);
    expect(r.currencySkipped).toBe(1);
    expect(r.errors).toHaveLength(0);
  });

  it('mixed USD + MXN file imports only USD rows', () => {
    const usdRow = makeShipmentRow({ 'Currency': 'USD', 'Amazon Order Item Id': '158593198119961' });
    const mxnRow = makeShipmentRow({ 'Currency': 'MXN', 'Amazon Order Item Id': 'MX-ITEM-001', 'Item Price': '555.14' });
    const r = parseSalesReport(shipmentTsv(usdRow, mxnRow));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].orderItemId).toBe('158593198119961');
    expect(r.currencySkipped).toBe(1);
    expect(r.total).toBe(2);
  });

  it('existing lower-case hyphenated orders report format still works', () => {
    // Regression: original flat-file format must be unaffected
    const r = parseSalesReport(tsv(HEADERS_TSV, makeRow()));
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(0);
    expect(r.rows[0].orderItemId).toBe('OI-001');
  });
});

// ─── Currency safety (parseSalesReport) ──────────────────────────────────────

const HEADERS_WITH_CURRENCY = [
  'amazon-order-id', 'purchase-date', 'order-status', 'fulfillment-channel',
  'asin', 'sku', 'product-name', 'quantity', 'item-price',
  'item-tax', 'item-promotion-discount', 'ship-promotion-discount',
  'order-item-id', 'currency',
];

function makeRowWithCurrency(currency: string, overrides: Record<string, string> = {}): string[] {
  const defaults: Record<string, string> = {
    'amazon-order-id':         '111-2222222-3333333',
    'purchase-date':           '2024-04-01T10:00:00+00:00',
    'order-status':            'Shipped',
    'fulfillment-channel':     'AFN',
    'asin':                    'B00CURR1234',
    'sku':                     'SKU-CURR',
    'product-name':            'Currency Test Product',
    'quantity':                '1',
    'item-price':              '25.00',
    'item-tax':                '0.00',
    'item-promotion-discount': '0.00',
    'ship-promotion-discount': '0.00',
    'order-item-id':           'OI-CURR-001',
    'currency':                currency,
  };
  const merged = { ...defaults, ...overrides };
  return HEADERS_WITH_CURRENCY.map((h) => merged[h] ?? '');
}

describe('parseSalesReport — currency safety', () => {
  it('imports USD rows normally', () => {
    const raw = tsv(HEADERS_WITH_CURRENCY, makeRowWithCurrency('USD'));
    const r = parseSalesReport(raw);
    expect(r.rows).toHaveLength(1);
    expect(r.currencySkipped).toBe(0);
    expect(r.rows[0].grossRevenue).toBe(25.00);
  });

  it('skips MXN rows and does not create a SaleRecord entry', () => {
    const raw = tsv(HEADERS_WITH_CURRENCY, makeRowWithCurrency('MXN', { 'item-price': '555.14', 'order-item-id': 'OI-MX-001' }));
    const r = parseSalesReport(raw);
    expect(r.rows).toHaveLength(0);
    expect(r.currencySkipped).toBe(1);
    expect(r.errors).toHaveLength(0);
  });

  it('skips CAD rows', () => {
    const raw = tsv(HEADERS_WITH_CURRENCY, makeRowWithCurrency('CAD'));
    const r = parseSalesReport(raw);
    expect(r.rows).toHaveLength(0);
    expect(r.currencySkipped).toBe(1);
  });

  it('imports USD row and skips MXN row in the same file', () => {
    const usdRow = makeRowWithCurrency('USD', { 'order-item-id': 'OI-USD-001' });
    const mxnRow = makeRowWithCurrency('MXN', { 'order-item-id': 'OI-MX-001', 'item-price': '555.14' });
    const raw = tsv(HEADERS_WITH_CURRENCY, usdRow, mxnRow);
    const r = parseSalesReport(raw);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].orderItemId).toBe('OI-USD-001');
    expect(r.currencySkipped).toBe(1);
    expect(r.total).toBe(2);
  });

  it('MXN amount is never stored — no row with item-price=555.14 exists in output', () => {
    const raw = tsv(HEADERS_WITH_CURRENCY, makeRowWithCurrency('MXN', { 'item-price': '555.14' }));
    const r = parseSalesReport(raw);
    expect(r.rows.every((row) => row.grossRevenue !== 555.14)).toBe(true);
  });

  it('rows without currency column are imported (backward-compatible)', () => {
    // Existing reports without a currency column should still work
    const raw = tsv(HEADERS_TSV, makeRow());
    const r = parseSalesReport(raw);
    expect(r.rows).toHaveLength(1);
    expect(r.currencySkipped).toBe(0);
  });

  it('currencySkipped is 0 when all rows are USD', () => {
    const raw = tsv(
      HEADERS_WITH_CURRENCY,
      makeRowWithCurrency('USD', { 'order-item-id': 'OI-1' }),
      makeRowWithCurrency('USD', { 'order-item-id': 'OI-2' }),
    );
    const r = parseSalesReport(raw);
    expect(r.currencySkipped).toBe(0);
    expect(r.rows).toHaveLength(2);
  });

  it('created/updated dedup counts still work alongside currency skipping', () => {
    // Two USD rows, one MXN — only 2 USD rows reach the upsert stage
    const usdA = makeRowWithCurrency('USD', { 'order-item-id': 'OI-A' });
    const usdB = makeRowWithCurrency('USD', { 'order-item-id': 'OI-B' });
    const mxn  = makeRowWithCurrency('MXN', { 'order-item-id': 'OI-MX' });
    const raw = tsv(HEADERS_WITH_CURRENCY, usdA, usdB, mxn);
    const r = parseSalesReport(raw);
    expect(r.rows).toHaveLength(2);
    expect(r.currencySkipped).toBe(1);
    expect(r.rows.map((row) => row.orderItemId)).toEqual(['OI-A', 'OI-B']);
  });
});

// ─── detectSettlementFileTypeError ────────────────────────────────────────────

// Real-world orders report header (Amazon Fulfilled Shipments)
const ORDERS_REPORT_HEADER =
  'order-id\torder-item-id\tasin\tsku\titem-price\titem-price-currency\tquantity-shipped\tship-service-level\tpurchase-date\trecipient-name\tship-city\tship-state\tfulfillment-channel';

// Minimal valid settlement header
const VALID_SETTLEMENT_HEADER_MIN =
  'settlement-id\tsettlement-start-date\tsettlement-end-date\ttransaction-type\torder-id\torder-item-code\tamount-type\tamount-description\tamount';

describe('detectSettlementFileTypeError', () => {
  it('returns null for a valid V2 settlement header', () => {
    expect(detectSettlementFileTypeError(VALID_SETTLEMENT_HEADER_MIN + '\nsome\tdata')).toBeNull();
  });

  it('returns null for a valid V1 settlement header', () => {
    const v1 = 'settlement-id\ttransaction-type\torder-id\torder-item-code\titem-related-fee-type\titem-related-fee-amount';
    expect(detectSettlementFileTypeError(v1 + '\nsome\tdata')).toBeNull();
  });

  it('detects an orders report by order-item-id header and returns isOrdersReport=true', () => {
    const result = detectSettlementFileTypeError(ORDERS_REPORT_HEADER + '\nsome\tdata');
    expect(result).not.toBeNull();
    expect(result!.isOrdersReport).toBe(true);
    expect(result!.message).toMatch(/Orders report/i);
  });

  it('orders report error message instructs user to use Import Orders Report', () => {
    const result = detectSettlementFileTypeError(ORDERS_REPORT_HEADER + '\nsome\tdata');
    expect(result!.message).toMatch(/Import Orders Report/i);
  });

  it('detects missing required settlement columns when file is not orders but not settlement either', () => {
    const random = 'product-name\tprice\tquantity\nSome Product\t9.99\t1';
    const result = detectSettlementFileTypeError(random);
    expect(result).not.toBeNull();
    expect(result!.isOrdersReport).toBe(false);
    expect(result!.missingRequired.length).toBeGreaterThan(0);
  });

  it('returns null for empty string (no false positive)', () => {
    // Empty file is handled downstream; file-type guard should not throw
    expect(() => detectSettlementFileTypeError('')).not.toThrow();
  });

  it('handles CSV delimiter correctly', () => {
    const csvSettlement = 'settlement-id,transaction-type,order-id,amount-type,amount-description,amount';
    expect(detectSettlementFileTypeError(csvSettlement + '\ndata,row')).toBeNull();
  });

  it('header matching is case-insensitive and trims whitespace', () => {
    const mixedCase = 'Settlement-Id\tTransaction-Type\tOrder-Id\tAmount-Type\tAmount-Description\tAmount';
    expect(detectSettlementFileTypeError(mixedCase + '\ndata')).toBeNull();
  });
});

// ─── Settlement parser ─────────────────────────────────────────────────────────

const SETTLEMENT_HEADERS = [
  'settlement-id', 'transaction-type', 'posted-date',
  'order-id', 'order-item-code', 'sku',
  'price-type', 'price-amount',
  'item-related-fee-type', 'item-related-fee-amount',
  'other-fee-reason-description',
].join('\t');

function settRow(fields: Partial<{
  settlementId: string; transactionType: string; postedDate: string;
  orderId: string; orderItemCode: string; sku: string;
  priceType: string; priceAmount: string;
  itemFeeType: string; itemFeeAmount: string;
  otherFeeReason: string;
}>): string {
  return [
    fields.settlementId    ?? '',
    fields.transactionType ?? 'Order',
    fields.postedDate      ?? '2024-01-15',
    fields.orderId         ?? '114-1234567-8901234',
    fields.orderItemCode   ?? '12345678901234',
    fields.sku             ?? 'SKU-A',
    fields.priceType       ?? '',
    fields.priceAmount     ?? '',
    fields.itemFeeType     ?? '',
    fields.itemFeeAmount   ?? '',
    fields.otherFeeReason  ?? '',
  ].join('\t');
}

describe('parseSettlementReport', () => {
  it('returns empty result for empty string', () => {
    const r = parseSettlementReport('');
    expect(r.allRows).toHaveLength(0);
    expect(r.rowsParsed).toBe(0);
  });

  it('returns empty result for header-only file', () => {
    const r = parseSettlementReport(SETTLEMENT_HEADERS);
    expect(r.allRows).toHaveLength(0);
    expect(r.rowsParsed).toBe(0);
  });

  it('parses a single Order row', () => {
    const raw = [SETTLEMENT_HEADERS, settRow({ itemFeeType: 'Commission', itemFeeAmount: '-3.60' })].join('\n');
    const r = parseSettlementReport(raw);
    expect(r.allRows).toHaveLength(1);
    expect(r.orderRows).toHaveLength(1);
    expect(r.refundRows).toHaveLength(0);
    expect(r.unsupportedRows).toHaveLength(0);
    expect(r.rowsParsed).toBe(1);
  });

  it('classifies Refund rows separately', () => {
    const raw = [
      SETTLEMENT_HEADERS,
      settRow({ transactionType: 'Refund', itemFeeType: 'Commission', itemFeeAmount: '3.60' }),
    ].join('\n');
    const r = parseSettlementReport(raw);
    expect(r.refundRows).toHaveLength(1);
    expect(r.orderRows).toHaveLength(0);
    expect(r.refundCount).toBe(1);
  });

  it('classifies Transfer rows as unsupported', () => {
    const raw = [SETTLEMENT_HEADERS, settRow({ transactionType: 'Transfer' })].join('\n');
    const r = parseSettlementReport(raw);
    expect(r.unsupportedRows).toHaveLength(1);
    expect(r.unsupportedCount).toBe(1);
  });

  it('parses signed float amounts', () => {
    const raw = [SETTLEMENT_HEADERS, settRow({ itemFeeType: 'Commission', itemFeeAmount: '-3.60', priceType: 'Principal', priceAmount: '15.99' })].join('\n');
    const r = parseSettlementReport(raw);
    expect(r.allRows[0].itemFeeAmount).toBe(-3.60);
    expect(r.allRows[0].priceAmount).toBe(15.99);
  });

  it('returns null for missing/empty amount fields', () => {
    const raw = [SETTLEMENT_HEADERS, settRow({})].join('\n');
    const r = parseSettlementReport(raw);
    expect(r.allRows[0].itemFeeAmount).toBeNull();
    expect(r.allRows[0].priceAmount).toBeNull();
  });

  it('parses postedDate as Date when present', () => {
    const raw = [SETTLEMENT_HEADERS, settRow({ postedDate: '2024-03-10' })].join('\n');
    const r = parseSettlementReport(raw);
    expect(r.allRows[0].postedDate).toBeInstanceOf(Date);
  });

  it('handles CRLF line endings', () => {
    const raw = [SETTLEMENT_HEADERS, settRow({})].join('\r\n');
    const r = parseSettlementReport(raw);
    expect(r.allRows).toHaveLength(1);
  });

  it('tolerates missing optional columns', () => {
    const minHeaders = 'transaction-type\torder-id\torder-item-code';
    const minRow = 'Order\t114-1234567-8901234\t12345678901234';
    const r = parseSettlementReport([minHeaders, minRow].join('\n'));
    expect(r.allRows).toHaveLength(1);
    expect(r.allRows[0].transactionType).toBe('Order');
    expect(r.allRows[0].settlementId).toBeNull();
    expect(r.allRows[0].itemFeeAmount).toBeNull();
  });

  it('detects CSV (comma) delimiter', () => {
    const csvHeaders = 'settlement-id,transaction-type,order-id,order-item-code,item-related-fee-type,item-related-fee-amount';
    const csvRow = 'S123,Order,114-1234567-8901234,12345678901234,Commission,-4.50';
    const r = parseSettlementReport([csvHeaders, csvRow].join('\n'));
    expect(r.allRows).toHaveLength(1);
    expect(r.allRows[0].itemFeeAmount).toBe(-4.50);
  });

  it('assigns unique dedupKey to each row even with identical content at different positions', () => {
    const rowStr = settRow({ itemFeeType: 'Commission', itemFeeAmount: '-3.60' });
    const raw = [SETTLEMENT_HEADERS, rowStr, rowStr].join('\n');
    const r = parseSettlementReport(raw);
    expect(r.allRows).toHaveLength(2);
    expect(r.allRows[0].dedupKey).not.toBe(r.allRows[1].dedupKey);
  });

  it('accumulates orderItemCode from row', () => {
    const raw = [SETTLEMENT_HEADERS, settRow({ orderItemCode: 'ITEM001' })].join('\n');
    const r = parseSettlementReport(raw);
    expect(r.allRows[0].orderItemCode).toBe('ITEM001');
  });
});

describe('groupSettlementFees', () => {
  it('aggregates referral fee rows', () => {
    const rows = [
      { orderItemCode: 'ITEM001', orderId: 'ORD001', sku: 'SKU-A', itemFeeType: 'Commission', itemFeeAmount: -3.60 },
    ].map((f) => ({
      ...f, dedupKey: '', settlementId: null, transactionType: 'Order',
      postedDate: null, priceType: null, priceAmount: null, otherFeeReason: null, rawPayload: {},
    }));
    const groups = groupSettlementFees(rows as any);
    const g = groups.get('ITEM001')!;
    expect(g.referralFee).toBe(3.60);
    expect(g.fbaFee).toBe(0);
    expect(g.otherFees).toBe(0);
    expect(g.totalFees).toBe(3.60);
  });

  it('aggregates FBA fee rows', () => {
    const rows = [
      { orderItemCode: 'ITEM002', orderId: 'ORD002', sku: 'SKU-B', itemFeeType: 'FBAPerUnitFulfillmentFee', itemFeeAmount: -3.22 },
    ].map((f) => ({
      ...f, dedupKey: '', settlementId: null, transactionType: 'Order',
      postedDate: null, priceType: null, priceAmount: null, otherFeeReason: null, rawPayload: {},
    }));
    const groups = groupSettlementFees(rows as any);
    expect(groups.get('ITEM002')!.fbaFee).toBe(3.22);
  });

  it('aggregates multiple fee types for same orderItemCode', () => {
    const base = { dedupKey: '', settlementId: null, transactionType: 'Order', postedDate: null, priceType: null, priceAmount: null, otherFeeReason: null, rawPayload: {} };
    const rows = [
      { ...base, orderItemCode: 'ITEM003', orderId: 'ORD003', sku: 'SKU-C', itemFeeType: 'Commission', itemFeeAmount: -3.60 },
      { ...base, orderItemCode: 'ITEM003', orderId: 'ORD003', sku: 'SKU-C', itemFeeType: 'FBAPerUnitFulfillmentFee', itemFeeAmount: -3.22 },
      { ...base, orderItemCode: 'ITEM003', orderId: 'ORD003', sku: 'SKU-C', itemFeeType: 'VariableClosingFee', itemFeeAmount: -1.00 },
    ];
    const groups = groupSettlementFees(rows as any);
    const g = groups.get('ITEM003')!;
    expect(g.referralFee).toBe(3.60);
    expect(g.fbaFee).toBe(3.22);
    expect(g.otherFees).toBe(1.00);
    expect(g.totalFees).toBe(7.82);
  });

  it('skips rows with no orderItemCode', () => {
    const rows = [
      { dedupKey: '', settlementId: null, transactionType: 'Order', postedDate: null, orderId: 'ORD', orderItemCode: null, sku: null, priceType: null, priceAmount: null, itemFeeType: 'Commission', itemFeeAmount: -3.60, otherFeeReason: null, rawPayload: {} },
    ];
    const groups = groupSettlementFees(rows as any);
    expect(groups.size).toBe(0);
  });

  it('keeps separate groups for different orderItemCodes', () => {
    const base = { dedupKey: '', settlementId: null, transactionType: 'Order', postedDate: null, priceType: null, priceAmount: null, otherFeeReason: null, rawPayload: {} };
    const rows = [
      { ...base, orderItemCode: 'ITEM-A', orderId: 'ORD', sku: 'SKU', itemFeeType: 'Commission', itemFeeAmount: -2.00 },
      { ...base, orderItemCode: 'ITEM-B', orderId: 'ORD', sku: 'SKU', itemFeeType: 'Commission', itemFeeAmount: -4.00 },
    ];
    const groups = groupSettlementFees(rows as any);
    expect(groups.size).toBe(2);
    expect(groups.get('ITEM-A')!.referralFee).toBe(2.00);
    expect(groups.get('ITEM-B')!.referralFee).toBe(4.00);
  });

  it('ignores rows with null itemFeeAmount', () => {
    const rows = [
      { dedupKey: '', settlementId: null, transactionType: 'Order', postedDate: null, orderId: 'ORD', orderItemCode: 'ITEM', sku: null, priceType: 'Principal', priceAmount: 15.99, itemFeeType: null, itemFeeAmount: null, otherFeeReason: null, rawPayload: {} },
    ];
    const groups = groupSettlementFees(rows as any);
    const g = groups.get('ITEM')!;
    expect(g.referralFee).toBe(0);
    expect(g.totalFees).toBe(0);
  });
});

// ─── V2 amount-type / amount-description / amount format ─────────────────────

// V2 headers — matches actual Amazon GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE layout
const V2_HEADERS = [
  'settlement-id', 'transaction-type', 'order-id', 'order-item-code', 'sku',
  'posted-date', 'amount-type', 'amount-description', 'amount',
].join('\t');

function v2Row(fields: Partial<{
  settlementId: string; transactionType: string; orderId: string;
  orderItemCode: string; sku: string; postedDate: string;
  amountType: string; amountDescription: string; amount: string;
}>): string {
  return [
    fields.settlementId    ?? 'S001',
    fields.transactionType ?? 'Order',
    fields.orderId         ?? '114-1234567-8901234',
    fields.orderItemCode   ?? 'ITEM001',
    fields.sku             ?? 'SKU-A',
    fields.postedDate      ?? '2024-01-15',
    fields.amountType      ?? '',
    fields.amountDescription ?? '',
    fields.amount          ?? '',
  ].join('\t');
}

function v2Tsv(...rows: string[]): string {
  return [V2_HEADERS, ...rows].join('\n');
}

describe('parseSettlementReport — V2 format (amount-type / amount-description / amount)', () => {
  it('maps amount-type=ItemFees / amount-description=Commission to itemFeeType=Commission', () => {
    const raw = v2Tsv(v2Row({ amountType: 'ItemFees', amountDescription: 'Commission', amount: '-3.60' }));
    const r = parseSettlementReport(raw);
    expect(r.orderRows).toHaveLength(1);
    expect(r.orderRows[0].itemFeeType).toBe('Commission');
    expect(r.orderRows[0].itemFeeAmount).toBe(-3.60);
    expect(r.orderRows[0].priceType).toBeNull();
    expect(r.orderRows[0].priceAmount).toBeNull();
  });

  it('maps amount-type=ItemFees / amount-description=FBAPerUnitFulfillmentFee to itemFeeType', () => {
    const raw = v2Tsv(v2Row({ amountType: 'ItemFees', amountDescription: 'FBAPerUnitFulfillmentFee', amount: '-3.22' }));
    const r = parseSettlementReport(raw);
    expect(r.orderRows[0].itemFeeType).toBe('FBAPerUnitFulfillmentFee');
    expect(r.orderRows[0].itemFeeAmount).toBe(-3.22);
  });

  it('maps amount-type=ItemPrice / amount-description=Principal to priceType=Principal', () => {
    const raw = v2Tsv(v2Row({ amountType: 'ItemPrice', amountDescription: 'Principal', amount: '15.99' }));
    const r = parseSettlementReport(raw);
    expect(r.orderRows[0].priceType).toBe('Principal');
    expect(r.orderRows[0].priceAmount).toBe(15.99);
    expect(r.orderRows[0].itemFeeType).toBeNull();
    expect(r.orderRows[0].itemFeeAmount).toBeNull();
  });

  it('ItemPrice/Principal does not affect groupSettlementFees fee totals', () => {
    const raw = v2Tsv(v2Row({ amountType: 'ItemPrice', amountDescription: 'Principal', amount: '15.99' }));
    const r = parseSettlementReport(raw);
    const g = r.feeGroups.get('ITEM001');
    // group is created because the row has an orderItemCode, but no fee amounts are added
    expect(g?.referralFee ?? 0).toBe(0);
    expect(g?.fbaFee      ?? 0).toBe(0);
    expect(g?.totalFees   ?? 0).toBe(0);
  });

  it('aggregates Commission + FBAPerUnitFulfillmentFee for the same orderItemCode (V2)', () => {
    const raw = v2Tsv(
      v2Row({ amountType: 'ItemFees', amountDescription: 'Commission',              amount: '-3.60' }),
      v2Row({ amountType: 'ItemFees', amountDescription: 'FBAPerUnitFulfillmentFee', amount: '-3.22' }),
      v2Row({ amountType: 'ItemFees', amountDescription: 'VariableClosingFee',       amount: '-1.00' }),
    );
    const r = parseSettlementReport(raw);
    const g = r.feeGroups.get('ITEM001')!;
    expect(g.referralFee).toBe(3.60);
    expect(g.fbaFee).toBe(3.22);
    expect(g.otherFees).toBe(1.00);
    expect(g.totalFees).toBe(7.82);
  });

  it('unknown amount-type is stored as priceType, no fee mapping', () => {
    const raw = v2Tsv(v2Row({ amountType: 'UnknownType', amountDescription: 'Something', amount: '-5.00' }));
    const r = parseSettlementReport(raw);
    expect(r.orderRows[0].priceType).toBe('UnknownType');
    expect(r.orderRows[0].itemFeeType).toBeNull();
  });

  it('other-transaction rows are stored as unsupportedRows and not applied (V2)', () => {
    const raw = v2Tsv(
      v2Row({ transactionType: 'other-transaction', orderItemCode: '', amountType: 'other-transaction', amountDescription: 'Subscription Fee', amount: '-19.08' }),
    );
    const r = parseSettlementReport(raw);
    expect(r.unsupportedRows).toHaveLength(1);
    expect(r.orderRows).toHaveLength(0);
    expect(r.feeGroups.size).toBe(0);
  });

  it('V2 and V1 rows in the same parse call both work', () => {
    // V1 row
    const v1Headers = 'settlement-id\ttransaction-type\torder-id\torder-item-code\tsku\tposted-date\titem-related-fee-type\titem-related-fee-amount';
    const v1Row = 'S001\tOrder\t114-1234567-8901234\tITEM-V1\tSKU\t2024-01-15\tCommission\t-2.50';
    // V2 row is handled separately (different header sets can't be mixed in one file)
    // But we can confirm V1 still parses correctly
    const r = parseSettlementReport([v1Headers, v1Row].join('\n'));
    expect(r.orderRows).toHaveLength(1);
    expect(r.orderRows[0].itemFeeType).toBe('Commission');
    expect(r.orderRows[0].itemFeeAmount).toBe(-2.50);
  });

  it('V2 Commission row generates same dedupKey on re-parse (idempotency)', () => {
    const raw = v2Tsv(v2Row({ amountType: 'ItemFees', amountDescription: 'Commission', amount: '-3.60' }));
    const r1 = parseSettlementReport(raw);
    const r2 = parseSettlementReport(raw);
    expect(r1.orderRows[0].dedupKey).toBe(r2.orderRows[0].dedupKey);
  });
});

describe('buildSettlementDedupKey', () => {
  it('produces a stable key for the same inputs', () => {
    const k1 = buildSettlementDedupKey('S1', 'Order', 'O1', 'I1', 'Commission', 'Principal', 15.99, -3.60, 1);
    const k2 = buildSettlementDedupKey('S1', 'Order', 'O1', 'I1', 'Commission', 'Principal', 15.99, -3.60, 1);
    expect(k1).toBe(k2);
  });

  it('produces different keys when rowIndex differs', () => {
    const k1 = buildSettlementDedupKey('S1', 'Order', 'O1', 'I1', null, null, null, null, 1);
    const k2 = buildSettlementDedupKey('S1', 'Order', 'O1', 'I1', null, null, null, null, 2);
    expect(k1).not.toBe(k2);
  });

  it('handles null fields without throwing', () => {
    expect(() => buildSettlementDedupKey(null, null, null, null, null, null, null, null, 0)).not.toThrow();
  });
});

// ─── getSaleProfitStatus ──────────────────────────────────────────────────────

describe('getSaleProfitStatus', () => {
  it('returns COMPLETE when cost, fees, and realizedProfit are all present', () => {
    expect(getSaleProfitStatus({ unitCostUsed: 10, totalFees: 3, realizedProfit: 5 })).toBe('COMPLETE');
  });

  it('returns COMPLETE with zero values (zero cost / zero fees are valid)', () => {
    expect(getSaleProfitStatus({ unitCostUsed: 0, totalFees: 0, realizedProfit: 0 })).toBe('COMPLETE');
  });

  it('returns GROSS_ONLY when cost is present but fees are null', () => {
    expect(getSaleProfitStatus({ unitCostUsed: 10, totalFees: null, realizedProfit: null })).toBe('GROSS_ONLY');
  });

  it('returns INCOMPLETE when cost and fees are present but realizedProfit is null', () => {
    expect(getSaleProfitStatus({ unitCostUsed: 10, totalFees: 3, realizedProfit: null })).toBe('INCOMPLETE');
  });

  it('returns MISSING_COST when fees are present but cost is null', () => {
    expect(getSaleProfitStatus({ unitCostUsed: null, totalFees: 3, realizedProfit: null })).toBe('MISSING_COST');
  });

  it('returns NO_PROFIT_DATA when both cost and fees are null', () => {
    expect(getSaleProfitStatus({ unitCostUsed: null, totalFees: null, realizedProfit: null })).toBe('NO_PROFIT_DATA');
  });

  it('returns NO_PROFIT_DATA when all fields are null', () => {
    expect(getSaleProfitStatus({ unitCostUsed: null, totalFees: null, realizedProfit: null })).toBe('NO_PROFIT_DATA');
  });

  it('MISSING_COST: realizedProfit null even if fees are present when no cost', () => {
    expect(getSaleProfitStatus({ unitCostUsed: null, totalFees: 5.50, realizedProfit: null })).toBe('MISSING_COST');
  });

  it('returns INCOMPLETE when cost and fees are present but realizedProfit is null (edge case)', () => {
    expect(getSaleProfitStatus({ unitCostUsed: 12.09, totalFees: 9.31, realizedProfit: null })).toBe('INCOMPLETE');
  });

  it('G06 production-like case: cost=12.09, fees=9.31, realizedProfit=3.60 → COMPLETE', () => {
    expect(getSaleProfitStatus({ unitCostUsed: 12.09, totalFees: 9.31, realizedProfit: 3.60 })).toBe('COMPLETE');
  });

  it('INCOMPLETE is distinct from GROSS_ONLY: fees present means not gross-only', () => {
    const grossOnly  = getSaleProfitStatus({ unitCostUsed: 10, totalFees: null,  realizedProfit: null });
    const incomplete = getSaleProfitStatus({ unitCostUsed: 10, totalFees: 3,     realizedProfit: null });
    expect(grossOnly).toBe('GROSS_ONLY');
    expect(incomplete).toBe('INCOMPLETE');
    expect(grossOnly).not.toBe(incomplete);
  });
});

// ─── parseSalesFilter ─────────────────────────────────────────────────────────

describe('parseSalesFilter', () => {
  it('returns "all" for null', () => {
    expect(parseSalesFilter(null)).toBe('all');
  });

  it('returns "all" for undefined', () => {
    expect(parseSalesFilter(undefined)).toBe('all');
  });

  it('returns "all" for an invalid string', () => {
    expect(parseSalesFilter('garbage')).toBe('all');
    expect(parseSalesFilter('')).toBe('all');
    expect(parseSalesFilter('COMPLETE')).toBe('all'); // case-sensitive
  });

  it('returns each valid filter value unchanged', () => {
    const valid = ['all', 'complete', 'gross-only', 'missing-fees', 'missing-cost', 'no-profit-data', 'incomplete'];
    for (const v of valid) {
      expect(parseSalesFilter(v)).toBe(v);
    }
  });
});

// ─── applySalesFilter ─────────────────────────────────────────────────────────

describe('applySalesFilter', () => {
  // Representative rows for each status
  const complete      = { unitCostUsed: 10, totalFees: 3,    realizedProfit: 5    };
  const grossOnly     = { unitCostUsed: 10, totalFees: null,  realizedProfit: null };
  const missingCost   = { unitCostUsed: null, totalFees: 3,  realizedProfit: null };
  const noProfitData  = { unitCostUsed: null, totalFees: null, realizedProfit: null };
  const incomplete    = { unitCostUsed: 10, totalFees: 3,    realizedProfit: null };
  const all           = [complete, grossOnly, missingCost, noProfitData, incomplete];

  it('"all" returns every row unchanged', () => {
    expect(applySalesFilter(all, 'all')).toHaveLength(5);
    expect(applySalesFilter(all, 'all')).toEqual(all);
  });

  it('"complete" returns only COMPLETE rows', () => {
    const result = applySalesFilter(all, 'complete');
    expect(result).toEqual([complete]);
  });

  it('"gross-only" returns only GROSS_ONLY rows', () => {
    const result = applySalesFilter(all, 'gross-only');
    expect(result).toEqual([grossOnly]);
  });

  // missing-fees = totalFees === null (GROSS_ONLY + NO_PROFIT_DATA)
  it('"missing-fees" includes GROSS_ONLY rows (cost present, fees null)', () => {
    expect(applySalesFilter(all, 'missing-fees')).toContain(grossOnly);
  });

  it('"missing-fees" includes NO_PROFIT_DATA rows (cost null, fees null)', () => {
    expect(applySalesFilter(all, 'missing-fees')).toContain(noProfitData);
  });

  it('"missing-fees" excludes COMPLETE rows (fees present)', () => {
    expect(applySalesFilter(all, 'missing-fees')).not.toContain(complete);
  });

  it('"missing-fees" excludes MISSING_COST rows (fees present)', () => {
    expect(applySalesFilter(all, 'missing-fees')).not.toContain(missingCost);
  });

  it('"missing-fees" count equals rows where totalFees is null', () => {
    const result = applySalesFilter(all, 'missing-fees');
    expect(result.length).toBe(all.filter(r => r.totalFees === null).length);
  });

  // missing-cost = unitCostUsed === null (MISSING_COST + NO_PROFIT_DATA)
  it('"missing-cost" includes MISSING_COST rows (fees present, cost null)', () => {
    expect(applySalesFilter(all, 'missing-cost')).toContain(missingCost);
  });

  it('"missing-cost" includes NO_PROFIT_DATA rows (fees null, cost null)', () => {
    expect(applySalesFilter(all, 'missing-cost')).toContain(noProfitData);
  });

  it('"missing-cost" excludes COMPLETE rows (cost present)', () => {
    expect(applySalesFilter(all, 'missing-cost')).not.toContain(complete);
  });

  it('"missing-cost" excludes GROSS_ONLY rows (cost present)', () => {
    expect(applySalesFilter(all, 'missing-cost')).not.toContain(grossOnly);
  });

  it('"missing-cost" count equals rows where unitCostUsed is null', () => {
    const result = applySalesFilter(all, 'missing-cost');
    expect(result.length).toBe(all.filter(r => r.unitCostUsed === null).length);
  });

  it('"no-profit-data" returns only NO_PROFIT_DATA rows', () => {
    const result = applySalesFilter(all, 'no-profit-data');
    expect(result).toEqual([noProfitData]);
  });

  it('"incomplete" returns only INCOMPLETE rows', () => {
    const result = applySalesFilter(all, 'incomplete');
    expect(result).toEqual([incomplete]);
  });

  it('missing-fees and missing-cost overlap on NO_PROFIT_DATA rows', () => {
    const missingFeesResult = applySalesFilter(all, 'missing-fees');
    const missingCostResult = applySalesFilter(all, 'missing-cost');
    // noProfitData appears in both (totalFees null AND unitCostUsed null)
    expect(missingFeesResult).toContain(noProfitData);
    expect(missingCostResult).toContain(noProfitData);
  });
});

// ─── isEligibleForCostRecalculation ───────────────────────────────────────────

function makeRecalcRecord(overrides: Partial<RecalcSaleRecord> = {}): RecalcSaleRecord {
  return {
    id:           'rec_1',
    sku:          'SKU-TEST',
    asin:         'B00TEST001',
    quantitySold: 2,
    netRevenue:   39.98,
    totalFees:    null,
    unitCostUsed: null,
    orderStatus:  'Shipped',
    ...overrides,
  };
}

describe('isEligibleForCostRecalculation', () => {
  it('marks a valid record as eligible', () => {
    const { eligible } = isEligibleForCostRecalculation(makeRecalcRecord());
    expect(eligible).toBe(true);
  });

  it('skips a record that already has unitCostUsed', () => {
    const { eligible, reason } = isEligibleForCostRecalculation(
      makeRecalcRecord({ unitCostUsed: 12.09 }),
    );
    expect(eligible).toBe(false);
    expect(reason).toContain('already has unit cost');
  });

  it('skips a record with null SKU', () => {
    const { eligible, reason } = isEligibleForCostRecalculation(
      makeRecalcRecord({ sku: null }),
    );
    expect(eligible).toBe(false);
    expect(reason).toContain('no SKU');
  });

  it('skips a record with quantitySold = 0', () => {
    const { eligible, reason } = isEligibleForCostRecalculation(
      makeRecalcRecord({ quantitySold: 0 }),
    );
    expect(eligible).toBe(false);
    expect(reason).toContain('quantity sold is zero');
  });

  it('skips a record with negative quantitySold', () => {
    const { eligible } = isEligibleForCostRecalculation(
      makeRecalcRecord({ quantitySold: -1 }),
    );
    expect(eligible).toBe(false);
  });

  it('skips Cancelled status', () => {
    const { eligible, reason } = isEligibleForCostRecalculation(
      makeRecalcRecord({ orderStatus: 'Cancelled' }),
    );
    expect(eligible).toBe(false);
    expect(reason).toContain('Cancelled');
  });

  it('skips Pending status', () => {
    const { eligible } = isEligibleForCostRecalculation(
      makeRecalcRecord({ orderStatus: 'Pending' }),
    );
    expect(eligible).toBe(false);
  });

  it('skips PendingAvailability status', () => {
    const { eligible } = isEligibleForCostRecalculation(
      makeRecalcRecord({ orderStatus: 'PendingAvailability' }),
    );
    expect(eligible).toBe(false);
  });

  it('skips Unshipped status', () => {
    const { eligible } = isEligibleForCostRecalculation(
      makeRecalcRecord({ orderStatus: 'Unshipped' }),
    );
    expect(eligible).toBe(false);
  });

  it('allows null orderStatus (not a disqualifying condition)', () => {
    const { eligible } = isEligibleForCostRecalculation(
      makeRecalcRecord({ orderStatus: null }),
    );
    expect(eligible).toBe(true);
  });
});

// ─── applyInventoryCostToSaleRecord ───────────────────────────────────────────

describe('applyInventoryCostToSaleRecord', () => {
  it('computes cogs and grossProfitBeforeFees; realizedProfit null when totalFees null', () => {
    const result = applyInventoryCostToSaleRecord(
      { netRevenue: 39.98, quantitySold: 2, totalFees: null },
      12.09,
    );
    expect(result.unitCostUsed).toBe(12.09);
    expect(result.costSource).toBe('INVENTORY');
    expect(result.cogs).toBe(24.18);                      // 12.09 × 2
    expect(result.grossProfitBeforeFees).toBe(15.80);    // 39.98 − 24.18
    expect(result.realizedProfit).toBeNull();
    expect(result.roi).toBeNull();
  });

  it('computes realizedProfit and roi when totalFees is present', () => {
    const result = applyInventoryCostToSaleRecord(
      { netRevenue: 39.98, quantitySold: 2, totalFees: 9.31 },
      12.09,
    );
    expect(result.unitCostUsed).toBe(12.09);
    expect(result.costSource).toBe('INVENTORY');
    expect(result.cogs).toBe(24.18);
    expect(result.grossProfitBeforeFees).toBe(15.80);
    expect(result.realizedProfit).toBe(6.49);             // 39.98 − 9.31 − 24.18
    expect(result.roi).toBeCloseTo((6.49 / 24.18) * 100, 1);
  });

  it('delegates formula to computeSaleProfit — roi is null when cogs is zero', () => {
    const result = applyInventoryCostToSaleRecord(
      { netRevenue: 10.00, quantitySold: 1, totalFees: 2.00 },
      0.00,
    );
    // unitCost of 0 → cogs = 0 → roi formula guards against divide-by-zero
    expect(result.cogs).toBe(0);
    expect(result.roi).toBeNull();
  });
});

// ─── previewInventoryCostRecalculation ────────────────────────────────────────

describe('previewInventoryCostRecalculation', () => {
  const inventoryItem = { sku: 'SKU-TEST', unitCost: 12.09 };

  it('separates eligible from ineligible rows', () => {
    const records: RecalcSaleRecord[] = [
      makeRecalcRecord({ id: 'r1' }),
      makeRecalcRecord({ id: 'r2', unitCostUsed: 12.09 }),   // already has cost → skip
      makeRecalcRecord({ id: 'r3', quantitySold: 0 }),        // qty 0 → skip
    ];
    const { eligible, skipped, projections } =
      previewInventoryCostRecalculation(records, inventoryItem);

    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('r1');
    expect(skipped).toHaveLength(2);
    expect(projections.has('r1')).toBe(true);
    expect(projections.has('r2')).toBe(false);
  });

  it('always includes the historical-cost warning', () => {
    const { warnings } = previewInventoryCostRecalculation(
      [makeRecalcRecord()],
      inventoryItem,
    );
    expect(warnings.some((w) => w.includes('current inventory unit cost'))).toBe(true);
  });

  it('adds fee-gap warning when eligible rows have totalFees null', () => {
    const records = [makeRecalcRecord({ id: 'r1', totalFees: null })];
    const { warnings } = previewInventoryCostRecalculation(records, inventoryItem);
    expect(warnings.some((w) => w.includes('missing settlement fees'))).toBe(true);
  });

  it('does not add fee-gap warning when all eligible rows have fees', () => {
    const records = [makeRecalcRecord({ id: 'r1', totalFees: 9.31 })];
    const { warnings } = previewInventoryCostRecalculation(records, inventoryItem);
    expect(warnings.some((w) => w.includes('missing settlement fees'))).toBe(false);
  });

  it('produces correct projections for eligible rows', () => {
    const record = makeRecalcRecord({ id: 'r1', netRevenue: 39.98, quantitySold: 2 });
    const { projections } = previewInventoryCostRecalculation([record], inventoryItem);
    const proj = projections.get('r1')!;
    expect(proj.unitCostUsed).toBe(12.09);
    expect(proj.costSource).toBe('INVENTORY');
    expect(proj.cogs).toBe(24.18);
    expect(proj.grossProfitBeforeFees).toBe(15.80);
    expect(proj.realizedProfit).toBeNull();
  });

  it('returns empty eligible and skipped when records array is empty', () => {
    const { eligible, skipped } = previewInventoryCostRecalculation([], inventoryItem);
    expect(eligible).toHaveLength(0);
    expect(skipped).toHaveLength(0);
  });

  it.each([
    { label: 'null',     unitCost: null },
    { label: 'zero',     unitCost: 0 },
    { label: 'negative', unitCost: -5 },
    { label: 'NaN',      unitCost: NaN },
    { label: 'Infinity', unitCost: Infinity },
  ])('returns all records as skipped with a warning when unitCost is $label', ({ unitCost }) => {
    const records = [makeRecalcRecord({ id: 'r1' }), makeRecalcRecord({ id: 'r2' })];
    const { eligible, skipped, projections, warnings } =
      previewInventoryCostRecalculation(records, { sku: 'SKU-TEST', unitCost });
    expect(eligible).toHaveLength(0);
    expect(skipped).toHaveLength(2);
    expect(projections.size).toBe(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/no valid positive unit cost/);
    expect(skipped[0].skipReason).toMatch(/no valid unit cost/);
  });
});

// ─── classifyRefundSettlementRow ─────────────────────────────────────────────

describe('classifyRefundSettlementRow', () => {
  function makeRefundRow(overrides: Partial<RefundRowInput> = {}): RefundRowInput {
    return {
      transactionType: 'Refund',
      orderItemCode:   'ITEM-001',
      priceType:       null,
      priceAmount:     null,
      itemFeeType:     null,
      itemFeeAmount:   null,
      otherFeeReason:  null,
      ...overrides,
    };
  }

  it('classifies Principal price type as PRINCIPAL_REFUND', () => {
    const result = classifyRefundSettlementRow(makeRefundRow({ priceType: 'Principal', priceAmount: -19.99 }));
    expect(result.adjustmentType).toBe('PRINCIPAL_REFUND');
    expect(result.amountCategory).toBe('Principal');
    expect(result.amount).toBe(-19.99);
    expect(result.profitImpact).toBe(-19.99);
    expect(result.eligibleForItemLevelPreview).toBe(true);
  });

  it('classifies Tax price type as TAX_REFUND', () => {
    const result = classifyRefundSettlementRow(makeRefundRow({ priceType: 'Tax', priceAmount: -1.60 }));
    expect(result.adjustmentType).toBe('TAX_REFUND');
    expect(result.amountCategory).toBe('Tax');
    expect(result.amount).toBe(-1.60);
    expect(result.profitImpact).toBe(-1.60);
    expect(result.eligibleForItemLevelPreview).toBe(true);
  });

  it('classifies Commission itemFeeType as FEE_CREDIT', () => {
    const result = classifyRefundSettlementRow(makeRefundRow({ itemFeeType: 'Commission', itemFeeAmount: 2.25 }));
    expect(result.adjustmentType).toBe('FEE_CREDIT');
    expect(result.amountCategory).toBe('Commission');
    expect(result.amount).toBe(2.25);
    expect(result.profitImpact).toBe(2.25);
    expect(result.eligibleForItemLevelPreview).toBe(true);
  });

  it('classifies FBAPerUnitFulfillmentFee as FEE_CREDIT', () => {
    const result = classifyRefundSettlementRow(makeRefundRow({ itemFeeType: 'FBAPerUnitFulfillmentFee', itemFeeAmount: 3.30 }));
    expect(result.adjustmentType).toBe('FEE_CREDIT');
    expect(result.amountCategory).toBe('FBAPerUnitFulfillmentFee');
    expect(result.profitImpact).toBe(3.30);
    expect(result.eligibleForItemLevelPreview).toBe(true);
  });

  it('classifies FBAPerOrderFulfillmentFee as FEE_CREDIT', () => {
    const result = classifyRefundSettlementRow(makeRefundRow({ itemFeeType: 'FBAPerOrderFulfillmentFee', itemFeeAmount: 1.80 }));
    expect(result.adjustmentType).toBe('FEE_CREDIT');
    expect(result.eligibleForItemLevelPreview).toBe(true);
  });

  it('classifies ReturnShipping itemFeeType as RETURN_FEE', () => {
    const result = classifyRefundSettlementRow(makeRefundRow({ itemFeeType: 'ReturnShipping', itemFeeAmount: -2.50 }));
    expect(result.adjustmentType).toBe('RETURN_FEE');
    expect(result.amountCategory).toBe('ReturnShipping');
    expect(result.profitImpact).toBe(-2.50);
    expect(result.eligibleForItemLevelPreview).toBe(true);
  });

  it('classifies ShippingCharge priceType as RETURN_FEE', () => {
    const result = classifyRefundSettlementRow(makeRefundRow({ priceType: 'ShippingCharge', priceAmount: -4.99 }));
    expect(result.adjustmentType).toBe('RETURN_FEE');
    expect(result.amountCategory).toBe('ShippingCharge');
    expect(result.profitImpact).toBe(-4.99);
  });

  it('returns UNSUPPORTED for unknown priceType/itemFeeType', () => {
    const result = classifyRefundSettlementRow(makeRefundRow({ priceType: 'MarketplaceFacilitatorTax-Principal' }));
    expect(result.adjustmentType).toBe('UNSUPPORTED');
    expect(result.eligibleForItemLevelPreview).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('returns UNSUPPORTED for a non-Refund transactionType', () => {
    const result = classifyRefundSettlementRow(makeRefundRow({ transactionType: 'Order' }));
    expect(result.adjustmentType).toBe('UNSUPPORTED');
    expect(result.eligibleForItemLevelPreview).toBe(false);
    expect(result.reason).toContain('Order');
  });

  it('returns UNSUPPORTED for null transactionType', () => {
    const result = classifyRefundSettlementRow(makeRefundRow({ transactionType: null }));
    expect(result.adjustmentType).toBe('UNSUPPORTED');
    expect(result.eligibleForItemLevelPreview).toBe(false);
  });

  it('sets eligibleForItemLevelPreview=false when orderItemCode is null', () => {
    const result = classifyRefundSettlementRow(makeRefundRow({
      orderItemCode: null,
      priceType: 'Principal',
      priceAmount: -10.00,
    }));
    expect(result.adjustmentType).toBe('PRINCIPAL_REFUND');
    expect(result.eligibleForItemLevelPreview).toBe(false);
  });

  it('classifies via otherFeeReason when it contains "return"', () => {
    const result = classifyRefundSettlementRow(makeRefundRow({ otherFeeReason: 'Return Processing', itemFeeAmount: -1.00 }));
    expect(result.adjustmentType).toBe('RETURN_FEE');
    expect(result.amountCategory).toBe('Return Processing');
  });
});

// ─── groupRefundRowsByOrderItemCode ───────────────────────────────────────────

describe('groupRefundRowsByOrderItemCode', () => {
  function makeSettlementRow(overrides: Partial<ParsedSettlementRow> = {}): ParsedSettlementRow {
    return {
      dedupKey:        'key-1',
      settlementId:    'S001',
      transactionType: 'Refund',
      postedDate:      null,
      orderId:         'ORDER-1',
      orderItemCode:   'ITEM-001',
      sku:             'SKU-A',
      priceType:       'Principal',
      priceAmount:     -19.99,
      itemFeeType:     null,
      itemFeeAmount:   null,
      otherFeeReason:  null,
      rawPayload:      {},
      ...overrides,
    };
  }

  it('groups rows with the same orderItemCode together', () => {
    const rows = [
      makeSettlementRow({ dedupKey: 'k1', orderItemCode: 'ITEM-001', priceType: 'Principal' }),
      makeSettlementRow({ dedupKey: 'k2', orderItemCode: 'ITEM-001', itemFeeType: 'Commission', priceType: null }),
    ];
    const { byOrderItemCode, withoutOrderItemCode } = groupRefundRowsByOrderItemCode(rows);
    expect(byOrderItemCode.size).toBe(1);
    expect(byOrderItemCode.get('ITEM-001')).toHaveLength(2);
    expect(withoutOrderItemCode).toHaveLength(0);
  });

  it('separates rows with no orderItemCode into withoutOrderItemCode', () => {
    const rows = [
      makeSettlementRow({ dedupKey: 'k1', orderItemCode: 'ITEM-001' }),
      makeSettlementRow({ dedupKey: 'k2', orderItemCode: null }),
    ];
    const { byOrderItemCode, withoutOrderItemCode } = groupRefundRowsByOrderItemCode(rows);
    expect(byOrderItemCode.size).toBe(1);
    expect(withoutOrderItemCode).toHaveLength(1);
  });

  it('does not group by SKU — rows with same SKU but different orderItemCode are separate groups', () => {
    const rows = [
      makeSettlementRow({ dedupKey: 'k1', orderItemCode: 'ITEM-001', sku: 'SKU-A' }),
      makeSettlementRow({ dedupKey: 'k2', orderItemCode: 'ITEM-002', sku: 'SKU-A' }),
    ];
    const { byOrderItemCode } = groupRefundRowsByOrderItemCode(rows);
    expect(byOrderItemCode.size).toBe(2);
  });

  it('does not group by orderId — rows with same orderId but different orderItemCode are separate groups', () => {
    const rows = [
      makeSettlementRow({ dedupKey: 'k1', orderItemCode: 'ITEM-001', orderId: 'ORD-1' }),
      makeSettlementRow({ dedupKey: 'k2', orderItemCode: 'ITEM-002', orderId: 'ORD-1' }),
    ];
    const { byOrderItemCode } = groupRefundRowsByOrderItemCode(rows);
    expect(byOrderItemCode.size).toBe(2);
  });

  it('returns empty maps for an empty input', () => {
    const { byOrderItemCode, withoutOrderItemCode } = groupRefundRowsByOrderItemCode([]);
    expect(byOrderItemCode.size).toBe(0);
    expect(withoutOrderItemCode).toHaveLength(0);
  });
});

// ─── previewRefundClassification ─────────────────────────────────────────────

describe('previewRefundClassification', () => {
  function makeSettlementRow(overrides: Partial<ParsedSettlementRow> = {}): ParsedSettlementRow {
    return {
      dedupKey:        'key-1',
      settlementId:    'S001',
      transactionType: 'Refund',
      postedDate:      null,
      orderId:         'ORDER-1',
      orderItemCode:   'ITEM-001',
      sku:             'SKU-A',
      priceType:       'Principal',
      priceAmount:     -19.99,
      itemFeeType:     null,
      itemFeeAmount:   null,
      otherFeeReason:  null,
      rawPayload:      {},
      ...overrides,
    };
  }

  function makeSaleRecord(overrides: Partial<RefundPreviewSaleRecord> = {}): RefundPreviewSaleRecord {
    return {
      id:             'sale-1',
      orderItemId:    'ITEM-001',
      sku:            'SKU-A',
      realizedProfit: null,
      ...overrides,
    };
  }

  it('places a row in matchedGroups when orderItemCode matches a SaleRecord.orderItemId', () => {
    const rows = [makeSettlementRow()];
    const sales = [makeSaleRecord()];
    const result = previewRefundClassification(rows, sales);
    expect(result.matchedGroups).toHaveLength(1);
    expect(result.matchedGroups[0].saleRecordId).toBe('sale-1');
    expect(result.unmatchedGroups).toHaveLength(0);
  });

  it('places a row in unmatchedGroups when orderItemCode has no matching SaleRecord', () => {
    const rows = [makeSettlementRow({ orderItemCode: 'ITEM-999' })];
    const sales = [makeSaleRecord()]; // has ITEM-001, not ITEM-999
    const result = previewRefundClassification(rows, sales);
    expect(result.unmatchedGroups).toHaveLength(1);
    expect(result.unmatchedGroups[0].orderItemCode).toBe('ITEM-999');
    expect(result.matchedGroups).toHaveLength(0);
  });

  it('places order-level rows (no orderItemCode) in skippedRows', () => {
    const rows = [makeSettlementRow({ orderItemCode: null })];
    const result = previewRefundClassification(rows, []);
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0].reason).toContain('orderItemCode');
  });

  it('places UNSUPPORTED-classified rows in skippedRows', () => {
    const rows = [makeSettlementRow({ priceType: 'MarketplaceFacilitatorTax-Principal', priceAmount: -1.20 })];
    const sales = [makeSaleRecord()];
    const result = previewRefundClassification(rows, sales);
    expect(result.skippedRows.some((s) => s.row.orderItemCode === 'ITEM-001')).toBe(true);
    // Should not appear in matched or unmatched because all classifications were UNSUPPORTED
    expect(result.matchedGroups).toHaveLength(0);
  });

  it('does not match by SKU fallback — orderItemCode mismatch always goes to unmatchedGroups', () => {
    const rows = [makeSettlementRow({ orderItemCode: 'ITEM-999', sku: 'SKU-A' })];
    const sales = [makeSaleRecord({ orderItemId: 'ITEM-001', sku: 'SKU-A' })]; // same SKU, different orderItemCode
    const result = previewRefundClassification(rows, sales);
    expect(result.unmatchedGroups).toHaveLength(1);
    expect(result.matchedGroups).toHaveLength(0);
  });

  it('always includes all three required warning messages', () => {
    const result = previewRefundClassification([], []);
    expect(result.warnings.some((w) => w.includes('not applied to realized profit'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('Order-level refund rows'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('Unsupported refund row types'))).toBe(true);
  });

  it('reports correct counts in totalRefundRows, itemLevelRows, orderLevelRows', () => {
    const rows = [
      makeSettlementRow({ dedupKey: 'k1', orderItemCode: 'ITEM-001' }),
      makeSettlementRow({ dedupKey: 'k2', orderItemCode: null }),
    ];
    const result = previewRefundClassification(rows, []);
    expect(result.totalRefundRows).toBe(2);
    expect(result.itemLevelRows).toBe(1);
    expect(result.orderLevelRows).toBe(1);
  });

  it('does not mutate the input arrays', () => {
    const rows = [makeSettlementRow()];
    const sales = [makeSaleRecord()];
    const rowsCopy  = [...rows];
    const salesCopy = [...sales];
    previewRefundClassification(rows, sales);
    expect(rows).toEqual(rowsCopy);
    expect(sales).toEqual(salesCopy);
  });

  it('returns empty results for empty inputs', () => {
    const result = previewRefundClassification([], []);
    expect(result.totalRefundRows).toBe(0);
    expect(result.matchedGroups).toHaveLength(0);
    expect(result.unmatchedGroups).toHaveLength(0);
    expect(result.skippedRows).toHaveLength(0);
  });
});

// ─── buildSaleAdjustmentRecordDraft ──────────────────────────────────────────

describe('buildSaleAdjustmentRecordDraft', () => {
  function makeClassification(overrides: Partial<RefundClassification> = {}): RefundClassification {
    return {
      adjustmentType:              'PRINCIPAL_REFUND',
      amountCategory:              'Principal',
      amount:                      -19.99,
      profitImpact:                -19.99,
      eligibleForItemLevelPreview: true,
      ...overrides,
    };
  }

  function makeSettlementRec(overrides: Partial<DraftSettlementRecord> = {}): DraftSettlementRecord {
    return {
      id:              'sr-1',
      settlementId:    'S001',
      transactionType: 'Refund',
      orderId:         'ORD-1',
      orderItemCode:   'ITEM-001',
      sku:             'SKU-A',
      ...overrides,
    };
  }

  function makeSaleRec(overrides: Partial<DraftSaleRecord> = {}): DraftSaleRecord {
    return { id: 'sale-1', orgId: 'org-1', ...overrides };
  }

  it('returns a correct draft for PRINCIPAL_REFUND', () => {
    const draft = buildSaleAdjustmentRecordDraft(makeClassification(), makeSettlementRec(), makeSaleRec());
    expect(draft).not.toBeNull();
    expect(draft!.adjustmentType).toBe('PRINCIPAL_REFUND');
    expect(draft!.amountCategory).toBe('Principal');
    expect(draft!.amount).toBe(-19.99);
    expect(draft!.profitImpact).toBe(-19.99);
    expect(draft!.orgId).toBe('org-1');
    expect(draft!.saleRecordId).toBe('sale-1');
    expect(draft!.settlementRecordId).toBe('sr-1');
    expect(draft!.settlementId).toBe('S001');
    expect(draft!.orderItemCode).toBe('ITEM-001');
    expect(draft!.orderId).toBe('ORD-1');
    expect(draft!.sku).toBe('SKU-A');
  });

  it('returns a correct draft for FEE_CREDIT with positive profitImpact', () => {
    const draft = buildSaleAdjustmentRecordDraft(
      makeClassification({ adjustmentType: 'FEE_CREDIT', amountCategory: 'Commission', amount: 2.25, profitImpact: 2.25 }),
      makeSettlementRec(),
      makeSaleRec(),
    );
    expect(draft!.adjustmentType).toBe('FEE_CREDIT');
    expect(draft!.amount).toBe(2.25);
    expect(draft!.profitImpact).toBe(2.25);
  });

  it('returns a correct draft for RETURN_FEE with negative profitImpact', () => {
    const draft = buildSaleAdjustmentRecordDraft(
      makeClassification({ adjustmentType: 'RETURN_FEE', amountCategory: 'ReturnShipping', amount: -2.50, profitImpact: -2.50 }),
      makeSettlementRec(),
      makeSaleRec(),
    );
    expect(draft!.adjustmentType).toBe('RETURN_FEE');
    expect(draft!.profitImpact).toBe(-2.50);
  });

  it('returns a correct draft for TAX_REFUND', () => {
    const draft = buildSaleAdjustmentRecordDraft(
      makeClassification({ adjustmentType: 'TAX_REFUND', amountCategory: 'Tax', amount: -1.60, profitImpact: -1.60 }),
      makeSettlementRec(),
      makeSaleRec(),
    );
    expect(draft!.adjustmentType).toBe('TAX_REFUND');
    expect(draft!.amount).toBe(-1.60);
  });

  it('appliedToProfit is always false', () => {
    const draft = buildSaleAdjustmentRecordDraft(makeClassification(), makeSettlementRec(), makeSaleRec());
    expect(draft!.appliedToProfit).toBe(false);
  });

  it('rawPayload is not present on the draft (DB null via omission, not zero-fill)', () => {
    const draft = buildSaleAdjustmentRecordDraft(makeClassification(), makeSettlementRec(), makeSaleRec());
    expect('rawPayload' in draft!).toBe(false);
  });

  it('preserves negative sign on amount and profitImpact', () => {
    const draft = buildSaleAdjustmentRecordDraft(
      makeClassification({ amount: -9.99, profitImpact: -9.99 }),
      makeSettlementRec(),
      makeSaleRec(),
    );
    expect(draft!.amount).toBeLessThan(0);
    expect(draft!.profitImpact).toBeLessThan(0);
  });

  it('preserves positive sign on amount and profitImpact (fee credit)', () => {
    const draft = buildSaleAdjustmentRecordDraft(
      makeClassification({ adjustmentType: 'FEE_CREDIT', amount: 3.30, profitImpact: 3.30 }),
      makeSettlementRec(),
      makeSaleRec(),
    );
    expect(draft!.amount).toBeGreaterThan(0);
    expect(draft!.profitImpact).toBeGreaterThan(0);
  });

  it('returns null for UNSUPPORTED classification', () => {
    const draft = buildSaleAdjustmentRecordDraft(
      makeClassification({ adjustmentType: 'UNSUPPORTED', amount: null, profitImpact: null }),
      makeSettlementRec(),
      makeSaleRec(),
    );
    expect(draft).toBeNull();
  });

  it('returns null when amount is null', () => {
    const draft = buildSaleAdjustmentRecordDraft(
      makeClassification({ amount: null }),
      makeSettlementRec(),
      makeSaleRec(),
    );
    expect(draft).toBeNull();
  });

  it('returns null when profitImpact is null', () => {
    const draft = buildSaleAdjustmentRecordDraft(
      makeClassification({ profitImpact: null }),
      makeSettlementRec(),
      makeSaleRec(),
    );
    expect(draft).toBeNull();
  });

  it('returns null when amount is NaN', () => {
    const draft = buildSaleAdjustmentRecordDraft(
      makeClassification({ amount: NaN }),
      makeSettlementRec(),
      makeSaleRec(),
    );
    expect(draft).toBeNull();
  });

  it('returns null when amount is Infinity', () => {
    const draft = buildSaleAdjustmentRecordDraft(
      makeClassification({ amount: Infinity }),
      makeSettlementRec(),
      makeSaleRec(),
    );
    expect(draft).toBeNull();
  });

  it('draft does not contain adjustedProfit, refundImpact, or realizedProfit', () => {
    const draft = buildSaleAdjustmentRecordDraft(makeClassification(), makeSettlementRec(), makeSaleRec());
    expect('adjustedProfit' in draft!).toBe(false);
    expect('refundImpact' in draft!).toBe(false);
    expect('realizedProfit' in draft!).toBe(false);
  });

  it('uses Refund as transactionType fallback when settlementRecord.transactionType is null', () => {
    const draft = buildSaleAdjustmentRecordDraft(
      makeClassification(),
      makeSettlementRec({ transactionType: null }),
      makeSaleRec(),
    );
    expect(draft!.transactionType).toBe('Refund');
  });
});
