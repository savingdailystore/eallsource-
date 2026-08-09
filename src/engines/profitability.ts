import type { Discount, ProfitabilityInput, ProfitabilityResult } from '@/types';

// System-wide fallback source tax rate. Used when no org-level or per-record
// rate is provided. Callers should pass taxRate explicitly so this constant
// is only a last-resort default, not a hidden global.
const DEFAULT_TAX_RATE = 0.0875;

// Referral fee rates by category (approximate)
const REFERRAL_RATES: Record<string, number> = {
  'Electronics':        0.08,
  'Home & Kitchen':     0.15,
  'Toys & Games':       0.15,
  'Health & Beauty':    0.15,
  'Sports & Outdoors':  0.15,
  'Office Products':    0.15,
  'Books':              0.15,
  'Video Games':        0.15,
  'Clothing':           0.17,
  'Baby':               0.15,
  'Pet Supplies':       0.15,
  'Grocery':            0.08,
  'default':            0.15,
};

// FBA fulfillment fee by approximate item size (simplified)
const FBA_FEE_TABLE: Array<{ maxWeight: number; fee: number }> = [
  { maxWeight: 0.5,  fee: 3.22  },
  { maxWeight: 1.0,  fee: 4.56  },
  { maxWeight: 2.0,  fee: 5.47  },
  { maxWeight: 3.0,  fee: 6.02  },
  { maxWeight: 5.0,  fee: 7.45  },
  { maxWeight: 10.0, fee: 9.73  },
  { maxWeight: 20.0, fee: 12.80 },
  { maxWeight: 999,  fee: 18.50 },
];

export function estimateFbaFee(weightLbs = 1.0): number {
  const entry = FBA_FEE_TABLE.find((e) => weightLbs <= e.maxWeight);
  return entry?.fee ?? 18.50;
}

export function estimateReferralFee(price: number, category: string): number {
  const rate = REFERRAL_RATES[category] ?? REFERRAL_RATES['default'];
  return Math.max(price * rate, 0.30);
}

export function calculateProfitability(input: ProfitabilityInput): ProfitabilityResult {
  const {
    sourcePrice,
    taxRate,
    sourceShipping = 0,
    discounts,
    resellPrice,
    category,
    prepFee        = 1.50,
    referralFeeRate,
    fbaFee: inputFbaFee,
    storageFee     = 0.50,
  } = input;

  // Resolve the effective tax rate once. Callers should pass this explicitly;
  // DEFAULT_TAX_RATE is the last-resort fallback so existing callers that
  // omit taxRate continue to produce identical numeric results.
  const effectiveTaxRate = taxRate ?? DEFAULT_TAX_RATE;

  // ── Final source cost ──────────────────────────────────────────────────
  const totalDiscount = discounts.reduce((sum, d) => sum + d.amount, 0);
  const finalCost     = Math.max(0, sourcePrice - totalDiscount);
  // sourceTax is no longer accepted as a separate dollar-amount input.
  // Tax is always computed from effectiveTaxRate below (counted exactly once).
  const totalLandedCost = finalCost + sourceShipping;

  // ── Amazon fees ────────────────────────────────────────────────────────
  // Treat a zero (or missing) referral rate as "no real data" — a 0% referral
  // fee never happens on Amazon, so it can only mean an empty fee response leaked
  // through. Fall back to the category estimate rather than charging nothing.
  const referralFee = referralFeeRate != null && referralFeeRate > 0
    ? resellPrice * referralFeeRate
    : estimateReferralFee(resellPrice, category);

  // When SP-API's real fee estimate isn't available, estimateFbaFee() assumes
  // the cheapest 1lb tier — fine for a typical small item, but it silently
  // understates cost for anything actually heavy/oversized. Track whether the
  // real fee was used so callers can flag unconfirmed estimates instead of
  // treating them as verified economics.
  // A real FBA fee is always > 0; a 0 here means no confirmed estimate came
  // through, so it's neither "confirmed" nor usable — fall back to the table.
  const feeEstimateConfirmed = inputFbaFee != null && inputFbaFee > 0;
  const fbaFee       = feeEstimateConfirmed ? inputFbaFee! : estimateFbaFee();
  // Sales tax is the tax YOU pay buying from the retailer (on the source cost),
  // not a cut of the resale price. The tax a customer pays on Amazon is
  // collected and remitted by Amazon — it is never the seller's cost.
  // taxAmount is computed exactly once from effectiveTaxRate — not from any
  // separate dollar-amount input — eliminating the prior double-count risk.
  const taxAmount    = finalCost * effectiveTaxRate;
  const amazonFees   = referralFee + fbaFee + storageFee;

  // ── Profitability ──────────────────────────────────────────────────────
  const fees   = amazonFees + prepFee + taxAmount;
  const profit = resellPrice - fees - totalLandedCost;
  const roi    = totalLandedCost > 0 ? (profit / totalLandedCost) * 100 : 0;
  const margin = resellPrice > 0     ? (profit / resellPrice) * 100     : 0;

  // Profit floor raised from $5 → $8: at $5, normal fee volatility or a $1
  // price drop wipes the margin entirely — too thin to be worth a warehouse slot.
  const qualifies = roi >= 30 && profit >= 8;

  return {
    finalCost,
    totalLandedCost,
    resellPrice,
    amazonFees,
    referralFee,
    fbaFee,
    storageFee,
    prepFee,
    taxAmount,
    profit,
    roi,
    margin,
    qualifies,
    feeEstimateConfirmed,
  };
}

export function totalDiscountAmount(discounts: Discount[]): number {
  return discounts.reduce((sum, d) => sum + d.amount, 0);
}
