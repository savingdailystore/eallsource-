import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentDeliveryWeekStart, getWeeklyLeadUsage, getRemainingWeeklyLeadSlots, allowedLeadTiersForPlan } from './lead-delivery';

const countMock = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: { leadEntitlement: { count: (...a: unknown[]) => countMock(...a) } },
}));

// July 2026 reference frame (July 18 = Saturday; July 20 = Monday)
const MON_20_BEFORE = new Date('2026-07-20T12:59:59Z'); // Monday before drop
const MON_20_AT     = new Date('2026-07-20T13:00:00Z'); // exactly at drop
const MON_20_AFTER  = new Date('2026-07-20T13:00:01Z'); // Monday after drop
const WED_22        = new Date('2026-07-22T15:00:00Z'); // Wednesday same week
const SUN_19        = new Date('2026-07-19T20:00:00Z'); // Sunday before Monday drop
const PREV_MON_13   = '2026-07-13T13:00:00.000Z';
const THIS_MON_20   = '2026-07-20T13:00:00.000Z';

describe('getCurrentDeliveryWeekStart', () => {
  it('returns this Monday 13:00 UTC when called after the anchor', () => {
    expect(getCurrentDeliveryWeekStart(MON_20_AFTER).toISOString()).toBe(THIS_MON_20);
  });

  it('returns this Monday 13:00 UTC exactly at the anchor', () => {
    expect(getCurrentDeliveryWeekStart(MON_20_AT).toISOString()).toBe(THIS_MON_20);
  });

  it('returns previous Monday 13:00 UTC when called before Monday anchor', () => {
    expect(getCurrentDeliveryWeekStart(MON_20_BEFORE).toISOString()).toBe(PREV_MON_13);
  });

  it('returns this Monday 13:00 UTC for a mid-week time', () => {
    expect(getCurrentDeliveryWeekStart(WED_22).toISOString()).toBe(THIS_MON_20);
  });

  it('returns previous Monday 13:00 UTC on Sunday', () => {
    expect(getCurrentDeliveryWeekStart(SUN_19).toISOString()).toBe(PREV_MON_13);
  });

  it('result is always a Monday at 13:00:00.000 UTC', () => {
    for (const d of [MON_20_BEFORE, MON_20_AT, MON_20_AFTER, WED_22, SUN_19]) {
      const r = getCurrentDeliveryWeekStart(d);
      expect(r.getUTCDay()).toBe(1);   // Monday
      expect(r.getUTCHours()).toBe(13);
      expect(r.getUTCMinutes()).toBe(0);
      expect(r.getUTCSeconds()).toBe(0);
      expect(r.getUTCMilliseconds()).toBe(0);
    }
  });
});

describe('getWeeklyLeadUsage', () => {
  beforeEach(() => countMock.mockReset());

  it('queries entitlements for the current week anchor', async () => {
    countMock.mockResolvedValue(5);
    const weekStart = new Date(THIS_MON_20);
    const result = await getWeeklyLeadUsage('org-1', weekStart);
    expect(result).toBe(5);
    expect(countMock).toHaveBeenCalledWith({
      where: { orgId: 'org-1', deliveryWeekStart: weekStart, countsTowardWeeklyLimit: true },
    });
  });

  it('returns 0 when no entitlements exist', async () => {
    countMock.mockResolvedValue(0);
    expect(await getWeeklyLeadUsage('org-1', new Date(THIS_MON_20))).toBe(0);
  });
});

describe('getRemainingWeeklyLeadSlots', () => {
  beforeEach(() => countMock.mockReset());

  it('returns plan limit minus current usage for PRO plan', async () => {
    countMock.mockResolvedValue(3);
    const remaining = await getRemainingWeeklyLeadSlots({ id: 'org-1', plan: 'PRO' }, new Date(THIS_MON_20));
    expect(remaining).toBe(12); // 15 - 3
  });

  it('returns plan limit for STARTER with zero usage', async () => {
    countMock.mockResolvedValue(0);
    const remaining = await getRemainingWeeklyLeadSlots({ id: 'org-1', plan: 'STARTER' }, new Date(THIS_MON_20));
    expect(remaining).toBe(3);
  });

  it('never returns negative when over limit', async () => {
    countMock.mockResolvedValue(999);
    const remaining = await getRemainingWeeklyLeadSlots({ id: 'org-1', plan: 'STARTER' }, new Date(THIS_MON_20));
    expect(remaining).toBe(0);
  });
});

describe('allowedLeadTiersForPlan', () => {
  it('STARTER may only receive BASIC leads', () => {
    expect(allowedLeadTiersForPlan('STARTER')).toEqual(['BASIC']);
  });

  it('PRO may receive BASIC and PRO leads', () => {
    expect(allowedLeadTiersForPlan('PRO')).toEqual(['BASIC', 'PRO']);
  });

  it('ENTERPRISE may receive BASIC, PRO, and PREMIUM leads', () => {
    expect(allowedLeadTiersForPlan('ENTERPRISE')).toEqual(['BASIC', 'PRO', 'PREMIUM']);
  });
});
