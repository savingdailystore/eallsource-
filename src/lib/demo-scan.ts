import { prisma } from './prisma';

// Synchronous "demo" scan — generates realistic qualified products without
// Apify/Redis/worker, so the Scanner feature can be tested end-to-end.

interface DemoItem {
  asin: string; upc: string; title: string; brand: string; category: string;
  sourcePrice: number; finalCost: number; resell: number; amazonFees: number;
  prepFee: number; taxAmount: number; profit: number; roi: number; bsr: number;
  bsrPct: number; score: number;
  discounts: { source: string; type: string; amount: number; percentage?: number; code?: string }[];
}

const CATALOG: DemoItem[] = [
  { asin: 'B07NF76M5L', upc: '086279117809', title: 'Cuisinart DCC-3200P1 Perfectemp Coffee Maker, 14 Cup', brand: 'Cuisinart', category: 'Home & Kitchen', sourcePrice: 39.99, finalCost: 32.99, resell: 79.99, amazonFees: 16.0, prepFee: 2.0, taxAmount: 2.8, profit: 26.2, roi: 79.4, bsr: 5678, bsrPct: 0.11, score: 88, discounts: [{ source: 'Rakuten', type: 'cashback', amount: 2.0, percentage: 5 }, { source: 'CardBear', type: 'rewards', amount: 5.0 }] },
  { asin: 'B09B4MLLZ3', upc: '069055855664', title: 'Oral-B Pro 1000 Rechargeable Electric Toothbrush', brand: 'Oral-B', category: 'Health & Beauty', sourcePrice: 29.99, finalCost: 25.49, resell: 52.99, amazonFees: 7.95, prepFee: 1.5, taxAmount: 2.1, profit: 15.95, roi: 62.6, bsr: 1234, bsrPct: 0.05, score: 82, discounts: [{ source: 'Rakuten', type: 'cashback', amount: 3.0, percentage: 10 }] },
  { asin: 'B08BHXG144', upc: '885911750738', title: 'BLACK+DECKER Dustbuster AdvancedClean Cordless Hand Vacuum', brand: 'BLACK+DECKER', category: 'Home & Kitchen', sourcePrice: 29.99, finalCost: 27.39, resell: 62.99, amazonFees: 13.75, prepFee: 2.5, taxAmount: 2.1, profit: 17.25, roi: 63.0, bsr: 7891, bsrPct: 0.16, score: 76, discounts: [{ source: 'RetailMeNot', type: 'coupon', amount: 2.0, code: 'SAVE2' }] },
  { asin: 'B0936FQ8Y3', upc: '053891103893', title: 'COSORI Air Fryer 5 QT, 9-in-1 Compact', brand: 'COSORI', category: 'Home & Kitchen', sourcePrice: 49.99, finalCost: 44.99, resell: 89.99, amazonFees: 18.5, prepFee: 2.5, taxAmount: 3.1, profit: 20.9, roi: 46.5, bsr: 920, bsrPct: 0.03, score: 84, discounts: [{ source: 'Rakuten', type: 'cashback', amount: 5.0, percentage: 10 }] },
  { asin: 'B0863TXGM3', upc: '840006640592', title: 'JBL Clip 4 Portable Bluetooth Speaker, Waterproof', brand: 'JBL', category: 'Electronics', sourcePrice: 39.99, finalCost: 35.99, resell: 69.95, amazonFees: 12.0, prepFee: 1.5, taxAmount: 2.4, profit: 18.06, roi: 50.2, bsr: 2310, bsrPct: 0.07, score: 79, discounts: [{ source: 'BeFrugal', type: 'cashback', amount: 4.0, percentage: 10 }] },
  { asin: 'B07H9DVL76', upc: '191908231167', title: 'Gaiam Essentials Thick Yoga Mat with Carrier Strap', brand: 'Gaiam', category: 'Sports & Outdoors', sourcePrice: 19.99, finalCost: 17.49, resell: 39.99, amazonFees: 9.0, prepFee: 1.5, taxAmount: 1.4, profit: 10.6, roi: 60.6, bsr: 3450, bsrPct: 0.09, score: 73, discounts: [{ source: 'Capital One Shopping', type: 'cashback', amount: 2.5, percentage: 12 }] },
  { asin: 'B086JQGB1K', upc: '673419340533', title: 'LEGO Classic Medium Creative Brick Box 10696', brand: 'LEGO', category: 'Toys & Games', sourcePrice: 27.99, finalCost: 24.99, resell: 49.99, amazonFees: 10.5, prepFee: 1.5, taxAmount: 1.8, profit: 11.2, roi: 44.8, bsr: 640, bsrPct: 0.02, score: 81, discounts: [{ source: 'Rakuten', type: 'cashback', amount: 3.0, percentage: 8 }] },
];

