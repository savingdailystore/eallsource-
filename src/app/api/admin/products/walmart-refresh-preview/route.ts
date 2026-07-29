/**
 * POST /api/admin/products/walmart-refresh-preview
 *
 * Admin-only read-only route. Calls the pratikdani Apify actor against
 * known Walmart sourceUrls and returns a price/availability comparison
 * against existing Product.sourcePrice values.
 *
 * Safety:
 * - Does NOT write Product.priceCheckedAt, sourceCheckedAt, freshnessStatus.
 * - Does NOT write Lead.freshnessStatus or freshnessCheckedAt.
 * - Does NOT create Product, Lead, or LeadEntitlement records.
 * - Does NOT expire leads or change customer visibility.
 * - Does NOT call broadcastLeads, SP-API, or Keepa.
 * - All DB access is SELECT only. No update/upsert/create/delete.
 * - available: null is never treated as out of stock.
 * - price: null is never treated as price changed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { refreshWalmartProductUrlViaApify } from '@/lib/walmart-apify-refresh';

export const dynamic    = 'force-dynamic';
export const maxDuration = 300; // up to 5 products × 90s timeout each

const MAX_PRODUCTS = 5;

// ---------------------------------------------------------------------------
// Recommendation logic — conservative, never infers from null
// ---------------------------------------------------------------------------

type Recommendation = 'NO_CHANGE' | 'PRICE_CHANGED' | 'OUT_OF_STOCK' | 'UNKNOWN' | 'ERROR';

function deriveRecommendation(
  existingPrice: number | null,
  refreshedPrice: number | null,
  refreshedAvailable: boolean | null,
  error: string | null,
): Recommendation {
  if (error)                           return 'ERROR';
  // Explicit unavailability only — null means unknown, not OOS
  if (refreshedAvailable === false)    return 'OUT_OF_STOCK';
  // Both prices must be present and numeric for a price-change signal
  if (refreshedPrice === null || existingPrice === null) return 'UNKNOWN';
  // Allow $0.01 rounding tolerance
  if (Math.abs(refreshedPrice - existingPrice) > 0.01)  return 'PRICE_CHANGED';
  return 'NO_CHANGE';
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const session = await auth();
  const email   = session?.user?.email;
  const role    = session?.user?.role;

  if (role !== 'OWNER' && !isPlatformAdmin(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Input validation ─────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { productIds } = (body as { productIds?: unknown });

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return NextResponse.json(
      { error: 'productIds must be a non-empty array of strings.' },
      { status: 400 },
    );
  }

  if (productIds.length > MAX_PRODUCTS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_PRODUCTS} productIds per request.` },
      { status: 400 },
    );
  }

  // ── DB read — SELECT only ─────────────────────────────────────────────────
  const products = await prisma.product.findMany({
    where: {
      id:             { in: productIds as string[] },
      sourceRetailer: 'Walmart',
      sourceUrl:      { not: null },
    },
    select: {
      id:          true,
      asin:        true,
      title:       true,
      sourceUrl:   true,
      sourcePrice: true,
    },
  });

  // Build a set of found IDs so we can report skipped ones
  const foundIds = new Set(products.map(p => p.id));

  // ── Refresh each product via Apify ────────────────────────────────────────
  const results = await Promise.all(
    products.map(async (product) => {
      // sourceUrl is guaranteed non-null by the query filter, but TS doesn't know
      const sourceUrl = product.sourceUrl!;

      const refresh = await refreshWalmartProductUrlViaApify(sourceUrl);

      const existingPrice = product.sourcePrice ?? null;
      const refreshedPrice = refresh.price;

      const priceDelta =
        refreshedPrice !== null && existingPrice !== null
          ? parseFloat((refreshedPrice - existingPrice).toFixed(2))
          : null;

      const priceDeltaPercent =
        priceDelta !== null && existingPrice !== null && existingPrice !== 0
          ? parseFloat(((priceDelta / existingPrice) * 100).toFixed(1))
          : null;

      const recommendation = deriveRecommendation(
        existingPrice,
        refreshedPrice,
        refresh.available,
        refresh.error,
      );

      return {
        productId:          product.id,
        asin:               product.asin,
        title:              product.title,
        sourceUrl,
        existingSourcePrice: existingPrice,
        refreshedPrice,
        priceDelta,
        priceDeltaPercent,
        refreshedAvailable: refresh.available,
        refreshedTitle:     refresh.title,
        retailerItemId:     refresh.retailerItemId,
        sellerName:         refresh.sellerName,
        upc:                refresh.upc,
        brand:              refresh.brand,
        imageUrl:           refresh.imageUrl,
        parseSource:        refresh.parseSource,
        error:              refresh.error,
        checkedAt:          refresh.checkedAt,
        recommendation,
      };
    }),
  );

  // Skipped IDs (requested but not found as Walmart products with sourceUrl)
  const skippedIds = (productIds as string[]).filter(id => !foundIds.has(id));

  return NextResponse.json({
    ok:          true,
    checkedCount: results.length,
    skippedCount: skippedIds.length,
    skippedIds,
    results,
  });
}
