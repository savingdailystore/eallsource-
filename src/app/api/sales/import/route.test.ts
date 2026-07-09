import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock               = vi.fn();
const salesSyncCreateMock    = vi.fn();
const salesSyncUpdateMock    = vi.fn();
const saleRecordUpsertMock   = vi.fn();
const saleRecordFindManyMock = vi.fn();
const invFindManyMock        = vi.fn();
const repricingFindManyMock  = vi.fn();
const productFindManyMock    = vi.fn();
const poItemFindManyMock     = vi.fn();

vi.mock('@/lib/auth',   () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    salesSync:  { create: (...a: unknown[]) => salesSyncCreateMock(...a), update: (...a: unknown[]) => salesSyncUpdateMock(...a) },
    saleRecord: {
      upsert:   (...a: unknown[]) => saleRecordUpsertMock(...a),
      findMany:  (...a: unknown[]) => saleRecordFindManyMock(...a),
    },
    inventoryItem:    { findMany: (...a: unknown[]) => invFindManyMock(...a) },
    repricingRule:    { findMany: (...a: unknown[]) => repricingFindManyMock(...a) },
    product:          { findMany: (...a: unknown[]) => productFindManyMock(...a) },
    purchaseOrderItem:{ findMany: (...a: unknown[]) => poItemFindManyMock(...a) },
  },
}));

import { POST } from './route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TSV_HEADERS = [
  'amazon-order-id', 'purchase-date', 'order-status', 'fulfillment-channel',
  'asin', 'sku', 'product-name', 'quantity', 'item-price',
  'item-tax', 'item-promotion-discount', 'ship-promotion-discount', 'order-item-id',
].join('\t');

const TSV_ROW = [
  '111-1111111-1111111', '2024-03-15T10:00:00+00:00', 'Shipped', 'AFN',
  'B00TEST1234', 'SKU-001', 'Test Product', '2', '39.98',
  '3.20', '0.00', '0.00', 'OI-001',
].join('\t');

const VALID_TSV = TSV_HEADERS + '\n' + TSV_ROW;

function makeTextRequest(body: string, url = 'http://localhost/api/sales/import') {
  return new Request(url, {
    method:  'POST',
    headers: { 'content-type': 'text/plain' },
    body,
  });
}

const OWNER_SESSION  = { user: { orgId: 'org_1', role: 'OWNER',  plan: 'PRO'     } };
const ADMIN_SESSION  = { user: { orgId: 'org_1', role: 'ADMIN',  plan: 'PRO'     } };
const VIEWER_SESSION = { user: { orgId: 'org_1', role: 'VIEWER', plan: 'PRO'     } };
const ANALYST_SESSION= { user: { orgId: 'org_1', role: 'ANALYST',plan: 'PRO'     } };
const STARTER_SESSION= { user: { orgId: 'org_1', role: 'OWNER',  plan: 'STARTER' } };

function setupDefaults() {
  // Reset call history before setting new return values
  authMock.mockReset();
  salesSyncCreateMock.mockReset();
  salesSyncUpdateMock.mockReset();
  saleRecordUpsertMock.mockReset();
  saleRecordFindManyMock.mockReset();
  invFindManyMock.mockReset();
  repricingFindManyMock.mockReset();
  productFindManyMock.mockReset();
  poItemFindManyMock.mockReset();

  authMock.mockResolvedValue(OWNER_SESSION);
  salesSyncCreateMock.mockResolvedValue({ id: 'sync_1' });
  salesSyncUpdateMock.mockResolvedValue({});
  saleRecordUpsertMock.mockResolvedValue({});
  saleRecordFindManyMock.mockResolvedValue([]); // default: no existing records
  invFindManyMock.mockResolvedValue([]);
  repricingFindManyMock.mockResolvedValue([]);
  productFindManyMock.mockResolvedValue([]);
  poItemFindManyMock.mockResolvedValue([]);
}

// ─── Access control ──────────────────────────────────────────────────────────

