// Tests for PATCH /api/products/[id]/ip-history
//
// Cases:
//   1. Unauthenticated → 401
//   2. Non-OWNER role → 403
//   3. Product not found (wrong org or id) → 404
//   4. Invalid body → 400
//   5. Flagging ASIN → updates products + rejects active leads + writes AuditLog (all in tx)
//   6. Clearing flag → updates products (no lead rejection) + writes AuditLog
//   7. Response contains leadsRejected count

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

const productFindFirst  = vi.fn();
const productUpdateMany = vi.fn();
const leadUpdateMany    = vi.fn();
const auditLogCreate    = vi.fn();
const txFn              = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product:  { findFirst: (...a: unknown[]) => productFindFirst(...a) },
    $transaction: (...a: unknown[]) => txFn(...a),
  },
}));

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const mockAuth = auth as ReturnType<typeof vi.fn>;

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/products/prod1/ip-history', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'prod1' });

// Simulate prisma.$transaction: call the callback with a mock tx client
// and return its result.
function setupTx() {
  txFn.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      product:  { updateMany: productUpdateMany },
      lead:     { updateMany: leadUpdateMany },
      auditLog: { create: auditLogCreate },
    };
    return cb(tx);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  productUpdateMany.mockResolvedValue({ count: 4 });
  leadUpdateMany.mockResolvedValue({ count: 3 });
  auditLogCreate.mockResolvedValue({});
  setupTx();
});

describe('PATCH /api/products/[id]/ip-history', () => {
  // ── 1. Unauthenticated ────────────────────────────────────────────────────

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(makeReq({ flagged: true }), { params });
    expect(res.status).toBe(401);
  });

  // ── 2. Non-OWNER → 403 ───────────────────────────────────────────────────

  it('returns 403 when caller is not OWNER', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'ADMIN', orgId: 'org1', id: 'u1', email: 'admin@org.com' } });
    const res = await PATCH(makeReq({ flagged: true }), { params });
    expect(res.status).toBe(403);
    expect(productFindFirst).not.toHaveBeenCalled();
  });

  // ── 3. Product not found → 404 ────────────────────────────────────────────

  it('returns 404 when product is not in caller org', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'OWNER', orgId: 'org1', id: 'u1', email: 'owner@org.com' } });
    productFindFirst.mockResolvedValue(null);

    const res = await PATCH(makeReq({ flagged: true }), { params });
    expect(res.status).toBe(404);
    expect(txFn).not.toHaveBeenCalled();
  });

  // ── 4. Invalid body → 400 ─────────────────────────────────────────────────

  it('returns 400 for invalid body (missing flagged)', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'OWNER', orgId: 'org1', id: 'u1', email: 'owner@org.com' } });
    productFindFirst.mockResolvedValue({ asin: 'B0GCCDXV8X', hasIpComplaintHistory: false });

    const res = await PATCH(makeReq({ note: 'no flagged field' }), { params });
    expect(res.status).toBe(400);
    expect(txFn).not.toHaveBeenCalled();
  });

  // ── 5. Flag ASIN → tx: updateMany products + reject active leads + AuditLog

  it('wraps product update and lead rejection in a transaction and writes AuditLog', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'OWNER', orgId: 'org1', id: 'u1', email: 'owner@org.com' } });
    productFindFirst.mockResolvedValue({ asin: 'B0GCCDXV8X', hasIpComplaintHistory: false });

    const res = await PATCH(makeReq({ flagged: true, note: 'Private label Astercook' }), { params });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.flagged).toBe(true);
    expect(body.leadsRejected).toBe(3);

    // Transaction was called
    expect(txFn).toHaveBeenCalledTimes(1);

    // Products updated
    expect(productUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { asin: 'B0GCCDXV8X' },
        data:  { hasIpComplaintHistory: true, ipComplaintNote: 'Private label Astercook' },
      }),
    );

    // Active leads rejected
    expect(leadUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { product: { asin: 'B0GCCDXV8X' }, status: { notIn: ['REJECTED', 'EXPIRED'] } },
        data:  { status: 'REJECTED' },
      }),
    );

    // AuditLog written with correct metadata
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId:    'org1',
          userId:   'u1',
          action:   'IP_COMPLAINT_ASIN_FLAGGED',
          resource: 'Product',
          metadata: expect.objectContaining({
            asin:                   'B0GCCDXV8X',
            previousHasIpComplaint: false,
            newHasIpComplaint:      true,
            leadsRejected:          3,
          }),
        }),
      }),
    );
  });

  // ── 6. Clear flag → no lead rejection, AuditLog records clear action ──────

  it('clears the flag without rejecting leads and writes a CLEARED AuditLog entry', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'OWNER', orgId: 'org1', id: 'u1', email: 'owner@org.com' } });
    productFindFirst.mockResolvedValue({ asin: 'B0GCCDXV8X', hasIpComplaintHistory: true });

    const res = await PATCH(makeReq({ flagged: false }), { params });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flagged).toBe(false);
    expect(body.leadsRejected).toBe(0);

    // Lead rejection must NOT be called when clearing
    expect(leadUpdateMany).not.toHaveBeenCalled();

    // Product update clears the flag
    expect(productUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { hasIpComplaintHistory: false, ipComplaintNote: null },
      }),
    );

    // AuditLog action is CLEARED
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action:   'IP_COMPLAINT_ASIN_CLEARED',
          metadata: expect.objectContaining({
            previousHasIpComplaint: true,
            newHasIpComplaint:      false,
          }),
        }),
      }),
    );
  });
});
