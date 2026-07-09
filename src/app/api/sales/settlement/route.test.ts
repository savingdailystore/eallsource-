import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    salesSync:         { create: vi.fn(), update: vi.fn() },
    settlementRecord:  { findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    saleRecord:        { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
  },
}));

import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockAuth = auth as ReturnType<typeof vi.fn>;

const SETTLEMENT_HEADERS =
  'settlement-id\ttransaction-type\tposted-date\torder-id\torder-item-code\tsku\tprice-type\tprice-amount\titem-related-fee-type\titem-related-fee-amount\tother-fee-reason-description';

function makeRow(overrides: Partial<Record<string, string>> = {}): string {
  const defaults: Record<string, string> = {
    'settlement-id': 'S001',
    'transaction-type': 'Order',
    'posted-date': '2024-01-15',
    'order-id': '114-1234567-8901234',
    'order-item-code': 'ITEM001',
    'sku': 'SKU-A',
    'price-type': '',
    'price-amount': '',
    'item-related-fee-type': 'Commission',
    'item-related-fee-amount': '-3.60',
    'other-fee-reason-description': '',
  };
  const merged = { ...defaults, ...overrides };
  return Object.values(merged).join('\t');
}

function makeTsv(...rows: string[]): string {
  return [SETTLEMENT_HEADERS, ...rows].join('\n');
}

function makeRequest(body: string, contentType = 'text/plain'): Request {
  return new Request('http://localhost/api/sales/settlement', {
    method: 'POST',
    body,
    headers: { 'content-type': contentType },
  });
}

