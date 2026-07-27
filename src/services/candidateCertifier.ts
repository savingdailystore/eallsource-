/**
 * Candidate Certifier — Phase 18.3
 *
 * certifyCandidate: promotes a MATCHED candidate to CERTIFIED.
 *   - Creates (or upserts) a Product record.
 *   - Creates a Lead record linked to that Product.
 *   - Updates SourceCandidate with CERTIFIED status + productId + leadId.
 *   - Never calls processRetailerProduct, broadcastLeads, or Apify.
 *   - Never creates LeadEntitlement.
 *
 * rejectCandidate: marks any non-CERTIFIED candidate as REJECTED.
 *   - Updates SourceCandidate only.
 *
 * Safety invariants (enforced by structure — never imported):
 *   processRetailerProduct  → not imported
 *   broadcastLeads          → not imported
 *   Apify                   → not imported
 *   force: true             → not used anywhere
 *
 * Eligibility rules for certification:
 *   1. certStatus === 'MATCHED'
 *   2. asin present
 *   3. sourcePrice > 0
 *   4. buyBoxPrice > 0
 *   5. estimatedProfit > 0
 *   6. estimatedRoi > 0
 *   7. amazonCheckedAt present (real pricing was verified)
 *   8. certNotes === null (no outstanding advisory warnings)
 */

import { prisma } from '@/lib/prisma';
import type { CandidateStatus } from '@prisma/client';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CertifyResult {
  candidateId: string;
  productId:   string;
  leadId:      string;
  certifiedAt: Date;
}

export interface RejectResult {
  candidateId: string;
  rejectedAt:  Date;
  changed:     boolean;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

type EligibilityInput = {
  certStatus:      CandidateStatus;
  asin:            string | null;
  sourcePrice:     number | null;
  buyBoxPrice:     number | null;
  estimatedProfit: number | null;
  estimatedRoi:    number | null;
  amazonCheckedAt: Date | null;
  certNotes:       string | null;
};

function assertEligible(c: EligibilityInput): void {
  if (c.certStatus !== 'MATCHED') {
    throw new Error(`Only MATCHED candidates can be certified. Current status: ${c.certStatus}`);
  }
  if (!c.asin) {
    throw new Error('Candidate has no ASIN — cannot create Product');
  }
  if (c.sourcePrice == null || c.sourcePrice <= 0) {
    throw new Error('Candidate has no valid source price');
  }
  if (c.buyBoxPrice == null || c.buyBoxPrice <= 0) {
    throw new Error('Candidate has no valid buy box price');
  }
  if (c.estimatedProfit == null || c.estimatedProfit <= 0) {
    throw new Error('Candidate has no positive estimated profit');
  }
  if (c.estimatedRoi == null || c.estimatedRoi <= 0) {
    throw new Error('Candidate has no positive estimated ROI');
  }
  if (!c.amazonCheckedAt) {
    throw new Error('Candidate has not been Amazon-checked; re-evaluate before certifying');
  }
  if (c.certNotes != null) {
    throw new Error(`Candidate has outstanding review notes — cannot certify`);
  }
}

// ─── certifyCandidate ─────────────────────────────────────────────────────────

export async function certifyCandidate(
  candidateId: string,
  certifiedBy: string,
): Promise<CertifyResult> {
  const candidate = await prisma.sourceCandidate.findUnique({
    where:  { id: candidateId },
    select: {
      id:              true,
      certStatus:      true,
      orgId:           true,
      asin:            true,
      title:           true,
      brand:           true,
      sourcePrice:     true,
      buyBoxPrice:     true,
      estimatedProfit: true,
      estimatedRoi:    true,
      amazonCheckedAt: true,
      certNotes:       true,
      productId:       true,
    },
  });

  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }

  // Idempotent: already certified — return stored ids
  if (candidate.certStatus === 'CERTIFIED' && candidate.productId) {
    const lead = await prisma.lead.findFirst({
      where:  { productId: candidate.productId, orgId: candidate.orgId },
      select: { id: true },
    });
    const sc = await prisma.sourceCandidate.findUnique({
      where:  { id: candidateId },
      select: { certifiedAt: true },
    });
    return {
      candidateId,
      productId:   candidate.productId,
      leadId:      lead?.id ?? '',
      certifiedAt: sc?.certifiedAt ?? new Date(),
    };
  }

  assertEligible(candidate);

  const { orgId, asin, title, brand, buyBoxPrice, estimatedProfit, estimatedRoi } = candidate;
  const now = new Date();

  // Upsert Product (@@unique([orgId, asin]))
  const product = await prisma.product.upsert({
    where:  { orgId_asin: { orgId, asin: asin! } },
    create: {
      orgId,
      asin:   asin!,
      title:  title ?? asin!,
      brand:  brand ?? undefined,
      price:  buyBoxPrice!,
      fees:   0,
      profit: estimatedProfit!,
      roi:    estimatedRoi! * 100,
    },
    update: {
      title:  title ?? asin!,
      brand:  brand ?? undefined,
      price:  buyBoxPrice!,
      profit: estimatedProfit!,
      roi:    estimatedRoi! * 100,
    },
    select: { id: true },
  });

  // Create Lead linked to the Product
  const lead = await prisma.lead.create({
    data: {
      orgId,
      productId: product.id,
      score:     estimatedRoi! * 100,
      status:    'NEW',
      leadTier:  'BASIC',
    },
    select: { id: true },
  });

  // Stamp SourceCandidate as CERTIFIED
  await prisma.sourceCandidate.update({
    where: { id: candidateId },
    data:  {
      certStatus:  'CERTIFIED',
      certifiedAt: now,
      certifiedBy,
      productId:   product.id,
      leadId:      lead.id,
    },
  });

  return { candidateId, productId: product.id, leadId: lead.id, certifiedAt: now };
}

// ─── rejectCandidate ──────────────────────────────────────────────────────────

export async function rejectCandidate(
  candidateId: string,
  rejectedBy:  string,
  certNotes?:  string,
): Promise<RejectResult> {
  const candidate = await prisma.sourceCandidate.findUnique({
    where:  { id: candidateId },
    select: { id: true, certStatus: true },
  });

  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }
  if (candidate.certStatus === 'CERTIFIED') {
    throw new Error('Cannot reject a certified candidate');
  }
  // Idempotent
  if (candidate.certStatus === 'REJECTED') {
    return { candidateId, rejectedAt: new Date(), changed: false };
  }

  const now = new Date();
  await prisma.sourceCandidate.update({
    where: { id: candidateId },
    data:  {
      certStatus: 'REJECTED',
      certNotes:  certNotes ?? null,
      rejectedAt: now,
      rejectedBy,
    },
  });

  return { candidateId, rejectedAt: now, changed: true };
}
