// Tests for normalizeBrand helper

import { describe, it, expect } from 'vitest';
import { normalizeBrand } from './brand';

describe('normalizeBrand', () => {
  it('lowercases a mixed-case brand', () => {
    expect(normalizeBrand('Astercook')).toBe('astercook');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeBrand('  Astercook  ')).toBe('astercook');
  });

  it('collapses internal multiple spaces to one', () => {
    expect(normalizeBrand('Brand  Name   Here')).toBe('brand name here');
  });

  it('handles already-lowercase input', () => {
    expect(normalizeBrand('amazon basics')).toBe('amazon basics');
  });

  it('returns empty string for null', () => {
    expect(normalizeBrand(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(normalizeBrand(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(normalizeBrand('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeBrand('   ')).toBe('');
  });
});
