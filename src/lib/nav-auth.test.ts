// Tests for showAdminNav — controls admin nav section visibility in Sidebar
//
// Cases:
//   1. OWNER role → visible (regardless of isPlatformAdmin)
//   2. Non-OWNER + isPlatformAdmin=true → visible
//   3. ADMIN role, not platform admin → hidden
//   4. ANALYST role, not platform admin → hidden
//   5. VIEWER role, not platform admin → hidden
//   6. OWNER + isPlatformAdmin=true → still visible (belt-and-suspenders)

import { describe, it, expect } from 'vitest';
import { showAdminNav } from './nav-auth';

describe('showAdminNav', () => {
  it('returns true for OWNER role', () => {
    expect(showAdminNav('OWNER', false)).toBe(true);
  });

  it('returns true for OWNER role with isPlatformAdmin=true', () => {
    expect(showAdminNav('OWNER', true)).toBe(true);
  });

  it('returns true for non-OWNER when isPlatformAdmin=true', () => {
    expect(showAdminNav('ADMIN', true)).toBe(true);
  });

  it('returns false for ADMIN role when not platform admin', () => {
    expect(showAdminNav('ADMIN', false)).toBe(false);
  });

  it('returns false for ANALYST role', () => {
    expect(showAdminNav('ANALYST', false)).toBe(false);
  });

  it('returns false for VIEWER role', () => {
    expect(showAdminNav('VIEWER', false)).toBe(false);
  });
});
