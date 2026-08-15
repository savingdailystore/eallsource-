import { getFeeStaleStatus, type FeeStaleStatus } from '@/engines/feeStaleStatus';

export type FeeFreshnessDisplay = FeeStaleStatus | 'UNAVAILABLE';

export function resolveFeeFreshnessStatus(input: {
  feeEstimateSource?:  string | null;
  feeEstimatedAt?:     Date | string | null;
  feeEstimatePrice?:   number | null;
  currentResellPrice?: number | null;
  now?:                Date | string;
}): FeeFreshnessDisplay {
  if (input.feeEstimateSource !== 'SP_API') return 'UNAVAILABLE';
  if (!input.feeEstimatedAt) return 'UNAVAILABLE';
  return getFeeStaleStatus({
    feeEstimatedAt:     input.feeEstimatedAt,
    feeEstimatePrice:   input.feeEstimatePrice,
    currentResellPrice: input.currentResellPrice,
    now:                input.now,
  });
}
