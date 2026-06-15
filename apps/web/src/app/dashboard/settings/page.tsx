import { auth } from '@/lib/auth';
import { prisma } from '@lib/prisma';
import { User, CreditCard, Bell, Shield } from 'lucide-react';
import { AppearanceSettings } from '@/components/dashboard/AppearanceSettings';

const PLANS = [
  {
    id: 'FREE',
    name: 'Free',
    price: '$0',
    period: '/month',
    features: ['5 products/week', 'CSV export', 'Basic filters'],
    color: 'gray',
  },
  {
    id: 'STARTER',
    name: 'Starter',
    price: '$29',
    period: '/month',
    features: ['20 products/week', 'CSV + Excel export', 'All filters', 'Save for later'],
    color: 'blue',
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: '$79',
    period: '/month',
    features: ['40 products/week', 'Full export', 'Priority feed', 'All features', 'Keepa links'],
    color: 'green',
    popular: true,
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    price: '$199',
    period: '/month',
    features: ['Unlimited products', 'API access', 'Custom retailers', 'Dedicated support', 'Admin panel'],
    color: 'purple',
  },
];

export default async function SettingsPage() {
  const session = await auth();
  const userId = (session!.user as { id: string }).id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, subscriptionPlan: true, createdAt: true },
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[900px]">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account and subscription</p>
      </div>

      {/* Profile */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-5">
          <User className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Profile</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Full name</label>
            <input defaultValue={user?.name ?? ''} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
            <input defaultValue={user?.email ?? ''} type="email" disabled className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Member since</label>
            <div className="text-sm text-gray-600">
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
            </div>
          </div>
        </div>
        <button className="mt-4 text-sm bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition-colors font-medium">
          Save changes
        </button>
      </div>

      {/* Subscription */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-5">
          <CreditCard className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Subscription</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PLANS.map((plan) => {
            const isActive = user?.subscriptionPlan === plan.id;
            const colorMap: Record<string, string> = {
              gray: 'border-gray-200',
              blue: 'border-blue-200 hover:border-blue-300',
              green: 'border-green-300 bg-green-50',
              purple: 'border-purple-200 hover:border-purple-300',
            };

            return (
              <div
                key={plan.id}
                className={`relative p-4 rounded-xl border-2 transition-all ${colorMap[plan.color]} ${isActive ? 'ring-2 ring-green-500 ring-offset-1' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">
                    Popular
                  </div>
                )}
                {isActive && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-500" />
                )}
                <div className="font-bold text-gray-900 text-sm mb-0.5">{plan.name}</div>
                <div className="text-lg font-bold text-gray-900">
                  {plan.price}<span className="text-xs font-normal text-gray-400">{plan.period}</span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="text-xs text-gray-500 flex items-start gap-1.5">
                      <span className="text-green-500 mt-0.5">✓</span> {f}
                    </li>
                  ))}
                </ul>
                {!isActive && (
                  <button className="mt-3 w-full text-xs font-medium py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                    Upgrade
                  </button>
                )}
                {isActive && (
                  <div className="mt-3 text-center text-xs text-green-600 font-medium">Current plan</div>
                )}
              </div>
            );
          })}
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
            { label: 'Weekly feed ready', desc: 'Get notified when your weekly product batch is available' },
            { label: 'High ROI alerts', desc: 'Get notified when products exceed 80% ROI' },
            { label: 'Saved product price drops', desc: 'Get notified when saved products drop in price' },
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
            <input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 max-w-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Confirm password</label>
            <input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 max-w-sm" />
          </div>
          <button className="text-sm bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition-colors font-medium">
            Update password
          </button>
        </div>
      </div>
    </div>
  );
}
