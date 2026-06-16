import type { ValidationResult } from '@/types';

interface ProductIdentity {
  upc?: string;
  ean?: string;
  model?: string;
  brand?: string;
  title: string;
}

interface ValidationInput {
  source: ProductIdentity;
  amazon: ProductIdentity;
  sourcePrice: number;
  amazonPrice: number;
  sourceInStock: boolean;
  sourceUrl: string;
  matchConfidence: number;
}

function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/);
  const wordsA = new Set(normalize(a));
  const wordsB = new Set(normalize(b));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? (intersection / union) * 100 : 0;
}

export function validateProduct(input: ValidationInput): ValidationResult {
  const reasons: string[] = [];

  // ── Identity confidence ───────────────────────────────────────────────────
  let identityScore = 0;
  if (input.source.upc && input.amazon.upc && input.source.upc === input.amazon.upc) {
    identityScore = 100;
  } else if (input.source.ean && input.amazon.ean && input.source.ean === input.amazon.ean) {
    identityScore = 100;
  } else if (
    input.source.model && input.amazon.model &&
    input.source.model.toLowerCase() === input.amazon.model.toLowerCase() &&
    input.source.brand?.toLowerCase() === input.amazon.brand?.toLowerCase()
  ) {
    identityScore = 97;
  } else {
    const similarity = titleSimilarity(input.source.title, input.amazon.title);
    identityScore = Math.min(95, similarity);
    if (similarity < 95) {
      reasons.push(`Title similarity only ${similarity.toFixed(1)}% (need ≥ 95%)`);
    }
  }

  // Match confidence from the matching engine
  if (input.matchConfidence < 70) {
    identityScore = Math.min(identityScore, input.matchConfidence);
    reasons.push(`Low match confidence: ${input.matchConfidence}%`);
  }

  // ── URL confidence (stub — would check HTTP 200 in real impl) ─────────────
  const urlScore = input.sourceUrl.startsWith('https://') ? 98 : 50;
  if (urlScore < 95) reasons.push('Source URL does not use HTTPS');

  // ── Price confidence ──────────────────────────────────────────────────────
  const priceVariance = input.amazonPrice > 0
    ? Math.abs(input.sourcePrice - input.amazonPrice) / input.amazonPrice * 100
    : 100;
  const priceScore = priceVariance <= 2 ? 100 : Math.max(0, 100 - priceVariance * 5);
  if (priceVariance > 2) {
    reasons.push(`Price variance ${priceVariance.toFixed(1)}% exceeds 2% threshold`);
  }

  // ── Inventory confidence ──────────────────────────────────────────────────
  const inventoryScore = input.sourceInStock ? 99 : 0;
  if (!input.sourceInStock) reasons.push('Item out of stock at source');

  // ── Final gate ────────────────────────────────────────────────────────────
  const passed =
    identityScore >= 95 &&
    urlScore      >= 95 &&
    priceScore    >= 95 &&
    inventoryScore >= 95;

  if (!passed && reasons.length === 0) {
    reasons.push('One or more confidence scores below 95%');
  }

  return { identityScore, urlScore, priceScore, inventoryScore, passed, reasons };
}
