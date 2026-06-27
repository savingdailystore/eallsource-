import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock        = vi.fn();
const getSpApiClient  = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({ prisma: { inventoryItem: { updateMany: vi.fn(), upsert: vi.fn() } } }));
vi.mock('@/lib/sp-api', () => ({ getSpApiClient: (...args: unknown[]) => getSpApiClient(...args) }));

import { POST } from './route';

describe('POST /api/amazon/inventory', () => {
  beforeEach(() => {
    authMock.mockReset();
    getSpApiClient.mockReset();
    authMock.mockResolvedValue({ user: { orgId: 'org_1' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('maps a raw SP-API error to a generic sp_api_error code without the original message', async () => {
    getSpApiClient.mockRejectedValue(new Error('Invalid access token for seller A1B2C3D4E5: token=Atza|abcdef123'));
    const res  = await POST();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe('sp_api_error');
    expect(body.message).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('Atza|');
    expect(console.error).toHaveBeenCalled();
  });

  it('maps a missing-env error to missing_env without leaking which vars', async () => {
    getSpApiClient.mockRejectedValue(new Error('LWA_CLIENT_ID / LWA_CLIENT_SECRET env vars not set'));
    const res  = await POST();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe('missing_env');
    expect(body.message).toBeUndefined();
  });

  it('maps a not-connected error to not_connected', async () => {
    getSpApiClient.mockRejectedValue(new Error('Amazon account not connected for this org'));
    const res  = await POST();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('not_connected');
  });
});
