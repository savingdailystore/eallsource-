/**
 * Candidate Evaluation Service — Phase 18.2
 *
 * Evaluates a SourceCandidate through the full safety gate stack and writes
 * enrichment data back to SourceCandidate ONLY. This service must never
 * create Product, Lead, or LeadEntitlement records.
 *
 * Safety invariants (enforced by structure — these are never imported):
 * - processRetailerProduct  → not imported
 * - broadcastLeads          → not imported
 * - Apify                   → not imported
 * - force: true             → not used anywhere
 * - Only DB write: prisma.sourceCandidate.update
 *
 * Evaluation order (Phase 18.2e):
 *   0. source price missing        → NEEDS_REVIEW
 *   1. ASIN resolve                → REJECTED (no_match)
 *   2. IP complaint history        → REJECTED       ← hard gate
 *   3. Market data (SP-API+Keepa)
 *   4. Pricing guard (null/zero)   → NEEDS_REVIEW
 *   5. Brand block                 → REJECTED       ← hard gate
 *   6. Price floor                 → NO_LONGER_PROFITABLE
 *   7. Gating (PL/hazmat/generic)  → REJECTED       ← hard gate
 *   8. Advisory signal collection  ← runs regardless of fee availability
 *   9. Fee estimation              → NEEDS_REVIEW (fee note + advisory signals appended)
 *  10. Profitability               → NO_LONGER_PROFITABLE
 *  11. Advisory warnings present   → NEEDS_REVIEW
 *  12. Profitable + clean          → MATCHED  (owner must CERTIFY in Phase 18.4)
 *      CERTIFIED                  → never set here
 *
 * certNotes priority: hard reject > no pricing > fee unavailable > advisory warnings
 */

import { prisma } from '@/lib/prisma';
import { normalizeBrand } from '@/lib/brand';
import {
  getProductData,
  searchCatalogByUpc,
  searchCatalogByKeywords,
  getFeeEstimate,
} from '@/lib/amazon';
import { getKeepaData } from '@/lib/keepa';
import { assessGating } from '@/engines/gating';
import { assessDemand } from '@/engines/demand';
import { calculateProfitability } from '@/engines/profitability';
import type { CandidateStatus } from '@prisma/client';
import type { AmazonMatch } from '@/types';

