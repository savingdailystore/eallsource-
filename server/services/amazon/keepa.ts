import { buildKeepaUrl } from '@lib/utils';

const KEEPA_API_BASE = 'https://api.keepa.com';
const KEEPA_API_KEY = process.env.KEEPA_API_KEY;

export interface KeepaProduct {
  asin: string;
  title: string;
  currentPrice?: number;
  buyBoxPrice?: number;
  lowestFbaPrice?: number;
  bsr?: number;
  bsrPercentage?: number;
  totalSellers?: number;
  fbaSellers?: number;
  amazonIsSeller?: boolean;
  amazonOwnsBuyBox?: boolean;
  salesRankHistory?: number[];
  priceHistory?: { timestamp: number; price: number }[];
}

export async function getKeepaProduct(asin: string): Promise<KeepaProduct | null> {
  if (!KEEPA_API_KEY) {
    // Return simulated data when no API key is configured
    return simulateKeepaData(asin);
  }

  try {
    const url = `${KEEPA_API_BASE}/product?key=${KEEPA_API_KEY}&domain=1&asin=${asin}&stats=180&history=1`;
    const res = await fetch(url);

    if (!res.ok) return null;

    const data = await res.json() as Record<string, unknown>;
    const products = data.products as Array<Record<string, unknown>> | undefined;
    const product = products?.[0];
    if (!product) return null;

    const csvData = product.csv;

    return {
      asin,
      title: product.title as string,
      currentPrice: undefined,
      buyBoxPrice: undefined,
      lowestFbaPrice: undefined,
      bsr: ((product.stats as Record<string, unknown>)?.current as number[] | undefined)?.[3] ?? undefined,
      amazonIsSeller: ((product.stats as Record<string, unknown>)?.buyBoxIsAmazon as boolean) ?? false,
      amazonOwnsBuyBox: ((product.stats as Record<string, unknown>)?.buyBoxIsAmazon as boolean) ?? false,
    };
  } catch {
    return null;
  }
}

export function getKeepaLink(asin: string): string {
  return buildKeepaUrl(asin);
}

function simulateKeepaData(asin: string): KeepaProduct {
  const seed = asin.charCodeAt(0) + asin.charCodeAt(asin.length - 1);
  const price = 20 + (seed % 180);
  const bsr = 1000 + (seed % 500000);

  return {
    asin,
    title: `Product ${asin}`,
    currentPrice: price,
    buyBoxPrice: price * (0.95 + Math.random() * 0.1),
    lowestFbaPrice: price * (0.92 + Math.random() * 0.08),
    bsr,
    bsrPercentage: Math.min(3, (bsr / 1000000) * 100),
    totalSellers: Math.floor(Math.random() * 25),
    fbaSellers: Math.floor(Math.random() * 12),
    amazonIsSeller: Math.random() < 0.3,
    amazonOwnsBuyBox: Math.random() < 0.25,
  };
}
