import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseReimbursementReport } from '@/engines/reimbursementRecovery';

export const dynamic   = 'force-dynamic';
export const maxDuration = 60;

// Max upload size: 5 MB (reimbursement reports are typically < 100 KB)
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role, orgId, plan } = session.user;

  if (plan === 'STARTER') {
    return NextResponse.json({ error: 'Profit Recovery requires a Pro plan' }, { status: 403 });
  }
  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden — only owners and admins can import reimbursement reports' }, { status: 403 });
  }

  // Accept multipart/form-data with a "file" field OR raw text body
  let rawText: string;

  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
    }

    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Missing file field in multipart upload' }, { status: 400 });
    }

    const bytes = await (file as File).arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 5 MB limit' }, { status: 413 });
    }
    rawText = new TextDecoder().decode(bytes);
  } else {
    // Plain text body (TSV/CSV pasted directly)
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Body exceeds 5 MB limit' }, { status: 413 });
    }
    rawText = new TextDecoder().decode(bytes);
  }

  if (!rawText.trim()) {
    return NextResponse.json({ error: 'Empty file — nothing to import' }, { status: 400 });
  }

  // Create sync log
  const syncLog = await prisma.reimbursementSync.create({
    data: { orgId, source: 'MANUAL_CSV', status: 'RUNNING' },
  });

  try {
    const { rows, errors, total } = parseReimbursementReport(rawText);

    if (rows.length === 0 && errors.length > 0) {
      await prisma.reimbursementSync.update({
        where: { id: syncLog.id },
        data: {
          status:      'FAILED',
          completedAt: new Date(),
          recordsFound: total,
          error: `All ${errors.length} rows failed to parse. First error: ${errors[0].message}`,
        },
      });
      return NextResponse.json(
        { error: 'No valid rows found', parseErrors: errors.slice(0, 10) },
        { status: 422 }
      );
    }

    // Upsert rows — @@unique([orgId, reimbursementId]) prevents duplicates
    let upserted = 0;
    for (const row of rows) {
      const data = {
        approvalDate:                row.approvalDate,
        caseId:                      row.caseId,
        amazonOrderId:               row.amazonOrderId,
        reason:                      row.reason,
        sku:                         row.sku,
        fnsku:                       row.fnsku,
        asin:                        row.asin,
        productName:                 row.productName,
        condition:                   row.condition,
        currencyUnit:                row.currencyUnit,
        amountPerUnit:               row.amountPerUnit,
        amountTotal:                 row.amountTotal,
        quantityReimbursedCash:      row.quantityReimbursedCash,
        quantityReimbursedInventory: row.quantityReimbursedInventory,
        quantityReimbursedTotal:     row.quantityReimbursedTotal,
        originalReimbursementId:     row.originalReimbursementId,
        originalReimbursementType:   row.originalReimbursementType,
        importSource:                'MANUAL_CSV',
        rawPayload:                  row.rawPayload,
      };

      await prisma.reimbursement.upsert({
        where:  { orgId_reimbursementId: { orgId, reimbursementId: row.reimbursementId } },
        create: { orgId, reimbursementId: row.reimbursementId, ...data },
        update: data,
      });
      upserted++;
    }

    await prisma.reimbursementSync.update({
      where: { id: syncLog.id },
      data: {
        status:          'DONE',
        completedAt:     new Date(),
        recordsFound:    total,
        recordsUpserted: upserted,
      },
    });

    return NextResponse.json({
      imported:    upserted,
      parseErrors: errors.length,
      total,
      syncId:      syncLog.id,
      ...(errors.length > 0 && { rowErrors: errors.slice(0, 10) }),
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reimbursements/import] failed:', err);

    await prisma.reimbursementSync.update({
      where: { id: syncLog.id },
      data: { status: 'FAILED', completedAt: new Date(), error: message },
    }).catch(() => {}); // best-effort

    return NextResponse.json({ error: 'Import failed', detail: message }, { status: 500 });
  }
}
