/**
 * Lead pipeline: takes a raw retailer product through the full engine stack
 * and either creates a qualified Lead in the DB or returns the rejection reason.
 *
 * Flow:
 *   RetailerProduct
 *     → match Amazon ASIN (SP-API catalog, then Keepa fallback)
 *     → get market data (SP-API pricing + Keepa)
 *     → calculate profitability
 *     → assess gating risk
 *     → assess demand (BSR)
 *     → validate all scores ≥ 95%
 *     → score the lead
 *     → upsert Product + upsert Lead
 */

import { prisma } from '@/lib/prisma';
import { getKeepaData } from '@/lib/keepa';
import { getProductData, searchCatalogByUpc, searchCatalogByEan, searchCatalogByKeywords, getFeeEstimate } from '@/lib/amazon';
import { calculateProfitability } from '@/engines/profitability';
import { assessGating } from '@/engines/gating';
import { assessDemand, bsrToPercentile } from '@/engines/demand';
import { validateProduct } from '@/engines/validation';
import { calculateScore } from '@/engines/scoring';
import type { RetailerProduct, AmazonMatch } from '@/types';

export type PipelineResult =
  | { outcome: 'lead_created';      leadId: string; score: number }
  | { outcome: 'lead_updated';      leadId: string; score: number }
  | { outcome: 'no_match' }
  | { outcome: 'validation_failed'; reasons: string[] }
  | { outcome: 'not_profitable';    roi: number; profit: number }
  | { outcome: 'demand_too_low';    bsr: number }
  | { outcome: 'error';             message: string };

