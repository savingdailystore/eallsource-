// Centralized password policy — 12-char minimum with upper, lower, number, and
// special character. Used by registration, team invites, and password changes.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_AGE_DAYS = 365;

export const PASSWORD_RULE_TEXT =
  'At least 12 characters, including uppercase, lowercase, a number, and a special character.';

export function validatePassword(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!/[A-Z]/.test(pw))               return 'Password must include an uppercase letter.';
  if (!/[a-z]/.test(pw))               return 'Password must include a lowercase letter.';
  if (!/[0-9]/.test(pw))               return 'Password must include a number.';
  if (!/[^A-Za-z0-9]/.test(pw))        return 'Password must include a special character.';
  return null;
}

/** True if the password is older than the max age and must be rotated. */
export function isPasswordExpired(changedAt: Date | string): boolean {
  const changed = new Date(changedAt).getTime();
  const ageMs   = Date.now() - changed;
  return ageMs > PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}
