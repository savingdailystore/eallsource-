/**
 * Lead pipeline: takes a raw retailer product through the full engine stack
 * and either creates a qualified Lead in the DB or returns the rejection reason.
 *
 * Flow:
 *   RetailerProduct
 *     → match Amazon ASIN (SP-API catalog, then Keepa fallback)
 *     → get market data (SP-API pricing + Keepa)
 *     → calculate profitability
 *     → assess gating risk
 *     → assess demand (BSR)
 *     → validate all scores ≥ 95%
 *     → score the lead
 *     → upsert Product + upsert Lead
 */

import { prisma } from '@/lib/prisma';
import { getKeepaData } from '@/lib/keepa';
import { getProductData, searchCatalogByUpc, searchCatalogByEan, searchCatalogByKeywords, getFeeEstimate } from '@/lib/amazon';
import { calculateProfitability } from '@/engines/profitability';
import { assessGating } from '@/engines/gating';
import { assessDemand, bsrToPercentile } from '@/engines/demand';
import { validateProduct } from '@/engines/validation';
import { calculateScore } from '@/engines/scoring';
import type { RetailerProduct, AmazonMatch } from '@/types';

// Minimum Amazon resale price for a lead to be worth sourcing. Below this, fees
// eat the margin and the per-unit labor isn't worth it.
const MIN_RESALE_PRICE = 12;
// Review count below which a listing reads as new/unestablished (hijack &
// counterfeit-bait risk, no proven demand). Informational flag, not a gate.
const LOW_REVIEW_THRESHOLD = 3;

export type PipelineResult =
  | { outcome: 'lead_created';      leadId: string; score: number }
  | { outcome: 'lead_updated';      leadId: string; score: number }
  | { outcome: 'no_match' }
  | { outcome: 'no_amazon_data' }
  | { outcome: 'no_pricing_data' }
  | { outcome: 'validation_failed'; reasons: string[] }
  | { outcome: 'not_profitable';    roi: number; profit: number }
  | { outcome: 'demand_too_low';    bsr: number }
  | { outcome: 'velocity_too_low';  expectedUnits: number }
  | { outcome: 'price_too_low';     resellPrice: number }
  | { outcome: 'amazon_sells_it' }
  | { outcome: 'no_buybox' }
  | { outcome: 'price_unstable' }
  | { outcome: 'price_declining';   trendPct: number }
  | { outcome: 'private_label' }
  | { outcome: 'hazmat' }
  | { outcome: 'generic_brand' }
  | { outcome: 'ip_complaint_history' }
  | { outcome: 'error';             message: string };

export interface ProcessOptions {
  // When the ASIN is already known (e.g. manual entry from an Amazon link),
  // skip auto-matching and use it directly.
  knownAsin?: string;
  // When true, compute everything but never reject — always create the lead.
  // Used for manual owner entry where the product was deliberately chosen.
  force?: boolean;
  // Free-text sourcing notes to attach to the product (manual entry).
  notes?: string;
}

