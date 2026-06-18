import { prisma } from './prisma';
import { decrypt, encrypt } from './encryption';
import type { AmazonMatch, AmazonProductData } from '@/types';

const SP_API_BASE = 'https://sellingpartnerapi-na.amazon.com';
const LWA_URL     = 'https://api.amazon.com/auth/o2/token';

// ─── Token refresh ───────────────────────────────────────────────────────────

export async function getValidAccessToken(orgId: string): Promise<string | null> {
  const cred = await prisma.amazonCredential.findUnique({ where: { orgId } });
  if (!cred || !cred.isActive) return null;

  // If token is still valid (5-minute buffer), return it
  if (cred.tokenExpiresAt && cred.tokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return decrypt(cred.accessToken);
  }

  // Refresh the token
  const refreshToken = decrypt(cred.refreshToken);
  const res = await fetch(LWA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     process.env.LWA_CLIENT_ID     ?? '',
      client_secret: process.env.LWA_CLIENT_SECRET ?? '',
    }),
  });

  if (!res.ok) {
    console.error('[amazon] token refresh failed:', res.status);
    return null;
  }

  const { access_token, expires_in } = await res.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + expires_in * 1000);

  await prisma.amazonCredential.update({
    where: { orgId },
    data: {
      accessToken:    encrypt(access_token),
      tokenExpiresAt: expiresAt,
    },
  });

  return access_token;
}

// ─── SP-API request helper ────────────────────────────────────────────────────

async function spApi(orgId: string, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const accessToken = await getValidAccessToken(orgId);
  if (!accessToken) throw new Error('No valid Amazon credentials for org');

  const url = new URL(`${SP_API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      'x-amz-access-token': accessToken,
      'x-amz-date':         new Date().toISOString().replace(/[:-]/g, '').slice(0, 15) + 'Z',
      'Content-Type':       'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SP-API ${res.status}: ${body}`);
  }

  return res.json();
}

// ─── Catalog search ───────────────────────────────────────────────────────────

export async function searchCatalogByUpc(orgId: string, upc: string, marketplaceId = 'ATVPDKIKX0DER'): Promise<AmazonMatch | null> {
  try {
    const data = await spApi(orgId, '/catalog/2022-04-01/items', {
      identifiers:        upc,
      identifiersType:    'UPC',
      marketplaceIds:     marketplaceId,
      includedData:       'identifiers,summaries',
    }) as { items?: Array<{ asin: string }> };

    const item = data.items?.[0];
    if (!item) return null;

    return {
      asin:            item.asin,
      amazonUrl:       `https://www.amazon.com/dp/${item.asin}`,
      matchMethod:     'UPC',
      matchConfidence: 99,
    };
  } catch (err) {
    console.error('[amazon] searchCatalogByUpc error:', err);
    return null;
  }
}

export async function searchCatalogByEan(orgId: string, ean: string, marketplaceId = 'ATVPDKIKX0DER'): Promise<AmazonMatch | null> {
  try {
    const data = await spApi(orgId, '/catalog/2022-04-01/items', {
      identifiers:     ean,
      identifiersType: 'EAN',
      marketplaceIds:  marketplaceId,
      includedData:    'identifiers,summaries',
    }) as { items?: Array<{ asin: string }> };

    const item = data.items?.[0];
    if (!item) return null;

    return {
      asin:            item.asin,
      amazonUrl:       `https://www.amazon.com/dp/${item.asin}`,
      matchMethod:     'EAN',
      matchConfidence: 99,
    };
  } catch (err) {
    console.error('[amazon] searchCatalogByEan error:', err);
    return null;
  }
}

export async function searchCatalogByKeywords(orgId: string, keywords: string, marketplaceId = 'ATVPDKIKX0DER'): Promise<AmazonMatch | null> {
  try {
    const data = await spApi(orgId, '/catalog/2022-04-01/items', {
      keywords:       keywords,
      marketplaceIds: marketplaceId,
      includedData:   'identifiers,summaries',
    }) as { items?: Array<{ asin: string; summaries?: Array<{ itemName?: string }> }> };

    const items = data.items ?? [];
    if (items.length === 0) return null;

    // Score the top candidates and keep the best — Amazon's keyword ranking
    // is good but the #1 result isn't always the closest title match. Reject
    // candidates whose pack size conflicts with the source (e.g. a single item
    // matched to a 12-pack), which otherwise produces fake "profitable" leads.
    const srcQty = extractPackCount(keywords);
    let best: { asin: string; confidence: number } | null = null;
    for (const it of items.slice(0, 5)) {
      const name  = it.summaries?.[0]?.itemName ?? '';
      const itQty = extractPackCount(name);
      if (srcQty != null && itQty != null && srcQty !== itQty) continue; // pack-size mismatch
      const c = estimateTitleConfidence(keywords, name);
      if (!best || c > best.confidence) best = { asin: it.asin, confidence: c };
    }
    if (!best || best.confidence < 55) return null;

    return {
      asin:            best.asin,
      amazonUrl:       `https://www.amazon.com/dp/${best.asin}`,
      matchMethod:     'TITLE_SIMILARITY',
      matchConfidence: best.confidence,
    };
  } catch (err) {
    console.error('[amazon] searchCatalogByKeywords error:', err);
    return null;
  }
}

// ─── Product market data ──────────────────────────────────────────────────────

