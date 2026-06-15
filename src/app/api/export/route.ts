import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ExcelJS from 'exceljs';

const COLUMNS = [
  { header: 'ASIN', key: 'asin' },
  { header: 'Product Name', key: 'name' },
  { header: 'UPC', key: 'upc' },
  { header: 'Category', key: 'category' },
  { header: 'Source URL', key: 'sourceUrl' },
  { header: 'Source Retailer', key: 'sourceRetailer' },
  { header: 'Source Price', key: 'sourcePrice' },
  { header: 'Available Discounts', key: 'discountSources' },
  { header: 'Final Cost', key: 'finalCost' },
  { header: 'Amazon URL', key: 'amazonUrl' },
  { header: 'Buy Box Price', key: 'buyBoxPrice' },
  { header: 'Lowest Listed Price', key: 'lowestListedPrice' },
  { header: 'Est. Resell Price', key: 'estimatedResellPrice' },
  { header: 'Amazon Fees', key: 'amazonFees' },
  { header: 'Prep Fee', key: 'prepFee' },
  { header: 'Tax Amount', key: 'taxAmount' },
  { header: 'Net Profit', key: 'netProfit' },
  { header: 'ROI %', key: 'roi' },
  { header: 'BSR', key: 'bsr' },
  { header: 'BSR %', key: 'bsrPercentage' },
  { header: 'Auto Ungated', key: 'autoUngated' },
  { header: 'Buy Box Owner', key: 'buyBoxOwner' },
  { header: 'Amazon Is Seller', key: 'amazonIsSeller' },
  { header: 'Amazon Owns Buy Box', key: 'amazonOwnsBuyBox' },
  { header: 'IP Risk', key: 'ipRiskScore' },
  { header: 'Keepa Link', key: 'keepaLink' },
  { header: 'Date Added', key: 'dateAdded' },
];

export async function GET(req: NextRequest) {
  try {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const format = searchParams.get('format') ?? 'csv';
  const type = searchParams.get('type') ?? 'products'; // 'products' | 'saved'
  const userId = (session.user as { id: string }).id;

  let products: Record<string, unknown>[] = [];

  if (type === 'saved') {
    const saved = await prisma.savedProduct.findMany({
      where: { userId },
      include: { product: true },
    });
    products = saved.map((s) => ({
      ...s.product,
      savedNotes: s.notes,
      savedTags: s.tags?.join(', '),
      isPurchased: s.isPurchased ? 'Yes' : 'No',
      purchaseDate: s.purchaseDate,
      purchaseQty: s.purchaseQty,
    }));
  } else {
    products = await prisma.product.findMany({
      where: { status: 'ACTIVE', ipRiskScore: 'LOW' },
      orderBy: { roi: 'desc' },
      take: 500,
    });
  }

  if (format === 'csv') {
    const headers = COLUMNS.map((c) => c.header).join(',');
    const rows = products.map((p) =>
      COLUMNS.map((c) => {
        const val = p[c.key];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return String(val);
      }).join(','),
    );
    const csv = [headers, ...rows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="arbitrage-pro-${type}-${Date.now()}.csv"`,
      },
    });
  }

  if (format === 'excel') {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EALLsource';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Products', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 20 }));

    // Style header row
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF16A34A' },
    };

    for (const p of products) {
      sheet.addRow(
        COLUMNS.reduce(
          (acc, col) => {
            acc[col.key] = p[col.key] ?? '';
            return acc;
          },
          {} as Record<string, unknown>,
        ),
      );
    }

    // Highlight ROI cells
    sheet.eachRow((row, i) => {
      if (i === 1) return;
      const roi = Number(row.getCell('roi').value);
      if (roi >= 50) {
        row.getCell('roi').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDCFCE7' },
        };
      } else if (roi >= 30) {
        row.getCell('roi').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF9C4' },
        };
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="arbitrage-pro-${type}-${Date.now()}.xlsx"`,
      },
    });
  }

  return NextResponse.json({ success: false, error: 'Invalid format' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
