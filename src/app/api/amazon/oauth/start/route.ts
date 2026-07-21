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

  const clientId = process.env.LWA_CLIENT_ID;
  if (!clientId) {
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

  // version=beta is required while the app is in Draft status on Seller Central.
  // Remove it after Amazon approves and publishes the app.
  const amazonUrl = new URL('https://sellercentral.amazon.com/apps/authorize/consent');
  amazonUrl.searchParams.set('application_id', clientId);
  amazonUrl.searchParams.set('state', state);
  amazonUrl.searchParams.set('version', 'beta');

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
