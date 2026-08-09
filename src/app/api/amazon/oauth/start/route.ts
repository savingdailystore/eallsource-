import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL('/auth/login', req.url));

  if (session.user.plan === 'STARTER') {
    return NextResponse.redirect(new URL('/dashboard/billing', req.url));
  }

  const role = session.user.role;
  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard/amazon?error=insufficient_role', req.url));
  }

  // spAppId: published SP-API app ID — used as application_id on the Seller Central consent URL.
  // clientId: LWA OAuth2 credential — used only for token exchange in the callback route.
  // Both must be present for a coherent OAuth environment.
  const spAppId  = process.env.AMAZON_SP_APP_ID;
  const clientId = process.env.LWA_CLIENT_ID;
  if (!spAppId || !clientId) {
    return NextResponse.redirect(new URL('/dashboard/amazon?error=missing_credentials', req.url));
  }

  await prisma.auditLog.create({
    data: {
      orgId:    session.user.orgId,
      userId:   session.user.id,
      action:   'AMAZON_OAUTH_START_ATTEMPTED',
      resource: 'AmazonCredential',
      metadata: { plan: session.user.plan },
    },
  }).catch(() => null);

  const state = crypto.randomBytes(32).toString('hex');

  const amazonUrl = new URL('https://sellercentral.amazon.com/apps/authorize/consent');
  amazonUrl.searchParams.set('application_id', spAppId);
  amazonUrl.searchParams.set('state', state);

  const res = NextResponse.redirect(amazonUrl.toString());
  res.cookies.set('amazon_oauth_state', state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   600, // 10 minutes
    path:     '/',
  });
  return res;
}
