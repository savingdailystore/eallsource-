/**
 * POST /api/admin/candidates/va-import
 *
 * Admin-only VA-format CSV import for SourceCandidate rows.
 * Parses the VA sheet format (Product Name, ASIN, Cost Price, etc.),
 * maps to CandidateRow, then upserts into SourceCandidate.
 *
 * VA-estimated profit/ROI/Sales are discarded — EALLsource recalculates
 * all economics via SP-API + Keepa during evaluation.
 *
 * Safety:
 * - Does NOT trust VA Sales Price, Profit, or R.O.I for any calculation.
 * - Does NOT call SP-API, Keepa, or Apify.
 * - Does NOT create Product, Lead, or LeadEntitlement records.
 * - Does NOT call processRetailerProduct or broadcastLeads.
 * - Does NOT certify or deliver any candidates.
 * - All candidates enter as RAW_CANDIDATE.
 * - Skips rows with no ASIN and no ASIN-extractable Amazon URL.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { parseVaCsv } from '@/lib/va-csv';
import { normalizeRetailerUrl } from '@/lib/candidates-csv';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  const { acceptedRows, skippedRows, needsCleanupRows, parseErrors } = parseVaCsv(csvText);

  if (acceptedRows.length === 0) {
    return NextResponse.json({
      error: 'No importable rows found after VA format parsing. Check that rows include a valid ASIN or Amazon URL and a numeric Cost Price.',
      skippedRows,
      needsCleanupRows,
      parseErrors,
    }, { status: 400 });
  }

  const sourceOrg = await prisma.organization.findFirst({
    where:  { isBroadcastSource: true },
    select: { id: true },
  });
  if (!sourceOrg) {
    return NextResponse.json({ error: 'No broadcast-source org configured.' }, { status: 500 });
  }
  const orgId = sourceOrg.id;

  let imported        = 0;
  let updated         = 0;
  let skippedRejected = 0;
  let skippedNoChange = 0;
  const rowErrors: string[] = [...parseErrors];

  for (const { candidate } of acceptedRows) {
    const normalizedUrl = normalizeRetailerUrl(candidate.retailerUrl);

    try {
      const existing = await prisma.sourceCandidate.findUnique({
        where:  { orgId_normalizedRetailerUrl: { orgId, normalizedRetailerUrl: normalizedUrl } },
        select: { id: true, certStatus: true },
      });

      if (existing) {
        const status = existing.certStatus;

        if (status === 'REJECTED') { skippedRejected++; continue; }

        if (status === 'CERTIFIED') {
          await prisma.sourceCandidate.update({
            where: { id: existing.id },
            data:  { sourcePrice: candidate.sourcePrice },
          });
          updated++;
          continue;
        }

        if (status === 'STALE' || status === 'NO_LONGER_PROFITABLE') {
          await prisma.sourceCandidate.update({
            where: { id: existing.id },
            data:  {
              certStatus:  'RAW_CANDIDATE',
              sourcePrice: candidate.sourcePrice,
              title:       candidate.title,
              asin:        candidate.asin   ?? null,
              vaNotes:     candidate.vaNotes ?? null,
              staleAt:     null,
            },
          });
          updated++;
          continue;
        }

        await prisma.sourceCandidate.update({
          where: { id: existing.id },
          data:  {
            sourcePrice: candidate.sourcePrice,
            title:       candidate.title,
            asin:        candidate.asin   ?? null,
            vaNotes:     candidate.vaNotes ?? null,
          },
        });
        updated++;
      } else {
        await prisma.sourceCandidate.create({
          data: {
            orgId,
            retailerUrl:           candidate.retailerUrl,
            normalizedRetailerUrl: normalizedUrl,
            retailer:              candidate.retailer,
            title:                 candidate.title,
            asin:                  candidate.asin   ?? null,
            upc:                   candidate.upc    ?? null,
            sourcePrice:           candidate.sourcePrice,
            vaNotes:               candidate.vaNotes ?? null,
            sourceType:            'VA_IMPORT',
            sourceCost:            0,
            certStatus:            'RAW_CANDIDATE',
          },
        });
        imported++;
      }
    } catch (err) {
      rowErrors.push(`Row (${candidate.retailerUrl}): ${(err as Error).message}`);
      skippedNoChange++;
    }
  }

  await prisma.auditLog.create({
    data: {
      orgId,
      userId:   session!.user.id,
      action:   'ADMIN_VA_CANDIDATES_IMPORT',
      resource: 'SourceCandidate',
      metadata: {
        adminEmail: email,
        imported,
        updated,
        skippedRejected,
        skippedRows:     skippedRows.length + skippedNoChange,
        cleanupRows:     needsCleanupRows.length,
        rowErrors:       rowErrors.slice(0, 20),
      },
    },
  }).catch(() => null);

  return NextResponse.json({
    ok:             true,
    imported,
    updated,
    skippedRejected,
    skippedRows:    skippedRows.length + skippedNoChange,
    cleanupRows:    needsCleanupRows.length,
    rowErrors:      rowErrors.slice(0, 20),
  });
}
