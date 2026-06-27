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

// ScanJob.error is read back and displayed verbatim to the org owner in the
// scan history UI (ScannerPanel.tsx). Never store a raw exception/`String(err)`
// there — a scraper failure or downstream error can carry connection detail,
// hostnames, or other internal information that shouldn't reach a browser,
// even the org's own. Use a fixed, safe message per category instead, and log
// the real error (with scanJobId/retailer context) server-side via
// console.error so it's still fully diagnosable from Vercel logs.
const SCAN_ERROR_UNKNOWN_RETAILER = 'Unknown retailer. Check your saved search configuration.';
const SCAN_ERROR_GENERIC = 'Scan failed. Our team has been notified — try again later.';

export interface ScanRunResult {
  created: number;
  updated: number;
  skipped: number;
  errors:  number;
  found:   number;
  leadIds: string[];  // IDs of leads created or updated (used for broadcast)
  // Breakdown of why products were filtered out (sums into `skipped`)
  noMatch:          number;
  noPricing:        number;
  notProfitable:    number;
  demandTooLow:     number;
  velocityTooLow:   number;
  noBuyBox:         number;
  priceDeclining:   number;
  priceTooLow:      number;
  validationFailed: number;
  // How many scraped products arrived with a UPC (barcode enrichment health).
  upcCount?:        number;
  // Per-product match diagnostics (debugging match quality). Capped in size.
  diagnostics?:     MatchDiagnostic[];
}

export async function runScanJob(args: {
  retailer:   string;
  query:      string;
  orgId:      string;
  scanJobId?: string;
}): Promise<ScanRunResult> {
  const { retailer, query, orgId, scanJobId } = args;

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
    noMatch: 0, noPricing: 0, notProfitable: 0, demandTooLow: 0, velocityTooLow: 0, noBuyBox: 0, priceDeclining: 0, priceTooLow: 0, validationFailed: 0,
  };

  const diagnostics: MatchDiagnostic[] = [];

  try {
    const products = (await plugin.search(query)) as RetailerProduct[];
    result.found = products.length;
    result.upcCount = products.filter((p) => p.upc).length;

    for (const product of products) {
      const outcome = await processRetailerProduct(product, orgId, {
        onDiagnostic: (d) => { if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(d); },
      });
      switch (outcome.outcome) {
        case 'lead_created':      result.created++; result.leadIds.push(outcome.leadId); break;
        case 'lead_updated':      result.updated++; result.leadIds.push(outcome.leadId); break;
        case 'error':             result.errors++;  break;
        case 'no_match':          result.skipped++; result.noMatch++;          break;
        case 'no_pricing_data':   result.skipped++; result.noPricing++;        break;
        case 'not_profitable':    result.skipped++; result.notProfitable++;    break;
        case 'demand_too_low':    result.skipped++; result.demandTooLow++;     break;
        case 'velocity_too_low':  result.skipped++; result.velocityTooLow++;   break;
        case 'no_buybox':         result.skipped++; result.noBuyBox++;         break;
        case 'price_declining':   result.skipped++; result.priceDeclining++;   break;
        case 'price_too_low':     result.skipped++; result.priceTooLow++;      break;
        case 'validation_failed': result.skipped++; result.validationFailed++; break;
        default:                  result.skipped++; break;
      }
    }

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