const RETAILER_DOMAIN: Record<string, string> = {
  'Walmart':    'walmart.com',
  'Target':     'target.com',
  'Home Depot': 'homedepot.com',
};

function sourceUrl(retailer: string, asin: string): string {
  const domain = RETAILER_DOMAIN[retailer] ?? 'example.com';
  return `https://www.${domain}/ip/${asin.toLowerCase()}`;
}

export async function runDemoScan(orgId: string, retailer: string, query?: string): Promise<number> {
  const q = (query ?? '').trim().toLowerCase();

  // Match the query against the catalog; if nothing matches, return a sample set.
  let items = q
    ? CATALOG.filter((c) => c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || c.brand.toLowerCase().includes(q))
    : CATALOG;
  if (items.length === 0) items = CATALOG.slice(0, 4);

  let count = 0;

  for (const item of items) {
    const data = {
      orgId,
      asin:             item.asin,
      upc:              item.upc,
      title:            item.title,
      brand:            item.brand,
      category:         item.category,
      sourceUrl:        sourceUrl(retailer, item.asin),
      sourceRetailer:   retailer,
      sourcePrice:      item.sourcePrice,
      availableDiscounts: item.discounts,
      discountSources:  item.discounts.map((d) => d.source),
      finalCost:        item.finalCost,
      totalLandedCost:  item.finalCost,
      amazonUrl:        `https://www.amazon.com/dp/${item.asin}`,
      buyBoxPrice:      Math.round(item.resell * 1.08 * 100) / 100,
      lowestFbaPrice:   item.resell,
      estimatedResellPrice: item.resell,
      price:            item.resell,
      amazonFees:       item.amazonFees,
      prepFee:          item.prepFee,
      taxAmount:        item.taxAmount,
      fees:             Math.round((item.amazonFees + item.prepFee + item.taxAmount) * 100) / 100,
      profit:           item.profit,
      roi:              item.roi,
      bsr:              item.bsr,
      bsrPercentage:    item.bsrPct,
      fbaSellers:       Math.floor(Math.random() * 8) + 2,
      autoUngated:      true,
      buyBoxOwner:      'FBA_SELLER',
      amazonOwnsBuyBox: false,
      ipRiskScore:      'LOW',
      gatingRisk:       'LOW' as const,
      demandLevel:      (item.bsr < 3000 ? 'HIGH' : 'MEDIUM') as 'HIGH' | 'MEDIUM',
      matchMethod:      'UPC',
      matchConfidence:  99,
      identityScore:    100,
      urlScore:         98,
      priceScore:       99,
      inventoryScore:   99,
      validationPassed: true,
      keepaLink:        `https://keepa.com/#!product/1-${item.asin}`,
      score:            item.score,
    };

    const product = await prisma.product.upsert({
      where:  { orgId_asin: { orgId, asin: item.asin } },
      create: data,
      update: data,
    });

    const existingLead = await prisma.lead.findFirst({ where: { orgId, productId: product.id } });
    if (!existingLead) {
      await prisma.lead.create({ data: { orgId, productId: product.id, score: item.score, status: 'NEW' } });
    }
    count++;
  }

  return count;
}
