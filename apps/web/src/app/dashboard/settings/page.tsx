import { auth } from '@/lib/auth';
import { prisma } from '@lib/prisma';
import { User, Bell, Shield } from 'lucide-react';
import { AppearanceSettings } from '@/components/dashboard/AppearanceSettings';

export default async function SettingsPage() {
  const session = await auth();
  const userId = (session!.user as { id: string }).id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, createdAt: true },
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[900px]">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account</p>
      </div>

      {/* Profile */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-5">
          <User className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Profile</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
            <input
              defaultValue={user?.email ?? ''}
              type="email"
              disabled
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500 cursor-not-allowed max-w-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Member since</label>
            <div className="text-sm text-gray-600">
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-5">
          <Bell className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Notifications</h2>
        </div>
        <div className="space-y-4">
          {[
            { label: 'High ROI alerts',    desc: 'Get notified when products exceed 80% ROI' },
            { label: 'New lead alerts',    desc: 'Get notified when high-scoring leads are found' },
            { label: 'Scrape job updates', desc: 'Get notified when scrape jobs complete' },
          ].map((n) => (
            <div key={n.label} className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-gray-900">{n.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{n.desc}</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-green-500 rounded-full peer peer-checked:bg-green-600 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Appearance */}
      <AppearanceSettings />

      {/* Security */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-5">
          <Shield className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Security</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">New password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 max-w-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Confirm password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 max-w-sm"
            />
          </div>
          <button className="text-sm bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition-colors font-medium">
            Update password
          </button>
        </div>
      </div>
    </div>
  );
}
