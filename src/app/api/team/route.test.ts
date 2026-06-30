// Tests for POST /api/team (invite user)
//
// Cases:
//   1. Successful invite when under plan limit
//   2. Invite blocked when plan user limit is reached (STARTER at 1 user)
//   3. Invite blocked when PRO plan at 1 user (new limit)
//   4. Unauthorized caller (no session) → 401
//   5. Non-admin/owner role → 403

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    user: {
      findUnique: vi.fn(),
      create:     vi.fn(),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed') },
}));

vi.mock('@/lib/password', () => ({
  validatePassword: vi.fn().mockReturnValue(null),
}));

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const mockAuth      = auth      as ReturnType<typeof vi.fn>;
const mockFindOrg   = prisma.organization.findUnique as ReturnType<typeof vi.fn>;
const mockFindUser  = prisma.user.findUnique         as ReturnType<typeof vi.fn>;
const mockCreateUser = prisma.user.create            as ReturnType<typeof vi.fn>;

function makeReq(body: object) {
  return new Request('http://localhost/api/team', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

const validBody = { email: 'new@example.com', role: 'ANALYST', password: 'ValidPass1!' };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'u1', orgId: 'org1', role: 'ADMIN' } });
  mockFindUser.mockResolvedValue(null); // no existing user
});

describe('POST /api/team', () => {

  it('creates user when org is under its plan limit', async () => {
    // STARTER plan, 0 current users → limit is 1
    mockFindOrg.mockResolvedValue({ plan: 'STARTER', _count: { users: 0 } });
    mockCreateUser.mockResolvedValue({ id: 'u2', email: 'new@example.com', name: null, role: 'ANALYST' });

    const res = await POST(makeReq(validBody));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 403 when STARTER org already has 1 user (limit reached)', async () => {
    // STARTER allows maxUsers: 1; org already has 1 user
    mockFindOrg.mockResolvedValue({ plan: 'STARTER', _count: { users: 1 } });

    const res = await POST(makeReq(validBody));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/STARTER/);
    expect(body.error).toMatch(/1 user/);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('returns 403 when PRO org already has 1 user (new limit is 1)', async () => {
    // PRO maxUsers changed from 2 → 1; org already has 1 user
    mockFindOrg.mockResolvedValue({ plan: 'PRO', _count: { users: 1 } });

    const res = await POST(makeReq(validBody));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/PRO/);
    expect(body.error).toMatch(/1 user/);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await POST(makeReq(validBody));

    expect(res.status).toBe(401);
  });

  it('returns 403 when caller role is ANALYST (not OWNER or ADMIN)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', orgId: 'org1', role: 'ANALYST' } });

    const res = await POST(makeReq(validBody));

    expect(res.status).toBe(403);
    expect(mockFindOrg).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

});
