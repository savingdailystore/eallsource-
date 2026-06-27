/**
 * Single source of truth for platform-admin access (cross-organization
 * access to /admin and /api/admin/**). Previously this allowlist was
 * copy-pasted in three files, which risked the copies drifting out of sync.
 * Still an email allowlist rather than a DB-backed role — tracked as a
 * Future Improvement in docs/security/AccessControlPolicy.md — but
 * consolidating it here removes the duplication risk in the meantime.
 */
const ADMIN_EMAILS = ['savingdailystore@gmail.com'];

export function isPlatformAdmin(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email);
}
