import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRetailerNames } from '@/retailers';
import { ScannerPanel } from '@/components/scanner/ScannerPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Scanner' };

export default async function ScannerPage() {
  const session = await auth();
  const orgId   = session!.user.orgId;

  const jobs = await prisma.scanJob.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, type: true, retailer: true, query: true, status: true, error: true, createdAt: true },
  });

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Scanner</h1>
          <p className="page-subtitle">Run retailer scans to discover qualified opportunities</p>
        </div>
      </div>

      <ScannerPanel retailers={getRetailerNames()} jobs={jobs} />
    </div>
  );
}
