import type { SellerListing, BuyBoxStatus } from '@lib/types';

export interface AmazonConnection {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sellerId: string;
  marketplaceId?: string;
}

// ─── mock listings (demo mode) ────────────────────────────────────────────────

export function getMockListings(): SellerListing[] {
  return [
    {
      sku: 'OB-PRO1000-WMT',
      asin: 'B09B4MLLZ3',
      productName: 'Oral-B Pro 1000 Electric Toothbrush Power Rechargeable',
      imageUrl: 'https://m.media-amazon.com/images/I/61evn2-BFKL._SL75_.jpg',
      condition: 'New',
      currentPrice: 54.99,
      buyBoxPrice: 52.99,
      buyBoxStatus: 'OTHER_FBA',
      lowestFbaPrice: 52.99,
      lowestFbmPrice: 50.49,
      competitorCount: 8,
      salesRank: 1842,
      fulfillableQty: 12,
      fulfillmentChannel: 'FBA',
    },
    {
      sku: 'IP-DUO6-TGT',
      asin: 'B07FZ8S74R',
      productName: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker 6qt',
      imageUrl: 'https://m.media-amazon.com/images/I/71V1-D35UCL._SL75_.jpg',
      condition: 'New',
      currentPrice: 99.99,
      buyBoxPrice: 89.99,
      buyBoxStatus: 'AMAZON',
      lowestFbaPrice: 94.99,
      lowestFbmPrice: 88.00,
      competitorCount: 11,
      salesRank: 4201,
      fulfillableQty: 3,
      fulfillmentChannel: 'FBA',
    },
    {
      sku: 'STN-32OZ-TGT',
      asin: 'B001TH7GUU',
      productName: 'Stanley Classic Vacuum Insulated Wide Mouth Bottle 32oz',
      imageUrl: 'https://m.media-amazon.com/images/I/61CPt8WZFBL._SL75_.jpg',
      condition: 'New',
      currentPrice: 49.99,
      buyBoxPrice: 49.99,
      buyBoxStatus: 'SELF',
      lowestFbaPrice: 49.99,
      lowestFbmPrice: 47.50,
      competitorCount: 6,
      salesRank: 2914,
      fulfillableQty: 7,
      fulfillmentChannel: 'FBA',
    },
    {
      sku: 'SHP-24PK-STP',
      asin: 'B07HBQPZP9',
      productName: 'Sharpie Permanent Markers Fine Point 24 Pack Assorted',
      imageUrl: 'https://m.media-amazon.com/images/I/71rZG9WBxZL._SL75_.jpg',
      condition: 'New',
      currentPrice: 24.99,
      buyBoxPrice: 22.99,
      buyBoxStatus: 'OTHER_FBM',
      lowestFbaPrice: 23.49,
      lowestFbmPrice: 22.99,
      competitorCount: 12,
      salesRank: 5122,
      fulfillableQty: 18,
      fulfillmentChannel: 'FBA',
    },
    {
      sku: 'BD-PVAC-HD',
      asin: 'B08BHXG144',
      productName: 'BLACK+DECKER Hand Vacuum Cordless Pivot 20V Max',
      imageUrl: 'https://m.media-amazon.com/images/I/71UYNrWHmOL._SL75_.jpg',
      condition: 'New',
      currentPrice: 69.99,
      buyBoxPrice: 69.99,
      buyBoxStatus: 'SELF',
      lowestFbaPrice: 69.99,
      lowestFbmPrice: 66.00,
      competitorCount: 7,
      salesRank: 7344,
      fulfillableQty: 5,
      fulfillmentChannel: 'FBA',
    },
  ];
}

// ─── SP-API integration ───────────────────────────────────────────────────────

async function getLwaToken(conn: AmazonConnection): Promise<string> {
  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: conn.clientId,
      client_secret: conn.clientSecret,
      refresh_token: conn.refreshToken,
    }),
  });
  if (!res.ok) throw new Error('Failed to obtain LWA token');
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export async function fetchSellerListings(conn: AmazonConnection): Promise<SellerListing[]> {
  const token = await getLwaToken(conn);
  const marketplace = conn.marketplaceId ?? 'ATVPDKIKX0DER';

  // Fetch active FBA listings
  const listingsRes = await fetch(
    `https://sellingpartnerapi-na.amazon.com/listings/2021-08-01/items/${conn.sellerId}?marketplaceIds=${marketplace}&status=ACTIVE`,
    { headers: { 'x-amz-access-token': token, 'content-type': 'application/json' } },
  );
  if (!listingsRes.ok) throw new Error('Failed to fetch listings from SP-API');
  const listingsData = await listingsRes.json() as { items: { sku: string; asin: string; summaries: { itemName: string; mainImage?: { link: string } }[] }[] };

  const listings: SellerListing[] = await Promise.all(
    listingsData.items.map(async (item) => {
      const sku = item.sku;
      const asin = item.asin;
      const productName = item.summaries[0]?.itemName ?? 'Unknown Product';
      const imageUrl = item.summaries[0]?.mainImage?.link;

      // Fetch competitive pricing
      const priceRes = await fetch(
        `https://sellingpartnerapi-na.amazon.com/pricing/v0/competitivePrice?Asins=${asin}&MarketplaceId=${marketplace}&ItemType=Asin`,
        { headers: { 'x-amz-access-token': token } },
      );
      const priceData = priceRes.ok
        ? await priceRes.json() as { payload: { Product: { CompetitivePricing: { CompetitivePrices: { CompetitivePriceType: string; Price: { LandedPrice: { Amount: number } } }[] }; NumberOfOfferListings: { condition: string; fulfillmentChannel: string; Count: number }[] } }[] }
        : null;

      const product = priceData?.payload?.[0]?.Product;
      const competitivePrices = product?.CompetitivePricing?.CompetitivePrices ?? [];
      const buyBoxEntry = competitivePrices.find((p) => p.CompetitivePriceType === 'USED_BUY_BOX_PRICE' || p.CompetitivePriceType === 'NEW_BUY_BOX_PRICE');
      const buyBoxPrice = buyBoxEntry?.Price?.LandedPrice?.Amount ?? null;

      return {
        sku,
        asin,
        productName,
        imageUrl,
        condition: 'New',
        currentPrice: 0, // would come from merchant listing API
        buyBoxPrice,
        buyBoxStatus: 'NONE' as BuyBoxStatus,
        lowestFbaPrice: null,
        lowestFbmPrice: null,
        competitorCount: 0,
        salesRank: null,
        fulfillableQty: 0,
        fulfillmentChannel: 'FBA' as const,
      };
    }),
  );

  return listings;
}

export async function submitPriceChange(
  conn: AmazonConnection,
  sku: string,
  newPrice: number,
): Promise<boolean> {
  const token = await getLwaToken(conn);
  const marketplace = conn.marketplaceId ?? 'ATVPDKIKX0DER';

  const res = await fetch(
    `https://sellingpartnerapi-na.amazon.com/listings/2021-08-01/items/${conn.sellerId}/${encodeURIComponent(sku)}?marketplaceIds=${marketplace}`,
    {
      method: 'PATCH',
      headers: { 'x-amz-access-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({
        productType: 'PRODUCT',
        patches: [{ op: 'replace', path: '/attributes/purchasable_offer', value: [{ marketplace_id: marketplace, currency: 'USD', our_price: [{ schedule: [{ value_with_tax: newPrice }] }] }] }],
      }),
    },
  );

  return res.ok;
}
