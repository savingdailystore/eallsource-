/**
 * Synchronous scan runner — executes a single retailer search end to end:
 * scrape via the retailer plugin, run each product through the lead pipeline,
 * and record the outcome on the ScanJob row. Shared by the BullMQ worker and
 * the Vercel cron route so manual and scheduled scans behave identically.
 */

import { prisma } from '@/lib/prisma';
import { getRetailer } from '@/retailers';
import { processRetailerProduct } from '@/services/pipeline';
import type { RetailerProduct } from '@/types';

export interface ScanRunResult {
  created: number;
  updated: number;
  skipped: number;
  errors:  number;
  found:   number;
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
    if (scanJobId) {
      await prisma.scanJob.update({
        where: { id: scanJobId },
        data:  { status: 'FAILED', error: `Unknown retailer: ${retailer}`, completedAt: new Date() },
      }).catch(() => {});
    }
    throw new Error(`Unknown retailer: ${retailer}`);
  }

  const result: ScanRunResult = { created: 0, updated: 0, skipped: 0, errors: 0, found: 0 };

  try {
    const products = (await plugin.search(query)) as RetailerProduct[];
    result.found = products.length;

    for (const product of products) {
      const outcome = await processRetailerProduct(product, orgId);
      if      (outcome.outcome === 'lead_created') result.created++;
      else if (outcome.outcome === 'lead_updated') result.updated++;
      else if (outcome.outcome === 'error')        result.errors++;
      else                                          result.skipped++;
    }

    if (scanJobId) {
      await prisma.scanJob.update({
        where: { id: scanJobId },
        data:  { status: 'DONE', result: result as object, completedAt: new Date() },
      }).catch(() => {});
    }

    return result;
  } catch (err) {
    if (scanJobId) {
      await prisma.scanJob.update({
        where: { id: scanJobId },
        data:  { status: 'FAILED', error: String(err), completedAt: new Date() },
      }).catch(() => {});
    }
    throw err;
  }
}
