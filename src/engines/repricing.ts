import type { RepricingInput, RepricingResult } from '@/types';
import { calculateProfitability } from './profitability';

export function calculateReprice(input: RepricingInput): RepricingResult {
  const { costBasis, currentPrice, buyBoxPrice, fbaSellers, minRoi, minProfit, strategy, floorPrice: manualFloor } = input;

  // Find the minimum viable price that still clears Min ROI + Min Profit
  let roiFloor = costBasis;
  const searchCeiling = Math.max(buyBoxPrice * 2, currentPrice * 2, costBasis * 3);
  for (let price = costBasis; price <= searchCeiling; price += 0.01) {
    const result = calculateProfitability({
      sourcePrice: costBasis,
      discounts: [],
      resellPrice: price,
      category: 'default',
      prepFee: 0,
    });
    if (result.roi >= minRoi && result.profit >= minProfit) {
      roiFloor = price;
      break;
    }
  }
  roiFloor = Math.round(roiFloor * 100) / 100;

  // Effective floor = the higher of the ROI-based floor and the manual floor.
  // The manual floor lets the user set a hard price ceiling-down they never cross,
  // while the ROI floor protects them if their manual floor is set too low.
  const floorPrice = Math.max(roiFloor, manualFloor ?? 0);

  let recommendedPrice = currentPrice;
  let direction: 'UP' | 'DOWN' | 'HOLD' = 'HOLD';
  let riskScore = 50;
  let reason = 'No action needed';

  // Describe which floor is binding, for clearer reason text.
  const floorLabel = (manualFloor ?? 0) >= roiFloor && (manualFloor ?? 0) > 0
    ? `manual floor $${floorPrice.toFixed(2)}`
    : `${minRoi}% ROI floor`;

  if (strategy === 'FLOOR') {
    // Always price at floor
    recommendedPrice = floorPrice;
    direction = currentPrice > floorPrice ? 'DOWN' : currentPrice < floorPrice ? 'UP' : 'HOLD';
    reason = `Pricing at ${floorLabel}`;
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
        reason = `Buy box below your floor — holding at ${floorLabel}`;
        riskScore = 60;
      }
    }
  }

  // Prevent going below floor under any strategy
  if (recommendedPrice < floorPrice) {
    recommendedPrice = floorPrice;
    reason = `Price protected at ${floorLabel}`;
    riskScore = Math.max(riskScore, 30);
  }

  // Derive direction from the actual move so it can never disagree with the
  // recommended price. This matters when the current price sits BELOW the floor:
  // the recommendation (raise to floor) must read as UP, not HOLD, or it would
  // never surface as an actionable proposal. The per-branch direction above only
  // shapes the reason text.
  const finalPrice = Math.round(recommendedPrice * 100) / 100;
  const EPS = 0.005;
  if      (finalPrice > currentPrice + EPS) direction = 'UP';
  else if (finalPrice < currentPrice - EPS) direction = 'DOWN';
  else                                      direction = 'HOLD';

  return {
    recommendedPrice: finalPrice,
    direction,
    riskScore,
    reason,
  };
}
