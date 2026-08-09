import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    auditLog:     { create: vi.fn() },
  },
}));

import { GET, PATCH } from './route';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const mockAuth  = auth  as ReturnType<typeof vi.fn>;
const mockOrg   = (prisma.organization as any);
const mockAudit = (prisma.auditLog    as any);

function session(role = 'OWNER', orgId = 'org-1', userId = 'user-1') {
  return { user: { id: userId, orgId, role } };
}

function patchReq(body: unknown) {
  return new NextRequest('http://localhost/api/settings/org', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

const BASE_ORG = { id: 'org-1', name: 'Test Org', slug: 'test', plan: 'PRO', defaultSourceTaxRate: null };

// ─── GET ──────────────────────────────────────────────────────────────────────

describe('GET /api/settings/org', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/settings/org'));
    expect(res.status).toBe(401);
  });

  it('returns org with defaultSourceTaxRate field', async () => {
    mockAuth.mockResolvedValue(session());
    mockOrg.findUniqueOrThrow.mockResolvedValue({ ...BASE_ORG, defaultSourceTaxRate: 0.0825 });
    const res  = await GET(new NextRequest('http://localhost/api/settings/org'));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveProperty('defaultSourceTaxRate', 0.0825);
  });

  it('returns null defaultSourceTaxRate when not set', async () => {
    mockAuth.mockResolvedValue(session());
    mockOrg.findUniqueOrThrow.mockResolvedValue(BASE_ORG);
    const res  = await GET(new NextRequest('http://localhost/api/settings/org'));
    const data = await res.json();
    expect(data.defaultSourceTaxRate).toBeNull();
  });
});

// ─── PATCH authorization ──────────────────────────────────────────────────────

describe('PATCH /api/settings/org — authorization', () => {
  beforeEach(() => {
    mockOrg.update.mockResolvedValue(BASE_ORG);
    mockAudit.create.mockResolvedValue({});
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(patchReq({ name: 'Test' }));
    expect(res.status).toBe(401);
  });

  it('OWNER can update', async () => {
    mockAuth.mockResolvedValue(session('OWNER'));
    const res = await PATCH(patchReq({ name: 'My Org' }));
    expect(res.status).toBe(200);
  });

  it('ADMIN can update', async () => {
    mockAuth.mockResolvedValue(session('ADMIN'));
    const res = await PATCH(patchReq({ name: 'My Org' }));
    expect(res.status).toBe(200);
  });

  it('ANALYST cannot update — 403', async () => {
    mockAuth.mockResolvedValue(session('ANALYST'));
    const res = await PATCH(patchReq({ name: 'My Org' }));
    expect(res.status).toBe(403);
  });

  it('VIEWER cannot update — 403', async () => {
    mockAuth.mockResolvedValue(session('VIEWER'));
    const res = await PATCH(patchReq({ name: 'My Org' }));
    expect(res.status).toBe(403);
  });
});

// ─── PATCH defaultSourceTaxRate validation ────────────────────────────────────

describe('PATCH /api/settings/org — defaultSourceTaxRate', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(session('OWNER'));
    mockAudit.create.mockResolvedValue({});
  });

  it('accepts valid decimal rate 0.0825 (8.25%)', async () => {
    mockOrg.update.mockResolvedValue({ ...BASE_ORG, defaultSourceTaxRate: 0.0825 });
    const res = await PATCH(patchReq({ defaultSourceTaxRate: 0.0825 }));
    expect(res.status).toBe(200);
    expect(mockOrg.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ defaultSourceTaxRate: 0.0825 }) })
    );
  });

  it('accepts 0 (tax-exempt / resale certificate)', async () => {
    mockOrg.update.mockResolvedValue({ ...BASE_ORG, defaultSourceTaxRate: 0 });
    const res = await PATCH(patchReq({ defaultSourceTaxRate: 0 }));
    expect(res.status).toBe(200);
  });

  it('accepts null (clears org rate — reverts to system default)', async () => {
    mockOrg.update.mockResolvedValue(BASE_ORG);
    const res = await PATCH(patchReq({ defaultSourceTaxRate: null }));
    expect(res.status).toBe(200);
  });

  it('accepts 0.15 (maximum allowed, 15%)', async () => {
    mockOrg.update.mockResolvedValue({ ...BASE_ORG, defaultSourceTaxRate: 0.15 });
    const res = await PATCH(patchReq({ defaultSourceTaxRate: 0.15 }));
    expect(res.status).toBe(200);
  });

  it('rejects negative rate', async () => {
    const res = await PATCH(patchReq({ defaultSourceTaxRate: -0.01 }));
    expect(res.status).toBe(400);
  });

  it('rejects rate above 15% (0.16)', async () => {
    const res = await PATCH(patchReq({ defaultSourceTaxRate: 0.16 }));
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric string', async () => {
    const res = await PATCH(patchReq({ defaultSourceTaxRate: 'eight-percent' }));
    expect(res.status).toBe(400);
  });

  it('name update still works alongside tax rate', async () => {
    mockOrg.update.mockResolvedValue({ ...BASE_ORG, name: 'New Name', defaultSourceTaxRate: 0.065 });
    const res = await PATCH(patchReq({ name: 'New Name', defaultSourceTaxRate: 0.065 }));
    expect(res.status).toBe(200);
    expect(mockOrg.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'New Name', defaultSourceTaxRate: 0.065 }) })
    );
  });
});
