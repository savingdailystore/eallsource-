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
  buyBoxSuppressed?: boolean; // offers exist but no current buy box winner
  isVariation?:    boolean;   // child of a parent variation listing
  parentAsin?:     string;
  rating?:         number;    // average star rating (0–5)
  reviewCount?:    number;    // total ratings/reviews on the listing
  // Sales velocity: estimated units sold per month. Prefer Amazon's own
  // "X+ bought in past month" (monthlySold), fall back to Keepa's 30-day
  // sales-rank-drop count (each drop ≈ a sale). undefined = no signal.
  monthlySales?:   number;
  priceHistory?:   number[]; // last 90 days of buy box prices
  priceStability?: 'STABLE' | 'VOLATILE' | 'UNKNOWN';
  // Directional 90-day trend of the buy box price, independent of volatility.
  priceTrend?:     'RISING' | 'FLAT' | 'DECLINING' | 'UNKNOWN';
  priceTrendPct?:  number; // % change recent vs. earlier window (negative = falling)
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

    // Sales velocity: Amazon's "X+ bought in past month" is the cleanest signal
    // when present; otherwise the 30-day sales-rank-drop count is the standard
    // proxy (each meaningful rank drop corresponds to at least one unit sold).
    // 30-day rank drops directly, else derive a 30-day figure from the 90-day count.
    let rankDrops30: number | undefined;
    if (typeof stats.salesRankDrops30 === 'number')      rankDrops30 = stats.salesRankDrops30;
    else if (typeof stats.salesRankDrops90 === 'number') rankDrops30 = Math.round(stats.salesRankDrops90 / 3);

    const monthlySales: number | undefined =
      typeof p.monthlySold === 'number' && p.monthlySold > 0 ? p.monthlySold
      : rankDrops30 != null && rankDrops30 > 0 ? rankDrops30
      : undefined;

    // Buy box price (most recent)
    const buyBoxPrice = buyBoxHistory.length > 0 ? buyBoxHistory[buyBoxHistory.length - 1] : undefined;
    const lowestNew   = newHistory.length    > 0 ? newHistory[newHistory.length - 1]        : undefined;

    // Buy box suppression: there are live offers but no buy box price is being
    // shown. Amazon suppresses the buy box when no offer meets its criteria
    // (price too high vs. external refs, or eligibility issues) — these convert
    // poorly since there's no one-click "Buy Now" button for customers.
    const buyBoxSuppressed = allSellers > 0 && buyBoxPrice == null;

    // Variation relationship — Keepa exposes the parent ASIN directly.
    const parentAsin: string | undefined =
      typeof p.parentAsin === 'string' && p.parentAsin && p.parentAsin !== asin ? p.parentAsin : undefined;
    const isVariation = parentAsin != null;

    // Rating (csv[16], stored ×10 e.g. 45 = 4.5★) and review count (csv[17]).
    // A real, established listing has a track record of reviews; near-zero
    // reviews can mean a brand-new listing or a hijacked/counterfeit-prone one.
    const ratingRaw = lastCsvValue(p.csv?.[16]);
    const reviewRaw = lastCsvValue(p.csv?.[17]);
    const rating      = ratingRaw != null && ratingRaw >= 0 ? ratingRaw / 10 : undefined;
    const reviewCount = reviewRaw != null && reviewRaw >= 0 ? reviewRaw : undefined;

    // Price stability from last 30 days
    const recent30   = buyBoxHistory.slice(-30);
    const priceStability = computeStability(recent30);

    // Directional trend over the available buy box history.
    const { trend: priceTrend, pct: priceTrendPct } = computeTrend(buyBoxHistory);

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
      monthlySales,
      buyBoxSuppressed,
      isVariation,
      parentAsin,
      rating,
      reviewCount,
      amazonIsSeller:  (p.csv?.[0]?.length ?? 0) > 0, // Amazon price history exists = Amazon sells it
      priceHistory:    priceHistoryFormatted,
      priceStability,
      priceTrend,
      priceTrendPct,
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

// Last raw value from a Keepa csv series ([time, value, time, value, ...]).
// Unlike parsePriceHistory this does NOT divide by 100 — used for non-price
// series like rating and review count. Returns null when there's no value.
function lastCsvValue(csv?: number[]): number | null {
  if (!csv || csv.length < 2) return null;
  for (let i = csv.length - 1; i >= 1; i -= 2) {
    if (csv[i] != null && csv[i] >= 0) return csv[i];
  }
  return null;
}

function computeStability(prices: number[]): 'STABLE' | 'VOLATILE' | 'UNKNOWN' {
  if (prices.length < 5) return 'UNKNOWN';
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  if (avg === 0) return 'UNKNOWN';
  const variance = prices.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / prices.length;
  const cv = Math.sqrt(variance) / avg; // coefficient of variation
  return cv < 0.05 ? 'STABLE' : cv < 0.20 ? 'STABLE' : 'VOLATILE';
}

// Directional price trend, independent of volatility. Compares the average of
// the most recent third of the window against the earliest third — averaging
// smooths out noise so a genuinely declining price isn't masked by day-to-day
// swings (and vice versa: volatile-but-flat isn't mistaken for a decline).
const TREND_THRESHOLD = 0.08; // ±8% between windows to count as a real move
function computeTrend(prices: number[]): { trend: 'RISING' | 'FLAT' | 'DECLINING' | 'UNKNOWN'; pct?: number } {
  if (prices.length < 12) return { trend: 'UNKNOWN' };
  const third  = Math.floor(prices.length / 3);
  const early  = prices.slice(0, third);
  const recent = prices.slice(-third);
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const earlyAvg = avg(early);
  if (earlyAvg === 0) return { trend: 'UNKNOWN' };
  const pct = (avg(recent) - earlyAvg) / earlyAvg;
  const trend = pct <= -TREND_THRESHOLD ? 'DECLINING' : pct >= TREND_THRESHOLD ? 'RISING' : 'FLAT';
  return { trend, pct: Math.round(pct * 1000) / 10 }; // pct as e.g. -12.3
}

function categoryName(raw?: string): string | undefined {
  if (!raw) return undefined;
  // Keepa returns category names like "Health & Beauty > Vitamins..." — take first segment
  return raw.split('>')[0].trim() || undefined;
}
