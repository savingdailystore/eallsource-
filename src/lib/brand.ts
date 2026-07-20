/**
 * Brand name normalization — single source of truth used by:
 *   - BrandBlock API (before upsert and pipeline lookup key)
 *   - Pipeline gate (to compare Amazon brand against active blocks)
 *   - Product update batch (to find matching products when a brand is blocked/cleared)
 *
 * Rules: trim whitespace, lowercase, collapse runs of internal spaces to one space.
 * Returns '' for null/undefined/empty inputs (safe for callers to short-circuit on falsy).
 */
export function normalizeBrand(brand: string | null | undefined): string {
  if (!brand) return '';
  return brand.trim().toLowerCase().replace(/\s+/g, ' ');
}
