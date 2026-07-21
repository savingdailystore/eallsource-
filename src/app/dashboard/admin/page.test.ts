import { describe, it, expect } from 'vitest';
import { isPlatformAdmin } from '@/lib/admin';
import { showAdminNav } from '@/lib/nav-auth';
import type { Role } from '@/types';

/**
 * Access-control predicate used by /dashboard/admin/page.tsx:
 *   allow = role === 'OWNER' || isPlatformAdmin(email)
 *
 * Mirrors showAdminNav() exactly — these tests verify both stay in sync.
 */
function canAccessAdminPage(role: Role, email: string | undefined): boolean {
  return role === 'OWNER' || isPlatformAdmin(email);
}

const PLATFORM_ADMIN_EMAIL = 'savingdailystore@gmail.com';
const CUSTOMER_EMAIL       = 'customer@example.com';

describe('/dashboard/admin — access-control guard', () => {
  it('allows OWNER regardless of email', () => {
    expect(canAccessAdminPage('OWNER', CUSTOMER_EMAIL)).toBe(true);
  });

  it('allows platform admin email regardless of role', () => {
    expect(canAccessAdminPage('ADMIN', PLATFORM_ADMIN_EMAIL)).toBe(true);
  });

  it('rejects customer ADMIN', () => {
    expect(canAccessAdminPage('ADMIN', CUSTOMER_EMAIL)).toBe(false);
  });

  it('rejects ANALYST', () => {
    expect(canAccessAdminPage('ANALYST', CUSTOMER_EMAIL)).toBe(false);
  });

  it('rejects VIEWER', () => {
    expect(canAccessAdminPage('VIEWER', CUSTOMER_EMAIL)).toBe(false);
  });

  it('rejects unauthenticated (undefined email, non-OWNER role)', () => {
    expect(canAccessAdminPage('VIEWER', undefined)).toBe(false);
  });
});

describe('showAdminNav — parity with /dashboard/admin guard', () => {
  it('OWNER sees admin nav', () => {
    expect(showAdminNav('OWNER', false)).toBe(true);
  });

  it('platform admin sees admin nav', () => {
    expect(showAdminNav('ADMIN', true)).toBe(true);
  });

  it('customer ADMIN does not see admin nav', () => {
    expect(showAdminNav('ADMIN', false)).toBe(false);
  });

  it('ANALYST does not see admin nav', () => {
    expect(showAdminNav('ANALYST', false)).toBe(false);
  });

  it('VIEWER does not see admin nav', () => {
    expect(showAdminNav('VIEWER', false)).toBe(false);
  });

  it('guard predicate and showAdminNav agree on all cases', () => {
    const cases: Array<[Role, string | undefined, boolean]> = [
      ['OWNER',   CUSTOMER_EMAIL,       true],
      ['ADMIN',   PLATFORM_ADMIN_EMAIL, true],
      ['ADMIN',   CUSTOMER_EMAIL,       false],
      ['ANALYST', CUSTOMER_EMAIL,       false],
      ['VIEWER',  CUSTOMER_EMAIL,       false],
    ];
    for (const [role, email, expected] of cases) {
      const pageAllows = canAccessAdminPage(role, email);
      const navShows   = showAdminNav(role, isPlatformAdmin(email));
      expect(pageAllows).toBe(expected);
      expect(navShows).toBe(expected);
    }
  });
});

describe('Sidebar — ADMIN_NAV href', () => {
  it('Admin Dashboard link points to /dashboard/admin (not /admin)', async () => {
    // Import the raw source and grep for the href to avoid rendering the full component
    const fs   = await import('fs');
    const path = await import('path');
    const src  = fs.readFileSync(
      path.resolve('src/components/layout/Sidebar.tsx'),
      'utf8',
    );
    expect(src).toContain("href: '/dashboard/admin'");
    expect(src).not.toMatch(/ADMIN_NAV[\s\S]*?href:\s*'\/admin'/);
  });
});

describe('/admin redirect', () => {
  it('old /admin/page.tsx contains only a redirect to /dashboard/admin', async () => {
    const fs   = await import('fs');
    const path = await import('path');
    const src  = fs.readFileSync(
      path.resolve('src/app/admin/page.tsx'),
      'utf8',
    );
    expect(src).toContain("redirect('/dashboard/admin')");
    // Must not contain the full admin page content
    expect(src).not.toContain('AdminOrgsTable');
    expect(src).not.toContain('prisma.organization.findMany');
  });
});