export async function getProductData(orgId: string, asin: string, marketplaceId = 'ATVPDKIKX0DER'): Promise<Partial<AmazonProductData>> {
  try {
    // competitivePricing returns 403 for this app's roles; getItemOffers
    // (also under the Pricing role) returns a usable buy-box / lowest-price
    // summary, so use that for resale pricing.
    const [catalogData, offersData] = await Promise.allSettled([
      spApi(orgId, `/catalog/2022-04-01/items/${asin}`, {
        marketplaceIds: marketplaceId,
        includedData:   'summaries,salesRanks,attributes',
      }),
      spApi(orgId, `/products/pricing/v0/items/${asin}/offers`, {
        MarketplaceId: marketplaceId,
        ItemCondition: 'New',
      }),
    ]);

    const catalog = catalogData.status === 'fulfilled' ? catalogData.value as any : null;
    const offers  = offersData.status  === 'fulfilled' ? offersData.value  as any : null;

    const summary   = catalog?.summaries?.[0];
    const salesRank = catalog?.salesRanks?.[0]?.ranks?.[0];

    const sum = offers?.payload?.Summary;
    const buyBox =
      sum?.BuyBoxPrices?.find((p: any) => p.condition?.toLowerCase() === 'new') ?? sum?.BuyBoxPrices?.[0];
    const buyBoxPrice = buyBox?.LandedPrice?.Amount;

    const lowestFba =
      sum?.LowestPrices?.find((p: any) => p.fulfillmentChannel === 'Amazon') ?? sum?.LowestPrices?.[0];
    const lowestFbaPrice = lowestFba?.LandedPrice?.Amount;

    const offerCounts  = (sum?.NumberOfOffers ?? []) as Array<{ fulfillmentChannel?: string; OfferCount?: number }>;
    const totalSellers = sum?.TotalOfferCount ?? offerCounts.reduce((a, o) => a + (o.OfferCount ?? 0), 0);
    const fbaSellers   = offerCounts.filter((o) => o.fulfillmentChannel === 'Amazon').reduce((a, o) => a + (o.OfferCount ?? 0), 0);

    return {
      asin,
      title:          summary?.itemName,
      brand:          summary?.brand,
      category:       summary?.productType,
      imageUrl:       summary?.mainImage?.link,
      bsr:            salesRank?.rank,
      buyBoxPrice,
      lowestFbaPrice,
      fbaSellers,
      totalSellers,
    };
  } catch (err) {
    console.error('[amazon] getProductData error:', err);
    return { asin };
  }
}

// ─── Fee estimate ─────────────────────────────────────────────────────────────

export async function getFeeEstimate(orgId: string, asin: string, price: number, marketplaceId = 'ATVPDKIKX0DER'): Promise<{ referralFee: number; fbaFee: number } | null> {
  try {
    const res = await fetch(`${SP_API_BASE}/products/fees/v0/items/${asin}/feesEstimate`, {
      method: 'POST',
      headers: {
        'x-amz-access-token': (await getValidAccessToken(orgId)) ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        FeesEstimateRequest: {
          MarketplaceId:  marketplaceId,
          IsAmazonFulfilled: true,
          PriceToEstimateFees: {
            ListingPrice: { CurrencyCode: 'USD', Amount: price },
            Shipping:     { CurrencyCode: 'USD', Amount: 0 },
          },
          Identifier: asin,
        },
      }),
    });

    if (!res.ok) return null;

    const data = await res.json() as any;
    const fees = data?.payload?.FeesEstimateResult?.FeesEstimate?.FeeDetailList ?? [];

    const referralFee = fees.find((f: any) => f.FeeType === 'ReferralFee')?.FinalFee?.Amount ?? 0;
    const fbaFee      = fees.find((f: any) => f.FeeType === 'FBAFees')?.FinalFee?.Amount      ?? 0;

    return { referralFee, fbaFee };
  } catch (err) {
    console.error('[amazon] getFeeEstimate error:', err);
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Containment-based title confidence: what fraction of the *shorter* title's
// significant words appear in the other. More robust than Jaccard for matching
// a retailer title to an Amazon title (they differ in length/phrasing), while a
// minimum-shared-words floor guards against trivial/generic matches.
const TITLE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'an', 'of', 'to', 'in', 'by', 'or', 'from',
  'your', 'that', 'this', 'new', 'set',
]);

// Extract a pack/multi-count from a title, e.g. "12 Pack", "5-pk", "set of 3",
// "single". Returns null when no count is stated (can't compare).
function extractPackCount(title: string): number | null {
  const t = title.toLowerCase();
  if (/\bsingle\b/.test(t)) return 1;
  const m =
    t.match(/(?:set|pack)\s*of\s*(\d{1,3})/) ||
    t.match(/(\d{1,3})\s*-?\s*(?:pack|pk|count|ct|pieces?|pcs?|pc)\b/);
  return m ? parseInt(m[1], 10) : null;
}

function estimateTitleConfidence(sourceTitle: string, amazonTitle: string): number {
  if (!amazonTitle) return 0;
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !TITLE_STOPWORDS.has(w));
  const a = new Set(norm(sourceTitle));
  const b = new Set(norm(amazonTitle));
  if (a.size === 0 || b.size === 0) return 0;

  const intersection = [...a].filter((w) => b.has(w)).length;
  if (intersection < 3) return 0; // require at least 3 shared significant words

  const containment = intersection / Math.min(a.size, b.size);
  return Math.round(containment * 100);
}
