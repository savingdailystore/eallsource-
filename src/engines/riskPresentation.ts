// Improved Risk Presentation (Phase 1, Feature 4).
//
// This is a categorization/explanation layer, not a new risk calculator —
// every level below is derived from fields the gating engine (gating.ts) and
// pipeline already computed. Each category carries a plain-language reason
// tied to the real field that produced it.

import type { RiskPresentationInput, RiskBreakdown, RiskCategory, RiskLevel } from '@/types';

const SEVERITY: Record<RiskLevel, number> = { VERY_LOW: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
const maxLevel = (a: RiskLevel, b: RiskLevel): RiskLevel => (SEVERITY[a] >= SEVERITY[b] ? a : b);

function pricingRisk(input: RiskPresentationInput): RiskCategory {
  if (input.priceStability === 'VOLATILE') {
    return { category: 'Pricing', level: 'HIGH', reason: 'Buy Box price has been volatile over the recorded history' };
  }
  if (input.priceTrend === 'DECLINING') {
    return { category: 'Pricing', level: 'MEDIUM', reason: 'Buy Box price has been trending downward' };
  }
  if (input.priceStability === 'STABLE') {
    return { category: 'Pricing', level: 'VERY_LOW', reason: 'Buy Box price has held steady' };
  }
  return { category: 'Pricing', level: 'MEDIUM', reason: 'Not enough price history yet to judge stability' };
}

function competitionRisk(input: RiskPresentationInput): RiskCategory {
  const n = input.totalSellers;
  if (n <= 2)  return { category: 'Competition', level: 'VERY_LOW', reason: `Only ${n} active seller(s)` };
  if (n <= 5)  return { category: 'Competition', level: 'LOW',      reason: `${n} active sellers` };
  if (n <= 10) return { category: 'Competition', level: 'MEDIUM',   reason: `${n} active sellers` };
  return           { category: 'Competition', level: 'HIGH',     reason: `${n} active sellers — crowded listing` };
}

function amazonRisk(input: RiskPresentationInput): RiskCategory {
  if (input.amazonIsSeller && !input.buyBoxSuppressed) {
    return { category: 'Amazon', level: 'HIGH', reason: 'Amazon is currently selling and holding the Buy Box' };
  }
  if (input.amazonIsSeller && input.buyBoxSuppressed) {
    return { category: 'Amazon', level: 'MEDIUM', reason: 'Amazon is listed as a seller, but the Buy Box is currently suppressed' };
  }
  if (input.amazonAbsentPct != null) {
    if (input.amazonAbsentPct >= 80) {
      return { category: 'Amazon', level: 'VERY_LOW', reason: `Amazon has been absent ${input.amazonAbsentPct}% of recorded history` };
    }
    return { category: 'Amazon', level: 'LOW', reason: `Amazon is not currently selling (absent ${input.amazonAbsentPct}% of recorded history)` };
  }
  return { category: 'Amazon', level: 'LOW', reason: 'Amazon is not currently selling this listing' };
}

function ipRisk(input: RiskPresentationInput): RiskCategory {
  if (input.isPrivateLabel) {
    return { category: 'IP', level: 'HIGH', reason: 'Amazon private-label brand — no buy box to win' };
  }
  if (input.isBrandRestricted) {
    return { category: 'IP', level: 'HIGH', reason: 'High-IP-enforcement brand' };
  }
  if (input.isGenericBrand) {
    return { category: 'IP', level: 'HIGH', reason: 'No real brand on file — higher counterfeit/IP-complaint exposure' };
  }
  if (input.ipRiskScore === 'MEDIUM') {
    return { category: 'IP', level: 'MEDIUM', reason: 'Mid-tier IP-enforcement brand' };
  }
  return { category: 'IP', level: 'LOW', reason: 'No known brand IP restrictions' };
}

function storageRisk(input: RiskPresentationInput): RiskCategory {
  if (input.hasHazmat) {
    return { category: 'Storage', level: 'HIGH', reason: 'Hazmat designation — requires special FBA handling/storage approval' };
  }
  if (input.isMeltable) {
    return { category: 'Storage', level: 'MEDIUM', reason: 'Temperature-sensitive item — melt risk in storage/transit during warm months' };
  }
  return { category: 'Storage', level: 'VERY_LOW', reason: 'No known storage restrictions' };
}

export function buildRiskBreakdown(input: RiskPresentationInput): RiskBreakdown {
  const categories = [
    pricingRisk(input),
    competitionRisk(input),
    amazonRisk(input),
    ipRisk(input),
    storageRisk(input),
  ];

  const overall = categories.reduce((acc, c) => maxLevel(acc, c.level), 'VERY_LOW' as RiskLevel);

  return { overall, categories };
}