describe('POST /api/sales/import — access control', () => {
  beforeEach(() => {
    authMock.mockReset();
    salesSyncCreateMock.mockReset();
    salesSyncUpdateMock.mockReset();
    saleRecordUpsertMock.mockReset();
    saleRecordFindManyMock.mockReset();
    invFindManyMock.mockReset();
    repricingFindManyMock.mockReset();
    productFindManyMock.mockReset();
    poItemFindManyMock.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeTextRequest(VALID_TSV));
    expect(res.status).toBe(401);
  });

  it('returns 403 for STARTER plan', async () => {
    authMock.mockResolvedValue(STARTER_SESSION);
    const res = await POST(makeTextRequest(VALID_TSV));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/pro plan/i);
  });

  it('returns 403 for VIEWER role', async () => {
    authMock.mockResolvedValue(VIEWER_SESSION);
    const res = await POST(makeTextRequest(VALID_TSV));
    expect(res.status).toBe(403);
  });

  it('returns 403 for ANALYST role', async () => {
    authMock.mockResolvedValue(ANALYST_SESSION);
    const res = await POST(makeTextRequest(VALID_TSV));
    expect(res.status).toBe(403);
  });

  it('allows ADMIN role', async () => {
    setupDefaults();
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makeTextRequest(VALID_TSV));
    expect(res.status).toBe(200);
  });

  it('allows OWNER role', async () => {
    setupDefaults();
    const res = await POST(makeTextRequest(VALID_TSV));
    expect(res.status).toBe(200);
  });
});

// ─── Empty / invalid body ─────────────────────────────────────────────────────

describe('POST /api/sales/import — input validation', () => {
  beforeEach(setupDefaults);

  it('returns 400 for empty body', async () => {
    const res = await POST(makeTextRequest(''));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/empty/i);
  });

  it('returns 400 for whitespace-only body', async () => {
    const res = await POST(makeTextRequest('   \n  '));
    expect(res.status).toBe(400);
  });

  it('returns 422 when all rows fail to parse', async () => {
    // Row with empty amazon-order-id (required) and garbage date — both parseable as non-empty
    const badRow = '\tbad-date-value';  // tab keeps the line non-blank; empty order-id triggers error
    const res = await POST(makeTextRequest(`amazon-order-id\tpurchase-date\n${badRow}`));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/no valid rows/i);
  });
});

// ─── Successful import ────────────────────────────────────────────────────────

