// Keepa API client — BSR, price history, seller data
// Docs: https://keepa.com/#!discuss/t/request-products/11

const KEEPA_BASE   = 'https://api.keepa.com';
const KEEPA_API_KEY = process.env.KEEPA_API_KEY ?? '';

// Keepa uses "Keepa time" = unix minutes offset from 2011-01-01
const KEEPA_EPOCH = 1293840000000;
const keepaToDate = (k: number) => new Date(KEEPA_EPOCH + k * 60000);
const keepaPrice  = (raw: number) => raw < 0 ? null : raw / 100; // Keepa stores cents

export interface KeepaProductData {
  asin:            string;
  title?:          string;
  brand?:          string;
  category?:       string;
  imageUrl?:       string;
  bsr?:            number;
  buyBoxPrice?:    number;
  lowestNewPrice?: number;
  fbaSellers?:     number;
  totalSellers?:   number;
  amazonIsSeller?: boolean;
  priceHistory?:   number[]; // last 90 days of buy box prices
  priceStability?: 'STABLE' | 'VOLATILE' | 'UNKNOWN';
  keepaLink:       string;
}

export async function getKeepaData(asin: string): Promise<KeepaProductData | null> {
  if (!KEEPA_API_KEY) return null;

  try {
    const url = new URL(`${KEEPA_BASE}/product`);
    url.searchParams.set('key',     KEEPA_API_KEY);
    url.searchParams.set('domain',  '1');       // US marketplace
    url.searchParams.set('asin',    asin);
    url.searchParams.set('stats',   '90');      // price stats over 90 days
    url.searchParams.set('history', '1');       // include price history
    url.searchParams.set('offers',  '20');      // include offer data

    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error('[keepa] request failed:', res.status);
      return null;
    }

    const data = await res.json() as { products?: any[] };
    const p    = data.products?.[0];
    if (!p) return null;

    // Price arrays: alternating [keepaTime, price, keepaTime, price, ...]
    // p.csv[0] = Amazon price history, p.csv[1] = Marketplace new, p.csv[18] = Buy Box
    const buyBoxHistory = parsePriceHistory(p.csv?.[18] ?? []);
    const newHistory    = parsePriceHistory(p.csv?.[1]  ?? []);

    // BSR: p.csv[3] = sales rank history
    const bsrHistory = parsePriceHistory(p.csv?.[3] ?? []);
    const bsr        = bsrHistory.length > 0 ? bsrHistory[bsrHistory.length - 1] : undefined;

    // Seller counts from stats
    const stats      = p.stats ?? {};
    const fbaSellers = p.offerCountFBA  ?? stats.offerCountFBA  ?? 0;
    const allSellers = p.offerCountTotal ?? stats.offerCountTotal ?? 0;

    // Buy box price (most recent)
    const buyBoxPrice = buyBoxHistory.length > 0 ? buyBoxHistory[buyBoxHistory.length - 1] : undefined;
    const lowestNew   = newHistory.length    > 0 ? newHistory[newHistory.length - 1]        : undefined;

    // Price stability from last 30 days
    const recent30   = buyBoxHistory.slice(-30);
    const priceStability = computeStability(recent30);

    // Recent price array for the product
    const priceHistoryFormatted = buyBoxHistory.slice(-90);

    return {
      asin,
      title:           p.title,
      brand:           p.brand,
      category:        categoryName(p.categoryTree?.[0]?.name),
      imageUrl:        p.imagesCSV ? `https://images-na.ssl-images-amazon.com/images/I/${p.imagesCSV.split(',')[0]}` : undefined,
      bsr:             bsr ?? undefined,
      buyBoxPrice:     buyBoxPrice ?? undefined,
      lowestNewPrice:  lowestNew  ?? undefined,
      fbaSellers:      fbaSellers,
      totalSellers:    allSellers,
      amazonIsSeller:  (p.csv?.[0]?.length ?? 0) > 0, // Amazon price history exists = Amazon sells it
      priceHistory:    priceHistoryFormatted,
      priceStability,
      keepaLink:       `https://keepa.com/#!product/1-${asin}`,
    };
  } catch (err) {
    console.error('[keepa] error:', err);
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePriceHistory(csv: number[]): number[] {
  const prices: number[] = [];
  for (let i = 1; i < csv.length; i += 2) {
    const price = keepaPrice(csv[i]);
    if (price !== null) prices.push(price);
  }
  return prices;
}

function computeStability(prices: number[]): 'STABLE' | 'VOLATILE' | 'UNKNOWN' {
  if (prices.length < 5) return 'UNKNOWN';
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  if (avg === 0) return 'UNKNOWN';
  const variance = prices.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / prices.length;
  const cv = Math.sqrt(variance) / avg; // coefficient of variation
  return cv < 0.05 ? 'STABLE' : cv < 0.20 ? 'STABLE' : 'VOLATILE';
}

function categoryName(raw?: string): string | undefined {
  if (!raw) return undefined;
  // Keepa returns category names like "Health & Beauty > Vitamins..." — take first segment
  return raw.split('>')[0].trim() || undefined;
}
