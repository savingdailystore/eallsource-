/**
 * Lead broadcast: after the source org's scan creates leads, this copies
 * the qualifying products + leads into every org that has receiveBroadcast=true.
 * One Apify run, many recipients — cost stays flat regardless of user count.
 *
 * Also exposes backfillOrgFromSource() so a newly-registered org immediately
 * receives a plan-appropriate subset of the current lead set.
 *
 * Phase 14.8c: every customer-visible copy gets a LeadEntitlement row so the
 * 14.8b read gate can allow access. Weekly quota is enforced per plan.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { normalizeBrand } from '@/lib/brand';
import type { Lead, Product } from '@prisma/client';
import { PLAN_LIMITS } from '@/types';
import type { Plan } from '@/types';
import {
  getCurrentDeliveryWeekStart,
  allowedLeadTiersForPlan,
  getWeeklyLeadUsage,
} from '@/lib/lead-delivery';

type LeadWithProduct = Lead & { product: Product };

// Copy a single source lead's product + lead into a target org (upsert).
// Returns the id of the customer org's lead row (new or existing).
export async function copyLeadToOrg(targetOrgId: string, lead: LeadWithProduct): Promise<string> {
  const p = lead.product;

  const productData = {
    asin:              p.asin,
    upc:               p.upc,
    ean:               p.ean,
    model:             p.model,
    brand:             p.brand,
    title:             p.title,
    category:          p.category,
    imageUrl:          p.imageUrl,
    sourceUrl:         p.sourceUrl,
    sourceRetailer:    p.sourceRetailer,
    sourcePrice:       p.sourcePrice,
    sourceListPrice:   p.sourceListPrice,
    onSale:            p.onSale,
    sourceTax:         p.sourceTax,
    sourceShipping:    p.sourceShipping,
    availableDiscounts: p.availableDiscounts ?? Prisma.JsonNull,
    discountSources:   p.discountSources ?? Prisma.JsonNull,
    finalCost:         p.finalCost,
    amazonUrl:         p.amazonUrl,
    buyBoxPrice:       p.buyBoxPrice,
    lowestFbaPrice:    p.lowestFbaPrice,
    estimatedResellPrice: p.estimatedResellPrice,
    totalLandedCost:   p.totalLandedCost,
    amazonFees:        p.amazonFees,
    referralFee:       p.referralFee,
    fbaFee:            p.fbaFee,
    storageFee:        p.storageFee,
    prepFee:           p.prepFee,
    taxAmount:         p.taxAmount,
    sourceTaxRate:     p.sourceTaxRate,
    price:             p.price,
    fees:              p.fees,
    profit:            p.profit,
    roi:               p.roi,
    margin:            p.margin,
    bsr:               p.bsr,
    bsrPercentage:     p.bsrPercentage,
    buyBoxOwner:       p.buyBoxOwner,
    fbaSellers:        p.fbaSellers,
    totalSellers:      p.totalSellers,
    monthlySales:           p.monthlySales,
    expectedUnitsPerSeller: p.expectedUnitsPerSeller,
    amazonIsSeller:    p.amazonIsSeller,
    amazonOwnsBuyBox:  p.amazonOwnsBuyBox,
    buyBoxSuppressed:  p.buyBoxSuppressed,
    isVariation:       p.isVariation,
    parentAsin:        p.parentAsin,
    roiImplausible:    p.roiImplausible,
    rating:            p.rating,
    reviewCount:       p.reviewCount,
    lowReviews:        p.lowReviews,
    matchMethod:       p.matchMethod,
    matchConfidence:   p.matchConfidence,
    identityScore:     p.identityScore,
    urlScore:          p.urlScore,
    priceScore:        p.priceScore,
    inventoryScore:    p.inventoryScore,
    validationPassed:  p.validationPassed,
    autoUngated:       p.autoUngated,
    ipRiskScore:       p.ipRiskScore,
    gatingRisk:        p.gatingRisk,
    hasHazmat:         p.hasHazmat,
    isBrandRestricted: p.isBrandRestricted,
    isCategoryGated:   p.isCategoryGated,
    isPrivateLabel:    p.isPrivateLabel,
    isGenericBrand:    p.isGenericBrand,
    isMeltable:        p.isMeltable,
    feeEstimateConfirmed:  p.feeEstimateConfirmed,
    hasIpComplaintHistory: p.hasIpComplaintHistory,
    ipComplaintNote:       p.ipComplaintNote,
    demandLevel:       p.demandLevel,
    priceStability:    p.priceStability,
    priceTrend:        p.priceTrend,
    priceTrendPct:     p.priceTrendPct,
    keepaLink:         p.keepaLink,
    notes:             p.notes,
    score:             p.score,
  };

  const savedProduct = await prisma.product.upsert({
    where:  { orgId_asin: { orgId: targetOrgId, asin: p.asin } },
    create: { ...productData, orgId: targetOrgId },
    update: productData,
  });

  const existing = await prisma.lead.findFirst({
    where: { orgId: targetOrgId, productId: savedProduct.id, status: { notIn: ['REJECTED', 'EXPIRED'] } },
  });

  if (existing) {
    await prisma.lead.update({ where: { id: existing.id }, data: { score: lead.score } });
    return existing.id;
  }

  const created = await prisma.lead.create({
    data: { orgId: targetOrgId, productId: savedProduct.id, score: lead.score, status: 'NEW', leadTier: lead.leadTier, sourceTaxRate: p.sourceTaxRate },
  });
  return created.id;
}

// Fan out freshly-created leads to every subscriber org, respecting each org's
// plan tier allowance and weekly quota. Returns number of entitlements upserted.
export async function broadcastLeads(sourceOrgId: string, leadIds: string[]): Promise<number> {
  if (leadIds.length === 0) return 0;

  const sourceLeads = await prisma.lead.findMany({
    where:   { id: { in: leadIds }, orgId: sourceOrgId },
    include: { product: true },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
  });
  if (sourceLeads.length === 0) return 0;

  // Defensive brand-block filter: the pipeline gate prevents new leads from blocked
  // brands entering the source org, but a brand may have been blocked after a lead
  // was already created. Exclude those leads from this broadcast run.
  const activeBlocks = await prisma.brandBlock.findMany({
    where:  { isActive: true },
    select: { normalizedBrand: true },
  });
  const blockedBrandSet = new Set(activeBlocks.map(b => b.normalizedBrand));
  const filteredLeads = sourceLeads.filter(l => {
    const nb = normalizeBrand(l.product.brand);
    return !nb || !blockedBrandSet.has(nb);
  });

  const targetOrgs = await prisma.organization.findMany({
    where:  { receiveBroadcast: true, id: { not: sourceOrgId } },
    select: { id: true, plan: true },
  });
  if (targetOrgs.length === 0) return 0;

  const weekStart = getCurrentDeliveryWeekStart();
  let totalEntitlements = 0;

  for (const org of targetOrgs) {
    const plan         = org.plan as Plan;
    const allowedTiers = allowedLeadTiersForPlan(plan);
    const used         = await getWeeklyLeadUsage(org.id, weekStart);
    const slots        = Math.max(0, PLAN_LIMITS[plan].leadsPerWeek - used);

    if (slots === 0) {
      console.log(`[broadcast] org ${org.id} (${plan}) at weekly limit — skipped`);
      continue;
    }

    // Pre-fetch every lead ID this org already holds an entitlement for (any source,
    // any week). Dedupe identity: customer lead ID, which is unique per ASIN per org
    // via the orgId_asin product upsert constraint in copyLeadToOrg.
    const existing = await prisma.leadEntitlement.findMany({
      where:  { orgId: org.id },
      select: { leadId: true },
    });
    const alreadyEntitled = new Set(existing.map(e => e.leadId));

    const eligible = filteredLeads
      .filter(l => allowedTiers.includes(l.leadTier as string as 'BASIC' | 'PRO' | 'PREMIUM'));

    // Iterate through all eligible candidates; skip those the org already owns.
    // Stop once we have filled the org's remaining weekly slots with NEW entitlements.
    let newThisRun = 0;
    for (const lead of eligible) {
      if (newThisRun >= slots) break;

      const copiedLeadId = await copyLeadToOrg(org.id, lead);

      if (alreadyEntitled.has(copiedLeadId)) {
        // Org already has this lead from a previous drop or backfill — skip without
        // consuming a slot. BACKFILL rows (countsTowardWeeklyLimit=false) are also
        // caught here, preventing duplicate delivery of the same underlying lead.
        continue;
      }

      await prisma.leadEntitlement.upsert({
        where:  { orgId_leadId: { orgId: org.id, leadId: copiedLeadId } },
        create: {
          orgId:                   org.id,
          leadId:                  copiedLeadId,
          deliverySource:          'AUTO_BROADCAST',
          countsTowardWeeklyLimit: true,
          leadTierAtDelivery:      lead.leadTier,
          deliveryWeekStart:       weekStart,
          deliveredAt:             new Date(),
        },
        update: {},
      });

      alreadyEntitled.add(copiedLeadId);
      newThisRun++;
    }

    totalEntitlements += newThisRun;
  }

  console.log(`[broadcast] ${totalEntitlements} entitlements upserted across ${targetOrgs.length} orgs`);
  return totalEntitlements;
}

// Seed a newly-registered org with a plan-appropriate subset of the current source
// lead pool. Entitlements count toward the first weekly allocation so the org
// does not receive more than its advertised drop volume on sign-up.
export async function backfillOrgFromSource(targetOrgId: string): Promise<number> {
  const [source, targetOrg] = await Promise.all([
    prisma.organization.findFirst({
      where:  { isBroadcastSource: true },
      select: { id: true },
    }),
    prisma.organization.findUnique({
      where:  { id: targetOrgId },
      select: { id: true, plan: true },
    }),
  ]);

  if (!source || !targetOrg || source.id === targetOrgId) return 0;

  const plan         = targetOrg.plan as Plan;
  const allowedTiers = allowedLeadTiersForPlan(plan);
  const limit        = PLAN_LIMITS[plan].leadsPerWeek;
  const weekStart    = getCurrentDeliveryWeekStart();

  const sourceLeads = await prisma.lead.findMany({
    where:   {
      orgId:    source.id,
      status:   { notIn: ['REJECTED', 'EXPIRED'] },
      leadTier: { in: allowedTiers as string[] as ['BASIC'] },
    },
    include: { product: true },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    take:    limit,
  });

  if (sourceLeads.length === 0) return 0;

  // Defensive brand-block filter for backfill (same rationale as broadcastLeads).
  const backfillBlocks = await prisma.brandBlock.findMany({
    where:  { isActive: true },
    select: { normalizedBrand: true },
  });
  const backfillBlockedSet = new Set(backfillBlocks.map(b => b.normalizedBrand));
  const eligibleLeads = sourceLeads.filter(l => {
    const nb = normalizeBrand(l.product.brand);
    return !nb || !backfillBlockedSet.has(nb);
  });

  let count = 0;
  for (const lead of eligibleLeads) {
    const copiedLeadId = await copyLeadToOrg(targetOrgId, lead);

    await prisma.leadEntitlement.upsert({
      where:  { orgId_leadId: { orgId: targetOrgId, leadId: copiedLeadId } },
      create: {
        orgId:                   targetOrgId,
        leadId:                  copiedLeadId,
        deliverySource:          'BACKFILL',
        countsTowardWeeklyLimit: true,
        leadTierAtDelivery:      lead.leadTier,
        deliveryWeekStart:       weekStart,
        deliveredAt:             new Date(),
      },
      update: {},
    });

    count++;
  }

  console.log(`[backfill] seeded org ${targetOrgId} with ${count} leads (plan=${plan}, limit=${limit})`);
  return count;
}
