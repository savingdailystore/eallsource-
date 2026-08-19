/**
 * Returns true only for the source/broadcast-org OWNER.
 * Customer org OWNERs, ADMIN, ANALYST, and VIEWER all return false.
 * Customer-facing refresh is deferred.
 */
export function canShowFeeRefreshButton({
  role,
  isBroadcastSource,
}: {
  role: string | null | undefined;
  isBroadcastSource: boolean;
}): boolean {
  return role === 'OWNER' && isBroadcastSource;
}
