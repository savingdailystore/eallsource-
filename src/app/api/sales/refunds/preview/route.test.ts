import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    settlementRecord: { findMany: vi.fn() },
    saleRecord:       { findMany: vi.fn() },
  },
}));

import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockAuth = auth as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown = {}): Request {
  return new Request('http://localhost/api/sales/refunds/preview', {
    method:  'POST',
    body:    JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function makeRefundRecord(overrides: Record<string, unknown> = {}) {
  return {
    id:              'sr-1',
    dedupKey:        'dk-1',
    settlementId:    'S001',
    transactionType: 'Refund',
    postedDate:      null,
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
  return {
    id:             'sale-1',
    orderItemId:    'ITEM-001',
    sku:            'SKU-A',
    realizedProfit: null,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function setupDefaults() {
  (prisma.settlementRecord.findMany as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue([]);
  (prisma.saleRecord.findMany      as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue([]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/sales/refunds/preview', () => {
  beforeEach(() => {
    setupDefaults();
    mockAuth.mockResolvedValue({
      user: { orgId: 'org-1', role: 'OWNER', plan: 'PRO' },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 for STARTER plan', async () => {
    mockAuth.mockResolvedValue({ user: { orgId: 'org-1', role: 'OWNER', plan: 'STARTER' } });
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Pro plan/i);
  });

  it('returns 403 for MEMBER role', async () => {
    mockAuth.mockResolvedValue({ user: { orgId: 'org-1', role: 'MEMBER', plan: 'PRO' } });
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns 200 with totalRefundRows=0 and message when no refund rows exist', async () => {
    const res  = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRefundRows).toBe(0);
    expect(body.message).toMatch(/No refund rows found/i);
    expect(body.matchedGroups).toEqual([]);
  });

  it('returns 200 with matched row when refund row orderItemCode matches a SaleRecord', async () => {
    (prisma.settlementRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeRefundRecord()]);
    (prisma.saleRecord.findMany      as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);

    const res  = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRefundRows).toBe(1);
    expect(body.matchedCount).toBe(1);
    expect(body.unmatchedCount).toBe(0);
    expect(body.sampleRows).toHaveLength(1);
    expect(body.sampleRows[0].saleRecordId).toBe('sale-1');
  });

  it('returns unmatchedCount > 0 when no SaleRecord matches the orderItemCode', async () => {
    (prisma.settlementRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRefundRecord({ orderItemCode: 'ITEM-999' }),
    ]);
    (prisma.saleRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res  = await POST(makeRequest());
    const body = await res.json();
    expect(body.matchedCount).toBe(0);
    expect(body.unmatchedCount).toBe(1);
  });

  it('does not match by SKU fallback — orderItemCode mismatch stays unmatched', async () => {
    (prisma.settlementRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRefundRecord({ orderItemCode: 'ITEM-999', sku: 'SKU-A' }),
    ]);
    (prisma.saleRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeSaleRecord({ orderItemId: 'ITEM-001', sku: 'SKU-A' }),
    ]);

    const res  = await POST(makeRequest());
    const body = await res.json();
    expect(body.matchedCount).toBe(0);
    expect(body.unmatchedCount).toBe(1);
  });

  it('never writes to DB — does not call saleRecord create, update, or upsert', async () => {
    (prisma.settlementRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeRefundRecord()]);
    (prisma.saleRecord.findMany      as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);

    await POST(makeRequest());

    // update/upsert were not added to the mock — calling them would throw, confirming no writes occurred
    expect(prisma.settlementRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.saleRecord.findMany).toHaveBeenCalledTimes(1);
  });

  it('accepts optional settlementId filter in body', async () => {
    (prisma.settlementRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await POST(makeRequest({ settlementId: 'S001' }));

    expect(prisma.settlementRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ settlementId: 'S001' }),
      }),
    );
  });

  it('works with empty JSON body (no settlementId required)', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
  });

  it('always includes the three required warnings in response', async () => {
    (prisma.settlementRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeRefundRecord()]);
    (prisma.saleRecord.findMany      as ReturnType<typeof vi.fn>).mockResolvedValue([makeSaleRecord()]);

    const res  = await POST(makeRequest());
    const body = await res.json();
    expect(body.warnings.some((w: string) => w.includes('not applied to realized profit'))).toBe(true);
    expect(body.warnings.some((w: string) => w.includes('Order-level refund rows'))).toBe(true);
    expect(body.warnings.some((w: string) => w.includes('Unsupported refund row types'))).toBe(true);
  });

  it('counts order-level rows (no orderItemCode) in skippedCount', async () => {
    (prisma.settlementRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRefundRecord({ orderItemCode: null }),
    ]);

    const res  = await POST(makeRequest());
    const body = await res.json();
    expect(body.skippedCount).toBe(1);
    expect(body.matchedCount).toBe(0);
  });
});
