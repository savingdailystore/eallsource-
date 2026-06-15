import type { DiscountItem, RoiInput, RoiResult } from '@/types';

// Amazon referral fee rates by category (approximate)
const REFERRAL_FEES: Record<string, number> = {
  'Electronics': 0.08,
  'Camera & Photo': 0.08,
  'Cell Phones & Accessories': 0.08,
  'Computers': 0.06,
  'Video Games': 0.15,
  'Toys & Games': 0.15,
  'Baby Products': 0.08,
  'Books': 0.15,
  'Music': 0.15,
  'Movies & TV': 0.15,
  'Clothing': 0.17,
  'Shoes & Handbags': 0.15,
  'Sports & Outdoors': 0.15,
  'Home & Kitchen': 0.15,
  'Tools & Home Improvement': 0.12,
  'Health & Beauty': 0.08,
  'Grocery': 0.08,
  'Office Products': 0.15,
  'Pet Supplies': 0.15,
  'Automotive': 0.12,
  'Arts & Crafts': 0.15,
  'Industrial & Scientific': 0.12,
  'default': 0.15,
};

// FBA fulfillment fee (simplified — real fees depend on size/weight)
const FBA_BASE_FEE = 3.22;
const FBA_WEIGHT_FEE_PER_LB = 0.51;

export function calculateRoi(input: RoiInput): RoiResult {
  const { sourcePrice, discounts, resellPrice, category } = input;

  // 1. Sum all discounts
  const totalDiscounts = discounts.reduce((sum, d) => sum + d.amount, 0);
  const finalCost = Math.max(0, sourcePrice - totalDiscounts);

  // 2. Amazon referral fee
  const referralRate = REFERRAL_FEES[category] ?? REFERRAL_FEES['default'];
  const referralFee = resellPrice * referralRate;

  // 3. FBA fee (using base estimate)
  const fbaFee = FBA_BASE_FEE + FBA_WEIGHT_FEE_PER_LB;

  // 4. Closing / variable fee (Amazon charges this on media items)
  const closingFee = ['Books', 'Music', 'Movies & TV', 'Video Games'].includes(category)
    ? 1.80
    : 0;

  const amazonFees = referralFee + fbaFee + closingFee;

  // 5. Tax + Prep = 30% of resell price (per platform spec)
  const taxAndPrep = resellPrice * 0.30;
  const prepFee = taxAndPrep * 0.5;
  const taxAmount = taxAndPrep * 0.5;

  // 6. Net profit
  const netProfit = resellPrice - amazonFees - taxAndPrep - finalCost;

  // 7. ROI
  const roi = finalCost > 0 ? (netProfit / finalCost) * 100 : 0;

  return {
    finalCost,
    totalDiscounts,
    amazonFees,
    prepFee,
    taxAmount,
    netProfit,
    roi,
    qualifies: roi > 30,
  };
}

export function estimateAmazonFees(resellPrice: number, category: string): number {
  const referralRate = REFERRAL_FEES[category] ?? REFERRAL_FEES['default'];
  const referralFee = resellPrice * referralRate;
  const fbaFee = FBA_BASE_FEE + FBA_WEIGHT_FEE_PER_LB;
  return referralFee + fbaFee;
}
