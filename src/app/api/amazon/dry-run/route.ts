import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getRetailer, getRetailerNames } from '@/retailers';
import { inspectRetailerProduct } from '@/services/pipeline';
import type { RetailerProduct } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Temporary diagnostic: scrape a query and show the per-product match +
 * economics WITHOUT filtering or persisting, so we can judge whether matches
 * are correct and the profit math is sane. Owner-only. Remove after tuning.
 *
 *   /api/amazon/dry-run?retailer=Target&kw=clearance%20toys&n=6
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sp       = new URL(req.url).searchParams;
  const retailer = sp.get('retailer') ?? 'Target';
  const kw       = sp.get('kw') ?? 'clearance toys';
  const n        = Math.min(8, Math.max(1, Number(sp.get('n')) || 6));

  if (!getRetailerNames().includes(retailer)) {
    return NextResponse.json({ error: `Unknown retailer: ${retailer}`, retailers: getRetailerNames() }, { status: 400 });
  }

  const plugin = getRetailer(retailer)!;
  let products: RetailerProduct[] = [];
  try {
    products = (await plugin.search(kw)) as RetailerProduct[];
  } catch (e) {
    return NextResponse.json({ error: `scrape failed: ${(e as Error).message}` }, { status: 502 });
  }

  const rows = [];
  for (const p of products.slice(0, n)) {
    rows.push(await inspectRetailerProduct(p, session.user.orgId));
  }

  return NextResponse.json({ retailer, keyword: kw, scraped: products.length, inspected: rows.length, rows });
}
