/**
 * Lead broadcast: after the source org's scan creates leads, this copies
 * the qualifying products + leads into every org that has receiveBroadcast=true.
 * One Apify run, many recipients — cost stays flat regardless of user count.
 *
 * Also exposes backfillOrgFromSource() so a newly-registered org immediately
 * receives the current lead set instead of waiting for the next scan.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { Lead, Product } from '@prisma/client';

type LeadWithProduct = Lead & { product: Product };

// Copy a single source lead's product + lead into a target org (upsert).
async function copyLeadToOrg(targetOrgId: string, lead: LeadWithProduct): Promise<void> {
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
    amazonIsSeller:    p.amazonIsSeller,
    amazonOwnsBuyBox:  p.amazonOwnsBuyBox,
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
    demandLevel:       p.demandLevel,
    priceStability:    p.priceStability,
    keepaLink:         p.keepaLink,
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
  } else {
    await prisma.lead.create({
      data: { orgId: targetOrgId, productId: savedProduct.id, score: lead.score, status: 'NEW' },
    });
  }
}

// Fan out freshly-created leads to every subscriber org.
export async function broadcastLeads(sourceOrgId: string, leadIds: string[]): Promise<number> {
  if (leadIds.length === 0) return 0;

  const sourceLeads = await prisma.lead.findMany({
    where:   { id: { in: leadIds }, orgId: sourceOrgId },
    include: { product: true },
  });
  if (sourceLeads.length === 0) return 0;

  const targetOrgs = await prisma.organization.findMany({
    where:  { receiveBroadcast: true, id: { not: sourceOrgId } },
    select: { id: true },
  });
  if (targetOrgs.length === 0) return 0;

  let broadcast = 0;
  for (const { id: targetOrgId } of targetOrgs) {
    for (const lead of sourceLeads) {
      await copyLeadToOrg(targetOrgId, lead);
      broadcast++;
    }
  }

  console.log(`[broadcast] ${sourceLeads.length} leads → ${targetOrgs.length} orgs (${broadcast} upserts)`);
  return broadcast;
}

// Seed a single new org with the current lead set from the broadcast source.
// Called at registration so new users don't start with an empty feed.
export async function backfillOrgFromSource(targetOrgId: string): Promise<number> {
  const source = await prisma.organization.findFirst({
    where:  { isBroadcastSource: true },
    select: { id: true },
  });
  if (!source || source.id === targetOrgId) return 0;

  const sourceLeads = await prisma.lead.findMany({
    where:   { orgId: source.id, status: { notIn: ['REJECTED', 'EXPIRED'] } },
    include: { product: true },
  });
  if (sourceLeads.length === 0) return 0;

  for (const lead of sourceLeads) {
    await copyLeadToOrg(targetOrgId, lead);
  }

  console.log(`[backfill] seeded org ${targetOrgId} with ${sourceLeads.length} leads`);
  return sourceLeads.length;
}
