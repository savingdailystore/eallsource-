import type { RepricingInput, RepricingResult } from '@/types';
import { calculateProfitability } from './profitability';

export function calculateReprice(input: RepricingInput): RepricingResult {
  const { costBasis, currentPrice, buyBoxPrice, fbaSellers, minRoi, minProfit, strategy } = input;

  // Calculate floor price — never go below break-even + min ROI
  const { profit: profitAtCurrent } = calculateProfitability({
    sourcePrice: costBasis,
    discounts: [],
    resellPrice: currentPrice,
    category: 'default',
    prepFee: 0,
  });

  // Find the minimum viable price
  let floorPrice = costBasis;
  for (let price = costBasis; price <= buyBoxPrice * 2; price += 0.01) {
    const result = calculateProfitability({
      sourcePrice: costBasis,
      discounts: [],
      resellPrice: price,
      category: 'default',
      prepFee: 0,
    });
    if (result.roi >= minRoi && result.profit >= minProfit) {
      floorPrice = price;
      break;
    }
  }
  floorPrice = Math.round(floorPrice * 100) / 100;

  let recommendedPrice = currentPrice;
  let direction: 'UP' | 'DOWN' | 'HOLD' = 'HOLD';
  let riskScore = 50;
  let reason = 'No action needed';

  if (strategy === 'FLOOR') {
    // Always price at floor
    recommendedPrice = floorPrice;
    direction = currentPrice > floorPrice ? 'DOWN' : currentPrice < floorPrice ? 'UP' : 'HOLD';
    reason = `Pricing at floor (${minRoi}% ROI minimum)`;
    riskScore = 20;
  } else if (strategy === 'CEILING') {
    // Price at buy box or slightly above
    recommendedPrice = Math.min(buyBoxPrice * 1.02, buyBoxPrice + 2);
    direction = recommendedPrice > currentPrice ? 'UP' : recommendedPrice < currentPrice ? 'DOWN' : 'HOLD';
    reason = 'Pricing near buy box ceiling';
    riskScore = 30;
  } else {
    // COMPETITIVE — try to win buy box without a price war
    if (buyBoxPrice > 0) {
      const target = buyBoxPrice * 0.995; // 0.5% below buy box
      if (target >= floorPrice) {
        recommendedPrice = Math.round(target * 100) / 100;
        if (fbaSellers > 10) {
          // Too competitive — hold or move to floor
          recommendedPrice = currentPrice;
          reason = 'High competition — holding price to avoid price war';
          riskScore = 70;
        } else {
          direction = recommendedPrice < currentPrice ? 'DOWN' : recommendedPrice > currentPrice ? 'UP' : 'HOLD';
          reason = `Competing at ${(0.5).toFixed(1)}% below buy box`;
          riskScore = 40;
        }
      } else {
        // Target price below floor — can't compete, hold at floor
        recommendedPrice = floorPrice;
        direction = currentPrice > floorPrice ? 'DOWN' : 'HOLD';
        reason = `Buy box too low — pricing at ${minRoi}% ROI floor`;
        riskScore = 60;
      }
    }
  }

  // Prevent going below floor under any strategy
  if (recommendedPrice < floorPrice) {
    recommendedPrice = floorPrice;
    direction = 'UP';
    reason = `Price protected at ${minRoi}% ROI floor`;
    riskScore = Math.max(riskScore, 30);
  }

  return {
    recommendedPrice: Math.round(recommendedPrice * 100) / 100,
    direction,
    riskScore,
    reason,
  };
}
