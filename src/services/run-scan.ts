/**
 * Synchronous scan runner — executes a single retailer search end to end:
 * scrape via the retailer plugin, run each product through the lead pipeline,
 * and record the outcome on the ScanJob row. Shared by the BullMQ worker and
 * the Vercel cron route so manual and scheduled scans behave identically.
 */

import { prisma } from '@/lib/prisma';
import { getRetailer } from '@/retailers';
import { processRetailerProduct } from '@/services/pipeline';
import type { MatchDiagnostic } from '@/services/pipeline';
import type { RetailerProduct } from '@/types';

// Cap diagnostics stored per scan so the ScanJob.result JSON stays small.
const MAX_DIAGNOSTICS = 40;

// Matches MAX_PRODUCTS in the retailer plugins (walmart.ts, target.ts).
// Used to infer whether the scraper hit its cap (products.length >= this).
const RETAILER_PRODUCT_CAP = 18;

// Confidence thresholds for low/high match quality bucketing.
const LOW_CONFIDENCE_THRESHOLD  = 70;
const HIGH_CONFIDENCE_THRESHOLD = 90;

// ScanJob.error is read back and displayed verbatim to the org owner in the
// scan history UI (ScannerPanel.tsx). Never store a raw exception/`String(err)`
// there — a scraper failure or downstream error can carry connection detail,
// hostnames, or other internal information that shouldn't reach a browser,
// even the org's own. Use a fixed, safe message per category instead, and log
// the real error (with scanJobId/retailer context) server-side via
// console.error so it's still fully diagnosable from Vercel logs.
const SCAN_ERROR_UNKNOWN_RETAILER = 'Unknown retailer. Check your saved search configuration.';
const SCAN_ERROR_GENERIC = 'Scan failed. Our team has been notified — try again later.';

// ─── Result sub-types ────────────────────────────────────────────────────────

export interface MatchMethodBreakdown {
  upc:        number;
  ean:        number;
  brandModel: number;
  title:      number;
  unknown:    number;
}

export interface RiskGateBreakdown {
  brandBlocked:        number;
  ipComplaintHistory:  number;
  privateLabel:        number;
  hazmat:              number;
  genericBrand:        number;
  amazonSellsIt:       number;
  priceUnstable:       number;
  /** Catch-all for any future/unknown gating outcomes. */
  gating:              number;
  /** Mirrors the top-level validationFailed count for convenience. */
  validationFailed:    number;
}

export interface ScraperMetrics {
  retailer:           string;
  query:              string;
  productsFound:      number;
  productsWithUpc:    number;
  productsWithoutUpc: number;
  /** True when the scraper returned exactly RETAILER_PRODUCT_CAP products,
   *  suggesting the actor hit its cap and there may be more results. */
  hitProductCap:      boolean;
}

export interface TimingMetrics {
  totalRuntimeMs:    number;
  scraperRuntimeMs:  number;
  pipelineRuntimeMs: number;
}

// ─── Main result type ─────────────────────────────────────────────────────────

export interface ScanRunResult {
  created: number;
  updated: number;
  skipped: number;
  errors:  number;
  found:   number;
  leadIds: string[];

  // Existing per-gate skip counts (kept for backward compatibility with the UI)
  noMatch:          number;
  noPricing:        number;
  notProfitable:    number;
  demandTooLow:     number;
  velocityTooLow:   number;
  noBuyBox:         number;
  priceDeclining:   number;
  priceTooLow:      number;
  validationFailed: number;

  // Scraper barcode coverage (pre-pipeline)
  upcCount?: number;

  // Per-product match diagnostics (debug). Capped to MAX_DIAGNOSTICS.
  diagnostics?: MatchDiagnostic[];

