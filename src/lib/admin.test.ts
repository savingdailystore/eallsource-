import { describe, it, expect } from 'vitest';
import { isPlatformAdmin } from './admin';

describe('isPlatformAdmin', () => {
  it('returns true for the platform admin email', () => {
    expect(isPlatformAdmin('savingdailystore@gmail.com')).toBe(true);
  });

  it('returns false for any other email', () => {
    expect(isPlatformAdmin('someone-else@example.com')).toBe(false);
  });

  it('returns false for null/undefined/empty', () => {
    expect(isPlatformAdmin(null)).toBe(false);
    expect(isPlatformAdmin(undefined)).toBe(false);
    expect(isPlatformAdmin('')).toBe(false);
  });
});
