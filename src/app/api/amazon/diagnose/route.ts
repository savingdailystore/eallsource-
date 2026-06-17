import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Minimal marketplace → endpoint map (same as src/lib/sp-api.ts).
const MARKETPLACE_ENDPOINT: Record<string, string> = {
  ATVPDKIKX0DER:  'https://sellingpartnerapi-na.amazon.com',
  A2EUQ1WTGCTBG2: 'https://sellingpartnerapi-na.amazon.com',
  A1AM79C64UM0Y8: 'https://sellingpartnerapi-na.amazon.com',
  A1F83G8C2ARO7P: 'https://sellingpartnerapi-eu.amazon.com',
  A1PA6795UKMFR9: 'https://sellingpartnerapi-eu.amazon.com',
  A13V1IB3VIYZZH: 'https://sellingpartnerapi-eu.amazon.com',
  APJ6JRA9NG5V4:  'https://sellingpartnerapi-eu.amazon.com',
  A1RKKUPIHCS9HS: 'https://sellingpartnerapi-eu.amazon.com',
  A1VC38T7YXB528: 'https://sellingpartnerapi-fe.amazon.com',
};

/**
 * Read-only diagnostic for the Amazon SP-API connection. Returns safe,
 * non-secret details (prefixes/lengths/HTTP statuses only) so we can pinpoint
 * why /fba/inventory/v1/summaries returns 403. Visit /api/amazon/diagnose
 * while logged in and share the JSON.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = session.user.orgId;
  const out: Record<string, unknown> = {};

  // ── 1. Env vars (the LWA app credentials in Vercel) ───────────────────────
  const clientId     = process.env.LWA_CLIENT_ID;
  const clientSecret = process.env.LWA_CLIENT_SECRET;
  out.env = {
    LWA_CLIENT_ID_set:     !!clientId,
    // First chars only — lets you confirm it matches the app you added roles to.
    LWA_CLIENT_ID_prefix:  clientId ? `${clientId.slice(0, 24)}…` : null,
    LWA_CLIENT_SECRET_set: !!clientSecret,
  };

  // ── 2. Stored credential ──────────────────────────────────────────────────
  const cred = await prisma.amazonCredential.findUnique({ where: { orgId } });
  if (!cred) {
    out.credential = 'NONE — connect first';
    return NextResponse.json(out);
  }
  out.credential = {
    isActive:      cred.isActive,
    sellerId:      cred.sellerId,
    marketplaceId: cred.marketplaceId,
  };

  let refreshToken: string;
  try {
    refreshToken = decrypt(cred.refreshToken);
  } catch (e) {
    out.decrypt = `FAILED: ${(e as Error).message}`;
    return NextResponse.json(out);
  }
  out.refreshToken_prefix = `${refreshToken.slice(0, 8)}…`;

  if (!clientId || !clientSecret) {
    out.lwaRefresh = 'SKIPPED — env vars missing';
    return NextResponse.json(out);
  }

  // ── 3. LWA token refresh ──────────────────────────────────────────────────
  let accessToken = '';
  try {
    const res = await fetch('https://api.amazon.com/auth/o2/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        client_id:     clientId,
        client_secret: clientSecret,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      out.lwaRefresh = { ok: false, status: res.status, body: text.slice(0, 400) };
      return NextResponse.json(out);
    }
    const data = JSON.parse(text);
    accessToken = data.access_token;
    out.lwaRefresh = { ok: true, accessToken_prefix: `${accessToken.slice(0, 8)}…`, expires_in: data.expires_in };
  } catch (e) {
    out.lwaRefresh = { ok: false, error: (e as Error).message };
    return NextResponse.json(out);
  }

  const endpoint = MARKETPLACE_ENDPOINT[cred.marketplaceId] ?? 'https://sellingpartnerapi-na.amazon.com';
  out.endpoint = endpoint;

  async function call(path: string, query: Record<string, string> = {}) {
    const qs  = new URLSearchParams(query).toString();
    const url = `${endpoint}${path}${qs ? '?' + qs : ''}`;
    const res = await fetch(url, {
      headers: { 'x-amz-access-token': accessToken, 'content-type': 'application/json' },
    });
    const body = await res.text();
    return { status: res.status, body: body.slice(0, 400) };
  }

  // ── 4. Role-agnostic probe: does the token work AT ALL? ───────────────────
  // getMarketplaceParticipations needs no specific role.
  out.probe_marketplaceParticipations = await call('/sellers/v1/marketplaceParticipations');

  // ── 5. The actual FBA Inventory call (needs Product Listing / Amazon Fulfillment) ──
  out.probe_fbaInventory = await call('/fba/inventory/v1/summaries', {
    granularityType: 'Marketplace',
    granularityId:   cred.marketplaceId,
    marketplaceIds:  cred.marketplaceId,
    details:         'false',
  });

  // ── Interpretation hint ───────────────────────────────────────────────────
  const partOk = (out.probe_marketplaceParticipations as { status: number }).status === 200;
  const fbaOk  = (out.probe_fbaInventory as { status: number }).status === 200;
  out.interpretation =
    fbaOk                 ? 'FBA OK — connection is healthy.'
    : partOk              ? 'Token VALID but lacks the FBA role → the refresh token was minted before Product Listing/Amazon Fulfillment took effect (re-authorize after roles saved, allow propagation), OR Vercel LWA_CLIENT_ID is a different app than the one you added roles to (compare LWA_CLIENT_ID_prefix to the app).'
    :                       'Token has NO effective scope (even the role-agnostic call failed) → the self-authorization did not attach to the right app, or the LWA credentials/refresh token are from a different app. Re-check that Vercel credentials and the self-authorized app are the SAME app.';

  return NextResponse.json(out);
}
