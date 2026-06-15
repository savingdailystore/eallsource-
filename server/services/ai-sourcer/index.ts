import { randomUUID } from 'crypto';
import { searchWalmart } from './walmart';
import { analyzeOpportunity } from './analyzer';
import { assessIpRisk } from '@server/services/ip-risk/engine';
import { getKeepaProduct } from '@server/services/amazon/keepa';
import { calculateRoi } from '@server/services/roi/calculator';
import type { SourceOpportunity, AmazonSnapshot, ProfitBreakdown, RetailerHit } from './types';

export interface SourceRequest {
  query: string;
  retailers?: ('walmart' | 'target')[];
  minRoi?: number;
  maxFbaSellers?: number;
  limit?: number;
}

export async function runAISourcing(req: SourceRequest): Promise<SourceOpportunity[]> {
  const { query, retailers = ['walmart'], minRoi = 25, maxFbaSellers = 15, limit = 10 } = req;

  // 1. Fetch retailer hits
  const hitArrays = await Promise.allSettled(
    retailers.map(async (r) => {
      if (r === 'walmart') return searchWalmart(query, limit * 2);
      return [];
    }),
  );

  const hits: RetailerHit[] = hitArrays.flatMap((r) =>
    r.status === 'fulfilled' ? r.value : [],
  );

  if (!hits.length) return [];

  // 2. Enrich each hit with Amazon data + analysis (parallel, capped at 8)
  const workList = hits.slice(0, 8);

  const results = await Promise.allSettled(
    workList.map((hit) => enrichAndAnalyze(hit, minRoi, maxFbaSellers)),
  );

  const opportunities: SourceOpportunity[] = results
    .flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
    .filter((o) => o.aiDecision.recommendation !== 'SKIP' || o.profit.roi >= minRoi)
    .sort((a, b) => b.aiDecision.score - a.aiDecision.score)
    .slice(0, limit);

  return opportunities;
}

async function enrichAndAnalyze(
  hit: RetailerHit,
  minRoi: number,
  maxFbaSellers: number,
): Promise<SourceOpportunity | null> {
  const ipResult = assessIpRisk(hit.name, hit.brand);

  // Fetch Amazon data (uses Keepa if key present, simulates otherwise)
  const asin = hit.asin ?? deriveAsin(hit);
  let amazon: AmazonSnapshot | null = null;

  if (asin) {
    const keepa = await getKeepaProduct(asin);
    if (keepa) {
      amazon = {
        asin,
        buyBoxPrice: keepa.buyBoxPrice ?? hit.sourcePrice * 1.8,
        bsr: keepa.bsr ?? 50000,
        bsrCategory: hit.category,
        fbaSellers: keepa.fbaSellers ?? 8,
        totalSellers: keepa.totalSellers ?? 12,
        amazonOwnsBuyBox: keepa.amazonOwnsBuyBox ?? false,
      };
    }
  }

  // If no Amazon data at all, estimate from source price
  if (!amazon) {
    amazon = estimateAmazonData(hit);
  }

  // ROI calculation
  const resellPrice = amazon.buyBoxPrice;
  const roi = calculateRoi({
    sourcePrice: hit.sourcePrice,
    discounts: [],
    resellPrice,
    category: hit.category,
  });

  const profit: ProfitBreakdown = {
    sourcePrice: hit.sourcePrice,
    finalCost: roi.finalCost,
    cashbackAmount: roi.totalDiscounts,
    resellPrice,
    amazonFees: roi.amazonFees,
    prepFee: roi.prepFee,
    taxAmount: roi.taxAmount,
    netProfit: roi.netProfit,
    roi: roi.roi,
  };

  // Filter early if clearly not viable
  if (roi.roi < minRoi - 10 && ipResult.score === 'HIGH') return null;
  if (amazon.fbaSellers > maxFbaSellers + 5) return null;

  // AI analysis
  const aiDecision = await analyzeOpportunity(
    { ...hit, asin: asin ?? undefined },
    amazon,
    profit,
    ipResult.score,
  );

  return {
    id: randomUUID(),
    retailerHit: { ...hit, asin: asin ?? undefined },
    amazon,
    profit,
    ipRisk: ipResult.score,
    aiDecision,
    scannedAt: new Date().toISOString(),
  };
}

/** Derive ASIN from hit or simulate a plausible one */
function deriveAsin(hit: RetailerHit): string | null {
  // In production this would do a UPC→ASIN lookup via Keepa or PAAPI
  return hit.asin ?? null;
}

function estimateAmazonData(hit: RetailerHit): AmazonSnapshot {
  const seed = hit.name.charCodeAt(0) + hit.name.charCodeAt(hit.name.length - 1);
  return {
    asin: hit.asin ?? 'UNKNOWN',
    buyBoxPrice: hit.sourcePrice * (1.7 + (seed % 10) / 10),
    bsr: 5000 + (seed % 90000),
    bsrCategory: hit.category,
    fbaSellers: 4 + (seed % 10),
    totalSellers: 8 + (seed % 18),
    amazonOwnsBuyBox: seed % 5 === 0,
  };
}

export type { SourceOpportunity };
