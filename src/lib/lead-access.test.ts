import { describe, it, expect } from 'vitest';
import { leadAccessWhere } from './lead-access';

describe('leadAccessWhere', () => {
  const orgId = 'org-abc';

  // ── Source org bypass ───────────────────────────────────────────────────────

  it('source org (isBroadcastSource=true): returns only orgId — no entitlement filter', () => {
    const where = leadAccessWhere({ orgId, isBroadcastSource: true });
    expect(where).toEqual({ orgId });
    expect(where).not.toHaveProperty('entitlements');
  });

  // ── Customer org entitlement enforcement ────────────────────────────────────

  it('customer org (isBroadcastSource=false): returns orgId + entitlements.some filter', () => {
    const where = leadAccessWhere({ orgId, isBroadcastSource: false });
    expect(where).toEqual({ orgId, entitlements: { some: { orgId } } });
  });

  it('customer: entitlements filter scopes to the same orgId (no cross-org leakage)', () => {
    const where = leadAccessWhere({ orgId: 'my-org', isBroadcastSource: false });
    expect((where as any).entitlements.some.orgId).toBe('my-org');
    expect((where as any).orgId).toBe('my-org');
  });

  // ── Role does NOT determine bypass ─────────────────────────────────────────

  it('customer org with OWNER-like scenario: isBroadcastSource=false still requires entitlement', () => {
    // A customer org that gains an OWNER user must NOT bypass entitlement —
    // only isBroadcastSource=true controls bypass, not role.
    const where = leadAccessWhere({ orgId: 'customer-org', isBroadcastSource: false });
    expect(where).toHaveProperty('entitlements');
  });

  it('source org with ADMIN-like scenario: isBroadcastSource=true bypasses even without OWNER role', () => {
    const where = leadAccessWhere({ orgId: 'source-org', isBroadcastSource: true });
    expect(where).not.toHaveProperty('entitlements');
  });

  // ── No plan-tier filtering in read paths ───────────────────────────────────

  it('does not apply plan-tier filtering — only entitlement existence', () => {
    const where = leadAccessWhere({ orgId, isBroadcastSource: false });
    const json  = JSON.stringify(where);
    expect(json).not.toContain('leadTier');
    expect(json).not.toContain('allowedLeadTiers');
    expect(json).not.toContain('deliverySource');
  });

  // ── BACKFILL entitlements: filter checks only orgId, not source ─────────────

  it('BACKFILL entitlements are visible: entitlements.some checks only orgId', () => {
    const where = leadAccessWhere({ orgId, isBroadcastSource: false });
    expect((where as any).entitlements.some).toEqual({ orgId });
  });
});
