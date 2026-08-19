import { describe, it, expect } from 'vitest';
import { canShowFeeRefreshButton } from './canShowFeeRefreshButton';

describe('canShowFeeRefreshButton', () => {
  // Test 1 — source-org/operator OWNER sees the button
  it('returns true for source org OWNER', () => {
    expect(canShowFeeRefreshButton({ role: 'OWNER', isBroadcastSource: true })).toBe(true);
  });

  // Test 2 — customer org OWNER does NOT see the button
  it('returns false for customer org OWNER', () => {
    expect(canShowFeeRefreshButton({ role: 'OWNER', isBroadcastSource: false })).toBe(false);
  });

  // Test 3 — ADMIN does NOT see the button
  it('returns false for ADMIN', () => {
    expect(canShowFeeRefreshButton({ role: 'ADMIN', isBroadcastSource: true })).toBe(false);
  });

  // Test 4 — ANALYST does NOT see the button
  it('returns false for ANALYST', () => {
    expect(canShowFeeRefreshButton({ role: 'ANALYST', isBroadcastSource: true })).toBe(false);
  });

  // Test 5 — VIEWER does NOT see the button
  it('returns false for VIEWER', () => {
    expect(canShowFeeRefreshButton({ role: 'VIEWER', isBroadcastSource: true })).toBe(false);
  });

  it('returns false when role is null', () => {
    expect(canShowFeeRefreshButton({ role: null, isBroadcastSource: true })).toBe(false);
  });
});
