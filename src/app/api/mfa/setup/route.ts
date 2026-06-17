import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt, isEncryptionConfigured } from '@/lib/encryption';
import { generateMfaSecret, buildOtpAuthUrl } from '@/lib/mfa';
import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';

// Generates a new TOTP secret, stores it (encrypted, not yet enabled), and
// returns a QR code + manual key for the user to add to their authenticator app.
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      { error: 'Server encryption key (ENCRYPTION_KEY) is not configured. Contact your administrator.' },
      { status: 503 },
    );
  }

  const secret    = generateMfaSecret();
  const otpauth   = buildOtpAuthUrl(session.user.email, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauth);

  // Persist encrypted secret but keep mfaEnabled=false until verified.
  await prisma.user.update({
    where: { id: session.user.id },
    data:  { mfaSecret: encrypt(secret), mfaEnabled: false },
  });

  return NextResponse.json({ qr: qrDataUrl, secret });
}