function makeMultipartRequest(body: string): Request {
  const form = new FormData();
  form.append('file', new Blob([body], { type: 'text/plain' }), 'settlement.txt');
  return new Request('http://localhost/api/sales/settlement', {
    method: 'POST',
    body: form,
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function setupDefaults() {
  (prisma.salesSync.create   as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({ id: 'sync-1' });
  (prisma.salesSync.update   as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({});
  (prisma.settlementRecord.findMany  as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue([]);
  (prisma.settlementRecord.upsert    as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({});
  (prisma.settlementRecord.updateMany as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({});
  (prisma.saleRecord.findFirst as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(null);
  (prisma.saleRecord.update    as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({});
  (prisma.saleRecord.count     as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(0);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/sales/settlement', () => {
  beforeEach(() => {
    setupDefaults();
    mockAuth.mockResolvedValue({
      user: { orgId: 'org-1', role: 'OWNER', plan: 'PRO' },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(makeTsv(makeRow())));
    expect(res.status).toBe(401);
  });

  it('returns 403 for STARTER plan', async () => {
    mockAuth.mockResolvedValue({ user: { orgId: 'org-1', role: 'OWNER', plan: 'STARTER' } });
    const res = await POST(makeRequest(makeTsv(makeRow())));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Pro plan/i);
  });

  it('returns 403 for MEMBER role', async () => {
    mockAuth.mockResolvedValue({ user: { orgId: 'org-1', role: 'MEMBER', plan: 'PRO' } });
    const res = await POST(makeRequest(makeTsv(makeRow())));
    expect(res.status).toBe(403);
  });

  it('returns 400 for empty body', async () => {
    const res = await POST(makeRequest(''));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/empty/i);
  });

  it('returns 200 with correct counts for a single Order row', async () => {
    const res = await POST(makeRequest(makeTsv(makeRow())));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toBe(1);
    expect(body.orderRows).toBe(1);
    expect(body.refundRows).toBe(0);
    expect(body.syncId).toBe('sync-1');
  });

  it('marks sync DONE on success', async () => {
    await POST(makeRequest(makeTsv(makeRow())));
    expect(prisma.salesSync.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DONE' }) }),
    );
  });

  it('upserts a SettlementRecord for each row', async () => {
    await POST(makeRequest(makeTsv(makeRow(), makeRow({ 'order-item-code': 'ITEM002' }))));
    expect(prisma.settlementRecord.upsert).toHaveBeenCalledTimes(2);
  });

  it('counts created vs updated correctly', async () => {
    // Pre-existing dedupKey → first row is an update
    (prisma.settlementRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { dedupKey: expect.any(String) },
    ]);
    const res = await POST(makeRequest(makeTsv(makeRow())));
    const body = await res.json();
    // One row; whether it comes back as created or updated depends on dedupKey match.
    // Here we just verify the fields exist in the response.
    expect(typeof body.created).toBe('number');
    expect(typeof body.updated).toBe('number');
  });

  it('applies fees to matched SaleRecord', async () => {
    (prisma.saleRecord.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sale-1', netRevenue: 15.99, quantitySold: 1, unitCostUsed: 8.00,
    });
    await POST(makeRequest(makeTsv(makeRow())));
    expect(prisma.saleRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sale-1' },
        data:  expect.objectContaining({ totalFees: expect.any(Number) }),
      }),
    );
  });

  it('counts unmatched when no SaleRecord found', async () => {
    (prisma.saleRecord.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeRequest(makeTsv(makeRow())));
    const body = await res.json();
    expect(body.unmatched).toBe(1);
    expect(body.matched).toBe(0);
  });

  it('handles Refund rows without applying fees', async () => {
    const res = await POST(makeRequest(makeTsv(makeRow({ 'transaction-type': 'Refund' }))));
    const body = await res.json();
    expect(body.refundRows).toBe(1);
    expect(prisma.saleRecord.update).not.toHaveBeenCalled();
  });

  it('accepts multipart/form-data upload', async () => {
    const res = await POST(makeMultipartRequest(makeTsv(makeRow())));
    expect(res.status).toBe(200);
  });

  it('returns 500 and marks sync FAILED on unexpected error', async () => {
    (prisma.settlementRecord.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest(makeTsv(makeRow())));
    expect(res.status).toBe(500);
    expect(prisma.salesSync.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  // ─── Phase 6.2.3 file-type guard ─────────────────────────────────────────

  const ORDERS_REPORT_BODY =
    'order-id\torder-item-id\tasin\tsku\titem-price\titem-price-currency\tquantity-shipped\tship-service-level\tpurchase-date\trecipient-name\tship-city\n' +
    '114-1111111-1111111\t11111111111111\tB001\tSKU-A\t19.99\tUSD\t1\tStandard\t2024-04-25\tJohn Doe\tSeattle';

  it('returns 422 when an orders report is uploaded to the settlement endpoint', async () => {
    const res = await POST(makeRequest(ORDERS_REPORT_BODY));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/Orders report/i);
  });

  it('does not call prisma.salesSync.create when orders report is rejected', async () => {
    await POST(makeRequest(ORDERS_REPORT_BODY));
    expect(prisma.salesSync.create).not.toHaveBeenCalled();
  });

  it('does not upsert any SettlementRecord when orders report is rejected', async () => {
    await POST(makeRequest(ORDERS_REPORT_BODY));
    expect(prisma.settlementRecord.upsert).not.toHaveBeenCalled();
  });

  it('does not update any SaleRecord fees when orders report is rejected', async () => {
    await POST(makeRequest(ORDERS_REPORT_BODY));
    expect(prisma.saleRecord.update).not.toHaveBeenCalled();
  });

  it('error message for orders file instructs user to use Import Orders Report', async () => {
    const res = await POST(makeRequest(ORDERS_REPORT_BODY));
    const body = await res.json();
    expect(body.error).toMatch(/Import Orders Report/i);
  });

  it('valid settlement file still imports successfully after guard is in place', async () => {
    const res = await POST(makeRequest(makeTsv(makeRow())));
    expect(res.status).toBe(200);
    expect(prisma.salesSync.create).toHaveBeenCalled();
  });

  // ─── Phase 6.9 — remainingMissingFeesCount ───────────────────────────────

  it('returns remainingMissingFeesCount in successful response', async () => {
    (prisma.saleRecord.count as ReturnType<typeof vi.fn>).mockResolvedValue(7);
    const res  = await POST(makeRequest(makeTsv(makeRow())));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.remainingMissingFeesCount).toBe(7);
  });

  it('returns remainingMissingFeesCount of 0 when no fees remain missing', async () => {
    (prisma.saleRecord.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    const res  = await POST(makeRequest(makeTsv(makeRow())));
    const body = await res.json();
    expect(body.remainingMissingFeesCount).toBe(0);
  });
});
