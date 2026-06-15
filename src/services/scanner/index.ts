import { prisma } from '@/lib/prisma';
import { calculateRoi } from '@/services/roi/calculator';
import { assessIpRisk } from '@/services/ip-risk/engine';
import { getAllDiscounts } from '@/services/cashback';
import { getKeepaProduct, getKeepaLink } from '@/services/amazon/keepa';
import { buildAmazonUrl } from '@/lib/utils';
import { isCategoryAutoUngated } from '@/services/amazon/sp-api';
import type { Product } from '@/types';

// BSR thresholds per category (top 3%)
const CATEGORY_BSR_LIMITS: Record<string, number> = {
  'Toys & Games': 50000,
  'Electronics': 100000,
  'Sports & Outdoors': 75000,
  'Home & Kitchen': 150000,
  'Health & Beauty': 80000,
  'Clothing': 200000,
  'Books': 500000,
  'Video Games': 30000,
  'default': 100000,
};

export function getBsrLimit(category: string): number {
  return CATEGORY_BSR_LIMITS[category] ?? CATEGORY_BSR_LIMITS['default'];
}

export function bsrPercentage(bsr: number, category: string): number {
  // Approximate total products per category
  const categoryTotals: Record<string, number> = {
    'Toys & Games': 1_700_000,
    'Electronics': 3_300_000,
    'Sports & Outdoors': 2_500_000,
    'Home & Kitchen': 5_000_000,
    'Health & Beauty': 2_700_000,
    'Clothing': 6_700_000,
    'Books': 16_000_000,
    'Video Games': 1_000_000,
    'default': 3_000_000,
  };

  const total = categoryTotals[category] ?? categoryTotals['default'];
  return Math.round((bsr / total) * 100 * 10) / 10;
}

export interface RawProduct {
  asin: string;
  upc?: string;
  name: string;
  brand?: string;
  category: string;
  imageUrl?: string;
  sourceUrl: string;
  sourceRetailer: string;
  sourcePrice: number;
  weight?: number; // lbs
}

export interface QualificationResult {
  qualifies: boolean;
  reasons: string[];
  product?: Omit<Product, 'id' | 'dateAdded' | 'status' | 'weeklyBatchId'>;
}

export async function qualifyProduct(raw: RawProduct): Promise<QualificationResult> {
  const reasons: string[] = [];

  // 1. IP risk check
  const ipRisk = assessIpRisk(raw.name, raw.brand);
  if (ipRisk.score !== 'LOW') {
    return { qualifies: false, reasons: [`IP Risk: ${ipRisk.score} - ${ipRisk.reasons.join(', ')}`] };
  }

  // 2. Auto-ungated check
  if (!isCategoryAutoUngated(raw.category)) {
    return { qualifies: false, reasons: [`Category not auto-ungated: ${raw.category}`] };
  }

  // 3. Fetch Keepa/Amazon data
  const keepaData = await getKeepaProduct(raw.asin);
  if (!keepaData) {
    return { qualifies: false, reasons: ['Could not fetch Amazon data'] };
  }

  // 4. BSR check (top 3%)
  const bsr = keepaData.bsr ?? 9999999;
  const bsrLimit = getBsrLimit(raw.category);
  if (bsr > bsrLimit) {
    return { qualifies: false, reasons: [`BSR ${bsr} exceeds limit ${bsrLimit} for ${raw.category}`] };
  }

  // 5. Competition check
  const fbaSellers = keepaData.fbaSellers ?? 0;
  const totalSellers = keepaData.totalSellers ?? 0;
  if (fbaSellers > 15) {
    return { qualifies: false, reasons: [`Too many FBA sellers: ${fbaSellers}`] };
  }
  if (totalSellers > 30) {
    return { qualifies: false, reasons: [`Too many total sellers: ${totalSellers}`] };
  }

  // 6. Get discounts
  const discounts = await getAllDiscounts(raw.sourceRetailer, raw.sourceUrl, raw.sourcePrice);
  const resellPrice = keepaData.lowestFbaPrice ?? keepaData.buyBoxPrice ?? raw.sourcePrice * 2;

  // 7. ROI calculation
  const roiResult = calculateRoi({
    sourcePrice: raw.sourcePrice,
    discounts,
    resellPrice,
    category: raw.category,
  });

  if (!roiResult.qualifies) {
    return { qualifies: false, reasons: [`ROI too low: ${roiResult.roi.toFixed(1)}%`] };
  }

  // 8. All checks passed
  const bsrPct = bsrPercentage(bsr, raw.category);

  const product: Omit<Product, 'id' | 'dateAdded' | 'status' | 'weeklyBatchId'> = {
    asin: raw.asin,
    upc: raw.upc,
    name: raw.name,
    category: raw.category,
    imageUrl: raw.imageUrl,
    sourceUrl: raw.sourceUrl,
    sourceRetailer: raw.sourceRetailer,
    sourcePrice: raw.sourcePrice,
    availableDiscounts: discounts,
    discountSources: [...new Set(discounts.map((d) => d.source))],
    finalCost: roiResult.finalCost,
    amazonUrl: buildAmazonUrl(raw.asin),
    buyBoxPrice: keepaData.buyBoxPrice,
    lowestListedPrice: keepaData.lowestFbaPrice,
    estimatedResellPrice: resellPrice,
    amazonFees: roiResult.amazonFees,
    prepFee: roiResult.prepFee,
    taxAmount: roiResult.taxAmount,
    netProfit: roiResult.netProfit,
    roi: roiResult.roi,
    bsr,
    bsrPercentage: bsrPct,
    fbaSellers,
    totalSellers,
    autoUngated: true,
    buyBoxOwner: keepaData.amazonOwnsBuyBox ? 'AMAZON' : 'FBA_SELLER',
    amazonIsSeller: keepaData.amazonIsSeller ?? false,
    amazonOwnsBuyBox: keepaData.amazonOwnsBuyBox ?? false,
    ipRiskScore: 'LOW',
    ipRiskReasons: [],
    keepaLink: getKeepaLink(raw.asin),
    hasBrandGating: false,
    hasCounterfeitRisk: false,
    isHazmat: false,
    isRestrictedCategory: false,
  };

  return { qualifies: true, reasons: [], product };
}

export async function saveQualifiedProduct(
  product: Omit<Product, 'id' | 'dateAdded' | 'status' | 'weeklyBatchId'>,
  batchId?: string,
) {
  return prisma.product.upsert({
    where: { asin: product.asin },
    update: {
      ...product,
      availableDiscounts: product.availableDiscounts as object[],
      weeklyBatchId: batchId,
    },
    create: {
      ...product,
      availableDiscounts: product.availableDiscounts as object[],
      weeklyBatchId: batchId,
      status: 'ACTIVE',
    },
  });
}
