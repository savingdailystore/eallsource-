/**
 * POST /api/admin/candidates/va-preview
 *
 * Parses a VA-format CSV and returns the pre-import review result.
 * No DB writes. No SP-API / Keepa / Apify calls.
 * Returns: acceptedRows, skippedRows, needsCleanupRows, warnings.
 *
 * Safety:
 * - Does NOT create SourceCandidate, Product, Lead, or LeadEntitlement records.
 * - Does NOT call broadcastLeads, processRetailerProduct, or any scanner job.
 * - Pure parse — all DB writes happen only in /api/admin/candidates/va-import.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/admin';
import { parseVaCsv } from '@/lib/va-csv';

export const dynamic = 'force-dynamic';

const MAX_CSV_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await auth();
  const email   = session?.user?.email;
  const role    = session?.user?.role;

  if (role !== 'OWNER' && !isPlatformAdmin(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let csvText: string;
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    csvText = typeof body.csv === 'string' ? body.csv : '';
  } else {
    csvText = await req.text().catch(() => '');
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: 'No CSV content provided.' }, { status: 400 });
  }
  if (Buffer.byteLength(csvText, 'utf8') > MAX_CSV_BYTES) {
    return NextResponse.json({ error: 'File too large (max 5 MB).' }, { status: 413 });
  }

  const result = parseVaCsv(csvText);

  return NextResponse.json({
    ok:               true,
    totalInputRows:   result.totalInputRows,
    acceptedCount:    result.acceptedRows.length,
    skippedCount:     result.skippedRows.length,
    cleanupCount:     result.needsCleanupRows.length,
    acceptedRows:     result.acceptedRows.map(r => ({
      rowNumber:   r.rowNumber,
      title:       r.candidate.title,
      asin:        r.candidate.asin,
      retailer:    r.candidate.retailer,
      retailerUrl: r.candidate.retailerUrl,
      sourcePrice: r.candidate.sourcePrice,
      vaNotes:     r.candidate.vaNotes,
      meta: {
        asinSource:               r.meta.asinSource,
        vaCategory:               r.meta.vaCategory,
        vaEstimatedBuyBox:        r.meta.vaEstimatedBuyBox,
        vaEstimatedProfit:        r.meta.vaEstimatedProfit,
        vaEstimatedRoi:           r.meta.vaEstimatedRoi,
        vaEstimatedSalesPerMonth: r.meta.vaEstimatedSalesPerMonth,
        couponCode:               r.meta.couponCode,
        amazonUrl:                r.meta.amazonUrl,
      },
      warnings: r.warnings,
    })),
    skippedRows:      result.skippedRows,
    needsCleanupRows: result.needsCleanupRows,
    parseErrors:      result.parseErrors,
  });
}
