import { prisma } from '@lib/prisma';
import { calculateRoi } from '@server/services/roi/calculator';
import { assessIpRisk } from '@server/services/ip-risk/engine';
import { searchWalmart } from '@server/services/ai-sourcer/walmart';

const MIN_ROI    = 25;
const MIN_PROFIT = 3;

export interface EnrichmentResult {
  leadId: string | null;
  skipped: boolean;
  skipReason?: string;
}

export async function enrichProduct(
  rawId: string,
  _scrapeJobId?: string,
): Promise<EnrichmentResult> {
  const raw = await prisma.productRaw.findUnique({ where: { id: rawId } });
  if (!raw) return { leadId: null, skipped: true, skipReason: 'Raw product not found' };
  if (!raw.price) return { leadId: null, skipped: true, skipReason: 'No Amazon price' };
  if (!raw.title) return { leadId: null, skipped: true, skipReason: 'No title' };

  const amazonPrice = raw.price;

  // 1. IP risk check
  const ipRisk = assessIpRisk(raw.title);
  if (ipRisk.score === 'HIGH') {
    return { leadId: null, skipped: true, skipReason: `High IP risk: ${ipRisk.reasons[0]}` };
  }

  // 2. Find source price at Walmart
  const walmartHits = await searchWalmart(raw.title, 3);
  if (!walmartHits.length) {
    return { leadId: null, skipped: true, skipReason: 'No Walmart match found' };
  }

  const source       = walmartHits[0];
  const sourcePrice  = source.sourcePrice;

  // 3. ROI calculation
  const roi = calculateRoi({
    sourcePrice,
    discounts:   [],
    resellPrice: amazonPrice,
    category:    'Home & Kitchen',
  });

  if (roi.roi < MIN_ROI) {
    return { leadId: null, skipped: true, skipReason: `ROI too low: ${roi.roi.toFixed(1)}%` };
  }
  if (roi.netProfit < MIN_PROFIT) {
    return { leadId: null, skipped: true, skipReason: `Profit too low: $${roi.netProfit.toFixed(2)}` };
  }

  // 4. Simple score (full scoring happens in scoringWorker)
  const score = Math.min(100, Math.round(
    Math.min(60, roi.roi * 0.6) + Math.min(40, roi.netProfit * 0.8),
  ));

  // 5. Create or update Product
  const existing = await prisma.product.findFirst({ where: { asin: raw.asin } });
  const product = existing
    ? await prisma.product.update({
        where: { id: existing.id },
        data:  { title: raw.title, price: amazonPrice, fees: roi.amazonFees, profit: roi.netProfit, roi: roi.roi, score },
      })
    : await prisma.product.create({
        data: { asin: raw.asin, title: raw.title, price: amazonPrice, fees: roi.amazonFees, profit: roi.netProfit, roi: roi.roi, score },
      });

  // 6. Create or update Lead
  const existingLead = await prisma.lead.findFirst({ where: { productId: product.id } });
  const lead = existingLead
    ? await prisma.lead.update({ where: { id: existingLead.id }, data: { score } })
    : await prisma.lead.create({ data: { productId: product.id, score } });

  return { leadId: lead.id, skipped: false };
}
