import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Prisma mock ──────────────────────────────────────────────────────────────
const leadFindMany         = vi.fn();
const orgFindMany          = vi.fn();
const orgFindFirst         = vi.fn();
const orgFindUnique        = vi.fn();
const productUpsert        = vi.fn();
const leadFindFirst        = vi.fn();
const leadCreate           = vi.fn();
const leadUpdate           = vi.fn();
const entitlementUpsert    = vi.fn();
const entitlementFindMany  = vi.fn();
const brandBlockFindMany   = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead:            { findMany: (...a: unknown[]) => leadFindMany(...a), findFirst: (...a: unknown[]) => leadFindFirst(...a), create: (...a: unknown[]) => leadCreate(...a), update: (...a: unknown[]) => leadUpdate(...a) },
    organization:    { findMany: (...a: unknown[]) => orgFindMany(...a), findFirst: (...a: unknown[]) => orgFindFirst(...a), findUnique: (...a: unknown[]) => orgFindUnique(...a) },
    product:         { upsert: (...a: unknown[]) => productUpsert(...a) },
    leadEntitlement: { upsert: (...a: unknown[]) => entitlementUpsert(...a), findMany: (...a: unknown[]) => entitlementFindMany(...a) },
    brandBlock:      { findMany: (...a: unknown[]) => brandBlockFindMany(...a) },
  },
}));

// ── lead-delivery mock ───────────────────────────────────────────────────────
const getWeeklyLeadUsageMock      = vi.fn();
const getCurrentDeliveryWeekStart = vi.fn(() => new Date('2026-07-20T13:00:00Z'));
const allowedLeadTiersForPlanMock = vi.fn();

vi.mock('@/lib/lead-delivery', () => ({
  getCurrentDeliveryWeekStart: () => getCurrentDeliveryWeekStart(),
  getWeeklyLeadUsage:          (...a: unknown[]) => getWeeklyLeadUsageMock(...a),
  allowedLeadTiersForPlan:     (...a: unknown[]) => allowedLeadTiersForPlanMock(...a),
}));

import { broadcastLeads, backfillOrgFromSource } from './broadcast';

// ── Helpers ──────────────────────────────────────────────────────────────────
const WEEK_START = new Date('2026-07-20T13:00:00Z');

function makeSourceLead(overrides: Record<string, unknown> = {}) {
  return {
    id:        'src-lead-1',
    orgId:     'source-org',
    score:     85,
    status:    'NEW',
    leadTier:  'BASIC',
    createdAt: new Date('2026-07-20T14:00:00Z'),
    product: {
      id: 'prod-1', asin: 'B001BASIC01', orgId: 'source-org',
      upc: null, ean: null, model: null, brand: 'TestBrand', title: 'Test Product',
      category: 'Electronics', imageUrl: null, sourceUrl: 'https://walmart.com/p/1',
      sourceRetailer: 'Walmart', sourcePrice: 10, sourceListPrice: 12, onSale: false,
      sourceTax: 0, sourceShipping: 0, availableDiscounts: null, discountSources: null,
      finalCost: 10, amazonUrl: 'https://amazon.com/dp/B001BASIC01', buyBoxPrice: 20,
      lowestFbaPrice: 20, estimatedResellPrice: 20, totalLandedCost: 10, amazonFees: 3,
      referralFee: 2, fbaFee: 1, storageFee: 0, prepFee: 0, taxAmount: 0,
      price: 20, fees: 3, profit: 7, roi: 70, margin: 35, bsr: 1000, bsrPercentage: 1,
      buyBoxOwner: null, fbaSellers: 5, totalSellers: 10, monthlySales: 100,
      expectedUnitsPerSeller: 10, amazonIsSeller: false, amazonOwnsBuyBox: false,
      buyBoxSuppressed: false, isVariation: false, parentAsin: null, roiImplausible: false,
      rating: 4.5, reviewCount: 200, lowReviews: false, matchMethod: 'ASIN',
      matchConfidence: 95, identityScore: 95, urlScore: 90, priceScore: 80,
      inventoryScore: 75, validationPassed: true, autoUngated: false, ipRiskScore: 'LOW',
      gatingRisk: 'LOW', hasHazmat: false, isBrandRestricted: false, isCategoryGated: false,
      isPrivateLabel: false, isGenericBrand: false, isMeltable: false,
      feeEstimateConfirmed: true,
      // Phase 20.2M-1D-4: FRESH SP_API defaults so guard passes in all existing tests
      feeEstimateSource: 'SP_API', feeEstimatedAt: new Date(), feeEstimatePrice: 20,
      hasIpComplaintHistory: false, ipComplaintNote: null,
      demandLevel: 'HIGH', priceStability: 'STABLE', priceTrend: null, priceTrendPct: null,
      keepaLink: null, notes: null, score: 85,
    },
    ...overrides,
  };
}

