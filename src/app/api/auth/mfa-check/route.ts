import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

// Validates email+password WITHOUT creating a session, and reports whether the
// account requires a 2FA code. Used by the login form to decide whether to show
// the TOTP field before calling signIn().
export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));

  if (!email || !password) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ valid: false });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return NextResponse.json({ valid: false });

  return NextResponse.json({ valid: true, mfaRequired: user.mfaEnabled });
}
