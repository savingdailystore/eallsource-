import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { generateOrgSlug } from '@/lib/utils';
import { validatePassword } from '@/lib/password';
import { backfillOrgFromSource } from '@/services/broadcast';
import { isRateLimited, recordAttempt } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { z } from 'zod';

const schema = z.object({
  orgName:  z.string().min(2).max(80),
  email:    z.string().email(),
  password: z.string().max(100),
});

// Cheap to abuse otherwise: unlimited account creation from one source.
const MAX_REGISTRATIONS_PER_IP = 5;
const WINDOW_SECONDS            = 60 * 60;

export async function POST(req: NextRequest) {
  try {
    const ip      = getClientIp(req);
    const ipKey   = `register:ip:${ip}`;
    const limited = await isRateLimited(ipKey, MAX_REGISTRATIONS_PER_IP, WINDOW_SECONDS);
    if (limited.limited) {
      return NextResponse.json(
        { error: 'Too many accounts created from this network. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
      );
    }

    const body   = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    await recordAttempt(ipKey, WINDOW_SECONDS);

    const { orgName, email, password } = parsed.data;

    const pwError = validatePassword(password);
    if (pwError) {
      return NextResponse.json({ error: pwError }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);
    const slug   = generateOrgSlug(orgName);

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const newOrgId = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: orgName, slug, plan: 'STARTER' },
      });

      await tx.user.create({
        data: { email, password: hashed, role: 'ADMIN', orgId: org.id },
      });

      await tx.subscription.create({
        data: {
          orgId: org.id,
          plan: 'STARTER',
          status: 'trialing',
          trialEndsAt,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId: org.id,
          action: 'REGISTER',
          resource: 'user',
          metadata: { email },
        },
      });

      return org.id;
    });

    // Seed the new org with the current broadcast lead set so the feed isn't
    // empty on first login. Best-effort — never block registration on this.
    try {
      await backfillOrgFromSource(newOrgId);
    } catch (err) {
      console.error('[register] backfill failed:', err);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[register]', err);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}
