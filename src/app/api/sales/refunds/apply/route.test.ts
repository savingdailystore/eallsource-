import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    settlementRecord:    { findMany: vi.fn() },
    saleRecord:          { findMany: vi.fn() },
    saleAdjustmentRecord: { findMany: vi.fn(), createMany: vi.fn() },
  },
}));

import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockAuth = auth as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/sales/refunds/apply', {
    method:  'POST',
    body:    JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function makeRefundRecord(overrides: Record<string, unknown> = {}) {
  return {
    id:              'sr-1',
    settlementId:    'S001',
    transactionType: 'Refund',
    orderId:         'ORD-1',
    orderItemCode:   'ITEM-001',
    sku:             'SKU-A',
    priceType:       'Principal',
    priceAmount:     -19.99,
    itemFeeType:     null,
    itemFeeAmount:   null,
    otherFeeReason:  null,
    ...overrides,
  };
}

function makeSaleRecord(overrides: Record<string, unknown> = {}) {
  return { id: 'sale-1', orderItemId: 'ITEM-001', ...overrides };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function setupDefaults() {
  (prisma.settlementRecord.findMany    as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue([]);
  (prisma.saleRecord.findMany          as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue([]);
  (prisma.saleAdjustmentRecord.findMany  as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue([]);
  (prisma.saleAdjustmentRecord.createMany as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({ count: 0 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/sales/refunds/apply', () => {
  beforeEach(() => {
    setupDefaults();
    mockAuth.mockResolvedValue({
      user: { orgId: 'org-1', role: 'OWNER', plan: 'PRO' },
    });
  });

  // ── Auth / plan guards ────────────────────────────────────────────────────

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ confirmed: true }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for STARTER plan', async () => {
    mockAuth.mockResolvedValue({ user: { orgId: 'org-1', role: 'OWNER', plan: 'STARTER' } });
    const res = await POST(makeRequest({ confirmed: true }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Pro plan/i);
  });

  it('returns 403 for MEMBER role', async () => {
    mockAuth.mockResolvedValue({ user: { orgId: 'org-1', role: 'MEMBER', plan: 'PRO' } });
    const res = await POST(makeRequest({ confirmed: true }));
    expect(res.status).toBe(403);
  });

  // ── confirmed guard ───────────────────────────────────────────────────────

  it('returns 400 when confirmed is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/confirmed/i);
  });

  it('returns 400 when confirmed is false', async () => {
    const res = await POST(makeRequest({ confirmed: false }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when confirmed is a string "true" instead of boolean', async () => {
    const res = await POST(makeRequest({ confirmed: 'true' }));
    expect(res.status).toBe(400);
  });

  // ── No refund rows ────────────────────────────────────────────────────────

  it('returns 200 with createdCount=0 and message when no refund rows exist', async () => {
    const res  = await POST(makeRequest({ confirmed: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.createdCount).toBe(0);
    expect(body.totalRefundRows).toBe(0);
    expect(body.message).toMatch(/No refund rows found/i);
    expect(prisma.saleAdjustmentRecord.createMany).not.toHaveBeenCalled();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('creates a SaleAdjustmentRecord for an eligible matched row', async () => {
    (prisma.settlementRecord.findMany   as ReturnType<typeof vi.fn>).mockResolvedValue([makeRefundRecord()]);
    (prisma.saleRecord.findMany         as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);
    (prisma.saleAdjustmentRecord.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    const res  = await POST(makeRequest({ confirmed: true }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.createdCount).toBe(1);
    expect(body.skippedCount).toBe(0);
    expect(prisma.saleAdjustmentRecord.createMany).toHaveBeenCalledOnce();
  });

  it('sets appliedToProfit=false on every created draft', async () => {
    (prisma.settlementRecord.findMany   as ReturnType<typeof vi.fn>).mockResolvedValue([makeRefundRecord()]);
    (prisma.saleRecord.findMany         as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);
    (prisma.saleAdjustmentRecord.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await POST(makeRequest({ confirmed: true }));

    const call = (prisma.saleAdjustmentRecord.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.every((d: Record<string, unknown>) => d.appliedToProfit === false)).toBe(true);
  });

  it('draft does not include rawPayload (intentionally omitted; DB stores NULL via default)', async () => {
    (prisma.settlementRecord.findMany   as ReturnType<typeof vi.fn>).mockResolvedValue([makeRefundRecord()]);
    (prisma.saleRecord.findMany         as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);
    (prisma.saleAdjustmentRecord.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await POST(makeRequest({ confirmed: true }));

    const call = (prisma.saleAdjustmentRecord.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.every((d: Record<string, unknown>) => !('rawPayload' in d))).toBe(true);
  });

  // ── Skip rules ────────────────────────────────────────────────────────────

  it('skips rows with no orderItemCode and returns orderLevelSkippedCount', async () => {
    (prisma.settlementRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRefundRecord({ orderItemCode: null }),
    ]);

    const res  = await POST(makeRequest({ confirmed: true }));
    const body = await res.json();
    expect(body.createdCount).toBe(0);
    expect(body.orderLevelSkippedCount).toBe(1);
    expect(prisma.saleAdjustmentRecord.createMany).not.toHaveBeenCalled();
  });

  it('skips rows with no matching SaleRecord and returns unmatchedSkippedCount', async () => {
    (prisma.settlementRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRefundRecord({ orderItemCode: 'ITEM-999' }),
    ]);
    (prisma.saleRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res  = await POST(makeRequest({ confirmed: true }));
    const body = await res.json();
    expect(body.createdCount).toBe(0);
    expect(body.unmatchedSkippedCount).toBe(1);
  });

  it('skips rows with UNSUPPORTED classification and returns unsupportedSkippedCount', async () => {
    (prisma.settlementRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRefundRecord({ priceType: 'MarketplaceFacilitatorTax-Principal', priceAmount: -1.20, itemFeeType: null }),
    ]);
    (prisma.saleRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);

    const res  = await POST(makeRequest({ confirmed: true }));
    const body = await res.json();
    expect(body.createdCount).toBe(0);
    expect(body.unsupportedSkippedCount).toBe(1);
  });

  it('skips rows whose classification produces null amount and returns invalidAmountSkippedCount', async () => {
    // A valid classification type but amount is null — buildSaleAdjustmentRecordDraft returns null
    (prisma.settlementRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRefundRecord({ priceType: 'Principal', priceAmount: null }),
    ]);
    (prisma.saleRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);

    const res  = await POST(makeRequest({ confirmed: true }));
    const body = await res.json();
    expect(body.createdCount).toBe(0);
    expect(body.invalidAmountSkippedCount).toBe(1);
  });

  it('skips already-existing adjustment records and returns alreadyExistsCount', async () => {
    (prisma.settlementRecord.findMany      as ReturnType<typeof vi.fn>).mockResolvedValue([makeRefundRecord()]);
    (prisma.saleRecord.findMany            as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);
    (prisma.saleAdjustmentRecord.findMany  as ReturnType<typeof vi.fn>).mockResolvedValue([
      { settlementRecordId: 'sr-1' }, // already exists
    ]);

    const res  = await POST(makeRequest({ confirmed: true }));
    const body = await res.json();
    expect(body.createdCount).toBe(0);
    expect(body.alreadyExistsCount).toBe(1);
    expect(prisma.saleAdjustmentRecord.createMany).not.toHaveBeenCalled();
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  it('second identical call creates 0 records (idempotent)', async () => {
    // Simulate second call: existing adjustment record for sr-1 already present
    (prisma.settlementRecord.findMany     as ReturnType<typeof vi.fn>).mockResolvedValue([makeRefundRecord()]);
    (prisma.saleRecord.findMany           as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);
    (prisma.saleAdjustmentRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { settlementRecordId: 'sr-1' },
    ]);

    const res  = await POST(makeRequest({ confirmed: true }));
    const body = await res.json();
    expect(body.createdCount).toBe(0);
    expect(body.alreadyExistsCount).toBe(1);
    expect(prisma.saleAdjustmentRecord.createMany).not.toHaveBeenCalled();
  });

  // ── settlementId filter ───────────────────────────────────────────────────

  it('passes optional settlementId filter to the SettlementRecord query', async () => {
    await POST(makeRequest({ confirmed: true, settlementId: 'S001' }));

    expect(prisma.settlementRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ settlementId: 'S001' }),
      }),
    );
  });

  // ── Data-safety guards ────────────────────────────────────────────────────

  it('never calls saleRecord.update', async () => {
    (prisma.settlementRecord.findMany   as ReturnType<typeof vi.fn>).mockResolvedValue([makeRefundRecord()]);
    (prisma.saleRecord.findMany         as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);
    (prisma.saleAdjustmentRecord.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await POST(makeRequest({ confirmed: true }));

    // The mock only has findMany — update was never added, so calling it would throw.
    // We verify findMany was called (reads are fine) and createMany was called (writes to adjustment only).
    expect(prisma.saleRecord.findMany).toHaveBeenCalledOnce();
    // No update method on the mock → if route called it, it would throw and the test would fail.
  });

  it('never calls settlementRecord.update or updateMany', async () => {
    (prisma.settlementRecord.findMany   as ReturnType<typeof vi.fn>).mockResolvedValue([makeRefundRecord()]);
    (prisma.saleRecord.findMany         as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);
    (prisma.saleAdjustmentRecord.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await POST(makeRequest({ confirmed: true }));

    // Only findMany was used on settlementRecord — no update methods on the mock.
    expect(prisma.settlementRecord.findMany).toHaveBeenCalledOnce();
  });

  it('written draft does not contain realizedProfit or adjustedProfit fields', async () => {
    (prisma.settlementRecord.findMany   as ReturnType<typeof vi.fn>).mockResolvedValue([makeRefundRecord()]);
    (prisma.saleRecord.findMany         as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);
    (prisma.saleAdjustmentRecord.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await POST(makeRequest({ confirmed: true }));

    const call = (prisma.saleAdjustmentRecord.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    for (const draft of call.data as Record<string, unknown>[]) {
      expect('realizedProfit'  in draft).toBe(false);
      expect('adjustedProfit'  in draft).toBe(false);
      expect('refundImpact'    in draft).toBe(false);
      expect('totalFees'       in draft).toBe(false);
      expect('netRevenue'      in draft).toBe(false);
    }
  });

  it('written draft includes all required SaleAdjustmentRecord fields', async () => {
    (prisma.settlementRecord.findMany   as ReturnType<typeof vi.fn>).mockResolvedValue([makeRefundRecord()]);
    (prisma.saleRecord.findMany         as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);
    (prisma.saleAdjustmentRecord.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await POST(makeRequest({ confirmed: true }));

    const call  = (prisma.saleAdjustmentRecord.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const draft = call.data[0] as Record<string, unknown>;
    expect(draft.orgId).toBe('org-1');
    expect(draft.saleRecordId).toBe('sale-1');
    expect(draft.settlementRecordId).toBe('sr-1');
    expect(draft.adjustmentType).toBe('PRINCIPAL_REFUND');
    expect(draft.amount).toBe(-19.99);
    expect(draft.profitImpact).toBe(-19.99);
    expect(draft.appliedToProfit).toBe(false);
  });
});