  // ── Phase 17.1 observability additions ────────────────────────────────────
  /** How many matched products used each match method. */
  matchMethodBreakdown:  MatchMethodBreakdown;
  /** Average matchConfidence across all matched products (0 when nothing matched). */
  avgMatchConfidence:    number;
  /** Matched products with confidence below LOW_CONFIDENCE_THRESHOLD (70). */
  lowConfidenceMatches:  number;
  /** Matched products with confidence at or above HIGH_CONFIDENCE_THRESHOLD (90). */
  highConfidenceMatches: number;
  /** Per-gate skip counts for the gates previously lumped into "other risk gates". */
  riskGateBreakdown:     RiskGateBreakdown;
  /** Scraper-level stats (before the pipeline runs). */
  scraperMetrics:        ScraperMetrics;
  /** Wall-time breakdown: total, scraper portion, pipeline portion. */
  timingMetrics:         TimingMetrics;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function matchMethodKey(method: string | undefined): keyof MatchMethodBreakdown {
  switch (method) {
    case 'UPC':              return 'upc';
    case 'EAN':              return 'ean';
    case 'BRAND_MODEL':      return 'brandModel';
    case 'TITLE_SIMILARITY': return 'title';
    default:                 return 'unknown';
  }
}

function emptyMatchMethodBreakdown(): MatchMethodBreakdown {
  return { upc: 0, ean: 0, brandModel: 0, title: 0, unknown: 0 };
}

function emptyRiskGateBreakdown(): RiskGateBreakdown {
  return {
    brandBlocked: 0, ipComplaintHistory: 0, privateLabel: 0, hazmat: 0,
    genericBrand: 0, amazonSellsIt: 0, priceUnstable: 0, gating: 0, validationFailed: 0,
  };
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function runScanJob(args: {
  retailer:   string;
  query:      string;
  orgId:      string;
  scanJobId?: string;
}): Promise<ScanRunResult> {
  const { retailer, query, orgId, scanJobId } = args;
  const totalStart = Date.now();

  if (scanJobId) {
    await prisma.scanJob.update({
      where: { id: scanJobId },
      data:  { status: 'RUNNING', startedAt: new Date() },
    }).catch(() => {});
  }

  const plugin = getRetailer(retailer);
  if (!plugin) {
    console.error(`[run-scan] unknown retailer "${retailer}" for scanJobId=${scanJobId ?? 'n/a'} orgId=${orgId}`);
    if (scanJobId) {
      await prisma.scanJob.update({
        where: { id: scanJobId },
        data:  { status: 'FAILED', error: SCAN_ERROR_UNKNOWN_RETAILER, completedAt: new Date() },
      }).catch(() => {});
    }
    throw new Error(`Unknown retailer: ${retailer}`);
  }

  const result: ScanRunResult = {
    created: 0, updated: 0, skipped: 0, errors: 0, found: 0, leadIds: [],
    noMatch: 0, noPricing: 0, notProfitable: 0, demandTooLow: 0, velocityTooLow: 0,
    noBuyBox: 0, priceDeclining: 0, priceTooLow: 0, validationFailed: 0,
    matchMethodBreakdown:  emptyMatchMethodBreakdown(),
    avgMatchConfidence:    0,
    lowConfidenceMatches:  0,
    highConfidenceMatches: 0,
    riskGateBreakdown:     emptyRiskGateBreakdown(),
    scraperMetrics: {
      retailer, query,
      productsFound: 0, productsWithUpc: 0, productsWithoutUpc: 0, hitProductCap: false,
    },
    timingMetrics: { totalRuntimeMs: 0, scraperRuntimeMs: 0, pipelineRuntimeMs: 0 },
  };

  const diagnostics: MatchDiagnostic[] = [];
  let totalConfidence = 0;
  let confidenceCount = 0;

  try {
    // ── Scrape ───────────────────────────────────────────────────────────────
    const scraperStart = Date.now();
    const products = (await plugin.search(query)) as RetailerProduct[];
    result.timingMetrics.scraperRuntimeMs = Date.now() - scraperStart;

    result.found     = products.length;
    result.upcCount  = products.filter((p) => p.upc).length;

    result.scraperMetrics = {
      retailer,
      query,
      productsFound:      products.length,
      productsWithUpc:    products.filter((p) => p.upc).length,
      productsWithoutUpc: products.filter((p) => !p.upc).length,
      // Inferred: if the scraper returned exactly the cap, it likely has more
      hitProductCap: products.length >= RETAILER_PRODUCT_CAP,
    };

    // ── Pipeline ─────────────────────────────────────────────────────────────
    const pipelineStart = Date.now();

    for (const product of products) {
      const outcome = await processRetailerProduct(product, orgId, {
        onDiagnostic: (d) => {
          if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(d);

          // Aggregate match method breakdown — only for products that had a match
          if (d.asin) {
            const key = matchMethodKey(d.matchMethod);
            result.matchMethodBreakdown[key]++;
          }

          // Aggregate match confidence
          if (d.asin && d.matchConfidence != null) {
            totalConfidence += d.matchConfidence;
            confidenceCount++;
            if (d.matchConfidence < LOW_CONFIDENCE_THRESHOLD)  result.lowConfidenceMatches++;
            if (d.matchConfidence >= HIGH_CONFIDENCE_THRESHOLD) result.highConfidenceMatches++;
          }
        },
      });

      switch (outcome.outcome) {
        // ── Leads ──────────────────────────────────────────────────────────
        case 'lead_created':         result.created++; result.leadIds.push(outcome.leadId); break;
        case 'lead_updated':         result.updated++; result.leadIds.push(outcome.leadId); break;
        case 'error':                result.errors++;  break;

        // ── Existing named skip reasons (top-level + old UI) ───────────────
        case 'no_match':             result.skipped++; result.noMatch++;          break;
        case 'no_pricing_data':      result.skipped++; result.noPricing++;        break;
        case 'not_profitable':       result.skipped++; result.notProfitable++;    break;
        case 'demand_too_low':       result.skipped++; result.demandTooLow++;     break;
        case 'velocity_too_low':     result.skipped++; result.velocityTooLow++;   break;
        case 'no_buybox':            result.skipped++; result.noBuyBox++;         break;
        case 'price_declining':      result.skipped++; result.priceDeclining++;   break;
        case 'price_too_low':        result.skipped++; result.priceTooLow++;      break;
        // Also record in riskGateBreakdown so UI can show it under both sections
        case 'validation_failed':    result.skipped++; result.validationFailed++; result.riskGateBreakdown.validationFailed++; break;

        // ── Risk gate breakdown (previously lumped into "other risk gates") ─
        case 'brand_blocked':        result.skipped++; result.riskGateBreakdown.brandBlocked++;       break;
        case 'ip_complaint_history': result.skipped++; result.riskGateBreakdown.ipComplaintHistory++;  break;
        case 'private_label':        result.skipped++; result.riskGateBreakdown.privateLabel++;        break;
        case 'hazmat':               result.skipped++; result.riskGateBreakdown.hazmat++;              break;
        case 'generic_brand':        result.skipped++; result.riskGateBreakdown.genericBrand++;        break;
        case 'amazon_sells_it':      result.skipped++; result.riskGateBreakdown.amazonSellsIt++;       break;
        case 'price_unstable':       result.skipped++; result.riskGateBreakdown.priceUnstable++;       break;

        // ── Catch-all for any future outcomes ─────────────────────────────
        default:                     result.skipped++; result.riskGateBreakdown.gating++;              break;
      }
    }

    result.timingMetrics.pipelineRuntimeMs = Date.now() - pipelineStart;
    result.timingMetrics.totalRuntimeMs    = Date.now() - totalStart;

    // Compute avg confidence after the loop (avoids division inside the hot path)
    result.avgMatchConfidence = confidenceCount > 0
      ? Math.round(totalConfidence / confidenceCount)
      : 0;

    result.diagnostics = diagnostics;

    if (scanJobId) {
      await prisma.scanJob.update({
        where: { id: scanJobId },
        data:  { status: 'DONE', result: result as object, completedAt: new Date() },
      }).catch(() => {});
    }

    return result;
  } catch (err) {
    console.error(`[run-scan] scan failed for scanJobId=${scanJobId ?? 'n/a'} retailer=${retailer} orgId=${orgId}:`, err);
    if (scanJobId) {
      await prisma.scanJob.update({
        where: { id: scanJobId },
        data:  { status: 'FAILED', error: SCAN_ERROR_GENERIC, completedAt: new Date() },
      }).catch(() => {});
    }
    throw err;
  }
}