export async function processRetailerProduct(
  product: RetailerProduct,
  orgId: string,
  opts: ProcessOptions = {},
): Promise<PipelineResult> {
  try {
    // ── 1. Find Amazon ASIN (or use the one provided) ─────────────────────────
    const match: AmazonMatch | null = opts.knownAsin
      ? { asin: opts.knownAsin, amazonUrl: `https://www.amazon.com/dp/${opts.knownAsin}`, matchMethod: 'MANUAL', matchConfidence: 100 }
      : await findMatch(product, orgId);
    if (!match) return { outcome: 'no_match' };

    const { asin, amazonUrl, matchMethod, matchConfidence } = match;

    // Real IP-complaint history gate — checked across ALL orgs since this is a
    // confirmed fact about the ASIN itself, not org-specific. Once an owner has
    // marked an ASIN this way (after an actual takedown/complaint), it's
    // permanently blocked everywhere — never bypassed, even by force, since
    // this is verified risk rather than a heuristic guess.
    const flaggedAsin = await prisma.product.findFirst({
      where:  { asin, hasIpComplaintHistory: true },
      select: { id: true },
    });
    if (flaggedAsin) return { outcome: 'ip_complaint_history' };

    // ── 2. Get market data ────────────────────────────────────────────────────
    // Try SP-API first (requires connected cred), fall back to Keepa
    const [spData, keepaData] = await Promise.allSettled([
      getProductData(orgId, asin).catch(() => null),
      getKeepaData(asin),
    ]);

    const sp    = spData.status    === 'fulfilled' ? spData.value    : null;
    const keepa = keepaData.status === 'fulfilled' ? keepaData.value : null;

    // Merge: SP-API takes precedence, Keepa fills gaps
    const amazonTitle    = sp?.title    ?? keepa?.title    ?? product.title;
    const amazonBrand    = sp?.brand    ?? keepa?.brand    ?? product.brand;
    const amazonCategory = sp?.category ?? keepa?.category ?? product.category;
    const imageUrl       = sp?.imageUrl ?? keepa?.imageUrl ?? product.imageUrl;
    const bsr            = sp?.bsr      ?? keepa?.bsr;
    const buyBoxPrice    = sp?.buyBoxPrice   ?? keepa?.buyBoxPrice;
    const lowestFbaPrice = sp?.lowestFbaPrice ?? keepa?.lowestNewPrice;
    const fbaSellers     = sp?.fbaSellers    ?? keepa?.fbaSellers    ?? 0;
    const totalSellers   = sp?.totalSellers  ?? keepa?.totalSellers  ?? 0;
    const amazonIsSeller = sp?.amazonIsSeller ?? keepa?.amazonIsSeller ?? false;
    const monthlySales   = keepa?.monthlySales; // velocity signal (Keepa only)
    const isVariation    = sp?.isVariation ?? keepa?.isVariation ?? false;
    const parentAsin     = sp?.parentAsin  ?? keepa?.parentAsin;
    const rating         = keepa?.rating;       // Keepa only
    const reviewCount    = keepa?.reviewCount;  // Keepa only
    const priceStability = keepa?.priceStability ?? 'UNKNOWN';
    const priceTrend     = keepa?.priceTrend ?? 'UNKNOWN'; // directional (Keepa only)
    const priceTrendPct  = keepa?.priceTrendPct;
    const keepaLink      = keepa?.keepaLink;

    // Manual entries must come back with real Amazon data. Without a resell price
    // the economics are fiction and the lead would be a shell (blank title, fake
    // ROI), so reject rather than persist garbage. Scans aren't affected — they
    // reach here only after a successful match and tolerate sparse data.
    if (opts.knownAsin && buyBoxPrice == null && lowestFbaPrice == null) {
      return { outcome: 'no_amazon_data' };
    }

    // Scans likewise can't be assessed without an Amazon resale price. Before,
    // resellPrice silently fell back to the SOURCE price, making profit = -fees
    // and burying a data gap as a bogus "not profitable" verdict. Surface it as
    // its own outcome so missing pricing is distinguishable from real thin spread.
    if (buyBoxPrice == null && lowestFbaPrice == null) {
      return { outcome: 'no_pricing_data' };
    }

    const resellPrice = lowestFbaPrice ?? buyBoxPrice ?? product.price;
    const category    = amazonCategory ?? product.category ?? 'Other';

    // Minimum resale-price floor: sub-$12 ASP items rarely clear the profit
    // floor after fees, and the per-unit labor (prep, ship, manage) isn't worth
    // it even when they do. Hard reject.
    if (!opts.force && resellPrice < MIN_RESALE_PRICE) {
      return { outcome: 'price_too_low', resellPrice };
    }

    // Buy box suppression: there are live offers but no buy box winner. Computed
    // from the merged data so it holds regardless of which source answered.
    const buyBoxSuppressed = buyBoxPrice == null && totalSellers > 0;

    // Amazon-as-seller gate: when Amazon itself holds the buy box, third-party
    // sellers rarely win it — the listed margin almost never converts to real
    // sales, so this is a hard reject rather than just a display flag.
    if (!opts.force && amazonIsSeller) {
      return { outcome: 'amazon_sells_it' };
    }

    // No-buy-box gate: a suppressed buy box means no one-click "Buy Now" for
    // customers — conversion craters, so the listed economics are misleading.
    if (!opts.force && buyBoxSuppressed) {
      return { outcome: 'no_buybox' };
    }

    // Price-stability gate: a crashing/volatile price history is one of the
    // more predictive "don't buy" signals — a margin computed off today's
    // snapshot price is unreliable if the price has been swinging.
    if (!opts.force && priceStability === 'VOLATILE') {
      return { outcome: 'price_unstable' };
    }

    // Price-trend gate: a steadily declining buy box price (race to the bottom)
    // means today's margin erodes over your sell-through window — distinct from
    // volatility, which is noise rather than direction.
    if (!opts.force && priceTrend === 'DECLINING') {
      return { outcome: 'price_declining', trendPct: priceTrendPct ?? 0 };
    }

    // ── 3. Demand gate (BSR top 6%, not oversaturated, enough velocity per seller) ──
    const demandResult = assessDemand({ bsr: bsr ?? 999999, category, fbaSellers, totalSellers, monthlySales });
    // Velocity reject gets its own outcome so it's distinguishable from a plain
    // weak-BSR rejection in the scan stats.
    if (!opts.force && demandResult.velocityTooLow) {
      return { outcome: 'velocity_too_low', expectedUnits: demandResult.expectedUnitsPerSeller ?? 0 };
    }
    if (!opts.force && demandResult.level === 'LOW' && bsr != null) {
      return { outcome: 'demand_too_low', bsr };
    }

    // ── 4. Gating risk ────────────────────────────────────────────────────────
    const gatingResult = assessGating({
      title:  product.title,
      brand:  product.brand   ?? amazonBrand,
      category,
      hasHazmat: false,
    });

    // Private-label gate: Amazon's own brands have no buy box to win — a hard
    // reject, not just a risk flag, since the lead can never actually be sold.
    if (!opts.force && gatingResult.isPrivateLabel) {
      return { outcome: 'private_label' };
    }

    // Hazmat / dangerous goods gate: requires special FBA approval/handling —
    // rarely worth it for arbitrage, hard reject.
    if (!opts.force && gatingResult.hasHazmat) {
      return { outcome: 'hazmat' };
    }

    // Generic/unbranded gate: no real manufacturer backing the listing means
    // higher IP-complaint exposure and unreliable supply — hard reject.
    if (!opts.force && gatingResult.isGenericBrand) {
      return { outcome: 'generic_brand' };
    }

    // ── 5. Get real fee data if SP-API is connected ───────────────────────────
    let referralFee: number | undefined;
    let fbaFee: number | undefined;

    if (resellPrice > 0) {
      const feeData = await getFeeEstimate(orgId, asin, resellPrice).catch(() => null);
      if (feeData) {
        referralFee = feeData.referralFee;
        fbaFee      = feeData.fbaFee;
      }
    }

    // ── 6. Profitability ──────────────────────────────────────────────────────
    const profitResult = calculateProfitability({
      sourcePrice:   product.price,
      discounts:     [],
      resellPrice,
      category,
      referralFeeRate: referralFee != null ? referralFee / resellPrice : undefined,
      fbaFee,
    });

    if (!opts.force && !profitResult.qualifies) {
      return { outcome: 'not_profitable', roi: profitResult.roi, profit: profitResult.profit };
    }

    // Too-good-to-be-true ROI: an implausibly high ROI is usually a bad match
    // (a single item paired to a multipack listing, or the wrong ASIN) rather
    // than a real goldmine. We FLAG rather than reject — genuine clearance finds
    // exist — but the bar is lower for non-barcode matches, which are where
    // mismatches actually happen. Barcode (UPC/EAN) matches are exact, so only
    // a truly extreme ROI is worth a second look there.
    const isBarcodeMatch = matchMethod === 'UPC' || matchMethod === 'EAN';
    const roiImplausibleThreshold = isBarcodeMatch ? 400 : 200;
    const roiImplausible = profitResult.roi >= roiImplausibleThreshold;

    // Low-reviews flag: an established listing has a review track record; very
    // few reviews can mean a brand-new or hijacked/counterfeit-prone listing.
    // Informational only — new listings can still be legitimate opportunities.
    const lowReviews = reviewCount != null && reviewCount < LOW_REVIEW_THRESHOLD;

    // ── 7. Validation ─────────────────────────────────────────────────────────
    const validationResult = validateProduct({
      source: {
        title: product.title,
        upc:   product.upc,
        ean:   product.ean,
        brand: product.brand,
        model: product.model,
      },
      amazon: {
        title: amazonTitle,
        upc:   product.upc,
        ean:   product.ean,
        brand: amazonBrand,
        model: product.model,
      },
      sourcePrice:     product.price,
      amazonPrice:     buyBoxPrice ?? resellPrice,
      sourceInStock:   product.inStock,
      sourceUrl:       product.url,
      matchConfidence,
      matchMethod,
    });

    if (!opts.force && !validationResult.passed) {
      return { outcome: 'validation_failed', reasons: validationResult.reasons };
    }

    // ── 8. Lead score ─────────────────────────────────────────────────────────
    const score = calculateScore({
      roi:            profitResult.roi,
      demandLevel:    demandResult.level,
      matchConfidence,
      gatingRisk:     gatingResult.risk,
      priceStability,
    });

    // ── 9. Persist Product + Lead ─────────────────────────────────────────────
    const bsrPercentage = bsr != null ? bsrToPercentile(bsr, category) : undefined;
    const ipRiskScore   = gatingResult.risk;

    const productData = {
      orgId,
      asin,
      upc:              product.upc,
      ean:              product.ean,
      model:            product.model,
      brand:            product.brand ?? amazonBrand,
      title:            product.title?.trim() || amazonTitle,
      category,
      imageUrl,

      sourceUrl:        product.url,
      sourceRetailer:   product.retailer,
      sourcePrice:      product.price,
      sourceListPrice:  product.listPrice ?? null,
      onSale:           product.onSale ?? null,

      amazonUrl,
      buyBoxPrice,
      lowestFbaPrice,
      estimatedResellPrice: resellPrice,

      finalCost:        profitResult.finalCost,
      totalLandedCost:  profitResult.totalLandedCost,
      amazonFees:       profitResult.amazonFees,
      referralFee:      profitResult.referralFee,
      fbaFee:           profitResult.fbaFee,
      storageFee:       profitResult.storageFee,
      prepFee:          profitResult.prepFee,
      taxAmount:        profitResult.taxAmount,

      price:            resellPrice,
      fees:             profitResult.amazonFees,
      profit:           profitResult.profit,
      roi:              profitResult.roi,
      margin:           profitResult.margin,

      bsr,
      bsrPercentage,
      fbaSellers,
      totalSellers,
      monthlySales:            demandResult.monthlySales ?? null,
      expectedUnitsPerSeller:  demandResult.expectedUnitsPerSeller ?? null,
      amazonIsSeller,
      amazonOwnsBuyBox: amazonIsSeller,
      buyBoxSuppressed,
      buyBoxOwner:      buyBoxSuppressed ? 'None (suppressed)' : amazonIsSeller ? 'Amazon' : 'Third-party',

      matchMethod,
      matchConfidence,
      identityScore:    validationResult.identityScore,
      urlScore:         validationResult.urlScore,
      priceScore:       validationResult.priceScore,
      inventoryScore:   validationResult.inventoryScore,
      validationPassed: validationResult.passed,

      autoUngated:      gatingResult.autoUngated,
      ipRiskScore,
      gatingRisk:       gatingResult.risk,
      hasHazmat:        gatingResult.hasHazmat,
      isBrandRestricted: gatingResult.isBrandRestricted,
      isCategoryGated:  gatingResult.isCategoryGated,
      isPrivateLabel:   gatingResult.isPrivateLabel,
      isGenericBrand:   gatingResult.isGenericBrand,
      isMeltable:       gatingResult.isMeltable,
      feeEstimateConfirmed: profitResult.feeEstimateConfirmed,

      demandLevel:      demandResult.level,
      priceStability:   priceStability,
      priceTrend:       priceTrend,
      priceTrendPct:    priceTrendPct ?? null,
      isVariation,
      parentAsin:       parentAsin ?? null,
      roiImplausible,
      rating:           rating ?? null,
      reviewCount:      reviewCount ?? null,
      lowReviews,
      keepaLink,
      notes:            opts.notes?.trim() || null,
      score,
    };

    // Upsert product keyed on the composite unique [orgId, asin]
    const savedProduct = await prisma.product.upsert({
      where:  { orgId_asin: { orgId, asin } },
      create: productData,
      update: productData,
    });

    // Upsert lead
    const existingLead = await prisma.lead.findFirst({
      where: { orgId, productId: savedProduct.id, status: { notIn: ['REJECTED', 'EXPIRED'] } },
    });

    if (existingLead) {
      await prisma.lead.update({
        where: { id: existingLead.id },
        data:  { score },
      });
      return { outcome: 'lead_updated', leadId: existingLead.id, score };
    }

    const lead = await prisma.lead.create({
      data: { orgId, productId: savedProduct.id, score, status: 'NEW' },
    });

    return { outcome: 'lead_created', leadId: lead.id, score };

  } catch (err) {
    console.error('[pipeline] error:', err);
    return { outcome: 'error', message: String(err) };
  }
}

