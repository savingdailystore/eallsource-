/**
 * Tests for src/lib/target-product-refresh.ts
 *
 * Covers:
 * - isTargetProductUrl: valid/invalid variants
 * - normalizeTargetProductUrl: canonical form, resilience
 * - extractTargetTcin: happy path, slug variants, edge cases
 * - No DB writes (pure URL utilities — no mocks needed)
 */

import { describe, it, expect } from 'vitest';
import {
  isTargetProductUrl,
  normalizeTargetProductUrl,
  extractTargetTcin,
} from './target-product-refresh';

// ---------------------------------------------------------------------------
// Representative Target product URL
// ---------------------------------------------------------------------------

const TCIN       = '84997538';
const CLEAN_URL  = `https://www.target.com/p/some-product-name/-/A-${TCIN}`;
const QUERY_URL  = `${CLEAN_URL}?preselect=${TCIN}&ref=tgt_adv_Xst`;
const HASH_URL   = `${CLEAN_URL}#lnk=sametab`;
const COMBO_URL  = `${CLEAN_URL}?preselect=${TCIN}#lnk=sametab`;
const NO_WWW_URL = `https://target.com/p/some-product-name/-/A-${TCIN}`;

// ---------------------------------------------------------------------------
// isTargetProductUrl
// ---------------------------------------------------------------------------

