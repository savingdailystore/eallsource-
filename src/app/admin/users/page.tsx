import { prisma } from '@/lib/prisma';
import { Users, Shield } from 'lucide-react';

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      subscriptionPlan: true,
      createdAt: true,
      _count: { select: { savedProducts: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <div className="flex items-center gap-3">
        <Users className="w-6 h-6 text-gray-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">{users.length} registered accounts</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              {['User', 'Role', 'Plan', 'Saved Products', 'Joined', 'Actions'].map((h) => (
                <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <span className="text-green-700 font-bold text-xs">
                        {user.name?.charAt(0)?.toUpperCase() ?? user.email.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{user.name ?? '—'}</div>
                      <div className="text-xs text-gray-400">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  {user.role === 'ADMIN' ? (
                    <span className="flex items-center gap-1 text-xs font-medium bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full w-fit">
                      <Shield className="w-3 h-3" />Admin
                    </span>
                  ) : (
                    <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                      User
                    </span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    user.subscriptionPlan === 'ENTERPRISE' ? 'bg-purple-100 text-purple-700'
                    : user.subscriptionPlan === 'PRO' ? 'bg-green-100 text-green-700'
                    : user.subscriptionPlan === 'STARTER' ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                  }`}>
                    {user.subscriptionPlan}
                  </span>
                </td>
                <td className="px-5 py-4 text-gray-600">{user._count.savedProducts}</td>
                <td className="px-5 py-4 text-gray-500 text-xs">
                  {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td className="px-5 py-4">
                  <select
                    defaultValue={user.subscriptionPlan}
                    onChange={async (e) => {
                      await fetch('/api/admin', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ resource: 'user', id: user.id, data: { subscriptionPlan: e.target.value } }),
                      });
                    }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="FREE">Free</option>
                    <option value="STARTER">Starter</option>
                    <option value="PRO">Pro</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
