import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/amazon';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SP_API_BASE = 'https://sellingpartnerapi-na.amazon.com';

/**
 * Temporary diagnostic: confirms whether Amazon catalog keyword matching works
 * for the current org. Reports token acquisition + the RAW catalog response
 * (before the confidence filter) so we can tell credentials vs. no-items vs.
 * confidence-threshold. Remove once lead matching is verified.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const out: Record<string, unknown> = {};

  // 1. Token
  let token: string | null = null;
  try {
    token = await getValidAccessToken(session.user.orgId);
    out.accessToken = token ? `${token.slice(0, 8)}…` : 'NULL (token refresh failed — check LWA_CLIENT_ID/SECRET)';
  } catch (e) {
    out.accessToken = `THREW: ${(e as Error).message}`;
  }
  if (!token) return NextResponse.json(out);

  // 2. Raw catalog keyword search (bypasses the <70 confidence filter)
  const kw = (new URL(req.url).searchParams.get('kw')) ?? 'air fryer';
  out.keyword = kw;
  try {
    const url = new URL(`${SP_API_BASE}/catalog/2022-04-01/items`);
    url.searchParams.set('keywords', kw);
    url.searchParams.set('marketplaceIds', 'ATVPDKIKX0DER');
    url.searchParams.set('includedData', 'identifiers,summaries');

    const res  = await fetch(url.toString(), {
      headers: { 'x-amz-access-token': token, 'Content-Type': 'application/json' },
    });
    const body = await res.text();
    out.catalogStatus = res.status;

    if (res.ok) {
      const data = JSON.parse(body) as { numberOfResults?: number; items?: Array<{ asin: string; summaries?: Array<{ itemName?: string; brand?: string }> }> };
      out.numberOfResults = data.numberOfResults ?? null;
      out.itemsReturned   = data.items?.length ?? 0;
      out.sampleItems     = (data.items ?? []).slice(0, 3).map((i) => ({
        asin: i.asin,
        name: i.summaries?.[0]?.itemName?.slice(0, 70),
        brand: i.summaries?.[0]?.brand,
      }));
    } else {
      out.catalogError = body.slice(0, 400);
    }
  } catch (e) {
    out.catalogError = `THREW: ${(e as Error).message}`;
  }

  return NextResponse.json(out);
}
