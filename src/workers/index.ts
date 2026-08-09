import { Worker, Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { calculateProfitability } from '@/engines/profitability';
import { assessGating } from '@/engines/gating';
import { assessDemand } from '@/engines/demand';
import { calculateScore } from '@/engines/scoring';
import { validateProduct } from '@/engines/validation';
import { calculateReprice } from '@/engines/repricing';
import { getFeeEstimate } from '@/lib/amazon';
import { processRetailerProduct } from '@/services/pipeline';
import type { RetailerProduct } from '@/types';

function makeWorker(queueName: string, redisUrl: string, handler: (job: Job) => Promise<unknown>) {
  return new Worker(queueName, handler, { connection: { url: redisUrl } });
}

export function startWorkers(redisUrl: string) {
  // ─── Retailer scrape worker ────────────────────────────────────────────────
  makeWorker('scrape_retailer', redisUrl, async (job) => {
    const { retailer, orgId, scanJobId, query } = job.data as { retailer: string; orgId: string; scanJobId: string; query: string };

    await prisma.scanJob.update({ where: { id: scanJobId }, data: { status: 'RUNNING' } });

    const { getRetailer } = await import('@/retailers/index');
    const plugin = getRetailer(retailer);
    if (!plugin) throw new Error(`Unknown retailer: ${retailer}`);

    const products = await plugin.search(query);

    // Run each product through the full pipeline
    const results = { created: 0, updated: 0, skipped: 0, errors: 0 };
    for (const product of products as RetailerProduct[]) {
      const outcome = await processRetailerProduct(product, orgId);
      if (outcome.outcome === 'lead_created') results.created++;
      else if (outcome.outcome === 'lead_updated') results.updated++;
      else if (outcome.outcome === 'error') results.errors++;
      else results.skipped++;
    }

    await prisma.scanJob.update({
      where: { id: scanJobId },
      data: { status: 'COMPLETED', result: results as object, completedAt: new Date() },
    });

    return results;
  });

  // ─── Validation worker ───────────────────────────────────────────────────
  makeWorker('validate_product', redisUrl, async (job) => {
    const { productId } = job.data as { productId: string };
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

    const result = validateProduct({
      source: {
        title: product.title,
        upc: product.upc ?? undefined,
        ean: product.ean ?? undefined,
        brand: product.brand ?? undefined,
        model: product.model ?? undefined,
      },
      amazon: {
        title: product.title,
        upc: product.upc ?? undefined,
        ean: product.ean ?? undefined,
        brand: product.brand ?? undefined,
        model: product.model ?? undefined,
      },
      sourcePrice: product.sourcePrice ?? 0,
      amazonPrice: product.buyBoxPrice ?? 0,
      sourceInStock: true,
      sourceUrl: product.sourceUrl ?? '',
      matchConfidence: product.matchConfidence ?? 0,
      matchMethod: product.matchMethod ?? undefined,
    });

    await prisma.product.update({
      where: { id: productId },
      data: {
        identityScore: result.identityScore,
        urlScore: result.urlScore,
        priceScore: result.priceScore,
        inventoryScore: result.inventoryScore,
        validationPassed: result.passed,
      },
    });

    return result;
  });

  // ─── ROI calculation worker ────────────────────────────────────────────────
  makeWorker('calculate_roi', redisUrl, async (job) => {
    const { productId } = job.data as { productId: string };
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

    let resolvedTaxRate = 0.0875;
    if (product.sourceTaxRate != null) {
      resolvedTaxRate = Number(product.sourceTaxRate);
    } else {
      const workerOrg = await prisma.organization.findUnique({ where: { id: product.orgId }, select: { defaultSourceTaxRate: true } });
      if (workerOrg?.defaultSourceTaxRate != null) resolvedTaxRate = Number(workerOrg.defaultSourceTaxRate);
    }

    // Try to refresh fees from SP-API using the product's current resell/buy-box price.
    // On success: use fresh fees in profitability calculation and write all fee metadata.
    // On failure: fall back to stored fees; preserve existing confirmed SP_API metadata.
    const workerResellPrice = product.estimatedResellPrice ?? product.buyBoxPrice ?? 0;
    let workerReferralFee: number | undefined = product.referralFee ?? undefined;
    let workerFbaFee: number | undefined = product.fbaFee ?? undefined;
    const feeEstimatedAt = new Date();
    let freshFeeConfirmed = false;

    if (product.asin && workerResellPrice > 0) {
      const freshFees = await getFeeEstimate(product.orgId, product.asin, workerResellPrice).catch(() => null);
      if (freshFees) {
        workerReferralFee  = freshFees.referralFee;
        workerFbaFee       = freshFees.fbaFee;
        freshFeeConfirmed  = true;
      }
    }

    const profitResult = calculateProfitability({
      sourcePrice:    product.sourcePrice ?? 0,
      taxRate:        resolvedTaxRate,
      sourceShipping: product.sourceShipping ?? undefined,
      discounts:      [],
      resellPrice:    workerResellPrice,
      category:       product.category ?? 'Other',
      prepFee:        product.prepFee ?? undefined,
      fbaFee:         workerFbaFee,
      storageFee:     product.storageFee ?? undefined,
      referralFeeRate: freshFeeConfirmed && workerResellPrice > 0 && workerReferralFee != null
        ? workerReferralFee / workerResellPrice
        : undefined,
    });

    const gatingResult = assessGating({
      title: product.title,
      brand: product.brand ?? undefined,
      category: product.category ?? undefined,
      hasHazmat: product.hasHazmat,
    });

    const demandResult = assessDemand({
      bsr: product.bsr ?? undefined,
      category: product.category ?? 'Other',
      fbaSellers: product.fbaSellers ?? 0,
      totalSellers: product.totalSellers ?? 0,
    });

    const score = calculateScore({
      roi: profitResult.roi,
      demandLevel: demandResult.level,
      matchConfidence: product.matchConfidence ?? 0,
      gatingRisk: gatingResult.risk,
      priceStability: (product.priceStability as 'STABLE' | 'VOLATILE' | 'UNKNOWN') ?? 'UNKNOWN',
    });

    // Fee metadata update strategy:
    // - SP-API succeeded: overwrite all fee fields and mark SP_API.
    // - SP-API failed and existing confirmed SP_API data exists: preserve it (don't downgrade).
    // - SP-API failed and no prior confirmed data: mark STATIC.
    const hasExistingConfirmedSpApi =
      product.feeEstimateConfirmed === true && product.feeEstimateSource === 'SP_API';

    const feeMetaUpdate = freshFeeConfirmed
      ? {
          referralFee:          workerReferralFee,
          fbaFee:               workerFbaFee,
          amazonFees:           profitResult.amazonFees,
          feeEstimateConfirmed: true,
          feeEstimateSource:    'SP_API',
          feeEstimatedAt,
          feeEstimatePrice:     workerResellPrice,
          priceCheckedAt:       feeEstimatedAt,
        }
      : {
          referralFee:          profitResult.referralFee,
          fbaFee:               profitResult.fbaFee,
          amazonFees:           profitResult.amazonFees,
          feeEstimateConfirmed: hasExistingConfirmedSpApi,
          ...(!hasExistingConfirmedSpApi ? {
            feeEstimateSource: 'STATIC',
            feeEstimatedAt,
            feeEstimatePrice:  workerResellPrice,
          } : {}),
        };

    await prisma.product.update({
      where: { id: productId },
      data: {
        profit:          profitResult.profit,
        roi:             profitResult.roi,
        margin:          profitResult.margin,
        finalCost:       profitResult.finalCost,
        totalLandedCost: profitResult.totalLandedCost,
        storageFee:      profitResult.storageFee,
        prepFee:         profitResult.prepFee,
        taxAmount:       profitResult.taxAmount,
        sourceTaxRate:   resolvedTaxRate,
        score,
        demandLevel:       demandResult.level,
        gatingRisk:        gatingResult.risk,
        autoUngated:       gatingResult.autoUngated,
        hasHazmat:         gatingResult.hasHazmat,
        isBrandRestricted: gatingResult.isBrandRestricted,
        isCategoryGated:   gatingResult.isCategoryGated,
        ...feeMetaUpdate,
      },
    });

    return { score, roi: profitResult.roi, profit: profitResult.profit };
  });

  // ─── Reprice worker ────────────────────────────────────────────────────────
  makeWorker('reprice_listing', redisUrl, async (job) => {
    const { ruleId } = job.data as { ruleId: string };
    const rule = await prisma.repricingRule.findUniqueOrThrow({ where: { id: ruleId } });

    const product = await prisma.product.findFirst({
      where: { orgId: rule.orgId, asin: rule.asin },
    });
    if (!product) throw new Error('Product not found for repricing rule');

    const result = calculateReprice({
      asin: rule.asin,
      costBasis: product.totalLandedCost ?? product.sourcePrice ?? 0,
      currentPrice: rule.lastRecommendedPrice ?? product.estimatedResellPrice ?? 0,
      buyBoxPrice: product.buyBoxPrice ?? 0,
      fbaSellers: product.fbaSellers ?? 0,
      minRoi: rule.minRoi,
      minProfit: rule.minProfit,
      strategy: rule.strategy as 'COMPETITIVE' | 'FLOOR' | 'CEILING',
    });

    await prisma.$transaction([
      prisma.repricingRule.update({
        where: { id: ruleId },
        data: {
          lastRecommendedPrice: result.recommendedPrice,
          lastDirection: result.direction,
          lastRepricedAt: new Date(),
        },
      }),
      prisma.repricingHistory.create({
        data: {
          ruleId,
          buyBoxPrice: product.buyBoxPrice,
          recommendedPrice: result.recommendedPrice,
          direction: result.direction,
          riskScore: result.riskScore,
        },
      }),
    ]);

    return result;
  });

  console.log('Workers started on 4 queues');
}
