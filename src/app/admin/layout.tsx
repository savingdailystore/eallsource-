import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user as { id: string; role: string; name?: string; email?: string; subscriptionPlan: string } | undefined;

  if (!user || user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        isAdmin
        userName={user.name ?? undefined}
        userEmail={user.email ?? undefined}
        plan={user.subscriptionPlan}
      />
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