describe('POST /api/sales/import — successful import', () => {
  beforeEach(setupDefaults);

  it('creates a SalesSync log and marks it DONE', async () => {
    await POST(makeTextRequest(VALID_TSV));
    expect(salesSyncCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: 'org_1', source: 'MANUAL_CSV', status: 'RUNNING' }) }),
    );
    expect(salesSyncUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DONE', recordsUpserted: 1 }) }),
    );
  });

  it('returns imported count and syncId', async () => {
    const res = await POST(makeTextRequest(VALID_TSV));
    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.syncId).toBe('sync_1');
    expect(body.parseErrors).toBe(0);
  });

  it('upserts with orgId scoped dedup key', async () => {
    await POST(makeTextRequest(VALID_TSV));
    expect(saleRecordUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_dedupKey: { orgId: 'org_1', dedupKey: 'OI-001' } },
      }),
    );
  });

  it('sets totalFees null — orders report has no fee data', async () => {
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.create.totalFees).toBeNull();
    expect(call.create.referralFee).toBeNull();
    expect(call.create.fbaFee).toBeNull();
  });

  it('sets cogs and grossProfitBeforeFees null when no cost data available', async () => {
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.create.unitCostUsed).toBeNull();
    expect(call.create.cogs).toBeNull();
    expect(call.create.grossProfitBeforeFees).toBeNull();
    expect(call.create.realizedProfit).toBeNull();
  });

  it('resolves unit cost from inventory when available', async () => {
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.create.unitCostUsed).toBe(10);
    expect(call.create.costSource).toBe('INVENTORY');
    expect(call.create.cogs).toBe(20);               // 10 × 2 units
    expect(call.create.grossProfitBeforeFees).toBe(19.98); // 39.98 - 20
    expect(call.create.realizedProfit).toBeNull();    // fees still null
  });

  it('prefers PO item cost over inventory', async () => {
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 12 }]);
    poItemFindManyMock.mockResolvedValue([{ sku: 'SKU-001', asin: 'B00TEST1234', unitCost: 8 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.create.unitCostUsed).toBe(8);
    expect(call.create.costSource).toBe('PO_ITEM');
  });

  it('skips non-USD currency rows and reports currencySkipped count', async () => {
    const withCurrencyHeader = 'amazon-order-id\tpurchase-date\torder-status\tfulfillment-channel\tasin\tsku\tproduct-name\tquantity\titem-price\titem-tax\titem-promotion-discount\tship-promotion-discount\torder-item-id\tcurrency';
    const usdRow = '111-1111111-1111111\t2024-03-15T10:00:00+00:00\tShipped\tAFN\tB00TEST1234\tSKU-001\tTest Product\t1\t25.00\t0.00\t0.00\t0.00\tOI-USD\tUSD';
    const mxnRow = '701-9662965-7457033\t2024-03-15T10:00:00+00:00\tShipped\tAFN\tB00TEST9999\tSKU-MX\tMX Product\t1\t555.14\t0.00\t0.00\t0.00\tOI-MX\tMXN';
    const body = await (await POST(makeTextRequest(withCurrencyHeader + '\n' + usdRow + '\n' + mxnRow))).json();
    expect(body.currencySkipped).toBe(1);
    expect(body.imported).toBe(1);
    expect(body.total).toBe(2);
    expect(saleRecordUpsertMock).toHaveBeenCalledTimes(1); // only USD row upserted
  });

  it('currencySkippedNote is present in response when non-USD rows exist alongside USD rows', async () => {
    // currencySkippedNote only appears on the full success path (when at least one USD row was imported)
    const withCurrencyHeader = 'amazon-order-id\tpurchase-date\torder-status\tfulfillment-channel\tasin\tsku\tproduct-name\tquantity\titem-price\titem-tax\titem-promotion-discount\tship-promotion-discount\torder-item-id\tcurrency';
    const usdRow = '111-1111111-1111111\t2024-03-15T10:00:00+00:00\tShipped\tAFN\tB00TEST1234\tSKU-001\tTest Product\t1\t25.00\t0.00\t0.00\t0.00\tOI-USD\tUSD';
    const mxnRow = '701-9662965-7457033\t2024-03-15T10:00:00+00:00\tShipped\tAFN\tB00TEST9999\tSKU-MX\tMX Product\t1\t555.14\t0.00\t0.00\t0.00\tOI-MX\tMXN';
    const body = await (await POST(makeTextRequest(withCurrencyHeader + '\n' + usdRow + '\n' + mxnRow))).json();
    expect(body.currencySkippedNote).toMatch(/unsupported currency/i);
  });

  it('skips Cancelled rows and reports skipped count', async () => {
    const cancelledRow = TSV_HEADERS + '\n' +
      TSV_ROW.replace('Shipped', 'Cancelled') + '\n' + TSV_ROW;
    const res = await POST(makeTextRequest(cancelledRow));
    const body = await res.json();
    expect(body.skipped).toBe(1);
    expect(body.imported).toBe(1);
  });

  it('marks sync DONE with zero imports when all rows are skipped', async () => {
    const allCancelled = TSV_HEADERS + '\n' + TSV_ROW.replace('Shipped', 'Cancelled');
    const res = await POST(makeTextRequest(allCancelled));
    const body = await res.json();
    expect(body.imported).toBe(0);
    expect(body.skipped).toBe(1);
    expect(salesSyncUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DONE', recordsUpserted: 0 }) }),
    );
  });
});

// ─── Org scoping ─────────────────────────────────────────────────────────────

