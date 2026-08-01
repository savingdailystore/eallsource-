/**
 * candidateCertifier — Phase 18.3 tests
 *
 * 13 test cases covering:
 *   - certifyCandidate eligibility guards (8 cases)
 *   - certifyCandidate happy path (1 case)
 *   - certifyCandidate idempotency (1 case)
 *   - rejectCandidate happy path (1 case)
 *   - rejectCandidate idempotency (1 case)
 *   - rejectCandidate CERTIFIED guard (1 case)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { certifyCandidate, rejectCandidate } from './candidateCertifier';

// ─── Mock prisma ──────────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => {
  const mockFindUnique    = vi.fn();
  const mockFindFirst     = vi.fn();
  const mockUpsert        = vi.fn();
  const mockCreate        = vi.fn();
  const mockUpdate        = vi.fn();

  return {
    prisma: {
      sourceCandidate: {
        findUnique: mockFindUnique,
        update:     mockUpdate,
      },
      lead: {
        findFirst: mockFindFirst,
        create:    mockCreate,
      },
      product: {
        upsert: mockUpsert,
      },
    },
  };
});

import { prisma } from '@/lib/prisma';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchedCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id:              'cand-1',
    certStatus:      'MATCHED',
    orgId:           'org-1',
    asin:            'B0001234567',
    title:           'Test Product',
    brand:           'TestBrand',
    sourcePrice:     10.00,
    buyBoxPrice:     24.99,
    estimatedProfit: 5.00,
    estimatedRoi:    0.30,
    amazonCheckedAt: new Date('2026-07-01'),
    certNotes:       null,
    productId:       null,
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

// ─── certifyCandidate — eligibility guards ────────────────────────────────────

describe('certifyCandidate — eligibility guards', () => {

  it('throws if candidate not found', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(certifyCandidate('no-such-id', 'user-1')).rejects.toThrow('not found');
  });

  it('throws if certStatus is NEEDS_REVIEW', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate({ certStatus: 'NEEDS_REVIEW', certNotes: 'Fee estimate unavailable' }),
    );
    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('Only MATCHED');
  });

  it('throws if certStatus is RAW_CANDIDATE', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate({ certStatus: 'RAW_CANDIDATE', certNotes: null }),
    );
    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('Only MATCHED');
  });

  it('throws if asin is null', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate({ asin: null }),
    );
    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('no ASIN');
  });

  it('throws if sourcePrice is null', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate({ sourcePrice: null }),
    );
    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('source price');
  });

  it('throws if buyBoxPrice is null or zero', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate({ buyBoxPrice: 0 }),
    );
    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('buy box price');
  });

  it('throws if buyBoxPrice is $10,000 (anomalously high — catalog anomaly guard)', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate({ buyBoxPrice: 10_000 }),
    );
    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('anomalously high');
  });

  it('throws if estimatedProfit is null or zero', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate({ estimatedProfit: 0 }),
    );
    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('estimated profit');
  });

  it('throws if estimatedRoi is 0.01 (below 30% threshold)', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate({ estimatedRoi: 0.01 }),
    );
    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('below minimum 30%');
  });

  it('throws if estimatedRoi is 0.299 (just below 30% threshold)', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate({ estimatedRoi: 0.299 }),
    );
    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('below minimum 30%');
  });

  it('throws if amazonCheckedAt is null', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate({ amazonCheckedAt: null }),
    );
    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('Amazon-checked');
  });

  it('throws if certNotes is non-null (outstanding review notes)', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate({ certNotes: 'Needs owner review: Amazon holds buy box' }),
    );
    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('outstanding review notes');
  });

});

// ─── certifyCandidate — happy path ────────────────────────────────────────────

describe('certifyCandidate — happy path', () => {

  it('succeeds when estimatedRoi is exactly 0.30 (meets 30% threshold) and creates Product + Lead', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate(),
    );
    (prisma.product.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'prod-1' });
    (prisma.lead.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'lead-1' });
    (prisma.sourceCandidate.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await certifyCandidate('cand-1', 'user-1');

    expect(result.productId).toBe('prod-1');
    expect(result.leadId).toBe('lead-1');
    expect(result.candidateId).toBe('cand-1');

    // Product upsert called with correct orgId+asin key
    expect(prisma.product.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { orgId_asin: { orgId: 'org-1', asin: 'B0001234567' } },
    }));

    // Lead created with score = estimatedRoi * 100
    expect(prisma.lead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        orgId:     'org-1',
        productId: 'prod-1',
        score:     30,
        status:    'NEW',
        leadTier:  'BASIC',
      }),
    }));

    // SourceCandidate stamped CERTIFIED
    expect(prisma.sourceCandidate.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'cand-1' },
      data:  expect.objectContaining({
        certStatus:  'CERTIFIED',
        certifiedBy: 'user-1',
        productId:   'prod-1',
        leadId:      'lead-1',
      }),
    }));
  });

});

// ─── certifyCandidate — idempotency ──────────────────────────────────────────

describe('certifyCandidate — idempotency', () => {

  it('returns existing ids without re-creating records if already CERTIFIED', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(matchedCandidate({ certStatus: 'CERTIFIED', productId: 'prod-existing' }))
      .mockResolvedValueOnce({ certifiedAt: new Date('2026-07-10') });
    (prisma.lead.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'lead-existing' });

    const result = await certifyCandidate('cand-1', 'user-1');

    expect(result.productId).toBe('prod-existing');
    expect(result.leadId).toBe('lead-existing');
    expect(prisma.product.upsert).not.toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.sourceCandidate.update).not.toHaveBeenCalled();
  });

});

// ─── rejectCandidate ─────────────────────────────────────────────────────────

describe('rejectCandidate', () => {

  it('rejects a NEEDS_REVIEW candidate and returns changed:true', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'cand-1', certStatus: 'NEEDS_REVIEW',
    });
    (prisma.sourceCandidate.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await rejectCandidate('cand-1', 'user-1', 'Not viable');

    expect(result.changed).toBe(true);
    expect(prisma.sourceCandidate.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        certStatus: 'REJECTED',
        certNotes:  'Not viable',
        rejectedBy: 'user-1',
      }),
    }));
  });

  it('is idempotent — returns changed:false if already REJECTED', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'cand-1', certStatus: 'REJECTED',
    });

    const result = await rejectCandidate('cand-1', 'user-1');

    expect(result.changed).toBe(false);
    expect(prisma.sourceCandidate.update).not.toHaveBeenCalled();
  });

  it('throws if attempting to reject a CERTIFIED candidate', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'cand-1', certStatus: 'CERTIFIED',
    });

    await expect(rejectCandidate('cand-1', 'user-1')).rejects.toThrow('Cannot reject a certified');
  });

});

// ─── Phase 20.2E: leadPurpose written on Lead.create ─────────────────────────

describe('certifyCandidate — leadPurpose on Lead.create (Phase 20.2E)', () => {

  it('PROFIT path explicitly writes leadPurpose = PROFIT on Lead.create', async () => {
    // matchedCandidate has no targetLeadPurpose → undefined → PROFIT path
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate(),
    );
    (prisma.product.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'prod-1' });
    (prisma.lead.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'lead-1' });
    (prisma.sourceCandidate.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await certifyCandidate('cand-1', 'user-1');

    expect(prisma.lead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ leadPurpose: 'PROFIT', leadTier: 'BASIC' }),
    }));
  });

  it('unknown targetLeadPurpose uses PROFIT certification path (WATCHLIST → ROI still required)', async () => {
    // 'WATCHLIST' is not 'STARTER_SALES' → assertEligible (PROFIT) is called → ROI must be >= 30%
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate({ targetLeadPurpose: 'WATCHLIST', estimatedRoi: 0.25 }),
    );

    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('below minimum 30%');
  });

});

// ─── Phase 20.2E: STARTER_SALES eligibility guards ───────────────────────────

function starterMatchedCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id:                'cand-1',
    certStatus:        'MATCHED',
    orgId:             'org-1',
    asin:              'B0001234567',
    title:             'Starter Test Product',
    brand:             'TestBrand',
    sourcePrice:       8.00,    // <= $15 ✓
    buyBoxPrice:       12.00,   // >= $5, <= $25 ✓
    estimatedProfit:   2.00,    // >= $1 ✓
    estimatedRoi:      0.25,    // no minimum ✓
    amazonCheckedAt:   new Date('2026-07-01'),
    certNotes:         null,
    productId:         null,
    targetLeadPurpose: 'STARTER_SALES',
    ...overrides,
  };
}

describe('certifyCandidate — STARTER_SALES eligibility guards (Phase 20.2E)', () => {

  it('STARTER_SALES: profit $1.00 can certify', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate({ estimatedProfit: 1.00 }),
    );
    (prisma.product.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'prod-1' });
    (prisma.lead.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'lead-1' });
    (prisma.sourceCandidate.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await certifyCandidate('cand-1', 'user-1');

    expect(result.leadId).toBe('lead-1');
    expect(result.productId).toBe('prod-1');
  });

  it('STARTER_SALES: profit $0.99 fails', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate({ estimatedProfit: 0.99 }),
    );

    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('STARTER_SALES floor');
  });

  it('STARTER_SALES: ROI 25% (below 30%) can certify when profit >= $1', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate({ estimatedProfit: 2.00, estimatedRoi: 0.25 }),
    );
    (prisma.product.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'prod-1' });
    (prisma.lead.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'lead-1' });
    (prisma.sourceCandidate.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await certifyCandidate('cand-1', 'user-1');

    expect(result.leadId).toBe('lead-1');
    // Verify no ROI error thrown — PROFIT path would require >= 30%
    expect(prisma.lead.create).toHaveBeenCalled();
  });

  it('STARTER_SALES: resale price $4.99 fails', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate({ buyBoxPrice: 4.99 }),
    );

    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('STARTER_SALES floor');
  });

  it('STARTER_SALES: resale price $5.00 can certify', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate({ buyBoxPrice: 5.00 }),
    );
    (prisma.product.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'prod-1' });
    (prisma.lead.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'lead-1' });
    (prisma.sourceCandidate.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await certifyCandidate('cand-1', 'user-1');

    expect(result.leadId).toBe('lead-1');
  });

  it('STARTER_SALES: resale price $25.01 fails', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate({ buyBoxPrice: 25.01 }),
    );

    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('STARTER_SALES ceiling');
  });

  it('STARTER_SALES: source price $15.01 fails', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate({ sourcePrice: 15.01 }),
    );

    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('STARTER_SALES ceiling');
  });

  it('STARTER_SALES: missing estimatedProfit fails', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate({ estimatedProfit: null }),
    );

    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('missing estimated profit');
  });

  it('STARTER_SALES: missing estimatedRoi fails (required for score)', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate({ estimatedRoi: null }),
    );

    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('missing estimated ROI');
  });

  it('STARTER_SALES: certStatus NEEDS_REVIEW fails', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate({ certStatus: 'NEEDS_REVIEW' }),
    );

    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('Only MATCHED');
  });

  it('STARTER_SALES: certNotes non-null fails', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate({ certNotes: 'Meltable item flagged' }),
    );

    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('outstanding review notes');
  });

});

// ─── Phase 20.2E: STARTER_SALES Lead.create fields ───────────────────────────

describe('certifyCandidate — STARTER_SALES Lead.create behavior (Phase 20.2E)', () => {

  it('creates Lead with leadPurpose = STARTER_SALES and leadTier = BASIC', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate(),
    );
    (prisma.product.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'prod-1' });
    (prisma.lead.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'lead-1' });
    (prisma.sourceCandidate.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await certifyCandidate('cand-1', 'user-1');

    expect(prisma.lead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        leadPurpose: 'STARTER_SALES',
        leadTier:    'BASIC',
        status:      'NEW',
      }),
    }));
  });

  it('score is estimatedRoi * 100 for STARTER_SALES (0.25 → 25)', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate({ estimatedRoi: 0.25 }),
    );
    (prisma.product.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'prod-1' });
    (prisma.lead.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'lead-1' });
    (prisma.sourceCandidate.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await certifyCandidate('cand-1', 'user-1');

    expect(prisma.lead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ score: 25 }),
    }));
  });

  it('STARTER_SALES stamps SourceCandidate as CERTIFIED after Lead.create', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      starterMatchedCandidate(),
    );
    (prisma.product.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'prod-1' });
    (prisma.lead.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'lead-1' });
    (prisma.sourceCandidate.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await certifyCandidate('cand-1', 'user-1');

    // SourceCandidate stamped CERTIFIED — same invariant as PROFIT path
    expect(prisma.sourceCandidate.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'cand-1' },
      data:  expect.objectContaining({ certStatus: 'CERTIFIED', productId: 'prod-1', leadId: 'lead-1' }),
    }));
  });

});
