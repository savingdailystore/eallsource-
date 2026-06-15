import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@lib/prisma';
import ExcelJS from 'exceljs';

const COLUMNS = [
  { header: 'ASIN',        key: 'asin' },
  { header: 'Title',       key: 'title' },
  { header: 'Price',       key: 'price' },
  { header: 'Fees',        key: 'fees' },
  { header: 'Net Profit',  key: 'profit' },
  { header: 'ROI %',       key: 'roi' },
  { header: 'Score',       key: 'score' },
  { header: 'Date Added',  key: 'createdAt' },
];

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const format = searchParams.get('format') ?? 'csv';

    const products = await prisma.product.findMany({
      orderBy: { roi: 'desc' },
      take: 500,
    });

    const rows: Record<string, unknown>[] = products.map((p) => ({ ...p }));

    if (format === 'csv') {
      const headers = COLUMNS.map((c) => c.header).join(',');
      const csvRows = rows.map((p) =>
        COLUMNS.map((c) => {
          const val = p[c.key];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
          return String(val);
        }).join(','),
      );
      const csv = [headers, ...csvRows].join('\n');
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="eallsource-products-${Date.now()}.csv"`,
        },
      });
    }

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'EALLsource';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('Products', { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 20 }));

      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } };

      for (const p of rows) {
        sheet.addRow(COLUMNS.reduce((acc, col) => { acc[col.key] = p[col.key] ?? ''; return acc; }, {} as Record<string, unknown>));
      }

      sheet.eachRow((row, i) => {
        if (i === 1) return;
        const roi = Number(row.getCell('roi').value);
        if (roi >= 50) row.getCell('roi').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        else if (roi >= 30) row.getCell('roi').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="eallsource-products-${Date.now()}.xlsx"`,
        },
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid format' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