describe('POST /api/sales/import — org scoping', () => {
  beforeEach(setupDefaults);

  it('scopes salesSync creation to session orgId', async () => {
    await POST(makeTextRequest(VALID_TSV));
    const createCall = salesSyncCreateMock.mock.calls[0][0];
    expect(createCall.data.orgId).toBe('org_1');
  });

  it('scopes saleRecord upsert to session orgId', async () => {
    await POST(makeTextRequest(VALID_TSV));
    const upsertCall = saleRecordUpsertMock.mock.calls[0][0];
    expect(upsertCall.create.orgId).toBe('org_1');
  });

  it('scopes inventory lookup to session orgId', async () => {
    await POST(makeTextRequest(VALID_TSV));
    const invCall = invFindManyMock.mock.calls[0][0];
    expect(invCall.where.orgId).toBe('org_1');
  });
});

// ─── Error handling ──────────────────────────────────────────────────────────

describe('POST /api/sales/import — error handling', () => {
  beforeEach(setupDefaults);

  it('marks sync FAILED and returns 500 on unexpected error', async () => {
    salesSyncCreateMock.mockResolvedValue({ id: 'sync_fail' });
    saleRecordUpsertMock.mockRejectedValue(new Error('DB connection lost'));
    const res = await POST(makeTextRequest(VALID_TSV));
    expect(res.status).toBe(500);
    expect(salesSyncUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
});

// ─── Phase 6.2.5a — Inventory cost lookup by SKU ──────────────────────────────

// Minimal Fulfilled Shipments TSV — title-case headers, no ASIN column
const FS_HEADERS = [
  'Amazon Order Id', 'Purchase Date', 'Amazon Order Item Id',
  'Merchant SKU', 'Shipped Quantity', 'Currency',
  'Item Price', 'Item Tax', 'Item Promo Discount', 'Shipment Promo Discount',
  'Fulfillment Channel',
].join('\t');

const FS_ROW = [
  '114-1111111-1111111', '2024-04-25T10:00:00+00:00', '158593198119961',
  'A00-G06-1.75-1000-SPLFREE-US2', '1', 'USD',
  '25.00', '0.00', '0.00', '0.00',
  'Amazon',
].join('\t');

const FS_TSV = FS_HEADERS + '\n' + FS_ROW;

describe('POST /api/sales/import — inventory cost lookup by SKU (Phase 6.2.5a)', () => {
  beforeEach(setupDefaults);

  it('resolves InventoryItem.unitCost by SKU when asin is null', async () => {
    // FS row has no ASIN → asins=[] → ASIN query short-circuits to Promise.resolve([]) without calling mock.
    // Only the SKU query fires, so exactly one mock call is needed.
    invFindManyMock.mockResolvedValueOnce([{ asin: null, sku: 'A00-G06-1.75-1000-SPLFREE-US2', unitCost: 12.09 }]);

    await POST(makeTextRequest(FS_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.create.unitCostUsed).toBe(12.09);
    expect(call.create.costSource).toBe('INVENTORY');
  });

  it('costSource = INVENTORY when cost resolved by SKU', async () => {
    invFindManyMock.mockResolvedValueOnce([{ asin: null, sku: 'A00-G06-1.75-1000-SPLFREE-US2', unitCost: 12.09 }]);

    await POST(makeTextRequest(FS_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.create.costSource).toBe('INVENTORY');
  });

  it('cogs = unitCost × quantity when cost resolved by SKU', async () => {
    invFindManyMock.mockResolvedValueOnce([{ asin: null, sku: 'A00-G06-1.75-1000-SPLFREE-US2', unitCost: 12.09 }]);

    await POST(makeTextRequest(FS_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.create.cogs).toBe(12.09);        // 12.09 × 1
    expect(call.create.unitCostUsed).toBe(12.09);
  });

  it('PO item still outranks InventoryItem when both are present', async () => {
    invFindManyMock.mockResolvedValueOnce([{ asin: null, sku: 'A00-G06-1.75-1000-SPLFREE-US2', unitCost: 12.09 }]);
    poItemFindManyMock.mockResolvedValue([{ sku: 'A00-G06-1.75-1000-SPLFREE-US2', asin: null, unitCost: 9.50 }]);

    await POST(makeTextRequest(FS_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.create.unitCostUsed).toBe(9.50);
    expect(call.create.costSource).toBe('PO_ITEM');
  });

  it('leaves unitCostUsed null when no InventoryItem for the SKU', async () => {
    // Only SKU query fires for FS rows — returns empty → no cost
    invFindManyMock.mockResolvedValueOnce([]);

    await POST(makeTextRequest(FS_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.create.unitCostUsed).toBeNull();
    expect(call.create.costSource).toBeNull();
    expect(call.create.cogs).toBeNull();
  });

  it('ASIN-based inventory lookup still works for flat-file format', async () => {
    // Original flat-file row with ASIN — must still resolve by ASIN
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);

    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.create.unitCostUsed).toBe(10);
    expect(call.create.costSource).toBe('INVENTORY');
  });

  it('InventoryItem still outranks RepricingRule when resolved by SKU', async () => {
    invFindManyMock.mockResolvedValueOnce([{ asin: null, sku: 'A00-G06-1.75-1000-SPLFREE-US2', unitCost: 12.09 }]);
    // No ASIN on FS rows → repricing query doesn't fire; cost must come from inventory by SKU
    repricingFindManyMock.mockResolvedValue([]);

    await POST(makeTextRequest(FS_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.create.unitCostUsed).toBe(12.09);
    expect(call.create.costSource).toBe('INVENTORY');
  });

  it('no inventory quantities are written — upsert data has no quantity fields', async () => {
    invFindManyMock.mockResolvedValueOnce([{ asin: null, sku: 'A00-G06-1.75-1000-SPLFREE-US2', unitCost: 12.09 }]);

    await POST(makeTextRequest(FS_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    // SaleRecord upsert must not contain inventory quantity fields
    expect(call.create).not.toHaveProperty('availableQuantity');
    expect(call.create).not.toHaveProperty('totalQuantity');
  });

  it('existing orders import (flat-file) behavior unchanged — still passes all checks', async () => {
    invFindManyMock.mockResolvedValue([]);
    const res = await POST(makeTextRequest(VALID_TSV));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.parseErrors).toBe(0);
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.create.totalFees).toBeNull();
    expect(call.create.referralFee).toBeNull();
  });
});

// ─── Phase 6.2.5b — Orders re-import preserves settlement fees ────────────────
//
// Settlement import is the sole authority for referralFee/fbaFee/otherFees/totalFees.
// Re-importing an orders report must NEVER overwrite those fields with null.

describe('POST /api/sales/import — Phase 6.2.5b: settlement fee preservation', () => {
  beforeEach(setupDefaults);

  // ── fee fields absent from updateData ──────────────────────────────────────

  it('update branch does NOT include referralFee — settlement is sole authority', async () => {
    saleRecordFindManyMock.mockResolvedValue([EXISTING_WITH_FEES]);
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.update).not.toHaveProperty('referralFee');
  });

  it('update branch does NOT include fbaFee — settlement is sole authority', async () => {
    saleRecordFindManyMock.mockResolvedValue([EXISTING_WITH_FEES]);
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.update).not.toHaveProperty('fbaFee');
  });

  it('update branch does NOT include otherFees — settlement is sole authority', async () => {
    saleRecordFindManyMock.mockResolvedValue([EXISTING_WITH_FEES]);
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.update).not.toHaveProperty('otherFees');
  });

  it('update branch does NOT include totalFees — settlement is sole authority', async () => {
    saleRecordFindManyMock.mockResolvedValue([EXISTING_WITH_FEES]);
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.update).not.toHaveProperty('totalFees');
  });

  // ── cost fields ARE written in updateData ──────────────────────────────────

  it('update branch writes unitCostUsed when cost is now resolved', async () => {
    saleRecordFindManyMock.mockResolvedValue([EXISTING_WITH_FEES]);
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.update.unitCostUsed).toBe(10);
    expect(call.update.costSource).toBe('INVENTORY');
  });

  it('update branch computes cogs from new unitCostUsed', async () => {
    saleRecordFindManyMock.mockResolvedValue([EXISTING_WITH_FEES]);
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.update.cogs).toBe(20); // 10 × 2 units
  });

  it('update branch computes grossProfitBeforeFees from new cost', async () => {
    saleRecordFindManyMock.mockResolvedValue([EXISTING_WITH_FEES]);
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.update.grossProfitBeforeFees).toBe(19.98); // 39.98 - 20
  });

  // ── realizedProfit recomputed using preserved fees + new cost ───────────────

  it('recomputes realizedProfit using preserved totalFees + new cost', async () => {
    // netRevenue=39.98, totalFees=9.31 (preserved), cogs=20 → realizedProfit=10.67
    saleRecordFindManyMock.mockResolvedValue([EXISTING_WITH_FEES]);
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.update.realizedProfit).toBe(10.67); // 39.98 - 9.31 - 20
  });

  it('recomputes roi using preserved totalFees + new cost', async () => {
    saleRecordFindManyMock.mockResolvedValue([EXISTING_WITH_FEES]);
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.update.roi).toBe(53.35); // 10.67 / 20 × 100
  });

  it('realizedProfit remains null when existing totalFees is null (no settlement yet)', async () => {
    saleRecordFindManyMock.mockResolvedValue([EXISTING_NO_FEES]);
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.update.realizedProfit).toBeNull();
    expect(call.update.roi).toBeNull();
  });

  it('realizedProfit remains null when cost is null even if totalFees exist', async () => {
    saleRecordFindManyMock.mockResolvedValue([EXISTING_WITH_FEES]);
    // no inventory item → cost null
    invFindManyMock.mockResolvedValue([]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.update.unitCostUsed).toBeNull();
    expect(call.update.realizedProfit).toBeNull();
    expect(call.update.roi).toBeNull();
  });

  // ── create branch still initializes fees to null ───────────────────────────

  it('create branch still initializes all fee fields to null for brand-new rows', async () => {
    saleRecordFindManyMock.mockResolvedValue([]); // new row — no existing record
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.create.referralFee).toBeNull();
    expect(call.create.fbaFee).toBeNull();
    expect(call.create.otherFees).toBeNull();
    expect(call.create.totalFees).toBeNull();
    expect(call.create.realizedProfit).toBeNull(); // fees not present yet → no realized profit
  });

  // ── SKU-based cost lookup works in update branch (Fulfilled Shipments) ──────

  it('update branch resolves unitCostUsed by SKU (FS format) and recomputes profit with preserved fees', async () => {
    // FS row: dedupKey = orderItemId '158593198119961'
    const existingFsRow = {
      dedupKey: '158593198119961',
      referralFee: 2.50, fbaFee: 4.81, otherFees: 2.00, totalFees: 9.31,
    };
    saleRecordFindManyMock.mockResolvedValue([existingFsRow]);
    // FS row has no ASIN → ASIN query short-circuits; only SKU query fires
    invFindManyMock.mockResolvedValueOnce([{ asin: null, sku: 'A00-G06-1.75-1000-SPLFREE-US2', unitCost: 12.09 }]);
    await POST(makeTextRequest(FS_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    // Cost fields resolved by SKU
    expect(call.update.unitCostUsed).toBe(12.09);
    expect(call.update.costSource).toBe('INVENTORY');
    expect(call.update.cogs).toBe(12.09);             // 12.09 × 1 unit
    // realizedProfit = 25.00 - 9.31 - 12.09 = 3.60
    expect(call.update.realizedProfit).toBe(3.60);
    // roi = 3.60 / 12.09 × 100 ≈ 29.78%
    expect(call.update.roi).toBe(29.78);
    // Fee fields absent from updateData — settlement is sole authority
    expect(call.update).not.toHaveProperty('totalFees');
    expect(call.update).not.toHaveProperty('referralFee');
  });

  // ── inventory quantities never written ─────────────────────────────────────

  it('update branch data contains no inventory quantity fields', async () => {
    saleRecordFindManyMock.mockResolvedValue([EXISTING_WITH_FEES]);
    invFindManyMock.mockResolvedValue([{ asin: 'B00TEST1234', sku: 'SKU-001', unitCost: 10 }]);
    await POST(makeTextRequest(VALID_TSV));
    const call = saleRecordUpsertMock.mock.calls[0][0];
    expect(call.update).not.toHaveProperty('availableQuantity');
    expect(call.update).not.toHaveProperty('totalQuantity');
    expect(call.update).not.toHaveProperty('reservedQuantity');
    expect(call.update).not.toHaveProperty('inboundQuantity');
  });
});

