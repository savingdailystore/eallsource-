import type { ScoringInput } from '@/types';

// Weights per spec: ROI 40%, Demand 20%, Match Confidence 15%, Risk Inverse 15%, Price Stability 10%
const WEIGHTS = { roi: 0.40, demand: 0.20, match: 0.15, risk: 0.15, stability: 0.10 };

function roiScore(roi: number): number {
  if (roi >= 100) return 100;
  if (roi >= 60)  return 80 + (roi - 60) / 2;
  if (roi >= 30)  return 50 + ((roi - 30) / 30) * 30;
  return Math.max(0, roi * 1.5);
}

function demandScore(level: string): number {
  return level === 'HIGH' ? 100 : level === 'MEDIUM' ? 60 : 20;
}

function riskScore(risk: string): number {
  return risk === 'LOW' ? 100 : risk === 'MEDIUM' ? 50 : 0;
}

function stabilityScore(stability: string): number {
  return stability === 'STABLE' ? 100 : stability === 'VOLATILE' ? 20 : 50;
}

export function calculateScore(input: ScoringInput): number {
  const { roi, demandLevel, matchConfidence, gatingRisk, priceStability } = input;

  const score =
    WEIGHTS.roi       * roiScore(roi) +
    WEIGHTS.demand    * demandScore(demandLevel) +
    WEIGHTS.match     * Math.min(100, matchConfidence) +
    WEIGHTS.risk      * riskScore(gatingRisk) +
    WEIGHTS.stability * stabilityScore(priceStability);

  return Math.round(Math.max(0, Math.min(100, score)));
}

export function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'HOT',  color: 'text-green-600' };
  if (score >= 60) return { label: 'GOOD', color: 'text-orange-600' };
  if (score >= 40) return { label: 'MAR',  color: 'text-amber-600' };
  return              { label: 'SKIP', color: 'text-gray-400' };
}
