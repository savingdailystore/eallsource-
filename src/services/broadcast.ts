/**
 * Lead broadcast: after the source org's scan creates leads, this copies
 * the qualifying products + leads into every org that has receiveBroadcast=true.
 * One Apify run, many recipients — cost stays flat regardless of user count.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function broadcastLeads(sourceOrgId: string, leadIds: string[]): Promise<number> {
  if (leadIds.length === 0) return 0;

  // Fetch the full product data for each qualifying lead
  const sourceLeads = await prisma.lead.findMany({
    where:   { id: { in: leadIds }, orgId: sourceOrgId },
    include: { product: true },
  });
  if (sourceLeads.length === 0) return 0;

  // All orgs that should receive these leads (excluding the source)
  const targetOrgs = await prisma.organization.findMany({
    where:  { receiveBroadcast: true, id: { not: sourceOrgId } },
    select: { id: true },
  });
  if (targetOrgs.length === 0) return 0;

  let broadcast = 0;

  for (const { id: targetOrgId } of targetOrgs) {
    for (const lead of sourceLeads) {
      const p = lead.product;

      // Build product payload — explicit field list avoids spreading relation internals
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

      // Upsert product for the target org
      const savedProduct = await prisma.product.upsert({
        where:  { orgId_asin: { orgId: targetOrgId, asin: p.asin } },
        create: { ...productData, orgId: targetOrgId },
        update: productData,
      });

      // Upsert the lead — refresh score if exists, create NEW if not
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

      broadcast++;
    }
  }

  console.log(`[broadcast] ${sourceLeads.length} leads → ${targetOrgs.length} orgs (${broadcast} upserts)`);
  return broadcast;
}