const MIN_RESALE_PRICE = 12;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface EvaluationSummary {
  candidateId:     string;
  prevStatus:      CandidateStatus;
  newStatus:       CandidateStatus;
  certNotes:       string | null;
  asin:            string | null;
  matchMethod:     string | null;
  matchConfidence: number | null;
  buyBoxPrice:     number | null;
  estimatedProfit: number | null;
  /** Stored as decimal fraction: 0.30 = 30% ROI */
  estimatedRoi:    number | null;
  evaluatedAt:     Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveMatch(
  orgId:  string,
  asin:   string | null,
  upc:    string | null,
  title:  string | null,
  brand:  string | null,
): Promise<AmazonMatch | null> {
  if (asin) {
    return { asin, amazonUrl: `https://www.amazon.com/dp/${asin}`, matchMethod: 'MANUAL', matchConfidence: 100 };
  }
  if (upc) {
    const m = await searchCatalogByUpc(orgId, upc).catch(() => null);
    if (m) return m;
  }
  if (title) {
    const kw = [brand, title].filter(Boolean).join(' ');
    const m  = await searchCatalogByKeywords(orgId, kw).catch(() => null);
    if (m) return m;
  }
  return null;
}

async function persistResult(args: {
  candidateId:     string;
  newStatus:       CandidateStatus;
  certNotes:       string | null;
  asin:            string | null;
  buyBoxPrice:     number | null;
  estimatedProfit: number | null;
  estimatedRoi:    number | null;
  now:             Date;
}): Promise<void> {
  const { candidateId, newStatus, certNotes, asin, buyBoxPrice, estimatedProfit, estimatedRoi, now } = args;

  await prisma.sourceCandidate.update({
    where: { id: candidateId },
    data: {
      certStatus:    newStatus,
      certNotes,
      ...(asin            != null ? { asin }            : {}),
      ...(buyBoxPrice     != null ? { buyBoxPrice }     : {}),
      ...(estimatedProfit != null ? { estimatedProfit } : {}),
      ...(estimatedRoi    != null ? { estimatedRoi }    : {}),
      ...(buyBoxPrice     != null ? { amazonCheckedAt: now } : {}),
      lastCheckedAt: now,
      ...(newStatus === 'REJECTED' ? { rejectedAt: now, rejectedBy: 'evaluator' } : {}),
    },
  });
}

// ─── Main evaluator ───────────────────────────────────────────────────────────

export async function evaluateCandidate(
  candidateId: string,
  orgId:       string,
): Promise<EvaluationSummary> {

  // ── Load ──────────────────────────────────────────────────────────────────
  const candidate = await prisma.sourceCandidate.findUnique({
    where:  { id: candidateId },
    select: {
      id: true, certStatus: true,
      asin: true, upc: true, title: true, brand: true,
      sourcePrice: true,
    },
  });

  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }
  if (candidate.certStatus === 'CERTIFIED') {
    throw new Error(`Candidate ${candidateId} is already CERTIFIED — cannot re-evaluate`);
  }

  const prevStatus = candidate.certStatus;
  const now        = new Date();

  // Local shorthand: persist and return summary in one call
  async function done(
    newStatus:       CandidateStatus,
    certNotes:       string | null,
    asin:            string | null = null,
    matchMethod:     string | null = null,
    matchConfidence: number | null = null,
    buyBoxPrice:     number | null = null,
    estimatedProfit: number | null = null,
    estimatedRoi:    number | null = null,
  ): Promise<EvaluationSummary> {
    await persistResult({ candidateId, newStatus, certNotes, asin, buyBoxPrice, estimatedProfit, estimatedRoi, now });
    return { candidateId, prevStatus, newStatus, certNotes, asin, matchMethod, matchConfidence, buyBoxPrice, estimatedProfit, estimatedRoi, evaluatedAt: now };
  }

  if (candidate.sourcePrice == null) {
    return done('NEEDS_REVIEW', 'Source price missing — cannot evaluate profitability');
  }

  // ── 1. Resolve ASIN ───────────────────────────────────────────────────────
  const match = await resolveMatch(orgId, candidate.asin, candidate.upc, candidate.title, candidate.brand);

  if (!match) {
    return done('REJECTED', 'No Amazon ASIN match found for this product');
  }

  const { asin, matchMethod, matchConfidence } = match;

  // ── 2. IP-complaint history ────────────────────────────────────────────────
  const ipFlagged = await prisma.product.findFirst({
    where:  { asin, hasIpComplaintHistory: true },
    select: { id: true },
  });
  if (ipFlagged) {
    return done('REJECTED', 'ASIN has confirmed IP complaint history', asin, matchMethod, matchConfidence);
  }

  // ── 3. Market data ────────────────────────────────────────────────────────
  const [spResult, keepaResult] = await Promise.allSettled([
    getProductData(orgId, asin).catch(() => null),
    getKeepaData(asin),
  ]);
  const sp    = spResult.status    === 'fulfilled' ? spResult.value    : null;
  const keepa = keepaResult.status === 'fulfilled' ? keepaResult.value : null;

  const amazonTitle    = sp?.title    ?? keepa?.title    ?? candidate.title ?? '';
  const amazonBrand    = sp?.brand    ?? keepa?.brand    ?? candidate.brand;
  const amazonCategory = sp?.category ?? keepa?.category ?? 'Other';
  const rawBuyBoxPrice    = sp?.buyBoxPrice    ?? keepa?.buyBoxPrice    ?? null;
  const rawLowestFbaPrice = sp?.lowestFbaPrice ?? keepa?.lowestNewPrice ?? null;
  // A $0 buy box signals suppression or Amazon-exclusive listing, not a real price.
  const buyBoxPrice    = rawBuyBoxPrice    != null && rawBuyBoxPrice    > 0 ? rawBuyBoxPrice    : null;
  const lowestFbaPrice = rawLowestFbaPrice != null && rawLowestFbaPrice > 0 ? rawLowestFbaPrice : null;
  const fbaSellers     = (sp?.fbaSellers   || null) ?? keepa?.fbaSellers   ?? 0;
  const totalSellers   = (sp?.totalSellers || null) ?? keepa?.totalSellers ?? 0;
  const amazonIsSeller = sp?.amazonIsSeller ?? keepa?.amazonIsSeller ?? false;
  const bsr            = sp?.bsr   ?? keepa?.bsr;
  const monthlySales   = keepa?.monthlySales;
  const priceStability = keepa?.priceStability ?? 'UNKNOWN';
  const priceTrend     = keepa?.priceTrend     ?? 'UNKNOWN';
  const priceTrendPct  = keepa?.priceTrendPct;

  if (buyBoxPrice == null && lowestFbaPrice == null) {
    return done('NEEDS_REVIEW', 'ASIN matched but reliable Amazon pricing was unavailable', asin, matchMethod, matchConfidence);
  }

  const resellPrice      = lowestFbaPrice ?? buyBoxPrice!;
  const category         = amazonCategory;
  const buyBoxSuppressed = buyBoxPrice == null && totalSellers > 0;

  // ── 4. Brand block ────────────────────────────────────────────────────────
  const brandKey = normalizeBrand(amazonBrand ?? candidate.brand ?? '');
  if (brandKey) {
    const blocked = await prisma.brandBlock.findFirst({
      where:  { normalizedBrand: brandKey, isActive: true },
      select: { id: true },
    });
    if (blocked) {
      return done('REJECTED', `Brand blocked: ${amazonBrand ?? candidate.brand ?? brandKey}`, asin, matchMethod, matchConfidence, buyBoxPrice);
    }
  }

  // ── 5. Minimum resale-price floor ─────────────────────────────────────────
  if (resellPrice < MIN_RESALE_PRICE) {
    return done('NO_LONGER_PROFITABLE', `Amazon resale price $${resellPrice.toFixed(2)} below $${MIN_RESALE_PRICE} floor`, asin, matchMethod, matchConfidence, buyBoxPrice);
  }

  // ── 6. Gating / IP / hazmat ───────────────────────────────────────────────
  // Use the Amazon-authoritative brand for gating: Amazon's own brand name is
  // what identifies private-label (Solimo, Amazon Basics, etc.) reliably.
  const gating = assessGating({ title: amazonTitle, brand: (amazonBrand ?? candidate.brand) ?? undefined, category, hasHazmat: false });

  if (gating.isPrivateLabel) {
    return done('REJECTED', 'Amazon private-label product — no FBA buy box available', asin, matchMethod, matchConfidence, buyBoxPrice);
  }
  if (gating.hasHazmat) {
    return done('REJECTED', 'Hazmat / dangerous goods — FBA-restricted product', asin, matchMethod, matchConfidence, buyBoxPrice);
  }
  if (gating.isGenericBrand) {
    return done('REJECTED', 'Generic / unbranded product — elevated IP and quality risk', asin, matchMethod, matchConfidence, buyBoxPrice);
  }

  // ── 7. Advisory signal collection ─────────────────────────────────────────
  // Collected here — before fee estimation — so they are available to append
  // to the fee-unavailable note. Hard gates above already exited if triggered.
  const warnings: string[] = [];
  if (amazonIsSeller)                warnings.push('Amazon holds buy box');
  if (buyBoxSuppressed)              warnings.push('Buy box suppressed');
  if (priceStability === 'VOLATILE') warnings.push('Volatile price history');
  if (priceTrend === 'DECLINING')    warnings.push(`Declining price${priceTrendPct != null ? ` (${priceTrendPct.toFixed(1)}%)` : ''}`);
  if (gating.risk === 'HIGH')        warnings.push('High IP / gating risk');
  if (gating.risk === 'MEDIUM')      warnings.push('Medium IP / gating risk');
  if (matchMethod === 'TITLE_SIMILARITY' && (matchConfidence ?? 100) < 80) {
    warnings.push(`Low-confidence title match (${matchConfidence}%)`);
  }

  const demand = assessDemand({ bsr, category, fbaSellers, totalSellers, monthlySales });
  if (demand.velocityTooLow) warnings.push(`Low velocity (${demand.expectedUnitsPerSeller?.toFixed(1) ?? '?'} units/seller/mo)`);
  if (demand.level === 'LOW') warnings.push('Weak demand signal');

  // ── 8. Fee estimation ─────────────────────────────────────────────────────
  let referralFee: number | undefined;
  let fbaFee:      number | undefined;
  let feeEstimateOk = false;
  if (resellPrice > 0) {
    const fees = await getFeeEstimate(orgId, asin, resellPrice).catch(() => null);
    if (fees) { referralFee = fees.referralFee; fbaFee = fees.fbaFee; feeEstimateOk = true; }
  }

  // Without a real fee estimate, profit/ROI would be based on default rates that
  // may not reflect this ASIN's category, size tier, or weight — too unreliable to store.
  // Advisory signals are appended so the owner sees the full picture in one pass.
  if (!feeEstimateOk) {
    const advisoryNote = warnings.length > 0 ? `; also noted: ${warnings.join('; ')}` : '';
    return done('NEEDS_REVIEW',
      `Fee estimate unavailable; manual review required${advisoryNote}`,
      asin, matchMethod, matchConfidence, buyBoxPrice);
  }

  // ── 9. Profitability ──────────────────────────────────────────────────────
  const profitResult = calculateProfitability({
    sourcePrice:     candidate.sourcePrice,
    discounts:       [],
    resellPrice,
    category,
    referralFeeRate: referralFee != null ? referralFee / resellPrice : undefined,
    fbaFee,
  });

  if (!profitResult.qualifies) {
    const note = `Not profitable: ROI ${profitResult.roi.toFixed(1)}%, profit $${profitResult.profit.toFixed(2)}`;
    return done('NO_LONGER_PROFITABLE', note, asin, matchMethod, matchConfidence, buyBoxPrice, profitResult.profit, profitResult.roi / 100);
  }

  // ── 10. Advisory warnings → NEEDS_REVIEW ─────────────────────────────────
  if (warnings.length > 0) {
    return done(
      'NEEDS_REVIEW',
      `Needs owner review: ${warnings.join('; ')}`,
      asin, matchMethod, matchConfidence, buyBoxPrice,
      profitResult.profit, profitResult.roi / 100,
    );
  }

  // ── 11. Profitable + clean — MATCHED ──────────────────────────────────────
  // Owner must CERTIFY (Phase 18.4) before this candidate becomes a deliverable lead.
  return done('MATCHED', null, asin, matchMethod, matchConfidence, buyBoxPrice, profitResult.profit, profitResult.roi / 100);
}
