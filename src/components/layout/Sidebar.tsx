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
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',  href: '/dashboard',           icon: LayoutDashboard },
  { label: 'Lead Feed',  href: '/dashboard/leads',     icon: TrendingUp },
  { label: 'Products',   href: '/dashboard/products',  icon: Package },
  { label: 'Inventory',  href: '/dashboard/inventory', icon: BarChart3 },
  { label: 'Repricing',  href: '/dashboard/repricing', icon: RefreshCw, plan: 'PRO' },
];

const BOTTOM_NAV: NavItem[] = [
  { label: 'Amazon SP-API', href: '/dashboard/amazon',   icon: Link2,     plan: 'PRO' },
  { label: 'Billing',       href: '/dashboard/billing',  icon: CreditCard },
  { label: 'Settings',      href: '/dashboard/settings', icon: Settings },
];

const PLAN_COLORS: Record<Plan, string> = {
  STARTER:    'bg-slate-100 text-slate-500',
  PRO:        'bg-blue-100 text-blue-700',
  ENTERPRISE: 'bg-purple-100 text-purple-700',
};

interface SidebarProps {
  plan:      Plan;
  orgName:   string;
  userEmail: string;
}

function BrandIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="2"  y="18" width="7" height="12" rx="2" fill="#3b82f6" fillOpacity="0.4" />
      <rect x="12" y="10" width="7" height="20" rx="2" fill="#3b82f6" fillOpacity="0.7" />
      <rect x="22" y="2"  width="7" height="28" rx="2" fill="#3b82f6" />
    </svg>
  );
}

export function Sidebar({ plan, orgName, userEmail }: SidebarProps) {
  const pathname = usePathname();

  function NavLink({ item }: { item: NavItem }) {
    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
    const isLocked = item.plan === 'PRO' && plan === 'STARTER';

    return (
      <Link
        href={isLocked ? '/dashboard/billing' : item.href}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
          isActive
            ? 'bg-blue-500 text-white'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
          isLocked && 'opacity-60',
        )}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">{item.label}</span>
        {isLocked && <Zap className="w-3 h-3 text-amber-500" />}
        {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
      </Link>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex flex-col"
      style={{ width: 'var(--sidebar-width)', background: '#ffffff', borderRight: '1px solid #e2e8f0' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5" style={{ borderBottom: '1px solid #e2e8f0' }}>
        <BrandIcon />
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-tight truncate text-slate-900">
            Arbitrage Pro <span className="text-blue-500">AI</span>
          </div>
          <div className="text-[10px] text-slate-400 truncate">{orgName}</div>
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

        <div className="my-3 border-t border-slate-100" />

        {BOTTOM_NAV.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid #e2e8f0' }}>
        <div className="flex items-center gap-2 px-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">{userEmail[0]?.toUpperCase()}</span>
          </div>
          <span className="text-xs text-slate-500 truncate flex-1">{userEmail}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
