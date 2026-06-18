import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/amazon';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SP_API_BASE = 'https://sellingpartnerapi-na.amazon.com';
const MKT = 'ATVPDKIKX0DER';

/**
 * Temporary diagnostic: compare two SP-API pricing endpoints for one ASIN so we
 * can see which returns a usable resale price. Owner-only. Remove after fixing
 * getProductData pricing.
 *   /api/amazon/price-test?asin=B00AQURG0Q
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const asin  = new URL(req.url).searchParams.get('asin') ?? 'B00AQURG0Q';
  const token = await getValidAccessToken(session.user.orgId);
  if (!token) return NextResponse.json({ error: 'no access token' }, { status: 502 });

  const hdr = { 'x-amz-access-token': token, 'Content-Type': 'application/json' };
  const out: Record<string, unknown> = { asin };

  // A) competitivePricing (what getProductData currently uses)
  try {
    const u = new URL(`${SP_API_BASE}/products/pricing/v0/competitivePricing`);
    u.searchParams.set('Asins', asin);
    u.searchParams.set('MarketplaceId', MKT);
    u.searchParams.set('ItemType', 'Asin');
    const r = await fetch(u.toString(), { headers: hdr });
    const b = await r.text();
    out.competitivePricing = { status: r.status, body: b.slice(0, 700) };
  } catch (e) { out.competitivePricing = { error: (e as Error).message }; }

  // B) getItemOffers (buy-box + lowest price summary) — often more reliable
  try {
    const u = new URL(`${SP_API_BASE}/products/pricing/v0/items/${asin}/offers`);
    u.searchParams.set('MarketplaceId', MKT);
    u.searchParams.set('ItemCondition', 'New');
    const r = await fetch(u.toString(), { headers: hdr });
    const b = await r.text();
    out.getItemOffers = { status: r.status, body: b.slice(0, 900) };
  } catch (e) { out.getItemOffers = { error: (e as Error).message }; }

  return NextResponse.json(out);
}
