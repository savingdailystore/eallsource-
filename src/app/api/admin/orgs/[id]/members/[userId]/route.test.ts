// Tests for PATCH /api/admin/orgs/[id]/members/[userId]
//
// Four required cases per spec:
//   1. Successful role update
//   2. Invalid role rejected (not in ADMIN|ANALYST|VIEWER)
//   3. Last owner cannot be downgraded (OWNER role blocked)
//   4. Unauthorized user cannot update roles (non-platform-admin)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/admin', () => ({
  isPlatformAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      update:    vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { auth } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';

const mockAuth            = auth as ReturnType<typeof vi.fn>;
const mockIsPlatformAdmin = isPlatformAdmin as ReturnType<typeof vi.fn>;
const mockFindFirst       = prisma.user.findFirst as ReturnType<typeof vi.fn>;
const mockUpdate          = prisma.user.update    as ReturnType<typeof vi.fn>;

// Helper: build a NextRequest with the given body
function makeReq(body: object) {
  return new NextRequest('http://localhost/api/admin/orgs/org1/members/user1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Route params for all tests
const params = Promise.resolve({ id: 'org1', userId: 'user1' });

beforeEach(() => {
  vi.clearAllMocks();
  // Default: caller is a platform admin
  mockAuth.mockResolvedValue({ user: { email: 'savingdailystore@gmail.com' } });
  mockIsPlatformAdmin.mockReturnValue(true);
});

// ── Test 1: Successful role update ───────────────────────────────────────────

describe('PATCH /api/admin/orgs/[id]/members/[userId]', () => {
  it('updates the role and returns 200 when all guards pass', async () => {
    mockFindFirst.mockResolvedValue({ id: 'user1', email: 'user@org.com', role: 'ANALYST' });
    mockUpdate.mockResolvedValue({ id: 'user1', email: 'user@org.com', role: 'ADMIN' });

    const res = await PATCH(makeReq({ role: 'ADMIN' }), { params });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user.role).toBe('ADMIN');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'ADMIN' } }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ADMIN_UPDATE_USER_ROLE' }),
      }),
    );
  });

  // ── Test 2: Invalid role rejected ──────────────────────────────────────────

  it('rejects a role value not in ADMIN|ANALYST|VIEWER with 400', async () => {
    mockFindFirst.mockResolvedValue({ id: 'user1', email: 'user@org.com', role: 'ANALYST' });

    const res = await PATCH(makeReq({ role: 'SUPERADMIN' }), { params });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // ── Test 3: Last owner cannot be downgraded ────────────────────────────────

  it("returns 400 and does not update when the target user's role is OWNER", async () => {
    mockFindFirst.mockResolvedValue({ id: 'user1', email: 'owner@org.com', role: 'OWNER' });

    const res = await PATCH(makeReq({ role: 'ADMIN' }), { params });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/owner/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // ── Test 4: Unauthorized user cannot update roles ──────────────────────────

  it('returns 403 when the caller is not a platform admin', async () => {
    mockIsPlatformAdmin.mockReturnValue(false);

    const res = await PATCH(makeReq({ role: 'ANALYST' }), { params });

    expect(res.status).toBe(403);
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // ── Bonus: user not in target org ─────────────────────────────────────────

  it('returns 404 when the user does not belong to the specified org', async () => {
    mockFindFirst.mockResolvedValue(null);

    const res = await PATCH(makeReq({ role: 'ANALYST' }), { params });

    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
