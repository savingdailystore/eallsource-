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

  it('throws if estimatedProfit is null or zero', async () => {
    (prisma.sourceCandidate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      matchedCandidate({ estimatedProfit: 0 }),
    );
    await expect(certifyCandidate('cand-1', 'user-1')).rejects.toThrow('estimated profit');
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

  it('creates Product + Lead and stamps CERTIFIED on the candidate', async () => {
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
