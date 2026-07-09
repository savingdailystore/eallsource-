import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRetailerNames } from '@/retailers';
import { ScannerPanel } from '@/components/scanner/ScannerPanel';
import { ScheduledSearches } from '@/components/scanner/ScheduledSearches';
import { ManualLeadEntry } from '@/components/scanner/ManualLeadEntry';
import { Clock } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Scanner' };

export default async function ScannerPage() {
  const session = await auth();

  const isOwner       = session!.user.role === 'OWNER';
  const canManualLead = !!(session!.user as any).canManualLead;

  if (!isOwner && !canManualLead) redirect('/dashboard');

  const orgId = session!.user.orgId;

  // Data fetches are only needed for the full OWNER view.
  let scanEnabled   = false;
  let jobs:          any[]  = [];
  let savedSearches: any[]  = [];

  if (isOwner) {
    // Auto-heal orphaned jobs: a serverless function that times out dies before
    // marking its job DONE/FAILED, leaving it stuck "RUNNING" forever. Anything
    // still PENDING/RUNNING past the 300s function limit (+buffer) is dead.
    const staleJobCutoff = new Date(Date.now() - 6 * 60 * 1000);
    await prisma.scanJob.updateMany({
      where: { orgId, status: { in: ['PENDING', 'RUNNING'] }, createdAt: { lt: staleJobCutoff } },
      data:  { status: 'FAILED', error: 'Scan exceeded the time limit and was stopped.', completedAt: new Date() },
    }).catch(() => {});

    const [org, fetchedJobs, fetchedSearches] = await Promise.all([
      prisma.organization.findUnique({ where: { id: orgId }, select: { scanEnabled: true } }),
      prisma.scanJob.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, retailer: true, query: true, status: true, error: true, createdAt: true, result: true },
      }),
      prisma.savedSearch.findMany({
        where: { orgId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }).catch((err) => {
        console.error('[scanner] savedSearch query failed:', err?.code ?? err);
        return [];
      }),
    ]);

    scanEnabled   = !!org?.scanEnabled;
    jobs          = fetchedJobs;
    savedSearches = fetchedSearches;
  }

  const retailers = getRetailerNames();

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Scanner</h1>
          <p className="page-subtitle">Run retailer scans to discover qualified opportunities</p>
        </div>
      </div>

      {isOwner ? (
        // Full scanner view for OWNER
        !scanEnabled ? (
          <div className="card p-10 text-center">
            <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Clock className="w-7 h-7 text-amber-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-50 mb-2">Scan access pending</h2>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              Your scanner access is being reviewed by the EALLsource team. Once enabled, you'll be
              able to run scans and set up scheduled searches here.
            </p>
            <p className="text-slate-400 text-sm max-w-sm mx-auto mt-3">
              In the meantime, check your{' '}
              <a href="/dashboard/leads" className="text-blue-500 hover:underline">Lead Feed</a>{' '}
              for available opportunities.
            </p>
            <p className="text-slate-500 text-xs max-w-sm mx-auto mt-4">
              Think this is a mistake or need help getting started?{' '}
              <a
                href="mailto:support@eallsource.com?subject=EALLsource Scanner Access"
                className="text-blue-500 hover:underline"
              >
                Contact support
              </a>
            </p>
          </div>
        ) : (
          <>
            <ManualLeadEntry retailers={retailers} />
            <ScannerPanel retailers={retailers} jobs={jobs as any} />
            <ScheduledSearches
              initialSearches={savedSearches.map((s: any) => ({
                ...s,
                lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
              }))}
              retailers={retailers}
            />
          </>
        )
      ) : (
        // canManualLead view: ManualLeadEntry only; other sections visible but locked
        <>
          <ManualLeadEntry retailers={retailers} />

          <div className="relative">
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/70 backdrop-blur-[1px]">
              <span className="text-xs text-slate-300 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg">
                Scanner — owner access only
              </span>
            </div>
            <div className="opacity-30 pointer-events-none select-none">
              <ScannerPanel retailers={retailers} jobs={[]} />
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/70 backdrop-blur-[1px]">
              <span className="text-xs text-slate-300 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg">
                Scheduled Searches — owner access only
              </span>
            </div>
            <div className="opacity-30 pointer-events-none select-none">
              <ScheduledSearches initialSearches={[]} retailers={retailers} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
