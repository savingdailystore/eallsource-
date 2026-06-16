'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard, TrendingUp, Package, BarChart3,
  RefreshCw, Link2, CreditCard, Settings,
  LogOut, ChevronRight, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Plan } from '@/types';

interface NavItem {
  label: string;
  href:  string;
  icon:  React.ComponentType<{ className?: string }>;
  plan?: Plan;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',  href: '/dashboard',           icon: LayoutDashboard },
  { label: 'Lead Feed',  href: '/dashboard/leads',     icon: TrendingUp },
  { label: 'Products',   href: '/dashboard/products',  icon: Package },
  { label: 'Inventory',  href: '/dashboard/inventory', icon: BarChart3 },
  { label: 'Repricing',  href: '/dashboard/repricing', icon: RefreshCw, plan: 'PRO' },
];

const BOTTOM_NAV: NavItem[] = [
  { label: 'Amazon SP-API', href: '/dashboard/amazon',  icon: Link2,       plan: 'PRO' },
  { label: 'Billing',       href: '/dashboard/billing', icon: CreditCard },
  { label: 'Settings',      href: '/dashboard/settings', icon: Settings },
];

const PLAN_COLORS: Record<Plan, string> = {
  STARTER:    'bg-slate-700 text-slate-300',
  PRO:        'bg-green-900 text-green-400',
  ENTERPRISE: 'bg-purple-900 text-purple-300',
};

interface SidebarProps {
  plan: Plan;
  orgName: string;
  userEmail: string;
}

export function Sidebar({ plan, orgName, userEmail }: SidebarProps) {
  const pathname = usePathname();

  function NavLink({ item }: { item: NavItem }) {
    const isActive  = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
    const isLocked  = item.plan === 'PRO' && plan === 'STARTER';

    return (
      <Link
        href={isLocked ? '/dashboard/billing' : item.href}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group',
          isActive
            ? 'bg-green-600 text-white shadow-sm'
            : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white',
          isLocked && 'opacity-60',
        )}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">{item.label}</span>
        {isLocked && <Zap className="w-3 h-3 text-amber-400" />}
        {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
      </Link>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex flex-col"
      style={{ width: 'var(--sidebar-width)', background: '#0f172a', borderRight: '1px solid #1e293b' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-black text-sm">E</span>
        </div>
        <div className="min-w-0">
          <div className="text-white font-bold text-sm leading-tight truncate">EALLsource</div>
          <div className="text-slate-500 text-[10px] truncate">{orgName}</div>
        </div>
        <span className={cn('ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0', PLAN_COLORS[plan])}>
          {plan}
        </span>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        <div className="my-3 border-t border-slate-800" />

        {BOTTOM_NAV.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-slate-800">
        <div className="flex items-center gap-2 px-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">
              {userEmail[0]?.toUpperCase()}
            </span>
          </div>
          <span className="text-slate-400 text-xs truncate flex-1">{userEmail}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition-all text-xs"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