// ─── Created vs updated tracking ─────────────────────────────────────────────

// Fee-shaped existing row helper for tests that need an existing record
const EXISTING_NO_FEES = { dedupKey: 'OI-001', referralFee: null, fbaFee: null, otherFees: null, totalFees: null };
const EXISTING_WITH_FEES = { dedupKey: 'OI-001', referralFee: 2.50, fbaFee: 4.81, otherFees: 2.00, totalFees: 9.31 };

describe('POST /api/sales/import — created vs updated counts', () => {
  beforeEach(setupDefaults);

  it('returns created=1 updated=0 when no existing records', async () => {
    saleRecordFindManyMock.mockResolvedValue([]); // no existing
    const res = await POST(makeTextRequest(VALID_TSV));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.updated).toBe(0);
    expect(body.imported).toBe(1);
  });

  it('returns created=0 updated=1 when record already exists (duplicate import)', async () => {
    saleRecordFindManyMock.mockResolvedValue([EXISTING_NO_FEES]);
    const res = await POST(makeTextRequest(VALID_TSV));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.updated).toBe(1);
    expect(body.imported).toBe(1);
  });

  it('returns mixed created and updated for partial duplicates', async () => {
    const secondRow = [
      '222-2222222-2222222', '2024-03-16T10:00:00+00:00', 'Shipped', 'AFN',
      'B00TEST9999', 'SKU-002', 'Another Product', '1', '19.99',
      '1.60', '0.00', '0.00', 'OI-002',
    ].join('\t');
    const twoRowTsv = TSV_HEADERS + '\n' + TSV_ROW + '\n' + secondRow;

    // OI-001 already exists; OI-002 is new
    saleRecordFindManyMock.mockResolvedValue([EXISTING_NO_FEES]);
    const res = await POST(makeTextRequest(twoRowTsv));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.updated).toBe(1);
    expect(body.imported).toBe(2);
  });

  it('queries existing dedupKeys scoped to orgId', async () => {
    saleRecordFindManyMock.mockResolvedValue([]);
    await POST(makeTextRequest(VALID_TSV));
    const findCall = saleRecordFindManyMock.mock.calls[0][0];
    expect(findCall.where.orgId).toBe('org_1');
    expect(findCall.where.dedupKey).toBeDefined();
  });

  it('dedup still prevents duplicate rows — upsert called once per row', async () => {
    // Even on duplicate import, upsert fires (update branch) exactly once per row
    saleRecordFindManyMock.mockResolvedValue([{ dedupKey: 'OI-001' }]);
    await POST(makeTextRequest(VALID_TSV));
    expect(saleRecordUpsertMock).toHaveBeenCalledTimes(1);
  });

  it('response includes created and updated fields in addition to imported', async () => {
    saleRecordFindManyMock.mockResolvedValue([]);
    const res = await POST(makeTextRequest(VALID_TSV));
    const body = await res.json();
    expect(body).toHaveProperty('created');
    expect(body).toHaveProperty('updated');
    expect(body).toHaveProperty('imported');
    expect(body.created + body.updated).toBe(body.imported);
  });
});
