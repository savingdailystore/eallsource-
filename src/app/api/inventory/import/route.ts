import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Detect whether the file is tab-delimited (Amazon reports) or comma-delimited.
function detectDelimiter(text: string): ',' | '\t' {
  const firstLine = text.split('\n').find((l) => l.trim() !== '') ?? '';
  const tabs   = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

// Minimal RFC-4180-ish parser (handles quoted fields, escaped quotes, CRLF, custom delimiter).
function parseDelimited(text: string, delimiter: ',' | '\t'): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delimiter) { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (c === '\r') { /* ignore */ }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const COLUMN_ALIASES: Record<string, string[]> = {
  sku:               ['sku', 'sellersku', 'merchantsku', 'msku'],
  fnsku:             ['fnsku', 'fulfillmentnetworksku'],
  asin:              ['asin'],
  productName:       ['productname', 'title', 'itemname', 'name', 'description'],
  availableQuantity: ['available', 'availablequantity', 'afnfulfillablequantity', 'fulfillablequantity'],
  reservedQuantity:  ['reserved', 'reservedquantity', 'afnreservedquantity'],
  inboundQuantity:   ['inbound', 'inboundquantity', 'afninboundworkingquantity', 'afninboundshippedquantity', 'afninboundreceivingquantity'],
  totalQuantity:     ['total', 'totalquantity', 'afntotalquantity', 'quantity', 'qty'],
};

function mapHeaders(headers: string[]): Record<string, number> {
  const normalized = headers.map(norm);
  const map: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = session.user.orgId;
  const { csv } = await req.json().catch(() => ({ csv: '' }));

  if (!csv || typeof csv !== 'string') {
    return NextResponse.json({ error: 'No file content provided.' }, { status: 400 });
  }

  const rows = parseDelimited(csv, detectDelimiter(csv));
  if (rows.length < 2) {
    return NextResponse.json({ error: 'File needs a header row and at least one data row.' }, { status: 400 });
  }

  const headerMap = mapHeaders(rows[0]);
  if (headerMap.asin === undefined) {
    return NextResponse.json(
      { error: 'Could not find an "ASIN" column. Include a header row with at least an ASIN column.' },
      { status: 400 },
    );
  }

  const cell = (row: string[], field: string): string | undefined => {
    const idx = headerMap[field];
    return idx === undefined ? undefined : row[idx]?.trim();
  };

  let imported = 0;
  let skipped  = 0;
  const errors: string[] = [];

  // Inbound may span several Amazon columns (working/shipped/receiving) — sum them.
  const inboundIdxs = rows[0]
    .map((h, idx) => (COLUMN_ALIASES.inboundQuantity.includes(norm(h)) ? idx : -1))
    .filter((idx) => idx !== -1);

  const toInt = (v?: string) => parseInt(v ?? '', 10) || 0;

  for (let i = 1; i < rows.length; i++) {
    const row  = rows[i];
    const asin = cell(row, 'asin')?.toUpperCase();
    if (!asin) { skipped++; continue; }

    const inbound = inboundIdxs.length
      ? inboundIdxs.reduce((sum, idx) => sum + (parseInt(row[idx]?.trim() ?? '', 10) || 0), 0)
      : toInt(cell(row, 'inboundQuantity'));

    const data = {
      sku:               cell(row, 'sku') || null,
      fnsku:             cell(row, 'fnsku') || null,
      productName:       cell(row, 'productName') || asin,
      availableQuantity: toInt(cell(row, 'availableQuantity')),
      reservedQuantity:  toInt(cell(row, 'reservedQuantity')),
      inboundQuantity:   inbound,
      totalQuantity:     toInt(cell(row, 'totalQuantity')),
    };

    try {
      await prisma.inventoryItem.upsert({
        where:  { orgId_asin: { orgId, asin } },
        create: { orgId, asin, ...data },
        update: data,
      });
      imported++;
    } catch {
      errors.push(`Row ${i + 1} (${asin}) failed.`);
      skipped++;
    }
  }

  return NextResponse.json({ imported, skipped, errors: errors.slice(0, 5) });
}
