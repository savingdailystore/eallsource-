import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SP_API_BASE = 'https://sellingpartnerapi-na.amazon.com';
const LWA_URL     = 'https://api.amazon.com/auth/o2/token';

/**
 * Temporary diagnostic for why Amazon catalog matching returns no token.
 * Reports the full credential + LWA-refresh + catalog chain. Owner-only,
 * no secrets returned. Remove once lead matching is verified.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const out: Record<string, unknown> = {};

  out.env = {
    LWA_CLIENT_ID_set:     !!process.env.LWA_CLIENT_ID,
    LWA_CLIENT_SECRET_set: !!process.env.LWA_CLIENT_SECRET,
    // First chars only — compare to your app's "LWA credentials → View" Client ID
    LWA_CLIENT_ID_prefix:  process.env.LWA_CLIENT_ID ? `${process.env.LWA_CLIENT_ID.slice(0, 30)}…` : null,
    LWA_CLIENT_SECRET_len: (process.env.LWA_CLIENT_SECRET ?? '').length,
  };

  const cred = await prisma.amazonCredential.findUnique({ where: { orgId: session.user.orgId } });
  if (!cred) { out.credential = 'NONE'; return NextResponse.json(out); }
  out.credential = {
    isActive:       cred.isActive,
    sellerId:       cred.sellerId,
    marketplaceId:  cred.marketplaceId,
    tokenExpiresAt: cred.tokenExpiresAt,
    cachedTokenStillValid: !!(cred.tokenExpiresAt && cred.tokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000),
  };

  let refreshToken = '';
  try {
    refreshToken = decrypt(cred.refreshToken);
    out.refreshToken = `${refreshToken.slice(0, 8)}… (len ${refreshToken.length})`;
  } catch (e) {
    out.refreshToken = `DECRYPT FAILED: ${(e as Error).message}`;
    return NextResponse.json(out);
  }

  // Inline LWA refresh (mirrors getValidAccessToken) so we see the real result
  let accessToken = '';
  try {
    const res  = await fetch(LWA_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        client_id:     process.env.LWA_CLIENT_ID     ?? '',
        client_secret: process.env.LWA_CLIENT_SECRET ?? '',
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      let errorCode: string | undefined;
      try { errorCode = JSON.parse(body).error; } catch { /* ignore */ }
      out.lwaRefresh = { ok: false, status: res.status, error: errorCode ?? '(unparsed)', body: body.slice(0, 600) };
      return NextResponse.json(out);
    }
    accessToken = JSON.parse(body).access_token;
    out.lwaRefresh = { ok: true, accessToken: `${accessToken.slice(0, 8)}…` };
  } catch (e) {
    out.lwaRefresh = { ok: false, error: (e as Error).message };
    return NextResponse.json(out);
  }

  // Raw catalog keyword search (bypasses the <70 confidence filter)
  const kw = new URL(req.url).searchParams.get('kw') ?? 'air fryer';
  out.keyword = kw;
  try {
    const url = new URL(`${SP_API_BASE}/catalog/2022-04-01/items`);
    url.searchParams.set('keywords', kw);
    url.searchParams.set('marketplaceIds', 'ATVPDKIKX0DER');
    url.searchParams.set('includedData', 'identifiers,summaries');
    const res  = await fetch(url.toString(), { headers: { 'x-amz-access-token': accessToken, 'Content-Type': 'application/json' } });
    const body = await res.text();
    out.catalogStatus = res.status;
    if (res.ok) {
      const data = JSON.parse(body) as { numberOfResults?: number; items?: Array<{ asin: string; summaries?: Array<{ itemName?: string; brand?: string }> }> };
      out.numberOfResults = data.numberOfResults ?? null;
      out.itemsReturned   = data.items?.length ?? 0;
      out.sampleItems     = (data.items ?? []).slice(0, 3).map((i) => ({ asin: i.asin, name: i.summaries?.[0]?.itemName?.slice(0, 70), brand: i.summaries?.[0]?.brand }));
    } else {
      out.catalogError = body.slice(0, 400);
    }
  } catch (e) {
    out.catalogError = `THREW: ${(e as Error).message}`;
  }

  return NextResponse.json(out);
}
