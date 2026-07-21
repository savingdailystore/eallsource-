import type { Role } from '@/types';

/** Returns true when the user should see the platform-admin navigation section. */
export function showAdminNav(role: Role, isPlatformAdmin: boolean): boolean {
  return role === 'OWNER' || isPlatformAdmin;
}
