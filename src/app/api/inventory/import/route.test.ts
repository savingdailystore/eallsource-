import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const upsert    = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { inventoryItem: { upsert: (...args: unknown[]) => upsert(...args) } },
}));

import { POST } from './route';

function makeRequest(csv: unknown) {
  return new Request('http://localhost/api/inventory/import', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ csv }),
  });
}

describe('POST /api/inventory/import', () => {
  beforeEach(() => {
    authMock.mockReset();
    upsert.mockReset();
    authMock.mockResolvedValue({ user: { orgId: 'org_1' } });
    upsert.mockResolvedValue({});
  });

  it('imports a small well-formed CSV', async () => {
    const csv = 'ASIN,Product Name,Available\nB000111222,Widget,5\nB000333444,Gadget,3\n';
    const res  = await POST(makeRequest(csv));
    const body = await res.json();
    expect(body.imported).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('rejects a CSV payload larger than the size bound', async () => {
    // 11MB of filler content, comfortably over the 10MB limit.
    const huge = 'ASIN,Product Name\n' + 'B000111222,'.repeat(1_100_000);
    const res  = await POST(makeRequest(huge));
    expect(res.status).toBe(413);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects a CSV with more rows than the row-count bound', async () => {
    const header = 'ASIN,Product Name\n';
    const rows   = Array.from({ length: 50_001 }, (_, i) => `B${String(i).padStart(9, '0')},Item ${i}`).join('\n');
    const res    = await POST(makeRequest(header + rows));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('accepts a CSV right at the row-count bound', async () => {
    const header = 'ASIN,Product Name\n';
    // MAX_ROWS counts the header row too, so this is exactly at the limit.
    const rows   = Array.from({ length: 49_999 }, (_, i) => `B${String(i).padStart(9, '0')},Item ${i}`).join('\n');
    const res    = await POST(makeRequest(header + rows));
    expect(res.status).toBe(200);
  });
});
