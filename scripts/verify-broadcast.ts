/**
 * One-off diagnostic: trace the lead-broadcast pipeline against live data.
 * Run:  npx tsx scripts/verify-broadcast.ts
 */
import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('\n=== ORGS ===');
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, isBroadcastSource: true, receiveBroadcast: true, scanEnabled: true },
    orderBy: { createdAt: 'asc' },
  });

  const leadCounts = await prisma.lead.groupBy({
    by: ['orgId'],
    _count: { _all: true },
    where: { status: { notIn: ['REJECTED', 'EXPIRED'] } },
  });
  const countByOrg = new Map(leadCounts.map((r) => [r.orgId, r._count._all]));

  for (const o of orgs) {
    const flags = [
      o.isBroadcastSource ? 'SOURCE' : null,
      o.receiveBroadcast ? 'receives' : null,
      o.scanEnabled ? 'scan-on' : 'scan-off',
    ].filter(Boolean).join(', ');
    console.log(`  ${o.name.padEnd(20)} leads=${String(countByOrg.get(o.id) ?? 0).padStart(4)}  [${flags}]  ${o.id}`);
  }

  const source = orgs.find((o) => o.isBroadcastSource);
  console.log('\n=== DIAGNOSIS ===');
  if (!source) {
    console.log('  ❌ No org has isBroadcastSource=true. Nothing will ever broadcast.');
    return;
  }
  console.log(`  ✅ Source org: ${source.name}`);

  const receivers = orgs.filter((o) => o.receiveBroadcast && o.id !== source.id);
  if (receivers.length === 0) {
    console.log('  ⚠️  No receiver orgs (receiveBroadcast=true) besides the source. Nothing to fan out to yet.');
  } else {
    console.log(`  ✅ ${receivers.length} receiver org(s): ${receivers.map((r) => r.name).join(', ')}`);
  }

  // Trace: do the source's leads appear in receiver orgs (matched by ASIN)?
  const sourceLeads = await prisma.lead.findMany({
    where: { orgId: source.id, status: { notIn: ['REJECTED', 'EXPIRED'] } },
    include: { product: { select: { asin: true, title: true } } },
    take: 5,
  });

  if (sourceLeads.length === 0) {
    console.log('  ⚠️  Source org has 0 active leads — run a scan before expecting broadcast.');
    return;
  }

  console.log(`\n=== TRACE (first ${sourceLeads.length} source leads by ASIN) ===`);
  for (const r of receivers) {
    console.log(`  Receiver: ${r.name}`);
    for (const sl of sourceLeads) {
      const match = await prisma.lead.findFirst({
        where: { orgId: r.id, product: { asin: sl.product.asin }, status: { notIn: ['REJECTED', 'EXPIRED'] } },
      });
      const mark = match ? '✅' : '❌ MISSING';
      console.log(`    ${mark}  ${sl.product.asin}  ${sl.product.title?.slice(0, 50) ?? ''}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