// ── broadcastLeads tests ─────────────────────────────────────────────────────
describe('broadcastLeads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productUpsert.mockResolvedValue({ id: 'cust-prod-1', asin: 'B001BASIC01' });
    leadFindFirst.mockResolvedValue(null); // no existing lead → create path
    leadCreate.mockResolvedValue({ id: 'cust-lead-1' });
    leadUpdate.mockResolvedValue({});
    entitlementUpsert.mockResolvedValue({});
    entitlementFindMany.mockResolvedValue([]); // no pre-existing entitlements
    getWeeklyLeadUsageMock.mockResolvedValue(0);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC', 'PRO']);
    brandBlockFindMany.mockResolvedValue([]); // no active brand blocks by default
  });

  it('returns 0 for empty leadIds', async () => {
    expect(await broadcastLeads('source-org', [])).toBe(0);
  });

  it('returns 0 when no source leads found', async () => {
    leadFindMany.mockResolvedValue([]);
    expect(await broadcastLeads('source-org', ['id-1'])).toBe(0);
  });

  it('returns 0 when no target orgs', async () => {
    leadFindMany.mockResolvedValue([makeSourceLead()]);
    orgFindMany.mockResolvedValue([]);
    expect(await broadcastLeads('source-org', ['src-lead-1'])).toBe(0);
  });

  it('creates AUTO_BROADCAST entitlement for each newly delivered lead', async () => {
    leadFindMany.mockResolvedValue([makeSourceLead()]);
    orgFindMany.mockResolvedValue([{ id: 'cust-org-1', plan: 'PRO' }]);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC', 'PRO']);

    const count = await broadcastLeads('source-org', ['src-lead-1']);
    expect(count).toBe(1);
    expect(entitlementUpsert).toHaveBeenCalledOnce();
    const call = entitlementUpsert.mock.calls[0][0];
    expect(call.create.deliverySource).toBe('AUTO_BROADCAST');
    expect(call.create.countsTowardWeeklyLimit).toBe(true);
    expect(call.create.leadTierAtDelivery).toBe('BASIC');
    expect(call.create.deliveryWeekStart).toEqual(WEEK_START);
    expect(call.create.orgId).toBe('cust-org-1');
    expect(call.create.leadId).toBe('cust-lead-1');
  });

  it('STARTER org receives only BASIC leads — PRO lead is filtered out', async () => {
    const proLead   = makeSourceLead({ id: 'src-lead-pro',   leadTier: 'PRO' });
    const basicLead = makeSourceLead({ id: 'src-lead-basic', leadTier: 'BASIC' });
    leadFindMany.mockResolvedValue([proLead, basicLead]);
    orgFindMany.mockResolvedValue([{ id: 'cust-starter', plan: 'STARTER' }]);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC']);
    leadCreate.mockResolvedValue({ id: 'cust-lead-basic' });

    const count = await broadcastLeads('source-org', ['src-lead-pro', 'src-lead-basic']);
    expect(count).toBe(1);
    expect(entitlementUpsert).toHaveBeenCalledOnce();
    expect(entitlementUpsert.mock.calls[0][0].create.leadTierAtDelivery).toBe('BASIC');
  });

  it('STARTER org respects 3-lead weekly limit', async () => {
    const leads = [1, 2, 3, 4].map(i => makeSourceLead({ id: `lead-${i}`, leadTier: 'BASIC' }));
    leadFindMany.mockResolvedValue(leads);
    orgFindMany.mockResolvedValue([{ id: 'cust-starter', plan: 'STARTER' }]);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC']);
    getWeeklyLeadUsageMock.mockResolvedValue(0);
    let callIdx = 0;
    leadCreate.mockImplementation(() => Promise.resolve({ id: `cust-lead-${++callIdx}` }));

    const count = await broadcastLeads('source-org', leads.map(l => l.id));
    expect(count).toBe(3);
    expect(entitlementUpsert).toHaveBeenCalledTimes(3);
  });

  it('PRO org respects partial-week remaining slots', async () => {
    const leads = Array.from({ length: 10 }, (_, i) => makeSourceLead({ id: `lead-${i}`, leadTier: 'BASIC' }));
    leadFindMany.mockResolvedValue(leads);
    orgFindMany.mockResolvedValue([{ id: 'cust-pro', plan: 'PRO' }]);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC', 'PRO']);
    getWeeklyLeadUsageMock.mockResolvedValue(8); // 15 - 8 = 7 remaining
    let callIdx = 0;
    leadCreate.mockImplementation(() => Promise.resolve({ id: `cust-lead-${++callIdx}` }));

    const count = await broadcastLeads('source-org', leads.map(l => l.id));
    expect(count).toBe(7);
  });

  it('skips org already at weekly limit', async () => {
    leadFindMany.mockResolvedValue([makeSourceLead()]);
    orgFindMany.mockResolvedValue([{ id: 'cust-full', plan: 'STARTER' }]);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC']);
    getWeeklyLeadUsageMock.mockResolvedValue(3); // STARTER limit = 3 → 0 slots

    const count = await broadcastLeads('source-org', ['src-lead-1']);
    expect(count).toBe(0);
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it('does not deliver PREMIUM leads to STARTER or PRO orgs', async () => {
    const premiumLead = makeSourceLead({ id: 'lead-premium', leadTier: 'PREMIUM' });
    leadFindMany.mockResolvedValue([premiumLead]);
    orgFindMany.mockResolvedValue([
      { id: 'cust-starter', plan: 'STARTER' },
      { id: 'cust-pro',     plan: 'PRO' },
    ]);
    allowedLeadTiersForPlanMock
      .mockReturnValueOnce(['BASIC'])
      .mockReturnValueOnce(['BASIC', 'PRO']);

    expect(await broadcastLeads('source-org', ['lead-premium'])).toBe(0);
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  // ── Already-owned / dedup tests ───────────────────────────────────────────
  it('skips leads org already has entitlements for and delivers next eligible leads', async () => {
    // Org has a STARTER plan (3 slots) but already holds customer copies of leads 1 and 2.
    // Broadcast has 4 source leads. Should skip 1+2, deliver 3+4 (2 new, within 3-slot budget).
    const leads = [1, 2, 3, 4].map(i =>
      makeSourceLead({ id: `src-lead-${i}`, leadTier: 'BASIC' }),
    );
    leadFindMany.mockResolvedValue(leads);
    orgFindMany.mockResolvedValue([{ id: 'cust-org', plan: 'STARTER' }]);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC']);
    getWeeklyLeadUsageMock.mockResolvedValue(0);

    // Org already owns cust-lead-1 and cust-lead-2
    entitlementFindMany.mockResolvedValue([
      { leadId: 'cust-lead-1' },
      { leadId: 'cust-lead-2' },
    ]);

    // copyLeadToOrg: src-lead-1 → existing cust-lead-1 (leadFindFirst returns it)
    //                src-lead-2 → existing cust-lead-2
    //                src-lead-3 → new cust-lead-3
    //                src-lead-4 → new cust-lead-4
    leadFindFirst
      .mockResolvedValueOnce({ id: 'cust-lead-1' })
      .mockResolvedValueOnce({ id: 'cust-lead-2' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    leadCreate
      .mockResolvedValueOnce({ id: 'cust-lead-3' })
      .mockResolvedValueOnce({ id: 'cust-lead-4' });

    const count = await broadcastLeads('source-org', leads.map(l => l.id));
    expect(count).toBe(2); // only leads 3 and 4 are new
    expect(entitlementUpsert).toHaveBeenCalledTimes(2);
    const deliveredIds = entitlementUpsert.mock.calls.map((c: any[]) => c[0].create.leadId);
    expect(deliveredIds).toEqual(['cust-lead-3', 'cust-lead-4']);
  });

  it('PRO org with partial history: fills remaining slots with new eligible leads only', async () => {
    // PRO org already has 13 leads entitled (from a previous drop); 2 slots remain.
    // Source has 5 new BASIC leads. Should deliver exactly 2.
    const newLeads = [1, 2, 3, 4, 5].map(i =>
      makeSourceLead({ id: `src-new-${i}`, leadTier: 'BASIC' }),
    );
    leadFindMany.mockResolvedValue(newLeads);
    orgFindMany.mockResolvedValue([{ id: 'cust-pro', plan: 'PRO' }]);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC', 'PRO']);
    getWeeklyLeadUsageMock.mockResolvedValue(13); // 15 - 13 = 2 slots

    entitlementFindMany.mockResolvedValue([]); // these specific source leads are new to the org
    let callIdx = 100;
    leadCreate.mockImplementation(() => Promise.resolve({ id: `cust-lead-${++callIdx}` }));

    const count = await broadcastLeads('source-org', newLeads.map(l => l.id));
    expect(count).toBe(2);
    expect(entitlementUpsert).toHaveBeenCalledTimes(2);
  });

  it('re-running broadcast does not re-deliver already-entitled leads or consume new slots', async () => {
    leadFindMany.mockResolvedValue([makeSourceLead()]);
    orgFindMany.mockResolvedValue([{ id: 'cust-org', plan: 'PRO' }]);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC', 'PRO']);
    getWeeklyLeadUsageMock.mockResolvedValue(1); // 1 already counted (the previous run)

    // The lead from the previous run is already entitled
    entitlementFindMany.mockResolvedValue([{ leadId: 'cust-lead-1' }]);
    leadFindFirst.mockResolvedValue({ id: 'cust-lead-1' }); // copyLeadToOrg finds existing

    const count = await broadcastLeads('source-org', ['src-lead-1']);
    expect(count).toBe(0); // no new entitlements created
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it('BACKFILL entitlements (countsTowardWeeklyLimit=false) still prevent duplicate delivery', async () => {
    // Org has 3 BACKFILL-sourced leads (not counted toward quota → slots = 3 full).
    // Source has those 3 leads + 2 new ones. Broadcast must skip the 3 already-backfilled
    // and deliver only the 2 new ones.
    const allLeads = [1, 2, 3, 4, 5].map(i =>
      makeSourceLead({ id: `src-lead-${i}`, leadTier: 'BASIC' }),
    );
    leadFindMany.mockResolvedValue(allLeads);
    orgFindMany.mockResolvedValue([{ id: 'cust-org', plan: 'STARTER' }]);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC']);
    // BACKFILL rows don't count toward quota → usage = 0 → slots = 3
    getWeeklyLeadUsageMock.mockResolvedValue(0);

    // But the org already has entitlement rows for the customer copies of leads 1-3
    entitlementFindMany.mockResolvedValue([
      { leadId: 'cust-lead-1' },
      { leadId: 'cust-lead-2' },
      { leadId: 'cust-lead-3' },
    ]);
    leadFindFirst
      .mockResolvedValueOnce({ id: 'cust-lead-1' }) // src-lead-1 → already owned
      .mockResolvedValueOnce({ id: 'cust-lead-2' }) // src-lead-2 → already owned
      .mockResolvedValueOnce({ id: 'cust-lead-3' }) // src-lead-3 → already owned
      .mockResolvedValueOnce(null)                   // src-lead-4 → new
      .mockResolvedValueOnce(null);                  // src-lead-5 → new
    leadCreate
      .mockResolvedValueOnce({ id: 'cust-lead-4' })
      .mockResolvedValueOnce({ id: 'cust-lead-5' });

    const count = await broadcastLeads('source-org', allLeads.map(l => l.id));
    expect(count).toBe(2); // only leads 4 and 5 (not exceeding 3 slots, but only 2 new available)
    const deliveredIds = entitlementUpsert.mock.calls.map((c: any[]) => c[0].create.leadId);
    expect(deliveredIds).toEqual(['cust-lead-4', 'cust-lead-5']);
  });

  it('returns 0 without error when no new eligible leads exist', async () => {
    leadFindMany.mockResolvedValue([makeSourceLead()]);
    orgFindMany.mockResolvedValue([{ id: 'cust-org', plan: 'PRO' }]);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC', 'PRO']);
    getWeeklyLeadUsageMock.mockResolvedValue(0);

    // All source leads already entitled
    entitlementFindMany.mockResolvedValue([{ leadId: 'cust-lead-1' }]);
    leadFindFirst.mockResolvedValue({ id: 'cust-lead-1' });

    const count = await broadcastLeads('source-org', ['src-lead-1']);
    expect(count).toBe(0);
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it('is idempotent — upsert update is empty no-op', async () => {
    leadFindMany.mockResolvedValue([makeSourceLead()]);
    orgFindMany.mockResolvedValue([{ id: 'cust-org-1', plan: 'PRO' }]);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC', 'PRO']);

    await broadcastLeads('source-org', ['src-lead-1']);
    expect(entitlementUpsert.mock.calls[0][0].update).toEqual({});
  });

  it('source org does not create entitlements for itself', async () => {
    leadFindMany.mockResolvedValue([makeSourceLead()]);
    orgFindMany.mockResolvedValue([]); // excluded via `id: { not: sourceOrgId }`
    expect(await broadcastLeads('source-org', ['src-lead-1'])).toBe(0);
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });
});

// ── backfillOrgFromSource tests ───────────────────────────────────────────────
describe('backfillOrgFromSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productUpsert.mockResolvedValue({ id: 'cust-prod-1', asin: 'B001BASIC01' });
    leadFindFirst.mockResolvedValue(null);
    leadCreate.mockResolvedValue({ id: 'cust-lead-1' });
    leadUpdate.mockResolvedValue({});
    entitlementUpsert.mockResolvedValue({});
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC', 'PRO']);
    brandBlockFindMany.mockResolvedValue([]); // no active brand blocks by default
  });

  it('returns 0 if source org not found', async () => {
    orgFindFirst.mockResolvedValue(null);
    orgFindUnique.mockResolvedValue({ id: 'new-org', plan: 'PRO' });
    expect(await backfillOrgFromSource('new-org')).toBe(0);
  });

  it('returns 0 if targetOrgId equals source org', async () => {
    orgFindFirst.mockResolvedValue({ id: 'source-org' });
    orgFindUnique.mockResolvedValue({ id: 'source-org', plan: 'ENTERPRISE' });
    expect(await backfillOrgFromSource('source-org')).toBe(0);
  });

  it('creates BACKFILL entitlements for a new org', async () => {
    orgFindFirst.mockResolvedValue({ id: 'source-org' });
    orgFindUnique.mockResolvedValue({ id: 'new-org', plan: 'PRO' });
    leadFindMany.mockResolvedValue([makeSourceLead()]);

    const count = await backfillOrgFromSource('new-org');
    expect(count).toBe(1);
    expect(entitlementUpsert).toHaveBeenCalledOnce();
    const call = entitlementUpsert.mock.calls[0][0];
    expect(call.create.deliverySource).toBe('BACKFILL');
    expect(call.create.countsTowardWeeklyLimit).toBe(true);
    expect(call.create.orgId).toBe('new-org');
  });

  it('respects plan limit — STARTER gets at most 3 leads (take: 3 passed to DB)', async () => {
    orgFindFirst.mockResolvedValue({ id: 'source-org' });
    orgFindUnique.mockResolvedValue({ id: 'new-starter', plan: 'STARTER' });
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC']);
    const leads = [1, 2, 3].map(i => makeSourceLead({ id: `lead-${i}` }));
    leadFindMany.mockResolvedValue(leads);
    let callIdx = 0;
    leadCreate.mockImplementation(() => Promise.resolve({ id: `cust-lead-${++callIdx}` }));

    const count = await backfillOrgFromSource('new-starter');
    expect(count).toBe(3);
    expect(leadFindMany.mock.calls[0][0].take).toBe(3);
  });

  it('filters source leads by allowed tiers', async () => {
    orgFindFirst.mockResolvedValue({ id: 'source-org' });
    orgFindUnique.mockResolvedValue({ id: 'new-starter', plan: 'STARTER' });
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC']);
    leadFindMany.mockResolvedValue([]);

    await backfillOrgFromSource('new-starter');
    expect(leadFindMany.mock.calls[0][0].where.leadTier).toEqual({ in: ['BASIC'] });
  });

  it('PRO org backfill takes up to 15 leads', async () => {
    orgFindFirst.mockResolvedValue({ id: 'source-org' });
    orgFindUnique.mockResolvedValue({ id: 'new-pro', plan: 'PRO' });
    leadFindMany.mockResolvedValue([]);
    await backfillOrgFromSource('new-pro');
    expect(leadFindMany.mock.calls[0][0].take).toBe(15);
  });

  it('uses score desc then createdAt desc ordering', async () => {
    orgFindFirst.mockResolvedValue({ id: 'source-org' });
    orgFindUnique.mockResolvedValue({ id: 'new-org', plan: 'PRO' });
    leadFindMany.mockResolvedValue([]);
    await backfillOrgFromSource('new-org');
    expect(leadFindMany.mock.calls[0][0].orderBy).toEqual([{ score: 'desc' }, { createdAt: 'desc' }]);
  });

  it('future backfill countsTowardWeeklyLimit=true (distinct from 14.8a grandfather rows)', async () => {
    orgFindFirst.mockResolvedValue({ id: 'source-org' });
    orgFindUnique.mockResolvedValue({ id: 'new-org', plan: 'PRO' });
    leadFindMany.mockResolvedValue([makeSourceLead()]);
    await backfillOrgFromSource('new-org');
    expect(entitlementUpsert.mock.calls[0][0].create.countsTowardWeeklyLimit).toBe(true);
  });
});

// ── Fee metadata copy (Phase 20.2M-1D-2) ─────────────────────────────────────
describe('copyLeadToOrg — copies fee metadata fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productUpsert.mockResolvedValue({ id: 'cust-prod-1', asin: 'B001BASIC01' });
    leadFindFirst.mockResolvedValue(null);
    leadCreate.mockResolvedValue({ id: 'cust-lead-1' });
    leadUpdate.mockResolvedValue({});
    entitlementUpsert.mockResolvedValue({});
    entitlementFindMany.mockResolvedValue([]);
    getWeeklyLeadUsageMock.mockResolvedValue(0);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC', 'PRO']);
    brandBlockFindMany.mockResolvedValue([]);
  });

  it('copies feeEstimateSource, feeEstimatedAt, feeEstimatePrice, priceCheckedAt to target product', async () => {
    const feeEstimatedAt = new Date('2026-08-09T06:00:00Z');
    const priceCheckedAt = new Date('2026-08-09T06:00:00Z');

    // feeEstimatePrice must be consistent with buyBoxPrice/estimatedResellPrice (20)
    // so the price-change guard does not block the copy.
    const leadWithFeeData = makeSourceLead({
      product: {
        ...makeSourceLead().product,
        feeEstimateSource: 'SP_API',
        feeEstimatedAt,
        feeEstimatePrice: 20,   // matches buyBoxPrice & estimatedResellPrice (0% change)
        priceCheckedAt,
      },
    });

    leadFindMany.mockResolvedValue([leadWithFeeData]);
    orgFindMany.mockResolvedValue([{ id: 'cust-org-1', plan: 'PRO' }]);

    await broadcastLeads('source-org', ['src-lead-1']);

    const upsertCall = productUpsert.mock.calls[0][0];
    expect(upsertCall.create.feeEstimateSource).toBe('SP_API');
    expect(upsertCall.create.feeEstimatedAt).toStrictEqual(feeEstimatedAt);
    expect(upsertCall.create.feeEstimatePrice).toBe(20);
    expect(upsertCall.create.priceCheckedAt).toStrictEqual(priceCheckedAt);
  });

  it('skips (does not broadcast) products with null fee metadata — no Product/Lead/Entitlement created', async () => {
    // Phase 20.2M-1D-4: null fee source → fee guard blocks broadcast.
    // Previously this test verified null metadata was copied; with the guard it is skipped entirely.
    const leadNullFees = makeSourceLead({
      product: {
        ...makeSourceLead().product,
        feeEstimateSource: null,
        feeEstimatedAt:    null,
        feeEstimatePrice:  null,
        priceCheckedAt:    null,
      },
    });

    leadFindMany.mockResolvedValue([leadNullFees]);
    orgFindMany.mockResolvedValue([{ id: 'cust-org-1', plan: 'PRO' }]);

    const count = await broadcastLeads('source-org', ['src-lead-1']);

    expect(count).toBe(0);
    expect(productUpsert).not.toHaveBeenCalled();
    expect(leadCreate).not.toHaveBeenCalled();
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it('sourceTaxRate behavior from Phase 20.2M-1C is unchanged', async () => {
    leadFindMany.mockResolvedValue([makeSourceLead()]);
    orgFindMany.mockResolvedValue([{ id: 'cust-org-1', plan: 'PRO' }]);

    await broadcastLeads('source-org', ['src-lead-1']);

    // sourceTaxRate is copied to both the product and the lead create data
    const upsertCall = productUpsert.mock.calls[0][0];
    expect(upsertCall.create).toHaveProperty('sourceTaxRate');
  });
});

// ── Phase 20.2M-1D-4: Broadcast fee freshness guard ──────────────────────────

describe('copyLeadToOrg / broadcastLeads — fee freshness guard (Phase 20.2M-1D-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productUpsert.mockResolvedValue({ id: 'cust-prod-1', asin: 'B001BASIC01' });
    leadFindFirst.mockResolvedValue(null);
    leadCreate.mockResolvedValue({ id: 'cust-lead-1' });
    leadUpdate.mockResolvedValue({});
    entitlementUpsert.mockResolvedValue({});
    entitlementFindMany.mockResolvedValue([]);
    getWeeklyLeadUsageMock.mockResolvedValue(0);
    allowedLeadTiersForPlanMock.mockReturnValue(['BASIC', 'PRO']);
    brandBlockFindMany.mockResolvedValue([]);
  });

  function freshSpApiLead(productOverrides: Record<string, unknown> = {}) {
    return makeSourceLead({
      product: {
        ...makeSourceLead().product,
        feeEstimateSource: 'SP_API',
        feeEstimatedAt:    new Date(),  // always FRESH
        feeEstimatePrice:  20,
        referralFee:       2,
        fbaFee:            1,
        ...productOverrides,
      },
    });
  }

  async function broadcastOne(productOverrides: Record<string, unknown> = {}) {
    leadFindMany.mockResolvedValue([freshSpApiLead(productOverrides)]);
    orgFindMany.mockResolvedValue([{ id: 'cust-org-1', plan: 'PRO' }]);
    return broadcastLeads('source-org', ['src-lead-1']);
  }

  // ── Allowed ──

  it('broadcasts when feeEstimateSource=SP_API, FRESH feeEstimatedAt, referralFee > 0, fbaFee > 0', async () => {
    const count = await broadcastOne();
    expect(count).toBe(1);
    expect(productUpsert).toHaveBeenCalledOnce();
    expect(leadCreate).toHaveBeenCalledOnce();
    expect(entitlementUpsert).toHaveBeenCalledOnce();
  });

  it('still copies fee metadata fields to the recipient product when FRESH', async () => {
    const feeEstimatedAt = new Date('2026-08-09T10:00:00Z');
    const count = await broadcastOne({ feeEstimatedAt, feeEstimatePrice: 20, priceCheckedAt: feeEstimatedAt });
    expect(count).toBe(1);
    const upsertArg = productUpsert.mock.calls[0][0];
    expect(upsertArg.create.feeEstimateSource).toBe('SP_API');
    expect(upsertArg.create.feeEstimatePrice).toBe(20);
  });

  // ── Skipped ──

  it('skips and creates 0 entitlements when feeEstimatedAt is null', async () => {
    const count = await broadcastOne({ feeEstimatedAt: null });
    expect(count).toBe(0);
    expect(productUpsert).not.toHaveBeenCalled();
    expect(leadCreate).not.toHaveBeenCalled();
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it('skips when feeEstimateSource is STATIC', async () => {
    const count = await broadcastOne({ feeEstimateSource: 'STATIC' });
    expect(count).toBe(0);
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it('skips when feeEstimateSource is null (missing)', async () => {
    const count = await broadcastOne({ feeEstimateSource: null });
    expect(count).toBe(0);
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it('skips when referralFee is null', async () => {
    const count = await broadcastOne({ referralFee: null });
    expect(count).toBe(0);
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it('skips when fbaFee is null', async () => {
    const count = await broadcastOne({ fbaFee: null });
    expect(count).toBe(0);
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it('skips when feeEstimatedAt is NEEDS_RECHECK (49 hours old)', async () => {
    const staleAt = new Date(Date.now() - 49 * 60 * 60 * 1000);
    const count = await broadcastOne({ feeEstimatedAt: staleAt });
    expect(count).toBe(0);
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it('skips when feeEstimatedAt is STALE (8 days old)', async () => {
    const staleAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const count = await broadcastOne({ feeEstimatedAt: staleAt });
    expect(count).toBe(0);
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it('skips when feeEstimatedAt is VERY_STALE (31 days old)', async () => {
    const staleAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const count = await broadcastOne({ feeEstimatedAt: staleAt });
    expect(count).toBe(0);
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it('skips when price moved >10% (feeEstimatePrice=20, buyBoxPrice=22.01)', async () => {
    // (22.01 - 20) / 20 = 10.05% → NEEDS_RECHECK → skipped
    const count = await broadcastOne({
      feeEstimatePrice:    20,
      estimatedResellPrice: null,
      buyBoxPrice:         22.01,
    });
    expect(count).toBe(0);
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it('does not skip when price moved exactly 10% (feeEstimatePrice=20, buyBoxPrice=22.00)', async () => {
    // exactly 10% → FRESH → allowed
    const count = await broadcastOne({
      feeEstimatePrice:    20,
      estimatedResellPrice: null,
      buyBoxPrice:         22.00,
    });
    expect(count).toBe(1);
    expect(entitlementUpsert).toHaveBeenCalledOnce();
  });

  it('does not create recipient Product or Lead when skipped', async () => {
    const count = await broadcastOne({ feeEstimateSource: 'STATIC' });
    expect(count).toBe(0);
    expect(productUpsert).not.toHaveBeenCalled();
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('sourceTaxRate behavior is unchanged — still copied on FRESH leads', async () => {
    await broadcastOne();
    const upsertArg = productUpsert.mock.calls[0][0];
    expect(upsertArg.create).toHaveProperty('sourceTaxRate');
  });
});
