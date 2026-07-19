// Returns a Prisma `where` fragment that scopes lead reads to entitled leads.
//
// Bypass is SOURCE-ORG based, not role-based. The source/operator org
// (isBroadcastSource = true) owns the canonical lead pool and has no
// entitlement rows of its own — it bypasses the entitlement filter.
//
// ALL customer orgs must have a LeadEntitlement row for each lead they read,
// regardless of the role of the requesting user. A customer org that later
// gains an OWNER user still requires entitlements for lead access.
//
// Plan/tier filtering happens at delivery time (Phase 14.8c), not here.
// Existing entitlements are never retroactively revoked by plan changes.
//
// Call sites: spread the return value into any Prisma `where` that currently
// uses `orgId`. The returned object always includes `orgId`, so the explicit
// `orgId` key in the caller's where can be replaced by the spread.
//
// Example:
//   const org = await prisma.organization.findUnique({
//     where:  { id: orgId },
//     select: { isBroadcastSource: true },
//   });
//   prisma.lead.findMany({
//     where: {
//       ...leadAccessWhere({ orgId, isBroadcastSource: org?.isBroadcastSource ?? false }),
//       status: { notIn: [...] },
//     },
//   })
export function leadAccessWhere({
  orgId,
  isBroadcastSource,
}: {
  orgId:             string;
  isBroadcastSource: boolean;
}) {
  if (isBroadcastSource) {
    // Source/operator org — all their leads are visible without entitlement.
    return { orgId };
  }
  // Customer org — only leads with an entitlement for this org are visible.
  return { orgId, entitlements: { some: { orgId } } };
}
