/**
 * Converts a YYYY-MM-DD string from <input type="date"> into a stable UTC ISO
 * string anchored at noon (T12:00:00.000Z). Noon UTC is safe from off-by-one-
 * day drift in any timezone (UTC-12 through UTC+14).
 *
 * Returns null when the input is empty or invalid.
 */
export function dateInputToIso(yyyyMmDd: string): string | null {
  if (!yyyyMmDd) return null;
  // Validate the pattern before constructing.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return null;
  return `${yyyyMmDd}T12:00:00.000Z`;
}

/**
 * Converts a stored ISO datetime string back into the YYYY-MM-DD value that
 * <input type="date"> expects. Interprets the stored value as UTC to match how
 * dateInputToIso wrote it, so the same calendar date is always recovered.
 *
 * Returns '' when the input is empty or unparseable.
 */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  // Slice the UTC date portion directly — avoids any local-timezone shift.
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}
