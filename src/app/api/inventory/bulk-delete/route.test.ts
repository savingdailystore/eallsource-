import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock   = vi.fn();
const deleteMany = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { inventoryItem: { deleteMany: (...args: unknown[]) => deleteMany(...args) } },
}));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/inventory/bulk-delete', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

describe('POST /api/inventory/bulk-delete', () => {
  beforeEach(() => {
    authMock.mockReset();
    deleteMany.mockReset();
    authMock.mockResolvedValue({ user: { orgId: 'org_1' } });
    deleteMany.mockResolvedValue({ count: 2 });
  });

  it('rejects an empty ids array', async () => {
    const res = await POST(makeRequest({ ids: [] }));
    expect(res.status).toBe(400);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a non-array ids field', async () => {
    const res = await POST(makeRequest({ ids: 'not-an-array' }));
    expect(res.status).toBe(400);
  });

  it('rejects an array containing a non-string/empty-string entry', async () => {
    const res = await POST(makeRequest({ ids: ['valid-id', ''] }));
    expect(res.status).toBe(400);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('rejects an array larger than the bound', async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `id_${i}`);
    const res = await POST(makeRequest({ ids }));
    expect(res.status).toBe(400);
  });

  it('deletes scoped to the caller org for a valid request', async () => {
    const res = await POST(makeRequest({ ids: ['id_1', 'id_2'] }));
    expect(res.status).toBe(200);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['id_1', 'id_2'] }, orgId: 'org_1' } });
  });
});
