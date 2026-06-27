import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock                = vi.fn();
const subscriptionFindUnique  = vi.fn();
const createCheckoutSession   = vi.fn();
const createStripeCustomer    = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: { findUnique: (...args: unknown[]) => subscriptionFindUnique(...args), upsert: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/stripe', () => ({
  PRICE_IDS: { STARTER: undefined, PRO: 'price_pro_123', ENTERPRISE: 'price_ent_123' },
  createCheckoutSession: (...args: unknown[]) => createCheckoutSession(...args),
  createStripeCustomer:  (...args: unknown[]) => createStripeCustomer(...args),
}));

import { POST } from './route';

function makeFormRequest(plan: unknown) {
  const form = new FormData();
  if (plan !== undefined) form.set('plan', plan as string);
  return new Request('http://localhost/api/billing/checkout', { method: 'POST', body: form }) as any;
}

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    authMock.mockReset();
    subscriptionFindUnique.mockReset();
    createCheckoutSession.mockReset();
    createStripeCustomer.mockReset();
    authMock.mockResolvedValue({ user: { orgId: 'org_1', role: 'OWNER', email: 'owner@example.com' } });
    subscriptionFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_123' });
    createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/session' });
  });

  it('rejects a plan value outside the known enum', async () => {
    const res = await POST(makeFormRequest('NOT_A_REAL_PLAN'));
    expect(res.status).toBe(400);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects a missing plan field', async () => {
    const res = await POST(makeFormRequest(undefined));
    expect(res.status).toBe(400);
  });

  it('rejects a syntactically valid-looking but unconfigured plan (no price id)', async () => {
    const res = await POST(makeFormRequest('STARTER'));
    expect(res.status).toBe(400);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('proceeds to checkout for a valid, configured plan', async () => {
    const res = await POST(makeFormRequest('PRO'));
    expect(createCheckoutSession).toHaveBeenCalledWith('cus_123', 'price_pro_123', expect.any(String));
    expect(res.status).toBe(303);
  });

  it('rejects non-owners before even parsing the plan', async () => {
    authMock.mockResolvedValue({ user: { orgId: 'org_1', role: 'MEMBER', email: 'member@example.com' } });
    const res = await POST(makeFormRequest('PRO'));
    expect(res.status).toBe(403);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });
});
