'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard, TrendingUp, Package, BarChart3,
  RefreshCw, Link2, CreditCard, Settings,
  LogOut, ChevronRight, Zap, Radar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Plan, Role } from '@/types';

interface NavItem {
  label: string;
  href:  string;
  icon:  React.ComponentType<{ className?: string }>;
  plan?: Plan;
  ownerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',  href: '/dashboard',           icon: LayoutDashboard },
  { label: 'Scanner',    href: '/dashboard/scanner',   icon: Radar, ownerOnly: true },
  { label: 'Lead Feed',  href: '/dashboard/leads',     icon: TrendingUp },
  { label: 'Products',   href: '/dashboard/products',  icon: Package },
  { label: 'Inventory',  href: '/dashboard/inventory', icon: BarChart3 },
  { label: 'Repricing',  href: '/dashboard/repricing', icon: RefreshCw, plan: 'PRO' },
];

const BOTTOM_NAV: NavItem[] = [
  { label: 'Amazon SP-API', href: '/dashboard/amazon',   icon: Link2,     plan: 'PRO' },
  { label: 'Billing',       href: '/dashboard/billing',  icon: CreditCard, ownerOnly: true },
  { label: 'Settings',      href: '/dashboard/settings', icon: Settings },
];

const PLAN_COLORS: Record<Plan, string> = {
  STARTER:    'bg-zinc-700 text-zinc-200',
  PRO:        'bg-orange-500 text-white',
  ENTERPRISE: 'bg-orange-600 text-white',
};

interface SidebarProps {
  plan:      Plan;
  role:      Role;
  orgName:   string;
  userEmail: string;
}

function BrandIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="2"  y="18" width="7" height="12" rx="2" fill="#f97316" fillOpacity="0.45" />
      <rect x="12" y="10" width="7" height="20" rx="2" fill="#f97316" fillOpacity="0.75" />
      <rect x="22" y="2"  width="7" height="28" rx="2" fill="#f97316" />
    </svg>
  );
}

export function Sidebar({ plan, role, orgName, userEmail }: SidebarProps) {
  const pathname = usePathname();
  const visibleNav    = NAV_ITEMS.filter((item) => !item.ownerOnly || role === 'OWNER');
  const visibleBottom = BOTTOM_NAV.filter((item) => !item.ownerOnly || role === 'OWNER');

  function NavLink({ item }: { item: NavItem }) {
    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
    const isLocked = item.plan === 'PRO' && plan === 'STARTER';

    return (
      <Link
        href={isLocked ? '/dashboard/billing' : item.href}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
          isActive
            ? 'bg-orange-600 text-white'
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-white',
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
      style={{ width: 'var(--sidebar-width)', background: '#18181b', borderRight: '1px solid #27272a' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5" style={{ borderBottom: '1px solid #27272a' }}>
        <BrandIcon />
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-tight truncate text-white">
            Arbitrage Pro <span className="text-orange-500">AI</span>
          </div>
          <div className="text-[10px] text-zinc-500 truncate">{orgName}</div>
        </div>
        <span className={cn('ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0', PLAN_COLORS[plan])}>
          {plan}
        </span>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {visibleNav.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        <div className="my-3 border-t border-zinc-800" />

        {visibleBottom.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid #27272a' }}>
        <div className="flex items-center gap-2 px-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-orange-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">{userEmail[0]?.toUpperCase()}</span>
          </div>
          <span className="text-xs text-zinc-400 truncate flex-1">{userEmail}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
