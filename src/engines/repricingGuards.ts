/**
 * Pure guard utilities for repricing safety checks.
 * No DB or network I/O — safe to call anywhere and trivial to unit-test.
 */

/** Percentage difference above which costBasis vs inventory cost triggers a warning. */
export const COST_MISMATCH_THRESHOLD = 0.20; // 20%

/**
 * Returns true when both SKUs are present and they differ.
 * Returns false when either SKU is missing — we can only warn if both sides exist.
 */
export function detectSkuMismatch(
  inventorySku: string | null | undefined,
  historySku:   string | null | undefined,
): boolean {
  if (!inventorySku || !historySku) return false;
  return inventorySku !== historySku;
}

/**
 * Returns true when both cost values are present and differ by more than
 * COST_MISMATCH_THRESHOLD (default 20%).
 * Returns false when either value is missing or non-positive — both sides must
 * be valid numbers before we can make a meaningful comparison.
 */
export function detectCostMismatch(
  costBasis:     number | null | undefined,
  inventoryCost: number | null | undefined,
): boolean {
  if (costBasis == null || inventoryCost == null) return false;
  if (costBasis <= 0 || inventoryCost <= 0) return false;
  const diff = Math.abs(costBasis - inventoryCost) / inventoryCost;
  return diff > COST_MISMATCH_THRESHOLD;
}
