/**
 * Enrichment pipeline — Phase 1
 *
 * Takes a scraped Amazon product, finds it at a source retailer,
 * calculates profit, and creates a Lead if criteria are met.
 */

import { prisma } from '@lib/prisma';
import { calculateRoi } from '@server/services/roi/calculator';
import { assessIpRisk } from '@server/services/ip-risk/engine';
import { scoreLead } from '@server/scoring/engine';
import { searchWalmart } from '@server/services/ai-sourcer/walmart';
import { buildAmazonUrl } from '@lib/utils';

const MIN_ROI = 25;
const MIN_PROFIT = 3;

export interface EnrichmentResult {
  leadId: string | null;
  skipped: boolean;
  skipReason?: string;
}

export async function enrichProduct(
  rawId: string,
  scrapeJobId?: string,
): Promise<EnrichmentResult> {
  const raw = await prisma.productRaw.findUnique({ where: { id: rawId } });
  if (!raw) return { leadId: null, skipped: true, skipReason: 'Raw product not found' };
  if (!raw.price) return { leadId: null, skipped: true, skipReason: 'No Amazon price' };

  const amazonPrice = raw.price;
  const category = raw.category ?? 'Home & Kitchen';

  // 1. IP risk check
  const ipRisk = assessIpRisk(raw.title);
  if (ipRisk.score === 'HIGH') {
    return { leadId: null, skipped: true, skipReason: `High IP risk: ${ipRisk.reasons[0]}` };
  }

  // 2. Find source price at Walmart (uses real API when WALMART_API_KEY set, demo otherwise)
  const walmartHits = await searchWalmart(raw.title, 3);
  if (!walmartHits.length) {
    return { leadId: null, skipped: true, skipReason: 'No Walmart match found' };
  }

  // Take the cheapest Walmart hit that's plausibly the same product
  const source = walmartHits[0];
  const sourcePrice = source.sourcePrice;

  // 3. ROI calculation (source = buy price, amazon = sell price)
  const roi = calculateRoi({
    sourcePrice,
    discounts: [],
    resellPrice: amazonPrice,
    category,
  });

  if (roi.roi < MIN_ROI) {
    return { leadId: null, skipped: true, skipReason: `ROI too low: ${roi.roi.toFixed(1)}%` };
  }
  if (roi.netProfit < MIN_PROFIT) {
    return { leadId: null, skipped: true, skipReason: `Profit too low: $${roi.netProfit.toFixed(2)}` };
  }

  // 4. Score
  const { score, breakdown } = scoreLead({
    roi: roi.roi,
    netProfit: roi.netProfit,
    bsr: raw.bsr ?? undefined,
    fbaSellers: 6,           // TODO: enrich from Keepa in Phase 2
    amazonOwnsBB: false,
    ipRisk: ipRisk.score,
    reviewCount: raw.reviewCount ?? undefined,
    rating: raw.rating ?? undefined,
  });

  // 5. Upsert Lead
  const lead = await prisma.lead.upsert({
    where: { id: `${raw.asin}_lead` },   // use fake stable ID so re-enrichment updates
    update: {
      title: raw.title,
      category,
      imageUrl: raw.imageUrl ?? undefined,
      sourcePrice,
      sourceUrl: source.sourceUrl,
      amazonPrice,
      amazonFees: roi.amazonFees,
      finalCost: roi.finalCost,
      netProfit: roi.netProfit,
      roi: roi.roi,
      bsr: raw.bsr ?? undefined,
      score,
      scoreBreakdown: breakdown,
      updatedAt: new Date(),
    },
    create: {
      id: `${raw.asin}_lead`,
      asin: raw.asin,
      title: raw.title,
      category,
      imageUrl: raw.imageUrl ?? undefined,
      sourceRetailer: 'Walmart',
      sourcePrice,
      sourceUrl: source.sourceUrl,
      amazonPrice,
      amazonFees: roi.amazonFees,
      amazonUrl: buildAmazonUrl(raw.asin),
      finalCost: roi.finalCost,
      netProfit: roi.netProfit,
      roi: roi.roi,
      bsr: raw.bsr ?? undefined,
      score,
      scoreBreakdown: breakdown,
      scrapeJobId: scrapeJobId ?? undefined,
    },
  });

  // 6. Record price history
  await prisma.priceHistory.createMany({
    data: [
      { asin: raw.asin, price: amazonPrice, source: 'amazon', leadId: lead.id },
      { asin: raw.asin, price: sourcePrice, source: 'walmart', leadId: lead.id },
    ],
    skipDuplicates: true,
  });

  return { leadId: lead.id, skipped: false };
}
