import { prisma } from '@/lib/prisma';
import { qualifyProduct, saveQualifiedProduct } from './index';
import { getWeekNumber } from '@/lib/utils';
import type { RawProduct } from './index';

// Sample product catalog to source from (replace with real scraper per retailer)
const SAMPLE_PRODUCTS: RawProduct[] = [
  {
    asin: 'B08N5WRWNW',
    name: 'Echo Dot (4th Gen) Smart Speaker',
    category: 'Electronics',
    sourceUrl: 'https://www.target.com/p/echo-dot/-/A-12345',
    sourceRetailer: 'Target',
    sourcePrice: 29.99,
  },
  {
    asin: 'B07FZ8S74R',
    name: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker',
    category: 'Home & Kitchen',
    sourceUrl: 'https://www.walmart.com/ip/instant-pot/12345',
    sourceRetailer: 'Walmart',
    sourcePrice: 59.99,
  },
  {
    asin: 'B09G3HRMVB',
    name: 'Ninja AF101 Air Fryer 4 Quart',
    category: 'Home & Kitchen',
    sourceUrl: 'https://www.target.com/p/ninja-air-fryer/-/A-67890',
    sourceRetailer: 'Target',
    sourcePrice: 79.99,
  },
  {
    asin: 'B07PVCVBN7',
    name: 'JBL Clip 4 Portable Bluetooth Speaker',
    category: 'Electronics',
    sourceUrl: 'https://www.bestbuy.com/site/jbl-clip4/1234567.p',
    sourceRetailer: 'Best Buy',
    sourcePrice: 49.99,
  },
  {
    asin: 'B08J65DST5',
    name: 'Hydro Flask 32oz Wide Mouth Water Bottle',
    category: 'Sports & Outdoors',
    sourceUrl: 'https://www.target.com/p/hydro-flask/-/A-99001',
    sourceRetailer: 'Target',
    sourcePrice: 34.99,
  },
  {
    asin: 'B00A2KD8NY',
    name: 'Monopoly Classic Board Game',
    category: 'Toys & Games',
    sourceUrl: 'https://www.walmart.com/ip/monopoly/987654',
    sourceRetailer: 'Walmart',
    sourcePrice: 14.99,
  },
  {
    asin: 'B09JQMJHXY',
    name: 'Anker 65W USB-C GaN Charger',
    category: 'Electronics',
    sourceUrl: 'https://www.bestbuy.com/site/anker-charger/2234567.p',
    sourceRetailer: 'Best Buy',
    sourcePrice: 35.99,
  },
  {
    asin: 'B08BHXG144',
    name: 'Black+Decker Hand Vacuum Cordless',
    category: 'Home & Kitchen',
    sourceUrl: 'https://www.homedepot.com/p/black-decker-vac/303412345',
    sourceRetailer: 'Home Depot',
    sourcePrice: 39.99,
  },
  {
    asin: 'B07YGXF9CY',
    name: 'Clorox Disinfecting Wipes Variety Pack 5ct',
    category: 'Health & Beauty',
    sourceUrl: 'https://www.costco.com/clorox-wipes.product.100717514.html',
    sourceRetailer: 'Costco',
    sourcePrice: 24.99,
  },
  {
    asin: 'B09B4MLLZ3',
    name: 'Oral-B Pro 1000 Electric Toothbrush',
    category: 'Health & Beauty',
    sourceUrl: 'https://www.walmart.com/ip/oral-b/654321',
    sourceRetailer: 'Walmart',
    sourcePrice: 29.99,
  },
  {
    asin: 'B01MRX8LBM',
    name: 'Purina Pro Plan Dog Food 30lb Bag',
    category: 'Pet Supplies',
    sourceUrl: 'https://www.chewy.com/purina-pro-plan/dp/12312312',
    sourceRetailer: "Chewy",
    sourcePrice: 54.99,
  },
  {
    asin: 'B07HBQPZP9',
    name: 'Sharpie Permanent Markers 24-Pack',
    category: 'Office Products',
    sourceUrl: 'https://www.staples.com/sharpie-24pack/product_SS123',
    sourceRetailer: 'Staples',
    sourcePrice: 12.99,
  },
  {
    asin: 'B001TH7GUU',
    name: 'Stanley Classic Vacuum Insulated Wide Mouth Bottle',
    category: 'Sports & Outdoors',
    sourceUrl: 'https://www.target.com/p/stanley-bottle/-/A-77001',
    sourceRetailer: 'Target',
    sourcePrice: 27.99,
  },
  {
    asin: 'B07NF76M5L',
    name: 'Cuisinart 12-Cup Coffee Maker',
    category: 'Home & Kitchen',
    sourceUrl: 'https://www.kohls.com/product/cuisinart-coffee/12345.jsp',
    sourceRetailer: "Kohl's",
    sourcePrice: 49.99,
  },
  {
    asin: 'B00YD2MHGU',
    name: 'Coleman Sundome 4-Person Dome Tent',
    category: 'Sports & Outdoors',
    sourceUrl: 'https://www.walmart.com/ip/coleman-tent/4444444',
    sourceRetailer: 'Walmart',
    sourcePrice: 74.99,
  },
  {
    asin: 'B07D4H5DJR',
    name: 'Tile Mate Bluetooth Tracker 4-Pack',
    category: 'Electronics',
    sourceUrl: 'https://www.target.com/p/tile-mate/-/A-52341',
    sourceRetailer: 'Target',
    sourcePrice: 69.99,
  },
  {
    asin: 'B08XM2TZZD',
    name: 'iRobot Roomba 694 Robot Vacuum',
    category: 'Home & Kitchen',
    sourceUrl: 'https://www.bestbuy.com/site/roomba-694/9876543.p',
    sourceRetailer: 'Best Buy',
    sourcePrice: 179.99,
  },
  {
    asin: 'B07NJ3JCGP',
    name: 'Fujifilm Instax Mini 11 Instant Camera',
    category: 'Electronics',
    sourceUrl: 'https://www.target.com/p/fujifilm-instax/-/A-33445',
    sourceRetailer: 'Target',
    sourcePrice: 69.99,
  },
  {
    asin: 'B079QHML21',
    name: 'Brita Standard Everyday Water Filter Pitcher',
    category: 'Home & Kitchen',
    sourceUrl: 'https://www.walmart.com/ip/brita-pitcher/11223344',
    sourceRetailer: 'Walmart',
    sourcePrice: 24.99,
  },
  {
    asin: 'B08P4HTG77',
    name: 'Crayola 120 Ct Colored Pencils School Supplies',
    category: 'Arts & Crafts',
    sourceUrl: 'https://www.target.com/p/crayola-pencils/-/A-55678',
    sourceRetailer: 'Target',
    sourcePrice: 11.99,
  },
];

export async function runWeeklyFeed(batchId: string): Promise<{
  processed: number;
  passed: number;
  failed: number;
}> {
  const { week, year } = getWeekNumber();

  // Find ASINs already in the last 90 days to avoid duplicates
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recentAsins = await prisma.product.findMany({
    where: { dateAdded: { gte: cutoff } },
    select: { asin: true },
  });

  const usedAsins = new Set(recentAsins.map((p) => p.asin));

  let processed = 0;
  let passed = 0;
  let failed = 0;
  const TARGET = 40;

  for (const raw of SAMPLE_PRODUCTS) {
    if (passed >= TARGET) break;
    if (usedAsins.has(raw.asin)) continue;

    processed++;

    const result = await qualifyProduct(raw);
    if (result.qualifies && result.product) {
      await saveQualifiedProduct(result.product, batchId);
      usedAsins.add(raw.asin);
      passed++;
    } else {
      failed++;
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  return { processed, passed, failed };
}
