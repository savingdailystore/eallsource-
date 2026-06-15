export interface ScoringInput {
  roi: number;
  netProfit: number;
  bsr?: number;
  fbaSellers: number;
  amazonOwnsBB: boolean;
  ipRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  isPrime?: boolean;
  reviewCount?: number;
  rating?: number;
}

export interface ScoreResult {
  score: number;      // 0–100
  breakdown: {
    roi: number;
    profit: number;
    velocity: number;
    competition: number;
    risk: number;
  };
  tier: 'HOT' | 'GOOD' | 'MARGINAL' | 'SKIP';
}

export function scoreLead(input: ScoringInput): ScoreResult {
  const breakdown = {
    roi: roiScore(input.roi),
    profit: profitScore(input.netProfit),
    velocity: velocityScore(input.bsr, input.reviewCount),
    competition: competitionScore(input.fbaSellers, input.amazonOwnsBB),
    risk: riskScore(input.ipRisk),
  };

  // Weighted sum: roi 30% | profit 20% | velocity 20% | competition 20% | risk 10%
  const raw =
    breakdown.roi * 0.30 +
    breakdown.profit * 0.20 +
    breakdown.velocity * 0.20 +
    breakdown.competition * 0.20 +
    breakdown.risk * 0.10;

  const score = Math.round(Math.max(0, Math.min(100, raw)));

  const tier: ScoreResult['tier'] =
    score >= 80 ? 'HOT' :
    score >= 60 ? 'GOOD' :
    score >= 40 ? 'MARGINAL' : 'SKIP';

  return { score, breakdown, tier };
}

function roiScore(roi: number): number {
  if (roi >= 80) return 100;
  if (roi >= 60) return 90;
  if (roi >= 50) return 80;
  if (roi >= 40) return 70;
  if (roi >= 30) return 55;
  if (roi >= 25) return 40;
  if (roi >= 15) return 20;
  return 0;
}

function profitScore(netProfit: number): number {
  if (netProfit >= 20) return 100;
  if (netProfit >= 15) return 85;
  if (netProfit >= 10) return 70;
  if (netProfit >= 7) return 55;
  if (netProfit >= 5) return 40;
  if (netProfit >= 3) return 20;
  return 0;
}

function velocityScore(bsr?: number, reviewCount?: number): number {
  let s = 50;

  if (bsr !== undefined) {
    if (bsr < 1_000) s = 100;
    else if (bsr < 5_000) s = 90;
    else if (bsr < 20_000) s = 78;
    else if (bsr < 50_000) s = 65;
    else if (bsr < 100_000) s = 50;
    else if (bsr < 300_000) s = 35;
    else s = 15;
  }

  // Boost for products with high review counts (proxy for sales volume)
  if (reviewCount && reviewCount > 10_000) s = Math.min(100, s + 10);
  else if (reviewCount && reviewCount > 1_000) s = Math.min(100, s + 5);

  return s;
}

function competitionScore(fbaSellers: number, amazonOwnsBB: boolean): number {
  if (amazonOwnsBB) return 5;  // Amazon wins buy box → very hard to win
  if (fbaSellers === 0) return 100;
  if (fbaSellers <= 2) return 90;
  if (fbaSellers <= 5) return 75;
  if (fbaSellers <= 8) return 60;
  if (fbaSellers <= 12) return 40;
  if (fbaSellers <= 18) return 20;
  return 5;
}

function riskScore(ipRisk: 'LOW' | 'MEDIUM' | 'HIGH'): number {
  if (ipRisk === 'LOW') return 100;
  if (ipRisk === 'MEDIUM') return 40;
  return 0;
}
