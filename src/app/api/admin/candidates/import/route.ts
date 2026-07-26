/**
 * POST /api/admin/candidates/import
 *
 * Admin-only VA CSV import for SourceCandidate rows.
 * Accepts { csv: string } or multipart text.
 *
 * Safety:
 * - Does NOT call SP-API, Keepa, or Apify.
 * - Does NOT create Product, Lead, or LeadEntitlement records.
 * - Does NOT call processRetailerProduct or broadcastLeads.
 * - Does NOT certify or deliver any candidates.
 * - All candidates enter as RAW_CANDIDATE (certStatus default).
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { parseCandidatesCsv, normalizeRetailerUrl } from '@/lib/candidates-csv';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  const session = await auth();
  const email   = session?.user?.email;
  const role    = session?.user?.role;

  // Owner or platform admin only
  if (role !== 'OWNER' && !isPlatformAdmin(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Accept JSON body { csv: string } or raw text
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

  const { rows, skippedRows, parseErrors, missingColumns } = parseCandidatesCsv(csvText);

  if (missingColumns.length > 0) {
    return NextResponse.json({
      error: `Missing required columns: ${missingColumns.map(c => `"${c}"`).join(', ')}. ` +
        'Required: retailer_url, retailer, source_price, title.',
    }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({
      error: 'No valid rows found. Check that required columns have values.',
      parseErrors,
      skippedRows,
    }, { status: 400 });
  }

  // Resolve the broadcast-source org — candidates always land in the source org.
  const sourceOrg = await prisma.organization.findFirst({
    where:  { isBroadcastSource: true },
    select: { id: true },
  });
  if (!sourceOrg) {
    return NextResponse.json({ error: 'No broadcast-source org configured.' }, { status: 500 });
  }
  const orgId = sourceOrg.id;

  let imported       = 0;
  let updated        = 0;
  let skippedRejected = 0;
  let skippedNoChange = 0;
  const rowErrors: string[] = [...parseErrors];

  for (const row of rows) {
    const normalizedUrl = normalizeRetailerUrl(row.retailerUrl);

    try {
      const existing = await prisma.sourceCandidate.findUnique({
        where:  { orgId_normalizedRetailerUrl: { orgId, normalizedRetailerUrl: normalizedUrl } },
        select: { id: true, certStatus: true },
      });

      if (existing) {
        const status = existing.certStatus;

        // REJECTED → skip; do not re-import
        if (status === 'REJECTED') {
          skippedRejected++;
          continue;
        }

        // CERTIFIED → update sourcePrice only, preserve status
        if (status === 'CERTIFIED') {
          await prisma.sourceCandidate.update({
            where: { id: existing.id },
            data:  { sourcePrice: row.sourcePrice },
          });
          updated++;
          continue;
        }

        // STALE or NO_LONGER_PROFITABLE → refresh price + reset to RAW_CANDIDATE
        if (status === 'STALE' || status === 'NO_LONGER_PROFITABLE') {
          await prisma.sourceCandidate.update({
            where: { id: existing.id },
            data:  {
              certStatus:     'RAW_CANDIDATE',
              sourcePrice:    row.sourcePrice,
              title:          row.title,
              brand:          row.brand          ?? null,
              vaNotes:        row.vaNotes        ?? null,
              sourceListPrice: row.sourceListPrice ?? null,
              onSale:         row.onSale         ?? null,
              staleAt:        null,
            },
          });
          updated++;
          continue;
        }

        // RAW_CANDIDATE / MATCHED / NEEDS_REVIEW → update mutable fields only
        await prisma.sourceCandidate.update({
          where: { id: existing.id },
          data:  {
            sourcePrice:     row.sourcePrice,
            title:           row.title,
            brand:           row.brand          ?? null,
            vaNotes:         row.vaNotes        ?? null,
            sourceListPrice: row.sourceListPrice ?? null,
            onSale:          row.onSale         ?? null,
          },
        });
        updated++;
      } else {
        // New candidate — create as RAW_CANDIDATE
        await prisma.sourceCandidate.create({
          data: {
            orgId,
            retailerUrl:          row.retailerUrl,
            normalizedRetailerUrl: normalizedUrl,
            retailer:      row.retailer,
            title:         row.title,
            brand:         row.brand          ?? null,
            asin:          row.asin           ?? null,
            upc:           row.upc            ?? null,
            retailerItemId: row.retailerItemId ?? null,
            sourcePrice:    row.sourcePrice,
            sourceListPrice: row.sourceListPrice ?? null,
            onSale:         row.onSale         ?? null,
            vaNotes:        row.vaNotes        ?? null,
            sourceType:     'VA_IMPORT',
            sourceCost:     0,
            certStatus:     'RAW_CANDIDATE',
          },
        });
        imported++;
      }
    } catch (err) {
      rowErrors.push(`Row (${row.retailerUrl}): ${(err as Error).message}`);
      skippedNoChange++;
    }
  }

  await prisma.auditLog.create({
    data: {
      orgId,
      userId:   session!.user.id,
      action:   'ADMIN_CANDIDATES_IMPORT',
      resource: 'SourceCandidate',
      metadata: {
        adminEmail: email,
        imported,
        updated,
        skippedRejected,
        skippedRows: skippedRows + skippedNoChange,
        rowErrors: rowErrors.slice(0, 20),
      },
    },
  }).catch(() => null);

  return NextResponse.json({
    ok:             true,
    imported,
    updated,
    skippedRejected,
    skippedRows:    skippedRows + skippedNoChange,
    rowErrors:      rowErrors.slice(0, 20),
  });
}
