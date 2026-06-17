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
  asin:         ['asin'],
  title:        ['title', 'productname', 'itemname', 'name', 'description'],
  quantity:     ['quantity', 'qty', 'afnfulfillablequantity', 'fulfillablequantity', 'availablequantity', 'units'],
  listedPrice:  ['listedprice', 'price', 'yourprice', 'sellingprice', 'listprice'],
  costBasis:    ['costbasis', 'cost', 'unitcost', 'buyprice', 'purchaseprice', 'cogs'],
  retailer:     ['retailer', 'source', 'supplier', 'store', 'sourceretailer'],
  purchaseDate: ['purchasedate', 'date', 'datepurchased', 'boughton'],
  status:       ['status', 'condition'],
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

function normalizeStatus(raw?: string): 'IN_STOCK' | 'LISTED' | 'SOLD' {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('sold')) return 'SOLD';
  if (s.includes('list') || s.includes('active')) return 'LISTED';
  return 'IN_STOCK';
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

  for (let i = 1; i < rows.length; i++) {
    const row  = rows[i];
    const asin = cell(row, 'asin')?.toUpperCase();
    if (!asin) { skipped++; continue; }

    const costBasis   = parseFloat(cell(row, 'costBasis') ?? '') || 0;
    const quantity    = parseInt(cell(row, 'quantity') ?? '', 10) || 1;
    const listedRaw   = cell(row, 'listedPrice');
    const listedPrice = listedRaw ? parseFloat(listedRaw) : null;
    const dateRaw     = cell(row, 'purchaseDate');
    const parsedDate  = dateRaw ? new Date(dateRaw) : null;
    const purchaseDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : new Date();
    const estimatedProfit = listedPrice != null ? (listedPrice - costBasis) * quantity : null;

    try {
      await prisma.inventoryItem.upsert({
        where: { orgId_asin: { orgId, asin } },
        create: {
          orgId,
          asin,
          title:        cell(row, 'title') || asin,
          retailer:     cell(row, 'retailer') || null,
          costBasis,
          quantity,
          purchaseDate,
          listedPrice,
          estimatedProfit,
          status:       normalizeStatus(cell(row, 'status')),
        },
        update: {
          title:        cell(row, 'title') || asin,
          retailer:     cell(row, 'retailer') || undefined,
          costBasis,
          quantity,
          purchaseDate,
          listedPrice,
          estimatedProfit,
          status:       normalizeStatus(cell(row, 'status')),
        },
      });
      imported++;
    } catch {
      errors.push(`Row ${i + 1} (${asin}) failed.`);
      skipped++;
    }
  }

  return NextResponse.json({ imported, skipped, errors: errors.slice(0, 5) });
}