// ─── Dry-run inspection (diagnostic — no filtering, no persistence) ──────────
// Returns the computed match + market data + economics for a single product so
// we can see WHY products are rejected (wrong match? genuinely no margin?).
export interface InspectResult {
  sourceTitle:     string;
  sourcePrice:     number;
  listPrice?:      number;
  onSale?:         boolean;
  matched:         boolean;
  matchMethod?:    string;
  matchConfidence?: number;
  asin?:           string;
  amazonTitle?:    string;
  resellPrice?:    number;
  buyBoxPrice?:    number;
  referralFee?:    number;
  fbaFee?:         number;
  profit?:         number;
  roi?:            number;
  qualifies?:      boolean;   // profitability only
  identityScore?:  number;
  passedValidation?: boolean;
  wouldBeLead?:    boolean;   // qualifies AND passes validation
}

export async function inspectRetailerProduct(product: RetailerProduct, orgId: string): Promise<InspectResult> {
  const base: InspectResult = {
    sourceTitle: product.title, sourcePrice: product.price,
    listPrice: product.listPrice, onSale: product.onSale, matched: false,
  };

  const match = await findMatch(product, orgId);
  if (!match) return base;

  const { asin } = match;
  const [spData, keepaData] = await Promise.allSettled([
    getProductData(orgId, asin).catch(() => null),
    getKeepaData(asin),
  ]);
  const sp    = spData.status    === 'fulfilled' ? spData.value    : null;
  const keepa = keepaData.status === 'fulfilled' ? keepaData.value : null;

  const buyBoxPrice    = sp?.buyBoxPrice    ?? keepa?.buyBoxPrice;
  const lowestFbaPrice = sp?.lowestFbaPrice ?? keepa?.lowestNewPrice;
  const resellPrice    = lowestFbaPrice ?? buyBoxPrice ?? product.price;
  const category       = sp?.category ?? keepa?.category ?? product.category ?? 'Other';

  let referralFee: number | undefined;
  let fbaFee: number | undefined;
  if (resellPrice > 0) {
    const feeData = await getFeeEstimate(orgId, asin, resellPrice).catch(() => null);
    if (feeData) { referralFee = feeData.referralFee; fbaFee = feeData.fbaFee; }
  }

  const profit = calculateProfitability({
    sourcePrice: product.price,
    discounts:   [],
    resellPrice,
    category,
    referralFeeRate: referralFee != null ? referralFee / resellPrice : undefined,
    fbaFee,
  });

  const validation = validateProduct({
    source: { title: product.title, upc: product.upc, ean: product.ean, brand: product.brand, model: product.model },
    amazon: { title: sp?.title ?? keepa?.title ?? product.title, upc: product.upc, ean: product.ean, brand: sp?.brand ?? keepa?.brand, model: product.model },
    sourcePrice:     product.price,
    amazonPrice:     buyBoxPrice ?? resellPrice,
    sourceInStock:   product.inStock,
    sourceUrl:       product.url,
    matchConfidence: match.matchConfidence,
    matchMethod:     match.matchMethod,
  });

  return {
    ...base,
    matched:          true,
    matchMethod:      match.matchMethod,
    matchConfidence:  match.matchConfidence,
    asin,
    amazonTitle:      sp?.title ?? keepa?.title,
    resellPrice,
    buyBoxPrice,
    referralFee:      profit.referralFee,
    fbaFee:           profit.fbaFee,
    profit:           profit.profit,
    roi:              profit.roi,
    qualifies:        profit.qualifies,
    identityScore:    validation.identityScore,
    passedValidation: validation.passed,
    wouldBeLead:      profit.qualifies && validation.passed,
  };
}

// ─── ASIN matching with priority fallback ────────────────────────────────────

async function findMatch(product: RetailerProduct, orgId: string): Promise<AmazonMatch | null> {
  // Priority 1: UPC (most reliable)
  if (product.upc) {
    const m = await searchCatalogByUpc(orgId, product.upc).catch(() => null);
    if (m) return m;
  }

  // Priority 2: EAN
  if (product.ean) {
    const m = await searchCatalogByEan(orgId, product.ean).catch(() => null);
    if (m) return m;
  }

  // Priority 3: Brand + Model keyword search
  if (product.brand && product.model) {
    const m = await searchCatalogByKeywords(orgId, `${product.brand} ${product.model}`).catch(() => null);
    if (m) return { ...m, matchMethod: 'BRAND_MODEL', matchConfidence: 85 };
  }

  // Priority 4: Title search (lowest confidence)
  const m = await searchCatalogByKeywords(orgId, product.title).catch(() => null);
  return m;
}
