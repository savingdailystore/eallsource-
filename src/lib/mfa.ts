import { authenticator } from 'otplib';

// Allow a 1-step (±30s) window to tolerate minor clock drift.
authenticator.options = { window: 1 };

const ISSUER = 'EALLsource';

export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpAuthUrl(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: token.replace(/\s/g, ''), secret });
  } catch {
    return false;
  }
}
