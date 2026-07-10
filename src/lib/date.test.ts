import { describe, it, expect } from 'vitest';
import { dateInputToIso, isoToDateInput } from './date';

describe('dateInputToIso', () => {
  it('converts a YYYY-MM-DD string to noon UTC ISO', () => {
    expect(dateInputToIso('2026-07-09')).toBe('2026-07-09T12:00:00.000Z');
  });

  it('produces a value whose UTC date matches the input date', () => {
    const iso = dateInputToIso('2024-01-01')!;
    expect(new Date(iso).toISOString().slice(0, 10)).toBe('2024-01-01');
  });

  it('returns null for empty string', () => {
    expect(dateInputToIso('')).toBeNull();
  });

  it('returns null for invalid format', () => {
    expect(dateInputToIso('not-a-date')).toBeNull();
    expect(dateInputToIso('07/09/2026')).toBeNull();
    expect(dateInputToIso('2026-7-9')).toBeNull();
  });

  it('noon UTC survives any UTC offset without drifting to adjacent day', () => {
    const iso = dateInputToIso('2026-07-09')!;
    const d = new Date(iso);
    // UTC+14 (LINT): 2026-07-10 02:00 — still same UTC date
    // UTC-12 (IDLW): 2026-07-09 00:00 — safe
    // The UTC date (not local) must always be 2026-07-09
    expect(d.toISOString().slice(0, 10)).toBe('2026-07-09');
  });
});

describe('isoToDateInput', () => {
  it('extracts the YYYY-MM-DD portion from a noon UTC ISO string', () => {
    expect(isoToDateInput('2026-07-09T12:00:00.000Z')).toBe('2026-07-09');
  });

  it('extracts the date portion from midnight UTC ISO strings too', () => {
    expect(isoToDateInput('2024-06-01T00:00:00.000Z')).toBe('2024-06-01');
  });

  it('returns empty string for null', () => {
    expect(isoToDateInput(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(isoToDateInput(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(isoToDateInput('')).toBe('');
  });

  it('round-trips through dateInputToIso and back', () => {
    const original = '2024-12-31';
    const iso = dateInputToIso(original)!;
    expect(isoToDateInput(iso)).toBe(original);
  });
});
