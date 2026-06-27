import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL('/auth/login', req.url));

  const { searchParams } = new URL(req.url);
  const code             = searchParams.get('spapi_oauth_code');
  const state            = searchParams.get('state');
  const sellingPartnerId = searchParams.get('selling_partner_id');

  // Validate CSRF state
  const storedState = req.cookies.get('amazon_oauth_state')?.value;
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL('/dashboard/amazon?error=invalid_state', req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/dashboard/amazon?error=missing_code', req.url));
  }

  // Amazon seller/merchant IDs are short alphanumeric identifiers (e.g.
  // "A1B2C3D4E5F6G7"). Reject anything that doesn't match before it's stored
  // — defense-in-depth against a malformed or unexpected redirect, even
  // though this value originates from Amazon's own redirect rather than
  // arbitrary user input.
  if (sellingPartnerId && !/^[A-Z0-9]{1,32}$/.test(sellingPartnerId)) {
    return NextResponse.redirect(new URL('/dashboard/amazon?error=invalid_seller_id', req.url));
  }

  const clientId     = process.env.LWA_CLIENT_ID;
  const clientSecret = process.env.LWA_CLIENT_SECRET;
  const baseUrl      = process.env.NEXTAUTH_URL ?? 'https://eallsource.com';

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/dashboard/amazon?error=missing_credentials', req.url));
  }

  try {
    const tokenRes = await fetch('https://api.amazon.com/auth/o2/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  `${baseUrl}/api/amazon/callback`,
        client_id:     clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      console.error('LWA token exchange failed:', await tokenRes.text());
      return NextResponse.redirect(new URL('/dashboard/amazon?error=token_exchange_failed', req.url));
    }

    const tokens = await tokenRes.json() as {
      access_token:  string;
      refresh_token: string;
      expires_in:    number;
    };

    await prisma.amazonCredential.upsert({
      where:  { orgId: session.user.orgId },
      create: {
        orgId:          session.user.orgId,
        sellerId:       sellingPartnerId ?? '',
        marketplaceId:  'ATVPDKIKX0DER',
        accessToken:    encrypt(tokens.access_token),
        refreshToken:   encrypt(tokens.refresh_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        isActive:       true,
      },
      update: {
        sellerId:       sellingPartnerId ?? '',
        marketplaceId:  'ATVPDKIKX0DER',
        accessToken:    encrypt(tokens.access_token),
        refreshToken:   encrypt(tokens.refresh_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        isActive:       true,
      },
    });

    await prisma.auditLog.create({
      data: {
        orgId:    session.user.orgId,
        userId:   session.user.id,
        action:   'AMAZON_CONNECT',
        resource: 'AmazonCredential',
        metadata: { sellerId: sellingPartnerId, marketplaceId: 'ATVPDKIKX0DER', via: 'oauth' },
      },
    });

    const res = NextResponse.redirect(new URL('/dashboard/amazon?connected=true', req.url));
    res.cookies.delete('amazon_oauth_state');
    return res;

  } catch (err) {
    console.error('Amazon OAuth callback error:', err);
    return NextResponse.redirect(new URL('/dashboard/amazon?error=server_error', req.url));
  }
}
