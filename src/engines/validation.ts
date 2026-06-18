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
  matchMethod?: string;   // how the ASIN was matched (UPC/EAN/BRAND_MODEL/TITLE_SIMILARITY)
}

// Minimum match confidence to accept a title-based ASIN match as a lead.
// Set high (precision over recall): wrong fuzzy matches tend to score 60-70,
// correct matches ~90, so a high bar filters dangerous false-positive leads
// (e.g. a single item mismatched to a multipack). UPC/EAN/model matches score
// 97-100 and always clear it. Lower this only if pairing with UPC matching.
const IDENTITY_MIN = 80;

export function validateProduct(input: ValidationInput): ValidationResult {
  const reasons: string[] = [];

  // ── Identity confidence ───────────────────────────────────────────────────
  // Exact identifiers are fully trusted; otherwise use the matching engine's
  // confidence (title containment) — the same signal used to pick the ASIN.
  // Identity is driven by HOW the ASIN was matched. A UPC/EAN match means the
  // ASIN was found *by* the barcode lookup, so it's exact and fully trusted.
  // We can't compare source.upc to a real Amazon UPC here (the pipeline never
  // fetches it — amazon.upc is just a copy of source.upc), so identity must key
  // off matchMethod, NOT identifier equality. Everything else (title /
  // brand-model) uses the match confidence and the brand-mismatch guard.
  let identityScore = 0;
  if (input.matchMethod === 'UPC' || input.matchMethod === 'EAN') {
    identityScore = 100;
  } else {
    identityScore = input.matchConfidence;

    // Brand-mismatch guard: spec-heavy titles (air conditioners, furniture)
    // can score high containment across DIFFERENT brands. If both brands are
    // known and clearly differ (no substring overlap), it's almost certainly
    // the wrong product — cap identity below the pass bar. When the source
    // brand field is empty, fall back to the first title token (these listings
    // typically lead with the brand, e.g. "KISSAIR Portable Air Conditioner").
    const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const firstToken = (input.source.title ?? '').trim().split(/\s+/)[0] ?? '';
    const sb = norm(input.source.brand) || norm(firstToken);
    const ab = norm(input.amazon.brand);
    const sourceBrandShown = input.source.brand || firstToken;
    if (sb.length > 2 && ab.length > 2 && !sb.includes(ab) && !ab.includes(sb)) {
      identityScore = Math.min(identityScore, 40);
      reasons.push(`Brand mismatch: source "${sourceBrandShown}" vs Amazon "${input.amazon.brand}"`);
    }
  }
  if (identityScore < IDENTITY_MIN) {
    reasons.push(`Match confidence ${identityScore}% (need ≥ ${IDENTITY_MIN}%)`);
  }

  // ── URL confidence (stub — would check HTTP 200 in real impl) ─────────────
  const urlScore = input.sourceUrl.startsWith('https://') ? 98 : 50;
  if (urlScore < 95) reasons.push('Source URL does not use HTTPS');

  // ── Price sanity (wrong-match guard, NOT a same-price requirement) ────────
  // Arbitrage REQUIRES Amazon price > source price, so a price gap is expected
  // and must not be penalised. We only flag ratios extreme enough to suggest a
  // mismatched product (e.g. a $30 item matched to a $500 listing).
  let priceScore = 100;
  if (input.amazonPrice <= 0) {
    priceScore = 0;
    reasons.push('No Amazon price available');
  } else if (input.sourcePrice > 0) {
    const ratio = input.amazonPrice / input.sourcePrice;
    if (ratio < 0.5 || ratio > 8) {
      priceScore = 50;
      reasons.push(`Amazon/source price ratio ${ratio.toFixed(1)}x looks implausible — possible wrong match`);
    }
  }

  // ── Inventory confidence ──────────────────────────────────────────────────
  const inventoryScore = input.sourceInStock ? 99 : 0;
  if (!input.sourceInStock) reasons.push('Item out of stock at source');

  // ── Final gate ────────────────────────────────────────────────────────────
  const passed =
    identityScore  >= IDENTITY_MIN &&
    urlScore       >= 95 &&
    priceScore     >= 70 &&
    inventoryScore >= 95;

  if (!passed && reasons.length === 0) {
    reasons.push('One or more confidence checks failed');
  }

  return { identityScore, urlScore, priceScore, inventoryScore, passed, reasons };
}
