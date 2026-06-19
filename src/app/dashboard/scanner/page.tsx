import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRetailerNames } from '@/retailers';
import { ScannerPanel } from '@/components/scanner/ScannerPanel';
import { ScheduledSearches } from '@/components/scanner/ScheduledSearches';
import { Clock } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Scanner' };

export default async function ScannerPage() {
  const session = await auth();

  if (session!.user.role !== 'OWNER') redirect('/dashboard');

  const orgId = session!.user.orgId;

  // Auto-heal orphaned jobs: a serverless function that times out dies before
  // marking its job DONE/FAILED, leaving it stuck "RUNNING" forever. Anything
  // still PENDING/RUNNING past the 300s function limit (+buffer) is dead.
  const staleJobCutoff = new Date(Date.now() - 6 * 60 * 1000);
  await prisma.scanJob.updateMany({
    where: { orgId, status: { in: ['PENDING', 'RUNNING'] }, createdAt: { lt: staleJobCutoff } },
    data:  { status: 'FAILED', error: 'Scan exceeded the time limit and was stopped.', completedAt: new Date() },
  }).catch(() => {});

  const [org, jobs, savedSearches] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { scanEnabled: true } }),
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

  const scanEnabled = !!org?.scanEnabled;

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Scanner</h1>
          <p className="page-subtitle">Run retailer scans to discover qualified opportunities</p>
        </div>
      </div>

      {!scanEnabled ? (
        <div className="card p-10 text-center">
          <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-50 mb-2">Scan access pending</h2>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Your account is being reviewed. Once approved, you'll be able to run scans and set up
            scheduled searches here. In the meantime, check your{' '}
            <a href="/dashboard/leads" className="text-blue-500 hover:underline">Lead Feed</a> for
            opportunities.
          </p>
        </div>
      ) : (
        <>
          <ScannerPanel retailers={getRetailerNames()} jobs={jobs} />
          <ScheduledSearches
            initialSearches={savedSearches.map((s) => ({
              ...s,
              lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
            }))}
            retailers={getRetailerNames()}
          />
        </>
      )}
    </div>
  );
}
