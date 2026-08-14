/**
 * target-product-refresh.ts
 *
 * URL helpers for Target.com product pages — the parallel to
 * walmart-product-refresh.ts for the Walmart side.
 *
 * Scope (Phase 20.3B):
 * - URL validation, normalisation, and TCIN extraction.
 * - No HTML scraping, no Apify calls, no DB writes.
 *
 * UPC note: Target does not expose UPC through any publicly accessible
 * API or actor we can use (confirmed 2026-06-21 in TargetRetailer comments
 * and memory/target-scraper-no-upc). TCIN is Target's internal identifier
 * only — Amazon cannot match on it. Callers must perform title-based
 * matching or supply UPC manually.
 *
 * Target product URL format:
 *   https://www.target.com/p/<slug>/-/A-<tcin>
 *   https://www.target.com/p/<slug>/-/A-<tcin>#lnk=sametab
 *   https://www.target.com/p/<slug>/-/A-<tcin>?preselect=<tcin>
 *
 * The TCIN is the numeric identifier after "A-" in the path segment.
 */

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Matches `/p/<slug>/-/A-<digits>` in a Target product URL path. */
const TARGET_TCIN_RE = /\/p\/[^/]+\/-\/A-(\d+)/i;

const TARGET_HOST_RE = /^(?:www\.)?target\.com$/i;

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when `url` is a recognisable Target.com product page.
 * Requires: host matches target.com and path matches the /p/…/-/A-<tcin> pattern.
 * Returns false (never throws) on malformed input.
 */
export function isTargetProductUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return TARGET_HOST_RE.test(u.hostname) && TARGET_TCIN_RE.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Returns the canonical Target product URL — strips query string and hash,
 * keeps only the /p/<slug>/-/A-<tcin> path.
 * Returns the original string unchanged (never throws) on malformed input or
 * if the URL is not a recognised Target product page.
 */
export function normalizeTargetProductUrl(url: string): string {
  try {
    const u    = new URL(url);
    const match = TARGET_TCIN_RE.exec(u.pathname);
    if (!match) return url;
    // Reconstruct origin + canonical path only, no query/hash.
    // Keep the full slug so the URL remains human-readable.
    const canonicalPath = u.pathname.replace(/#.*$/, '').replace(/\?.*$/, '');
    return `https://www.target.com${canonicalPath}`;
  } catch {
    return url;
  }
}

/**
 * Extracts the TCIN (Target Common Item Number) from a Target product URL.
 * Returns the TCIN as a string (e.g. "12345678") or null if not found.
 * Never throws.
 *
 * Note: TCIN is NOT equivalent to UPC. UPC is not extractable from the URL.
 */
export function extractTargetTcin(url: string): string | null {
  try {
    const u     = new URL(url);
    const match = TARGET_TCIN_RE.exec(u.pathname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
