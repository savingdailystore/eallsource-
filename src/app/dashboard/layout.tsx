export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const user = session.user as {
    id: string;
    name?: string;
    email?: string;
    role: string;
    subscriptionPlan: string;
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        isAdmin={user.role === 'ADMIN'}
        userName={user.name ?? undefined}
        userEmail={user.email ?? undefined}
        plan={user.subscriptionPlan}
      />
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