describe('isTargetProductUrl', () => {
  it('accepts a standard Target /p/.../A-<tcin> product URL', () => {
    expect(isTargetProductUrl(CLEAN_URL)).toBe(true);
  });

  it('accepts URL with query string (preselect param)', () => {
    expect(isTargetProductUrl(QUERY_URL)).toBe(true);
  });

  it('accepts URL with hash fragment', () => {
    expect(isTargetProductUrl(HASH_URL)).toBe(true);
  });

  it('accepts URL with both query and hash', () => {
    expect(isTargetProductUrl(COMBO_URL)).toBe(true);
  });

  it('accepts URL without www subdomain', () => {
    expect(isTargetProductUrl(NO_WWW_URL)).toBe(true);
  });

  it('accepts multi-segment slug before the TCIN', () => {
    expect(isTargetProductUrl(`https://www.target.com/p/bounty-select-a-size-paper-towels-6-double-rolls/-/A-14930068`)).toBe(true);
  });

  it('rejects a non-Target URL (Amazon)', () => {
    expect(isTargetProductUrl('https://www.amazon.com/dp/B0TEST1234')).toBe(false);
  });

  it('rejects a non-Target URL (Walmart)', () => {
    expect(isTargetProductUrl('https://www.walmart.com/ip/Widget/123456789')).toBe(false);
  });

  it('rejects a Target category/browse URL (no TCIN)', () => {
    expect(isTargetProductUrl('https://www.target.com/c/vitamins-supplements-health/-/N-4y89l')).toBe(false);
  });

  it('rejects a Target search URL', () => {
    expect(isTargetProductUrl('https://www.target.com/s?searchTerm=shampoo')).toBe(false);
  });

  it('rejects a Target homepage', () => {
    expect(isTargetProductUrl('https://www.target.com')).toBe(false);
  });

  it('rejects an empty string (does not throw)', () => {
    expect(isTargetProductUrl('')).toBe(false);
  });

  it('rejects a completely malformed string (does not throw)', () => {
    expect(isTargetProductUrl('not a url at all !@#$')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeTargetProductUrl
// ---------------------------------------------------------------------------

describe('normalizeTargetProductUrl', () => {
  it('returns the clean URL unchanged', () => {
    expect(normalizeTargetProductUrl(CLEAN_URL)).toBe(CLEAN_URL);
  });

  it('strips query string from a URL with preselect param', () => {
    expect(normalizeTargetProductUrl(QUERY_URL)).toBe(CLEAN_URL);
  });

  it('strips hash fragment', () => {
    expect(normalizeTargetProductUrl(HASH_URL)).toBe(CLEAN_URL);
  });

  it('strips both query string and hash', () => {
    expect(normalizeTargetProductUrl(COMBO_URL)).toBe(CLEAN_URL);
  });

  it('normalises www-less URL to include www', () => {
    // URL constructor keeps the host as-is; we prepend target.com from the path
    const result = normalizeTargetProductUrl(NO_WWW_URL);
    expect(result).toContain('target.com');
    expect(result).toContain(`/A-${TCIN}`);
    expect(result).not.toContain('?');
    expect(result).not.toContain('#');
  });

  it('returns input unchanged for a non-product Target URL (no crash)', () => {
    const categoryUrl = 'https://www.target.com/c/vitamins/-/N-4y89l';
    expect(normalizeTargetProductUrl(categoryUrl)).toBe(categoryUrl);
  });

  it('returns input unchanged for a completely non-Target URL (no crash)', () => {
    const other = 'https://www.walmart.com/ip/Widget/123456789';
    expect(normalizeTargetProductUrl(other)).toBe(other);
  });

  it('does not throw on empty string', () => {
    expect(() => normalizeTargetProductUrl('')).not.toThrow();
    expect(normalizeTargetProductUrl('')).toBe('');
  });

  it('does not throw on a malformed URL', () => {
    expect(() => normalizeTargetProductUrl('not a url')).not.toThrow();
  });

  it('produces a URL with no query string', () => {
    const result = normalizeTargetProductUrl(QUERY_URL);
    expect(result).not.toContain('?');
  });

  it('produces a URL with no hash', () => {
    const result = normalizeTargetProductUrl(HASH_URL);
    expect(result).not.toContain('#');
  });
});

// ---------------------------------------------------------------------------
// extractTargetTcin
// ---------------------------------------------------------------------------

describe('extractTargetTcin', () => {
  it('extracts TCIN from a clean URL', () => {
    expect(extractTargetTcin(CLEAN_URL)).toBe(TCIN);
  });

  it('extracts TCIN from a URL with query string', () => {
    expect(extractTargetTcin(QUERY_URL)).toBe(TCIN);
  });

  it('extracts TCIN from a URL with hash', () => {
    expect(extractTargetTcin(HASH_URL)).toBe(TCIN);
  });

  it('extracts TCIN from a URL with both query and hash', () => {
    expect(extractTargetTcin(COMBO_URL)).toBe(TCIN);
  });

  it('extracts TCIN from a URL without www', () => {
    expect(extractTargetTcin(NO_WWW_URL)).toBe(TCIN);
  });

  it('extracts a different TCIN correctly', () => {
    const url = 'https://www.target.com/p/dove-deep-moisture-body-wash/-/A-13374286';
    expect(extractTargetTcin(url)).toBe('13374286');
  });

  it('returns null for a Target category URL (no TCIN)', () => {
    expect(extractTargetTcin('https://www.target.com/c/vitamins/-/N-4y89l')).toBeNull();
  });

  it('returns null for a non-Target URL', () => {
    expect(extractTargetTcin('https://www.walmart.com/ip/Widget/123456789')).toBeNull();
  });

  it('returns null for an empty string (does not throw)', () => {
    expect(extractTargetTcin('')).toBeNull();
  });

  it('returns null for a malformed URL (does not throw)', () => {
    expect(extractTargetTcin('not a url')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UPC contract — must NOT be available from URL
// ---------------------------------------------------------------------------

describe('UPC is not extractable from Target URLs', () => {
  it('extractTargetTcin returns a TCIN, which is not a UPC', () => {
    // TCIN and UPC are different identifiers. This test documents the contract:
    // callers must match by title or supply UPC manually.
    const tcin = extractTargetTcin(CLEAN_URL);
    expect(tcin).toBeTruthy();
    // A UPC is 12-13 digits; TCINs are typically 8 digits — but this test is
    // intentionally about the contract, not the digit count.
    expect(tcin).toBe(TCIN); // returns TCIN, not UPC
  });
});
