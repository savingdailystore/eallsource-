// Amazon SP-API integration
// Docs: https://developer-docs.amazon.com/sp-api/

const SP_API_BASE = 'https://sellingpartnerapi-na.amazon.com';
const MARKETPLACE_ID = process.env.AMAZON_MARKETPLACE_ID || 'ATVPDKIKX0DER';

let accessToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.AMAZON_CLIENT_ID!,
      client_secret: process.env.AMAZON_CLIENT_SECRET!,
      refresh_token: process.env.AMAZON_REFRESH_TOKEN!,
    }),
  });

  if (!res.ok) throw new Error('Failed to get Amazon access token');

  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000 - 60000;
  return accessToken!;
}

export interface AmazonListingData {
  asin: string;
  title: string;
  buyBoxPrice?: number;
  lowestListedPrice?: number;
  salesRank?: number;
  category?: string;
  subcategory?: string;
  imageUrl?: string;
  totalOfferCount?: number;
  isRestricted?: boolean;
}

export async function getListingData(asin: string): Promise<AmazonListingData | null> {
  // Skip real API call if credentials not configured
  if (!process.env.AMAZON_CLIENT_ID) {
    return simulateListingData(asin);
  }

  try {
    const token = await getAccessToken();
    const url = `${SP_API_BASE}/products/pricing/v0/price?Asin=${asin}&MarketplaceId=${MARKETPLACE_ID}&ItemType=Asin`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-amz-access-token': token,
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const payload = data.payload?.[0];
    if (!payload) return null;

    return {
      asin,
      title: payload.Product?.AttributeSets?.[0]?.Title ?? '',
      buyBoxPrice: payload.Product?.CompetitivePricing?.CompetitivePrices?.[0]?.Price?.LandedPrice?.Amount,
      lowestListedPrice: payload.Product?.LowestOfferListings?.[0]?.Price?.LandedPrice?.Amount,
    };
  } catch {
    return null;
  }
}

export async function checkIfAutoUngated(asin: string): Promise<boolean> {
  // TODO: use SP-API Catalog Items and Listings Restrictions APIs
  // For now, return true for most categories
  const alwaysGated = ['Grocery', 'Health', 'Beauty', 'Medical'];
  return !alwaysGated.some((c) => asin.startsWith('B00'));
}

// ─────────────────────────────────────────────
// Auto-ungated categories (no approval required)
// ─────────────────────────────────────────────

export const AUTO_UNGATED_CATEGORIES = [
  'Books',
  'Music',
  'Movies & TV',
  'Video Games',
  'Toys & Games',
  'Sports & Outdoors',
  'Office Products',
  'Tools & Home Improvement',
  'Home & Kitchen',
  'Pet Supplies',
  'Arts & Crafts',
  'Industrial & Scientific',
  'Electronics',
  'Automotive',
];

export function isCategoryAutoUngated(category: string): boolean {
  return AUTO_UNGATED_CATEGORIES.some(
    (c) => c.toLowerCase() === category.toLowerCase(),
  );
}

function simulateListingData(asin: string): AmazonListingData {
  const seed = asin.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const price = 15 + (seed % 200);

  return {
    asin,
    title: `Sample Product ${asin}`,
    buyBoxPrice: price,
    lowestListedPrice: price * 0.95,
    salesRank: 1000 + (seed % 800000),
    category: AUTO_UNGATED_CATEGORIES[seed % AUTO_UNGATED_CATEGORIES.length],
    imageUrl: `https://via.placeholder.com/200x200?text=${asin}`,
    totalOfferCount: 5 + (seed % 30),
    isRestricted: false,
  };
}