export async function processRetailerProduct(
  product: RetailerProduct,
  orgId: string,
): Promise<PipelineResult> {
  try {
    // ── 1. Find Amazon ASIN ───────────────────────────────────────────────────
    const match = await findMatch(product, orgId);
    if (!match) return { outcome: 'no_match' };

    const { asin, amazonUrl, matchMethod, matchConfidence } = match;

    // ── 2. Get market data ────────────────────────────────────────────────────
    // Try SP-API first (requires connected cred), fall back to Keepa
    const [spData, keepaData] = await Promise.allSettled([
      getProductData(orgId, asin).catch(() => null),
      getKeepaData(asin),
    ]);

    const sp    = spData.status    === 'fulfilled' ? spData.value    : null;
    const keepa = keepaData.status === 'fulfilled' ? keepaData.value : null;

    // Merge: SP-API takes precedence, Keepa fills gaps
    const amazonTitle    = sp?.title    ?? keepa?.title    ?? product.title;
    const amazonBrand    = sp?.brand    ?? keepa?.brand    ?? product.brand;
    const amazonCategory = sp?.category ?? keepa?.category ?? product.category;
    const imageUrl       = sp?.imageUrl ?? keepa?.imageUrl ?? product.imageUrl;
    const bsr            = sp?.bsr      ?? keepa?.bsr;
    const buyBoxPrice    = sp?.buyBoxPrice   ?? keepa?.buyBoxPrice;
    const lowestFbaPrice = sp?.lowestFbaPrice ?? keepa?.lowestNewPrice;
    const fbaSellers     = sp?.fbaSellers    ?? keepa?.fbaSellers    ?? 0;
    const totalSellers   = sp?.totalSellers  ?? keepa?.totalSellers  ?? 0;
    const amazonIsSeller = sp?.amazonIsSeller ?? keepa?.amazonIsSeller ?? false;
    const priceStability = keepa?.priceStability ?? 'UNKNOWN';
    const keepaLink      = keepa?.keepaLink;

    const resellPrice = lowestFbaPrice ?? buyBoxPrice ?? product.price;
    const category    = amazonCategory ?? product.category ?? 'Other';

    // ── 3. Demand gate (BSR must be top 3%) ───────────────────────────────────
    const demandResult = assessDemand({ bsr: bsr ?? 999999, category, fbaSellers, totalSellers });
    if (demandResult.level === 'LOW' && bsr != null) {
      return { outcome: 'demand_too_low', bsr };
    }

    // ── 4. Gating risk ────────────────────────────────────────────────────────
    const gatingResult = assessGating({
      title:  product.title,
      brand:  product.brand   ?? amazonBrand,
      category,
      hasHazmat: false,
    });

    // ── 5. Get real fee data if SP-API is connected ───────────────────────────
    let referralFee: number | undefined;
    let fbaFee: number | undefined;

    if (resellPrice > 0) {
      const feeData = await getFeeEstimate(orgId, asin, resellPrice).catch(() => null);
      if (feeData) {
        referralFee = feeData.referralFee;
        fbaFee      = feeData.fbaFee;
      }
    }

    // ── 6. Profitability ──────────────────────────────────────────────────────
    const profitResult = calculateProfitability({
      sourcePrice:   product.price,
      discounts:     [],
      resellPrice,
      category,
      referralFeeRate: referralFee != null ? referralFee / resellPrice : undefined,
      fbaFee,
    });

    if (!profitResult.qualifies) {
      return { outcome: 'not_profitable', roi: profitResult.roi, profit: profitResult.profit };
    }

    // ── 7. Validation ─────────────────────────────────────────────────────────
    const validationResult = validateProduct({
      source: {
        title: product.title,
        upc:   product.upc,
        ean:   product.ean,
        brand: product.brand,
        model: product.model,
      },
      amazon: {
        title: amazonTitle,
        upc:   product.upc,
        ean:   product.ean,
        brand: amazonBrand,
        model: product.model,
      },
      sourcePrice:     product.price,
      amazonPrice:     buyBoxPrice ?? resellPrice,
      sourceInStock:   product.inStock,
      sourceUrl:       product.url,
      matchConfidence,
    });

    if (!validationResult.passed) {
      return { outcome: 'validation_failed', reasons: validationResult.reasons };
    }

    // ── 8. Lead score ─────────────────────────────────────────────────────────
    const score = calculateScore({
      roi:            profitResult.roi,
      demandLevel:    demandResult.level,
      matchConfidence,
      gatingRisk:     gatingResult.risk,
      priceStability,
    });

    // ── 9. Persist Product + Lead ─────────────────────────────────────────────
    const bsrPercentage = bsr != null ? bsrToPercentile(bsr, category) : undefined;
    const ipRiskScore   = gatingResult.risk;

    const productData = {
      orgId,
      asin,
      upc:              product.upc,
      ean:              product.ean,
      model:            product.model,
      brand:            product.brand ?? amazonBrand,
      title:            product.title,
      category,
      imageUrl,

      sourceUrl:        product.url,
      sourceRetailer:   product.retailer,
      sourcePrice:      product.price,

      amazonUrl,
      buyBoxPrice,
      lowestFbaPrice,
      estimatedResellPrice: resellPrice,

      finalCost:        profitResult.finalCost,
      totalLandedCost:  profitResult.totalLandedCost,
      amazonFees:       profitResult.amazonFees,
      referralFee:      profitResult.referralFee,
      fbaFee:           profitResult.fbaFee,
      storageFee:       profitResult.storageFee,
      prepFee:          profitResult.prepFee,
      taxAmount:        profitResult.taxAmount,

      price:            resellPrice,
      fees:             profitResult.amazonFees,
      profit:           profitResult.profit,
      roi:              profitResult.roi,
      margin:           profitResult.margin,

      bsr,
      bsrPercentage,
      fbaSellers,
      totalSellers,
      amazonIsSeller,
      amazonOwnsBuyBox: amazonIsSeller,
      buyBoxOwner:      amazonIsSeller ? 'Amazon' : 'Third-party',

      matchMethod,
      matchConfidence,
      identityScore:    validationResult.identityScore,
      urlScore:         validationResult.urlScore,
      priceScore:       validationResult.priceScore,
      inventoryScore:   validationResult.inventoryScore,
      validationPassed: validationResult.passed,

      autoUngated:      gatingResult.autoUngated,
      ipRiskScore,
      gatingRisk:       gatingResult.risk,
      hasHazmat:        gatingResult.hasHazmat,
      isBrandRestricted: gatingResult.isBrandRestricted,
      isCategoryGated:  gatingResult.isCategoryGated,

      demandLevel:      demandResult.level,
      priceStability:   priceStability,
      keepaLink,
      score,
    };

    // Upsert product keyed on the composite unique [orgId, asin]
    const savedProduct = await prisma.product.upsert({
      where:  { orgId_asin: { orgId, asin } },
      create: productData,
      update: productData,
    });

    // Upsert lead
    const existingLead = await prisma.lead.findFirst({
      where: { orgId, productId: savedProduct.id, status: { notIn: ['REJECTED', 'EXPIRED'] } },
    });

    if (existingLead) {
      await prisma.lead.update({
        where: { id: existingLead.id },
        data:  { score },
      });
      return { outcome: 'lead_updated', leadId: existingLead.id, score };
    }

    const lead = await prisma.lead.create({
      data: { orgId, productId: savedProduct.id, score, status: 'NEW' },
    });

    return { outcome: 'lead_created', leadId: lead.id, score };

  } catch (err) {
    console.error('[pipeline] error:', err);
    return { outcome: 'error', message: String(err) };
  }
}

// ─── ASIN matching with priority fallback ────────────────────────────────────

async function findMatch(product: RetailerProduct, orgId: string): Promise<AmazonMatch | null> {
  // Priority 1: UPC (most reliable)
  if (product.upc) {
    const m = await searchCatalogByUpc(orgId, product.upc).catch(() => null);
    if (m) return m;
  }

  // Priority 2: EAN
  if (product.ean) {
    const m = await searchCatalogByEan(orgId, product.ean).catch(() => null);
    if (m) return m;
  }

  // Priority 3: Brand + Model keyword search
  if (product.brand && product.model) {
    const m = await searchCatalogByKeywords(orgId, `${product.brand} ${product.model}`).catch(() => null);
    if (m) return { ...m, matchMethod: 'BRAND_MODEL', matchConfidence: 85 };
  }

  // Priority 4: Title search (lowest confidence)
  const m = await searchCatalogByKeywords(orgId, product.title).catch(() => null);
  return m;
}
