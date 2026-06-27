import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { __resetAllForTests } from '@/lib/rate-limit';

const findUnique = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

import { POST } from './route';

function makeRequest(body: unknown, ip = '203.0.113.1') {
  return new Request('http://localhost/api/auth/mfa-check', {
    method:  'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body:    JSON.stringify(body),
  });
}

describe('POST /api/auth/mfa-check', () => {
  beforeEach(() => {
    __resetAllForTests();
    findUnique.mockReset();
  });

  it('returns valid:false for an unknown email without revealing that distinction up front', async () => {
    findUnique.mockResolvedValue(null);
    const res  = await POST(makeRequest({ email: 'nobody@example.com', password: 'whatever' }));
    const body = await res.json();
    expect(body).toEqual({ valid: false });
  });

  it('returns valid:true and mfaRequired for a correct password', async () => {
    const passwordHash = await bcrypt.hash('CorrectHorseBattery1!', 4);
    findUnique.mockResolvedValue({ id: 'u1', password: passwordHash, mfaEnabled: true });

    const res  = await POST(makeRequest({ email: 'user@example.com', password: 'CorrectHorseBattery1!' }, '203.0.113.2'));
    const body = await res.json();
    expect(body).toEqual({ valid: true, mfaRequired: true });
  });

  it('locks out after repeated failed attempts from the same IP', async () => {
    findUnique.mockResolvedValue(null); // every attempt "fails" (no such user)
    const ip = '203.0.113.3';

    let last;
    for (let i = 0; i < 10; i++) {
      last = await POST(makeRequest({ email: `attempt${i}@example.com`, password: 'guess' }, ip));
    }
    // The 10th attempt should still be allowed through (limit is 10/window);
    // the 11th must be rejected.
    expect(last!.status).toBe(200);

    const eleventh = await POST(makeRequest({ email: 'attempt10@example.com', password: 'guess' }, ip));
    expect(eleventh.status).toBe(429);
    const body = await eleventh.json();
    expect(body.valid).toBe(false);
    expect(eleventh.headers.get('Retry-After')).toBeTruthy();
  });

  it('locks out after repeated failed attempts against the same account, even from different IPs', async () => {
    const passwordHash = await bcrypt.hash('CorrectHorseBattery1!', 4);
    findUnique.mockResolvedValue({ id: 'u2', password: passwordHash, mfaEnabled: false });

    for (let i = 0; i < 10; i++) {
      await POST(makeRequest({ email: 'victim@example.com', password: 'wrong-guess' }, `203.0.113.${10 + i}`));
    }

    const next = await POST(makeRequest({ email: 'victim@example.com', password: 'wrong-guess' }, '203.0.113.250'));
    expect(next.status).toBe(429);
  });

  it('resets the lockout counter after a successful login', async () => {
    const passwordHash = await bcrypt.hash('CorrectHorseBattery1!', 4);
    findUnique.mockResolvedValue({ id: 'u3', password: passwordHash, mfaEnabled: false });
    const ip = '203.0.113.99';

    // A few failed guesses, then the correct password.
    for (let i = 0; i < 5; i++) {
      await POST(makeRequest({ email: 'resets@example.com', password: 'wrong' }, ip));
    }
    const success = await POST(makeRequest({ email: 'resets@example.com', password: 'CorrectHorseBattery1!' }, ip));
    expect((await success.json()).valid).toBe(true);

    // Counter should be back to zero, so several more failures don't trip
    // the limiter immediately.
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest({ email: 'resets@example.com', password: 'wrong-again' }, ip));
      expect(res.status).toBe(200);
    }
  });
});
