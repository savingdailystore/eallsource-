import type { DiscountItem } from '@/types';

export interface CashbackProvider {
  name: string;
  lookup(retailer: string, url: string): Promise<DiscountItem[]>;
}

// ─────────────────────────────────────────────
// Modular provider registry
// ─────────────────────────────────────────────

class RakutenProvider implements CashbackProvider {
  name = 'Rakuten';

  async lookup(retailer: string): Promise<DiscountItem[]> {
    // TODO: integrate Rakuten API with real credentials
    // GET https://api.rakuten.com/v1/cashback?merchant={retailer}
    return simulateCashback(retailer, 'Rakuten', 'CASHBACK', 0.02, 0.08);
  }
}

class BeFrugalProvider implements CashbackProvider {
  name = 'BeFrugal';

  async lookup(retailer: string): Promise<DiscountItem[]> {
    // TODO: integrate BeFrugal API
    return simulateCashback(retailer, 'BeFrugal', 'CASHBACK', 0.01, 0.06);
  }
}

class TopCashbackProvider implements CashbackProvider {
  name = 'TopCashback';

  async lookup(retailer: string): Promise<DiscountItem[]> {
    return simulateCashback(retailer, 'TopCashback', 'CASHBACK', 0.01, 0.07);
  }
}

class RetailMeNotProvider implements CashbackProvider {
  name = 'RetailMeNot';

  async lookup(retailer: string, url: string): Promise<DiscountItem[]> {
    // TODO: integrate RetailMeNot API
    const coupons: DiscountItem[] = [];
    if (Math.random() > 0.5) {
      coupons.push({
        source: 'RetailMeNot',
        type: 'COUPON',
        amount: 0,
        percentage: Math.round(Math.random() * 15 + 5),
        code: generateCouponCode(),
      });
    }
    return coupons;
  }
}

class CardBearProvider implements CashbackProvider {
  name = 'CardBear';

  async lookup(retailer: string): Promise<DiscountItem[]> {
    return simulateCashback(retailer, 'CardBear', 'REWARD', 0.01, 0.05);
  }
}

class CapitalOneShoppingProvider implements CashbackProvider {
  name = 'Capital One Shopping';

  async lookup(retailer: string): Promise<DiscountItem[]> {
    return simulateCashback(retailer, 'Capital One Shopping', 'CASHBACK', 0.01, 0.04);
  }
}

// ─────────────────────────────────────────────
// Aggregator
// ─────────────────────────────────────────────

const providers: CashbackProvider[] = [
  new RakutenProvider(),
  new BeFrugalProvider(),
  new TopCashbackProvider(),
  new RetailMeNotProvider(),
  new CardBearProvider(),
  new CapitalOneShoppingProvider(),
];

export async function getAllDiscounts(
  retailer: string,
  url: string,
  price: number,
): Promise<DiscountItem[]> {
  const results = await Promise.allSettled(
    providers.map((p) => p.lookup(retailer, url)),
  );

  const discounts: DiscountItem[] = [];

  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const d of r.value) {
        // Convert percentage discounts to dollar amounts
        if (d.percentage && !d.amount) {
          d.amount = (price * d.percentage) / 100;
        }
        discounts.push(d);
      }
    }
  }

  return discounts;
}

export function addCashbackProvider(provider: CashbackProvider) {
  providers.push(provider);
}

// ─────────────────────────────────────────────
// Simulation helpers (replace with real API calls)
// ─────────────────────────────────────────────

function simulateCashback(
  retailer: string,
  source: string,
  type: DiscountItem['type'],
  minPct: number,
  maxPct: number,
): DiscountItem[] {
  // Deterministically return cashback for known retailers
  const knownRetailers = [
    'Target', 'Walmart', 'Costco', 'Best Buy', 'Home Depot',
    'Lowe\'s', 'Staples', 'Office Depot', 'Kohl\'s', 'Macy\'s',
    'Walgreens', 'CVS', 'Nike', 'Adidas', 'Gap', 'Old Navy',
  ];

  if (!knownRetailers.some((r) => retailer.toLowerCase().includes(r.toLowerCase()))) {
    return [];
  }

  const pct = minPct + Math.random() * (maxPct - minPct);

  return [
    {
      source,
      type,
      amount: 0, // computed by aggregator using price
      percentage: Math.round(pct * 100) / 100,
    },
  ];
}

function generateCouponCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
