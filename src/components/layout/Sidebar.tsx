'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOutAction } from '@/lib/actions/auth';
import {
  LayoutDashboard, TrendingUp, Package, BarChart3,
  RefreshCw, Link2, CreditCard, Settings,
  LogOut, ChevronRight, Zap, Radar, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Plan, Role } from '@/types';

interface NavItem {
  label: string;
  href:  string;
  icon:  React.ComponentType<{ className?: string }>;
  plan?: Plan;
  ownerOnly?:          boolean; // visible only to OWNER (and canManualLead users when allowManualLead is true)
  ownerOrAdminOnly?:   boolean; // visible to OWNER and ADMIN
  allowManualLead?:    boolean; // also visible when canManualLead is true (combined with ownerOnly)
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',  href: '/dashboard',           icon: LayoutDashboard },
  { label: 'Scanner',    href: '/dashboard/scanner',   icon: Radar, ownerOnly: true, allowManualLead: true },
  { label: 'Lead Feed',  href: '/dashboard/leads',     icon: TrendingUp },
  { label: 'Products',   href: '/dashboard/products',  icon: Package },
  { label: 'Inventory',  href: '/dashboard/inventory', icon: BarChart3 },
  { label: 'Repricing',       href: '/dashboard/repricing', icon: RefreshCw,   plan: 'PRO' },
  { label: 'Profit Recovery', href: '/dashboard/recovery',  icon: ShieldCheck, plan: 'PRO' },
];

const BOTTOM_NAV: NavItem[] = [
  { label: 'Amazon SP-API', href: '/dashboard/amazon',   icon: Link2 },
  { label: 'Billing',       href: '/dashboard/billing',  icon: CreditCard, ownerOrAdminOnly: true },
  { label: 'Settings',      href: '/dashboard/settings', icon: Settings },
];

const PLAN_COLORS: Record<Plan, string> = {
  STARTER:    'bg-slate-700 text-slate-200',
  PRO:        'bg-blue-500 text-white',
  ENTERPRISE: 'bg-blue-600 text-white',
};

interface SidebarProps {
  plan:          Plan;
  role:          Role;
  orgName:       string;
  userEmail:     string;
  canManualLead: boolean;
}

function BrandIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 42 42" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="eall-g" x1="8" y1="8" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#93c5fd" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="42" height="42" rx="10" fill="#070d1a" />
      {/* Vertical bar */}
      <rect x="9"  y="9"    width="6"  height="24" rx="2" fill="url(#eall-g)" />
      {/* Top horizontal */}
      <rect x="9"  y="9"    width="22" height="6"  rx="2" fill="url(#eall-g)" />
      {/* Middle horizontal */}
      <rect x="9"  y="18"   width="16" height="5"  rx="2" fill="url(#eall-g)" />
      {/* Bottom horizontal */}
      <rect x="9"  y="27"   width="22" height="6"  rx="2" fill="url(#eall-g)" />
    </svg>
  );
}

export function Sidebar({ plan, role, orgName, userEmail, canManualLead }: SidebarProps) {
  const pathname = usePathname();
  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.ownerOnly) return role === 'OWNER' || (item.allowManualLead && canManualLead);
    return true;
  });
  const visibleBottom = BOTTOM_NAV.filter((item) => {
    if (item.ownerOrAdminOnly) return role === 'OWNER' || role === 'ADMIN';
    return true;
  });

  function NavLink({ item }: { item: NavItem }) {
    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
    const isLocked = item.plan === 'PRO' && plan === 'STARTER';

    return (
      <Link
        href={isLocked ? '/dashboard/billing' : item.href}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
          isActive
            ? 'bg-blue-600 text-white'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white',
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
      style={{ width: 'var(--sidebar-width)', background: '#0f172a', borderRight: '1px solid #1e293b' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5" style={{ borderBottom: '1px solid #1e293b' }}>
        <BrandIcon />
        <div className="min-w-0">
          <div className="font-black text-[16px] leading-none tracking-tight text-white truncate">
            EALL
          </div>
          <div className="flex items-center gap-1 mt-[3px]">
            <span className="text-[8px] font-bold tracking-[0.22em] text-blue-400 uppercase leading-none">
              SOURCE
            </span>
            <svg width="16" height="5" viewBox="0 0 16 5" fill="none" aria-hidden="true">
              <path d="M0.5 2.5 Q7 5 14 2.5" stroke="#3b82f6" strokeWidth="1" strokeLinecap="round"/>
              <path d="M12.5 1 L14.5 2.5 L12.5 4" stroke="#3b82f6" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
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

        <div className="my-3 border-t border-slate-800" />

        {visibleBottom.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid #1e293b' }}>
        <div className="flex items-center gap-2 px-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">{userEmail[0]?.toUpperCase()}</span>
          </div>
          <span className="text-xs text-slate-400 truncate flex-1">{userEmail}</span>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
