import type { SellerListing, RepricingStrategy, PricingDecision, RepricerRule } from '@/types';

// ─── strategy implementations ─────────────────────────────────────────────────

function winBuyBox(listing: SellerListing, rule: Pick<RepricerRule, 'minPrice' | 'maxPrice'>): PricingDecision {
  const { buyBoxPrice, buyBoxStatus, currentPrice, lowestFbaPrice } = listing;

  if (buyBoxStatus === 'SELF') {
    // We own it — test a small price increase to squeeze more margin
    const raised = Math.min(currentPrice * 1.02, rule.maxPrice);
    if (raised > currentPrice + 0.01) {
      return {
        recommendedPrice: round(raised),
        action: 'INCREASE',
        reason: `We own the Buy Box — AI testing +2% price lift to $${round(raised).toFixed(2)}`,
        confidence: 78,
        estimatedBuyBoxOdds: 88,
      };
    }
    return { recommendedPrice: currentPrice, action: 'HOLD', reason: 'We own the Buy Box at maximum price', confidence: 92, estimatedBuyBoxOdds: 90 };
  }

  if (buyBoxStatus === 'AMAZON') {
    // Amazon owns it — can't compete directly; hold at floor to protect margin
    const floor = Math.max(rule.minPrice, currentPrice);
    return {
      recommendedPrice: round(floor),
      action: currentPrice > floor ? 'DECREASE' : 'HOLD',
      reason: 'Amazon owns the Buy Box — holding floor price to protect margin',
      confidence: 95,
      estimatedBuyBoxOdds: 5,
    };
  }

  // Another seller owns it — undercut by $0.01 within bounds
  const reference = buyBoxPrice ?? lowestFbaPrice ?? currentPrice;
  const target = Math.max(reference - 0.01, rule.minPrice);

  if (target < rule.minPrice) {
    return {
      recommendedPrice: rule.minPrice,
      action: currentPrice > rule.minPrice ? 'DECREASE' : 'HOLD',
      reason: `Buy Box at $${reference.toFixed(2)} — floor price applied to protect margin`,
      confidence: 88,
      estimatedBuyBoxOdds: 20,
    };
  }

  const action = target < currentPrice ? 'DECREASE' : target > currentPrice ? 'INCREASE' : 'HOLD';
  return {
    recommendedPrice: round(target),
    action,
    reason: `Undercutting ${buyBoxStatus === 'OTHER_FBA' ? 'FBA' : 'FBM'} Buy Box holder by $0.01 → $${round(target).toFixed(2)}`,
    confidence: 91,
    estimatedBuyBoxOdds: 82,
  };
}

function maximizeProfit(listing: SellerListing, rule: Pick<RepricerRule, 'minPrice' | 'maxPrice' | 'targetMargin'>): PricingDecision {
  const { salesRank, buyBoxStatus, buyBoxPrice, currentPrice } = listing;

  // Velocity score: lower BSR = faster sales = can push price higher
  const velocityScore = salesRank
    ? salesRank < 2000 ? 1.0
    : salesRank < 5000 ? 0.75
    : salesRank < 10000 ? 0.5
    : 0.3
    : 0.5;

  if (buyBoxStatus === 'SELF') {
    if (velocityScore >= 0.75) {
      // Hot item — raise price
      const raised = Math.min(currentPrice * (1 + 0.05 * velocityScore), rule.maxPrice);
      if (raised > currentPrice + 0.05) {
        return {
          recommendedPrice: round(raised),
          action: 'INCREASE',
          reason: `High-velocity item (BSR #${salesRank?.toLocaleString()}) — AI raising price to maximize profit`,
          confidence: Math.round(70 + velocityScore * 20),
          estimatedBuyBoxOdds: 80,
        };
      }
    }
    return { recommendedPrice: currentPrice, action: 'HOLD', reason: 'Holding price — profit-to-velocity ratio is optimal', confidence: 82, estimatedBuyBoxOdds: 85 };
  }

  // Don't own buy box — need to win it first, then optimize
  const reference = buyBoxPrice ?? currentPrice;
  const target = Math.max(reference - 0.01, rule.minPrice);
  return {
    recommendedPrice: round(target),
    action: target < currentPrice ? 'DECREASE' : 'HOLD',
    reason: `Winning Buy Box at $${round(target).toFixed(2)} to establish pricing position`,
    confidence: 75,
    estimatedBuyBoxOdds: 70,
  };
}

function stayCompetitive(listing: SellerListing, rule: Pick<RepricerRule, 'minPrice' | 'maxPrice'>): PricingDecision {
  const { lowestFbaPrice, buyBoxPrice, currentPrice, buyBoxStatus } = listing;
  const reference = lowestFbaPrice ?? buyBoxPrice ?? currentPrice;
  const target = Math.max(reference, rule.minPrice);

  if (Math.abs(target - currentPrice) < 0.01) {
    return { recommendedPrice: currentPrice, action: 'HOLD', reason: 'Already matching the lowest FBA price', confidence: 90, estimatedBuyBoxOdds: buyBoxStatus === 'SELF' ? 88 : 45 };
  }

  const action = target < currentPrice ? 'DECREASE' : 'INCREASE';
  return {
    recommendedPrice: round(target),
    action,
    reason: `Matching lowest FBA price of $${reference.toFixed(2)} to stay competitive`,
    confidence: 88,
    estimatedBuyBoxOdds: 55,
  };
}

function floorPrice(listing: SellerListing, rule: Pick<RepricerRule, 'minPrice'>): PricingDecision {
  const action = listing.currentPrice > rule.minPrice ? 'DECREASE' : listing.currentPrice < rule.minPrice ? 'INCREASE' : 'HOLD';
  return {
    recommendedPrice: rule.minPrice,
    action,
    reason: `Floor price strategy — holding minimum $${rule.minPrice.toFixed(2)} to protect margin`,
    confidence: 99,
    estimatedBuyBoxOdds: listing.buyBoxStatus === 'SELF' ? 90 : 15,
  };
}

// ─── public entry point ───────────────────────────────────────────────────────

export function runPricingEngine(
  listing: SellerListing,
  rule: Pick<RepricerRule, 'minPrice' | 'maxPrice' | 'strategy' | 'targetMargin'>,
): PricingDecision {
  switch (rule.strategy as RepricingStrategy) {
    case 'WIN_BUY_BOX':      return winBuyBox(listing, rule);
    case 'MAXIMIZE_PROFIT':  return maximizeProfit(listing, rule);
    case 'STAY_COMPETITIVE': return stayCompetitive(listing, rule);
    case 'FLOOR_PRICE':      return floorPrice(listing, rule);
    default:                 return winBuyBox(listing, rule);
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
