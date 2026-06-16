import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { generateOrgSlug } from '@/lib/utils';
import { z } from 'zod';

const schema = z.object({
  orgName:  z.string().min(2).max(80),
  email:    z.string().email(),
  password: z.string().min(8).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const { orgName, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);
    const slug   = generateOrgSlug(orgName);

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: orgName, slug, plan: 'STARTER' },
      });

      await tx.user.create({
        data: { email, password: hashed, role: 'OWNER', orgId: org.id },
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
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[register]', err);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}
