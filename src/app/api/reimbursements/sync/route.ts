import { NextResponse }        from 'next/server';
import { auth }                from '@/lib/auth';
import { prisma }              from '@/lib/prisma';
import { getSpApiClient }      from '@/lib/sp-api';
import { parseReimbursementReport } from '@/engines/reimbursementRecovery';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300; // 5 min — report polling can take a few minutes

const REPORT_TYPE         = 'GET_FBA_REIMBURSEMENTS_DATA';
const POLL_INTERVAL_MS    = 8_000;   // 8 seconds between polls
const MAX_POLL_ATTEMPTS   = 20;      // up to ~160s polling window

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role, orgId } = session.user;
  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Optional date range from request body
  let dataStartTime: string | undefined;
  let dataEndTime:   string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.dataStartTime === 'string') dataStartTime = body.dataStartTime;
    if (typeof body.dataEndTime   === 'string') dataEndTime   = body.dataEndTime;
  } catch { /* no body — use full history */ }

  // Create sync log
  const syncLog = await prisma.reimbursementSync.create({
    data: { orgId, source: 'SP_API', status: 'RUNNING' },
  });

  try {
    const client = await getSpApiClient(orgId);

    // ── Step 1: Request the report ────────────────────────────────────────────
    const reportId = await client.createReport(REPORT_TYPE, { dataStartTime, dataEndTime });

    await prisma.reimbursementSync.update({
      where: { id: syncLog.id },
      data:  { reportId },
    });

    // ── Step 2: Poll until DONE, FATAL, or CANCELLED ──────────────────────────
    let reportDocumentId: string | undefined;
    let attempts = 0;

    while (attempts < MAX_POLL_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      attempts++;

      const { processingStatus, reportDocumentId: docId } = await client.getReport(reportId);

      if (processingStatus === 'DONE') {
        reportDocumentId = docId;
        break;
      }
      if (processingStatus === 'FATAL' || processingStatus === 'CANCELLED') {
        throw new Error(`Report ${reportId} ended with status: ${processingStatus}`);
      }
      // IN_QUEUE or IN_PROGRESS — keep polling
    }

    if (!reportDocumentId) {
      throw new Error(`Report ${reportId} did not complete within the polling window (${MAX_POLL_ATTEMPTS} attempts)`);
    }

    await prisma.reimbursementSync.update({
      where: { id: syncLog.id },
      data:  { reportDocumentId },
    });

    // ── Step 3: Download + decompress ─────────────────────────────────────────
    const rawText = await client.downloadReportDocument(reportDocumentId);

    // ── Step 4: Parse ─────────────────────────────────────────────────────────
    const { rows, errors, total } = parseReimbursementReport(rawText);

    if (rows.length === 0) {
      await prisma.reimbursementSync.update({
        where: { id: syncLog.id },
        data: {
          status:          'DONE',
          completedAt:     new Date(),
          recordsFound:    total,
          recordsUpserted: 0,
          ...(errors.length > 0
            ? { error: `All ${errors.length} rows failed to parse` }
            : {}),
        },
      });
      return NextResponse.json({ synced: 0, parseErrors: errors.length, total, syncId: syncLog.id });
    }

    // ── Step 5: Upsert ────────────────────────────────────────────────────────
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
        importSource:                'SP_API',
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
        ...(errors.length > 0
          ? { error: `${errors.length} rows had parse errors` }
          : {}),
      },
    });

    return NextResponse.json({
      synced:      upserted,
      parseErrors: errors.length,
      total,
      syncId:      syncLog.id,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reimbursements/sync] SP-API sync failed:', err);

    await prisma.reimbursementSync.update({
      where: { id: syncLog.id },
      data: { status: 'FAILED', completedAt: new Date(), error: message },
    }).catch(() => {});

    const msg = message.toLowerCase();
    if (msg.includes('env vars not set'))  return NextResponse.json({ error: 'missing_env' },     { status: 503 });
    if (msg.includes('not connected'))     return NextResponse.json({ error: 'not_connected' },    { status: 400 });
    if (msg.includes('403'))              return NextResponse.json({ error: 'report_scope_denied', detail: 'The SP-API application does not have permission to create reimbursement reports. Check the application role in Seller Central.' }, { status: 403 });

    return NextResponse.json({ error: 'sp_api_error', detail: message }, { status: 502 });
  }
}
