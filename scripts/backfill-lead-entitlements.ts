/**
 * Phase 14.8a — Lead Entitlement Backfill Script
 *
 * Creates BACKFILL LeadEntitlement rows for every existing customer-org lead,
 * preserving full historical visibility. These entitlements are marked
 * countsTowardWeeklyLimit=false and deliveryWeekStart=null because they are
 * outside the normal weekly-drop accounting — they are grandfather grants.
 *
 * Weekly delivery model:
 *   New leads drop every Monday at 06:00 Arizona time (America/Phoenix,
 *   UTC-7 year-round). The deliveryWeekStart field stores the UTC timestamp
 *   of that Monday-morning anchor. Weekly quota queries use:
 *     WHERE orgId = ? AND deliveryWeekStart = <current week anchor>
 *       AND countsTowardWeeklyLimit = true
 *   BACKFILL rows set deliveryWeekStart=null and countsTowardWeeklyLimit=false,
 *   so they never appear in quota counts.
 *
 * SAFETY:
 * - Dry-run by default (set DRY_RUN=false to actually write).
 * - Idempotent: uses upsert on the @@unique([orgId, leadId]) constraint.
 * - Excludes the EALLsource source org (isBroadcastSource=true).
 * - Reports expected row count before writing.
 * - Do not run against production until separately approved.
 *
 * Usage:
 *   DRY_RUN=false npx tsx scripts/backfill-lead-entitlements.ts
 */

import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const prisma = new PrismaClient();

async function main() {
  console.log(`\n[backfill-entitlements] DRY_RUN=${DRY_RUN}\n`);

  // Find the source org — excluded from backfill (it owns the canonical leads).
  const sourceOrg = await prisma.organization.findFirst({
    where:  { isBroadcastSource: true },
    select: { id: true, name: true },
  });
  if (!sourceOrg) throw new Error('No isBroadcastSource org found.');
  console.log(`Source org (excluded): ${sourceOrg.name} (${sourceOrg.id})`);

  // Find all customer orgs.
  const customerOrgs = await prisma.organization.findMany({
    where:  { isBroadcastSource: false },
    select: { id: true, name: true },
  });
  console.log(`Customer orgs: ${customerOrgs.length}`);

  // Fetch all existing leads for customer orgs, including their current tier.
  const leads = await prisma.lead.findMany({
    where:  { orgId: { in: customerOrgs.map((o) => o.id) } },
    select: { id: true, orgId: true, leadTier: true, createdAt: true },
  });
  console.log(`Total customer leads found: ${leads.length}`);

  // Group by org for reporting.
  const byOrg = new Map<string, typeof leads>();
  for (const lead of leads) {
    const bucket = byOrg.get(lead.orgId) ?? [];
    bucket.push(lead);
    byOrg.set(lead.orgId, bucket);
  }
  for (const org of customerOrgs) {
    const count = byOrg.get(org.id)?.length ?? 0;
    console.log(`  ${org.name} (${org.id}): ${count} leads`);
  }
  console.log(`\nExpected entitlement rows to upsert: ${leads.length}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No writes performed. Set DRY_RUN=false to execute.');
    return;
  }

  // Write entitlements — idempotent via upsert.
  // BACKFILL entitlements:
  //   - countsTowardWeeklyLimit = false  → never counts against any quota
  //   - deliveryWeekStart = null         → outside weekly-drop accounting
  //   - deliveredAt = lead.createdAt     → preserves original visibility timestamp
  let upserted = 0;
  for (const lead of leads) {
    await prisma.leadEntitlement.upsert({
      where:  { orgId_leadId: { orgId: lead.orgId, leadId: lead.id } },
      create: {
        orgId:                   lead.orgId,
        leadId:                  lead.id,
        deliverySource:          'BACKFILL',
        countsTowardWeeklyLimit: false,
        leadTierAtDelivery:      lead.leadTier,
        deliveryWeekStart:       null,
        deliveredAt:             lead.createdAt,
        grantedByUserId:         null,
        note:                    'Phase 14.8a grandfather backfill — existing leads preserved',
      },
      update: {
        // Idempotent: if the row already exists, leave it unchanged.
        // Do not overwrite deliverySource, countsTowardWeeklyLimit, or deliveryWeekStart.
      },
    });
    upserted++;
    if (upserted % 10 === 0) process.stdout.write(`  upserted ${upserted}/${leads.length}\r`);
  }

  console.log(`\n[backfill-entitlements] Done. Upserted ${upserted} entitlement rows.`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
