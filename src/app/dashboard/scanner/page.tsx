import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRetailerNames } from '@/retailers';
import { ScannerPanel } from '@/components/scanner/ScannerPanel';
import { ScheduledSearches } from '@/components/scanner/ScheduledSearches';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Scanner' };

export default async function ScannerPage() {
  const session = await auth();

  // Scanner is restricted to the organization Owner for now.
  if (session!.user.role !== 'OWNER') redirect('/dashboard');

  const orgId = session!.user.orgId;

  const [jobs, savedSearches] = await Promise.all([
    prisma.scanJob.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, type: true, retailer: true, query: true, status: true, error: true, createdAt: true },
    }),
    // Degrade gracefully if the saved_searches table isn't present yet
    // (e.g. migration not applied) rather than crashing the whole page.
    prisma.savedSearch.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
    }).catch((err) => {
      console.error('[scanner] savedSearch query failed:', err?.code ?? err);
      return [];
    }),
  ]);

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Scanner</h1>
          <p className="page-subtitle">Run retailer scans to discover qualified opportunities</p>
        </div>
      </div>

      <ScannerPanel retailers={getRetailerNames()} jobs={jobs} />

      <ScheduledSearches
        initialSearches={savedSearches.map((s) => ({
          ...s,
          lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
        }))}
        retailers={getRetailerNames()}
      />
    </div>
  );
}
