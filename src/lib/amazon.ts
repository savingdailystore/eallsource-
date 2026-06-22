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

  // SP-API catalog/pricing endpoints have low rate limits and return 429
  // (QuotaExceeded) under burst — which otherwise surfaces as a bogus "no match"
  // / "no pricing" outcome. Retry with exponential backoff + jitter so a
  // transient throttle doesn't drop a real product. Bounded to stay well within
  // the route's 300s budget.
  const MAX_RETRIES = 4;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url.toString(), {
      headers: {
        'x-amz-access-token': accessToken,
        'x-amz-date':         new Date().toISOString().replace(/[:-]/g, '').slice(0, 15) + 'Z',
        'Content-Type':       'application/json',
      },
    });

    if (res.ok) return res.json();

    const body = await res.text();
    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
      const backoffMs = 600 * 2 ** attempt + Math.random() * 300; // ~0.6s,1.2s,2.4s,4.8s + jitter
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }
    throw new Error(`SP-API ${res.status}: ${body}`);
  }
}

// ─── Catalog search ───────────────────────────────────────────────────────────

// "Renewed"/refurbished listings are a different (lower-priced) condition. A new
// retail product must NEVER match one — the renewed resale price makes a real
// flip look unprofitable (or matches the wrong listing entirely). Prefer a new
// listing; only fall back to a flagged one if nothing else exists.
const RENEWED_RE = /\b(renewed|refurbished|refurb|pre-?owned|open[\s-]?box|restored)\b/i;
const isRenewedName = (name?: string): boolean => !!name && RENEWED_RE.test(name);

type CatalogItem = { asin: string; summaries?: Array<{ itemName?: string }> };
// Pick the first non-renewed candidate; fall back to the first item so a
// barcode match isn't dropped when only a renewed listing exists.
function pickNewItem(items: CatalogItem[]): CatalogItem | undefined {
  return items.find((it) => !isRenewedName(it.summaries?.[0]?.itemName)) ?? items[0];
}

export async function searchCatalogByUpc(orgId: string, upc: string, marketplaceId = 'ATVPDKIKX0DER'): Promise<AmazonMatch | null> {
  try {
    const data = await spApi(orgId, '/catalog/2022-04-01/items', {
      identifiers:        upc,
      identifiersType:    'UPC',
      marketplaceIds:     marketplaceId,
      includedData:       'identifiers,summaries',
    }) as { items?: CatalogItem[] };

    const item = pickNewItem(data.items ?? []);
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
    }) as { items?: CatalogItem[] };

    const item = pickNewItem(data.items ?? []);
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
    }) as { items?: CatalogItem[] };

    const items = data.items ?? [];
    if (items.length === 0) return null;

    // Score the top candidates and keep the best — Amazon's keyword ranking
    // is good but the #1 result isn't always the closest title match. Reject
    // candidates whose pack size conflicts with the source (e.g. a single item
    // matched to a 12-pack), which otherwise produces fake "profitable" leads.
    // Look past the first few results (widened to 8) because Renewed listings
    // often outrank the new one for popular brands.
    const srcQty = extractPackCount(keywords);
    let best: { asin: string; confidence: number } | null = null;
    for (const it of items.slice(0, 8)) {
      const name  = it.summaries?.[0]?.itemName ?? '';
      if (isRenewedName(name)) continue; // never match a new product to a renewed listing
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
        includedData:   'summaries,salesRanks,attributes,images,relationships',
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

    // Images live in their own block (not summaries). Prefer the MAIN variant,
    // then the largest available, so manual entries (no retailer thumbnail) and
    // scans both get a real product photo.
    const imageList = (catalog?.images?.[0]?.images ?? []) as Array<{ variant?: string; link?: string; height?: number }>;
    const mainImage = imageList.find((i) => i.variant === 'MAIN')
      ?? [...imageList].sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

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

    // Buy box suppressed: offers exist but Amazon shows no buy box winner.
    const buyBoxSuppressed = totalSellers > 0 && buyBoxPrice == null;

    // Variation relationship: a CHILD variation (one size/color) reports the
    // parent's aggregated BSR and shares the variation family's reviews, so its
    // demand data is misleading. The relationships block lists the parent ASIN
    // when this ASIN is itself a child.
    const relationships = (catalog?.relationships?.[0]?.relationships ?? []) as Array<{ type?: string; parentAsins?: string[] }>;
    const parentRel  = relationships.find((r) => Array.isArray(r.parentAsins) && r.parentAsins.length > 0);
    const parentAsin = parentRel?.parentAsins?.[0];
    const isVariation = parentAsin != null && parentAsin !== asin;

    return {
      asin,
      title:          summary?.itemName,
      brand:          summary?.brand,
      category:       summary?.productType,
      imageUrl:       mainImage?.link,
      bsr:            salesRank?.rank,
      buyBoxPrice,
      lowestFbaPrice,
      fbaSellers,
      totalSellers,
      buyBoxSuppressed,
      isVariation,
      parentAsin,
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

    const data   = await res.json() as any;
    const result = data?.payload?.FeesEstimateResult;

    // SP-API can return a 200 whose FeesEstimateResult.Status is 'ClientError'
    // or 'ServerError' with no FeesEstimate body at all. Treat anything but a
    // successful estimate as "no data" so the caller falls back to our own fee
    // estimates instead of charging $0 in fees.
    if (result?.Status !== 'Success') return null;

    const fees = result?.FeesEstimate?.FeeDetailList ?? [];

    const referralFee = fees.find((f: any) => f.FeeType === 'ReferralFee')?.FinalFee?.Amount ?? 0;
    const fbaFee      = fees.find((f: any) => f.FeeType === 'FBAFees')?.FinalFee?.Amount      ?? 0;

    // Every real FBA listing carries a referral fee (>0) and a fulfillment fee
    // (>0). If either is missing or zero, the detail list came back incomplete —
    // return null so estimates fill the gap rather than reporting near-zero fees
    // and a wildly inflated profit/ROI. (This was the "$0.50 Amazon fees" bug.)
    if (referralFee <= 0 || fbaFee <= 0) return null;

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
